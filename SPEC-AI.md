# seoscan AI Layer — BYOK Implementation

## Overview
Add AI-powered fix generation to seoscan. The user provides their own API key (OpenAI or Anthropic). seoscan uses it to generate actionable fixes, not just diagnostics.

## AI Config
Add to package.json or support env vars:

```bash
# Environment variables (priority)
OPENAI_API_KEY=sk-xxx
# or
ANTHROPIC_API_KEY=sk-ant-xxx
```

Or in a config file `~/.seoscan/config.yml`:
```yaml
ai:
  provider: openai    # openai | anthropic
  api_key: sk-xxx
  model: gpt-4o-mini  # default: cheapest that works well
```

## AI Client (`src/ai/client.js`)
- Reads config/env vars
- Supports OpenAI and Anthropic APIs
- Uses `gpt-4o-mini` by default (cheapest, good enough for SEO fixes)
- Falls back gracefully: if no key configured, skip AI features with a message
- Estimate and display token cost after each AI call

## New Command: `seoscan fix <url>`

Runs the full audit, then for each failed check generates a fix:

### Meta fixes
- Missing/bad title → generates optimized title (30-60 chars, includes main keyword)
- Missing/bad description → generates meta description (120-160 chars)
- Missing H1 → suggests H1 based on page content
- Missing OG tags → generates full OG tag set

Output:
```
Meta Fixes for https://example.com

1. Title tag (currently 64 chars, should be 30-60):
   Before: "Lecalculateur.fr — Calculateurs et Simulateurs en Ligne Gratuits"
   Fix:    "Calculateurs en Ligne Gratuits | Lecalculateur.fr"
   
   <title>Calculateurs en Ligne Gratuits | Lecalculateur.fr</title>

2. Missing Open Graph tags:
   <meta property="og:title" content="Calculateurs en Ligne Gratuits" />
   <meta property="og:description" content="Simulateurs gratuits : frais de notaire, crédit immobilier..." />
   <meta property="og:type" content="website" />
   <meta property="og:url" content="https://lecalculateur.fr/" />
```

### Image fixes
- Missing alt texts → AI analyzes image URL/context and generates alt text
- Output: list of `<img>` tags with suggested alt attributes

### Content fixes  
- Low word count → suggests content expansion topics
- Bad readability → rewrites worst paragraphs
- Missing keywords → suggests keyword insertions

### Header fixes
- Generates .htaccess or nginx config snippet for missing security headers
- Ready to copy-paste

### Robots/Sitemap fixes
- Generates corrected robots.txt
- Suggests sitemap improvements

## New Command: `seoscan fix <url> --apply --wp`
If the site is WordPress and credentials are provided:
- Actually applies the meta fixes via WP REST API
- Updates alt texts via WP REST API
- Requires wp_user + wp_app_password in config

## AI for `seoscan report`
When AI is configured, add an "AI Recommendations" section to reports:
- Executive summary (2-3 sentences)
- Priority action list (top 5 things to fix, ordered by impact)
- Estimated effort per fix

## Dependencies
- `openai` npm package (works for OpenAI API)
- For Anthropic: direct HTTP calls with axios (lighter than SDK)

## Implementation

### `src/ai/client.js`
```javascript
// Unified AI client
// Reads OPENAI_API_KEY or ANTHROPIC_API_KEY from env
// Falls back to ~/.seoscan/config.yml
// Exposes: generateCompletion(systemPrompt, userPrompt) → string
```

### `src/ai/prompts.js`
```javascript
// All SEO-specific prompts
// - fixMetaTitle(currentTitle, pageContent, url)
// - fixMetaDescription(currentDesc, pageContent, url)  
// - generateAltText(imgSrc, surroundingText, pageTitle)
// - generateOGTags(title, description, url)
// - fixSecurityHeaders(missingHeaders)
// - generateExecutiveSummary(auditResults)
// - generateActionPlan(auditResults)
```

### `src/commands/fix.js`
The main fix command. Runs audit → feeds results to AI → outputs fixes.

## Constraints
- AI calls are OPTIONAL — everything works without a key
- Show estimated cost before running AI (e.g. "~$0.02 for 14 alt texts")
- Use cheapest model that works (gpt-4o-mini for most, gpt-4o for complex analysis)
- Cache AI results to avoid re-running on same content
- Never send full page HTML to AI — only relevant excerpts (save tokens)

## Done Criteria
- `seoscan fix https://example.com` generates actionable code fixes
- Works with both OpenAI and Anthropic keys
- Shows cost estimate
- `seoscan report` includes AI recommendations when key is set
- Graceful degradation without key
- Tests pass
