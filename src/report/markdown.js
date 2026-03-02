/**
 * Markdown report generator for seoscan.
 */

/** Map a status string to an emoji indicator. */
function statusEmoji(status) {
  if (!status) return '';
  const s = String(status).toLowerCase();
  if (s === 'ok' || s === 'pass' || s === 'good') return '✅';
  if (s === 'warn' || s === 'warning' || s === 'info') return '⚠️';
  if (s === 'fail' || s === 'error' || s === 'bad') return '❌';
  return '—';
}

/** Map a numeric 0-100 score to an emoji. */
function scoreEmoji(score) {
  if (score >= 90) return '✅';
  if (score >= 70) return '⚠️';
  return '❌';
}

/** Format a date as YYYY-MM-DD. */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Renders a category result's checks as a markdown table.
 * Expects checks to be an array of { name, status, value?, details? }.
 *
 * @param {Array<{ name: string, status: string, value?: any, details?: string }>} checks
 * @returns {string}
 */
function renderChecksTable(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return '_No checks available._\n';
  }

  const hasValue = checks.some((c) => c.value !== undefined && c.value !== null && c.value !== '');
  const hasDetails = checks.some((c) => c.details !== undefined && c.details !== null && c.details !== '');

  const headers = ['Check', 'Status'];
  if (hasValue) headers.push('Value');
  if (hasDetails) headers.push('Details');

  const sep = headers.map(() => '---');
  const rows = checks.map((check) => {
    const emoji = statusEmoji(check.status);
    const row = [`${emoji} ${check.name ?? ''}`, `${check.status ?? ''}`];
    if (hasValue) row.push(String(check.value ?? ''));
    if (hasDetails) row.push(String(check.details ?? ''));
    return row;
  });

  const toRow = (cols) => `| ${cols.join(' | ')} |`;

  return [toRow(headers), toRow(sep), ...rows.map(toRow)].join('\n') + '\n';
}

/**
 * Renders the summary table for all categories.
 *
 * @param {Record<string, { score: number }>} results
 * @param {{ breakdown: Record<string, { score: number, weight: number, weighted: number }>, score: number, grade: string }} overallScore
 * @returns {string}
 */
function renderSummaryTable(results, overallScore) {
  const headers = ['Category', 'Score', 'Weight', 'Weighted', 'Status'];
  const sep = headers.map(() => '---');
  const rows = Object.entries(overallScore.breakdown).map(([category, data]) => {
    const emoji = scoreEmoji(data.score);
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    return [
      label,
      `${data.score}/100`,
      `${data.weight}%`,
      `${data.weighted.toFixed(1)}`,
      emoji,
    ];
  });

  const toRow = (cols) => `| ${cols.join(' | ')} |`;
  return [toRow(headers), toRow(sep), ...rows.map(toRow)].join('\n') + '\n';
}

/**
 * Collects all failed checks across all categories.
 *
 * @param {Record<string, { checks?: Array<{ name: string, status: string, details?: string }> }>} results
 * @returns {Array<{ category: string, name: string, details: string }>}
 */
function collectIssues(results) {
  const issues = [];
  for (const [category, result] of Object.entries(results)) {
    if (!result || !Array.isArray(result.checks)) continue;
    for (const check of result.checks) {
      const s = String(check.status ?? '').toLowerCase();
      if (s === 'fail' || s === 'error' || s === 'bad') {
        issues.push({
          category: category.charAt(0).toUpperCase() + category.slice(1),
          name: check.name ?? '',
          details: check.details ?? '',
        });
      }
    }
  }
  return issues;
}

/**
 * Generates a full markdown SEO report.
 *
 * @param {string} url - The audited URL.
 * @param {Record<string, { score: number, checks?: any[], [key: string]: any }>} results - Per-category results.
 * @param {{ score: number, grade: string, breakdown: Record<string, { score: number, weight: number, weighted: number }> }} overallScore - Output of calculateOverallScore().
 * @returns {string} Full markdown string.
 */
export default function generateMarkdown(url, results, overallScore) {
  const now = new Date();
  const dateStr = formatDate(now);
  const grade = overallScore.grade;
  const score = overallScore.score;

  const sections = [];

  // ── Title ────────────────────────────────────────────────────────────────
  sections.push(`# SEO Audit Report\n`);
  sections.push(`**URL:** ${url}  `);
  sections.push(`**Date:** ${dateStr}  `);
  sections.push(`**Tool:** seoscan\n`);

  // ── Overall Score ─────────────────────────────────────────────────────────
  sections.push(`## Overall Score\n`);
  const scoreBadge = `${scoreEmoji(score)} **${score}/100** — Grade **${grade}**`;
  sections.push(`${scoreBadge}\n`);

  // ── Summary Table ─────────────────────────────────────────────────────────
  sections.push(`## Category Summary\n`);
  sections.push(renderSummaryTable(results, overallScore));

  // ── Top Issues ────────────────────────────────────────────────────────────
  const issues = collectIssues(results);
  if (issues.length > 0) {
    sections.push(`## Top Issues\n`);
    sections.push(`The following checks failed and should be addressed:\n`);
    for (const issue of issues) {
      const detail = issue.details ? ` — ${issue.details}` : '';
      sections.push(`- ❌ **[${issue.category}]** ${issue.name}${detail}`);
    }
    sections.push('');
  }

  // ── Per-Category Detail ───────────────────────────────────────────────────
  sections.push(`## Detailed Results\n`);

  const categoryLabels = {
    meta: 'Meta Tags',
    performance: 'Performance',
    links: 'Links',
    images: 'Images',
    headers: 'Headers & Security',
    sitemap: 'Sitemap',
    robots: 'Robots.txt',
    structured: 'Structured Data',
    content: 'Content Quality',
  };

  const orderedCategories = [
    'meta', 'performance', 'links', 'images',
    'headers', 'sitemap', 'robots', 'structured', 'content',
  ];

  for (const category of orderedCategories) {
    const result = results[category];
    const breakdown = overallScore.breakdown[category];
    if (!result) continue;

    const label = categoryLabels[category] ?? (category.charAt(0).toUpperCase() + category.slice(1));
    const catScore = breakdown?.score ?? result.score ?? 0;
    const emoji = scoreEmoji(catScore);

    sections.push(`### ${emoji} ${label}\n`);
    sections.push(`**Score:** ${catScore}/100\n`);

    // Optional summary fields (e.g. word count, total images, etc.)
    const skipKeys = new Set(['score', 'checks', 'errors']);
    const summaryEntries = Object.entries(result).filter(([k]) => !skipKeys.has(k));
    if (summaryEntries.length > 0) {
      sections.push(`**Summary:**\n`);
      for (const [key, val] of summaryEntries) {
        if (val === null || val === undefined) continue;
        if (typeof val === 'object' && !Array.isArray(val)) continue; // skip nested objects
        const label2 = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        sections.push(`- ${label2}: ${Array.isArray(val) ? val.join(', ') : val}`);
      }
      sections.push('');
    }

    // Checks table
    if (Array.isArray(result.checks) && result.checks.length > 0) {
      sections.push(renderChecksTable(result.checks));
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  sections.push(`---\n`);
  sections.push(`_Report generated by [seoscan](https://github.com/seoscan/seoscan) on ${dateStr}_\n`);

  return sections.join('\n');
}
