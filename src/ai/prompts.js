/**
 * src/ai/prompts.js — SEO-specific AI prompts for seoscan fix command
 *
 * Each function returns { system, user } ready for generateCompletion().
 */

// ── Meta tag fixes ────────────────────────────────────────────────────────────

/**
 * Generate an optimized title tag.
 *
 * @param {string|null} currentTitle
 * @param {string} url
 * @param {string} [h1]
 * @param {string} [description]
 * @returns {{ system: string, user: string }}
 */
export function fixMetaTitle(currentTitle, url, h1 = '', description = '') {
  const system =
    'You are an SEO expert. Generate an optimized page title.\n' +
    'Rules:\n' +
    '- 30-60 characters (count carefully)\n' +
    '- Include the main keyword near the start\n' +
    '- Be descriptive and compelling, no clickbait\n' +
    'Respond with ONLY the title text — no quotes, no tags, no explanation.';

  const ctx = [
    currentTitle
      ? `Current title: "${currentTitle}" (${currentTitle.length} chars, should be 30-60)`
      : 'Current title: (missing)',
    h1          ? `H1 heading: "${h1}"` : '',
    description ? `Meta description: "${description.slice(0, 120)}"` : '',
    `Page URL: ${url}`,
  ].filter(Boolean).join('\n');

  return { system, user: `Generate an optimized SEO title for this page:\n${ctx}` };
}

/**
 * Generate an optimized meta description.
 *
 * @param {string|null} currentDesc
 * @param {string} url
 * @param {string} [title]
 * @param {string} [h1]
 * @returns {{ system: string, user: string }}
 */
export function fixMetaDescription(currentDesc, url, title = '', h1 = '') {
  const system =
    'You are an SEO expert. Generate an optimized meta description.\n' +
    'Rules:\n' +
    '- 120-160 characters (count carefully)\n' +
    '- Include the main keyword naturally\n' +
    '- Describe what the page offers; end with a soft call to action\n' +
    'Respond with ONLY the description text — no quotes, no tags, no explanation.';

  const ctx = [
    currentDesc
      ? `Current description: "${currentDesc}" (${currentDesc.length} chars, should be 120-160)`
      : 'Current description: (missing)',
    title ? `Title: "${title}"` : '',
    h1    ? `H1: "${h1}"` : '',
    `Page URL: ${url}`,
  ].filter(Boolean).join('\n');

  return { system, user: `Generate an optimized meta description for this page:\n${ctx}` };
}

/**
 * Suggest an H1 heading.
 *
 * @param {string} url
 * @param {string} [title]
 * @param {string} [description]
 * @returns {{ system: string, user: string }}
 */
export function fixH1(url, title = '', description = '') {
  const system =
    'You are an SEO expert. Generate an H1 heading for a web page.\n' +
    'Rules:\n' +
    '- Clear, descriptive, and keyword-rich\n' +
    '- Matches the page intent\n' +
    '- Usually 3-10 words\n' +
    'Respond with ONLY the H1 text — no HTML tags, no explanation.';

  const ctx = [
    `Page URL: ${url}`,
    title       ? `Title tag: "${title}"` : '',
    description ? `Meta description: "${description.slice(0, 120)}"` : '',
  ].filter(Boolean).join('\n');

  return { system, user: `Generate an H1 heading for this page:\n${ctx}` };
}

/**
 * Generate a full Open Graph tag set.
 *
 * @param {string} title
 * @param {string} description
 * @param {string} url
 * @returns {{ system: string, user: string }}
 */
export function generateOGTags(title, description, url) {
  const system =
    'You are an SEO expert. Generate Open Graph meta tags for a web page.\n' +
    'Output ONLY valid HTML <meta> tags, one per line. Include:\n' +
    '  og:title      (40-60 chars, compelling)\n' +
    '  og:description (100-150 chars, engaging summary)\n' +
    '  og:type       (website)\n' +
    '  og:url        (the canonical URL)\n' +
    'No explanation, no markdown code fences — just the HTML tags.';

  const ctx = [
    `Page URL: ${url}`,
    title       ? `Title: "${title}"` : '',
    description ? `Description: "${description}"` : '',
  ].filter(Boolean).join('\n');

  return { system, user: `Generate Open Graph meta tags for:\n${ctx}` };
}

