# 🔍 seoscan

**Full SEO audit from the terminal. One command, zero config.**

Stop paying $200/mo for bloated SEO tools. Audit any website in seconds — meta tags, performance, security headers, broken links, structured data, content quality — and get AI-powered fix suggestions.

```bash
$ seoscan report https://example.com

  SEO Audit Report — example.com
  ══════════════════════════════════════

  Score: 80/100 (B)

  ┌─────────────┬───────┬───────────────────────────────┐
  │ Category    │ Score │ Status                        │
  ├─────────────┼───────┼───────────────────────────────┤
  │ Meta        │ 90    │ ✅ Title, desc, OG present    │
  │ Performance │ 65    │ ⚠️  2.8s load, no compression │
  │ Headers     │ 70    │ ⚠️  Missing CSP, HSTS         │
  │ Images      │ 85    │ ✅ 2 missing alt tags         │
  │ Links       │ 95    │ ✅ No broken links             │
  │ Content     │ 75    │ ⚠️  Thin content on 3 pages   │
  └─────────────┴───────┴───────────────────────────────┘
```

## Install

```bash
# Run directly (no install)
npx seoscan report https://yoursite.com

# Or install globally
npm install -g seoscan
```

## Commands

| Command | Description |
|---------|-------------|
| `seoscan meta <url>` | Meta tags, headings, Open Graph, Twitter Cards |
| `seoscan performance <url>` | Page load speed, compression, render-blocking resources |
| `seoscan links <url>` | Internal/external links, broken links, redirects |
| `seoscan images <url>` | Alt text, dimensions, modern formats, lazy loading |
| `seoscan headers <url>` | Security headers (CSP, HSTS, X-Frame) + cache policy |
| `seoscan sitemap <url>` | Validate sitemap.xml structure and URLs |
| `seoscan robots <url>` | Parse robots.txt, check rules and directives |
| `seoscan structured <url>` | JSON-LD, Microdata, Schema.org validation |
| `seoscan content <url>` | Readability, keyword density, word count, thin content |
| `seoscan crawl <url>` | Deep crawl — broken links, orphan pages, redirect chains |
| `seoscan report <url>` | Full audit with score and grade (A-F) |
| `seoscan fix <url>` | AI-powered fix suggestions for every issue found |
| `seoscan compare <url1> <url2>` | Side-by-side comparison of two URLs |

## AI-Powered Fixes

The `fix` command runs a full audit, then uses AI to generate actionable fixes:

```bash
# With OpenAI (cheapest: gpt-4o-mini at ~$0.0003 per audit)
export OPENAI_API_KEY=sk-...
seoscan fix https://yoursite.com

# With Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
seoscan fix https://yoursite.com

# Dry run (no API key needed — shows what would be fixed)
seoscan fix https://yoursite.com --dry-run
```

**Example output:**

```
🔧 AI Fix Suggestions — yoursite.com

  Title Tag (current: 55 chars)
  ✏️  "Expert Web Design Services in Paris | YourBrand — Free Quote"

  Meta Description (missing!)
  ✏️  "Professional web design and SEO services in Paris. 10+ years
      experience, 200+ clients. Get your free quote today."

  Security Headers (Apache)
  ✏️  Header always set X-Content-Type-Options "nosniff"
      Header always set X-Frame-Options "SAMEORIGIN"
      Header always set Strict-Transport-Security "max-age=31536000"

  Cost: $0.0003 (gpt-4o-mini)
```

## No External APIs Required

seoscan runs entirely client-side. It fetches pages directly and analyses them locally — no Lighthouse, no Google API, no third-party services needed for basic audits.

The only external call is the AI fix command, which uses your own API key (BYOK).

## Output Formats

```bash
# Terminal (default)
seoscan report https://example.com

# JSON (pipe to jq, save to file, feed to other tools)
seoscan report https://example.com --format json

# PDF (professional branded report)
seoscan report https://example.com --format pdf --output report.pdf
```

## Use Cases

- **Freelancers**: Audit client sites before a pitch. Show them exactly what's broken.
- **Agencies**: Bulk audit prospects. Generate PDF reports with your branding.
- **Developers**: Pre-deploy SEO check in CI/CD. Catch issues before they ship.
- **Content teams**: Ensure every page meets SEO standards before publishing.

## Pricing

**seoscan is free and open-source.** The AI fix feature requires your own API key (OpenAI or Anthropic). Cost: ~$0.0003 per audit with gpt-4o-mini.

## Requirements

- Node.js ≥ 18
- No API keys needed for basic audits
- OpenAI or Anthropic API key for `seoscan fix`

## Made by [Recognity](https://recognity.fr)

Digital strategy & SEO consulting from Paris.

## License

MIT