// ── Image alt text ────────────────────────────────────────────────────────────

/**
 * Generate alt text for a batch of images.
 *
 * @param {string[]} imgSrcs  Up to 20 image URLs
 * @param {string}   [pageTitle]
 * @returns {{ system: string, user: string }}
 */
export function generateAltText(imgSrcs, pageTitle = '') {
  const system =
    'You are an SEO expert. Generate concise, descriptive alt text for images.\n' +
    'Rules:\n' +
    '- Describe what\'s in the image based on its filename/URL context\n' +
    '- 5-125 characters per alt text\n' +
    '- No "image of" or "photo of" prefix\n' +
    '- Keyword-relevant but natural\n' +
    'Respond with a JSON array ONLY:\n' +
    '[{"src": "url", "alt": "text"}, ...]\n' +
    'No explanation, no markdown — just valid JSON.';

  const list = imgSrcs.slice(0, 20).map(s => `- ${s}`).join('\n');
  const pageCtx = pageTitle ? ` from the page "${pageTitle}"` : '';

  return {
    system,
    user: `Generate alt text for these images${pageCtx}:\n${list}`,
  };
}

// ── Security headers ──────────────────────────────────────────────────────────

/**
 * Generate server config snippets for missing security headers.
 *
 * @param {string[]} missingHeaders  List of header names that are missing
 * @returns {{ system: string, user: string }}
 */
export function fixSecurityHeaders(missingHeaders) {
  const system =
    'You are a web security expert. Generate server configuration to add missing HTTP security headers.\n' +
    'Provide BOTH an Apache .htaccess snippet AND an nginx snippet.\n' +
    'Use sensible, widely-recommended values for each header.\n' +
    'Output clean, copy-paste ready config with clear section labels. No prose explanation needed.';

  return {
    system,
    user: `Generate server config to add these missing security headers:\n${missingHeaders.join('\n')}`,
  };
}

// ── Robots.txt ────────────────────────────────────────────────────────────────

/**
 * Generate a corrected robots.txt.
 *
 * @param {string}   url
 * @param {string[]} issues  Issues found in current robots.txt
 * @returns {{ system: string, user: string }}
 */
export function generateRobotsTxt(url, issues) {
  const system =
    'You are an SEO expert. Generate a correct, minimal robots.txt file.\n' +
    'Output ONLY the robots.txt file content — no explanation, no markdown fences.';

  return {
    system,
    user: `Generate a robots.txt for ${url}.\nIssues with current file:\n${issues.join('\n')}`,
  };
}

// ── Report AI sections ────────────────────────────────────────────────────────

/**
 * Generate a 2-3 sentence executive summary of an SEO audit.
 *
 * @param {string} url
 * @param {number} overallScore
 * @param {Record<string, number>} categoryScores
 * @returns {{ system: string, user: string }}
 */
export function generateExecutiveSummary(url, overallScore, categoryScores) {
  const system =
    'You are an SEO expert. Write a 2-3 sentence executive summary of an SEO audit.\n' +
    'Be specific: mention the score, 1-2 key strengths, and the biggest issue.\n' +
    'Plain text only — no markdown, no bullet points.';

  const scores = Object.entries(categoryScores)
    .map(([k, v]) => `${k}: ${v}/100`)
    .join(', ');

  return {
    system,
    user: `Write an executive summary for the SEO audit of ${url}.\nOverall score: ${overallScore}/100\nCategory scores: ${scores}`,
  };
}

/**
 * Generate a prioritised top-5 action plan.
 *
 * @param {string}   url
 * @param {string[]} failedChecks  List of issue descriptions
 * @returns {{ system: string, user: string }}
 */
export function generateActionPlan(url, failedChecks) {
  const system =
    'You are an SEO expert. Create a prioritized action plan from SEO audit failures.\n' +
    'Output ONLY a numbered list of the top 5 actions, ordered by impact (highest first).\n' +
    'Format each line exactly as: "N. [Action] — [Why it matters] — Effort: Low|Medium|High"\n' +
    'No introduction, no summary — just the 5 numbered lines.';

  const issues = failedChecks.slice(0, 15).join('\n');

  return {
    system,
    user: `Create a top-5 SEO action plan for ${url} based on these audit issues:\n${issues}`,
  };
}
