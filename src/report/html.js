/**
 * HTML report generator for seoscan.
 * Produces a fully self-contained, professional HTML document with inline CSS.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape HTML special characters to prevent injection in generated reports. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Return a status icon span for a check status string. */
function statusIcon(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'ok' || s === 'pass' || s === 'good') {
    return '<span class="icon-ok">✅</span>';
  }
  if (s === 'warn' || s === 'warning' || s === 'info') {
    return '<span class="icon-warn">⚠️</span>';
  }
  if (s === 'fail' || s === 'error' || s === 'bad') {
    return '<span class="icon-fail">❌</span>';
  }
  return '<span class="icon-neutral">—</span>';
}

/** Return CSS class name for a check status. */
function statusClass(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'ok' || s === 'pass' || s === 'good') return 'status-ok';
  if (s === 'warn' || s === 'warning' || s === 'info') return 'status-warn';
  if (s === 'fail' || s === 'error' || s === 'bad') return 'status-fail';
  return '';
}

/** Return a CSS class for a 0-100 score. */
function scoreClass(score) {
  if (score >= 90) return 'score-great';
  if (score >= 70) return 'score-ok';
  if (score >= 50) return 'score-warn';
  return 'score-fail';
}

/** Return the hex color for a 0-100 score (for inline styles on cards). */
function scoreColor(score) {
  if (score >= 90) return '#16a34a'; // green
  if (score >= 70) return '#d97706'; // amber
  return '#dc2626';                  // red
}

/** Format a date as "Mon DD, YYYY HH:MM UTC". */
function formatDateTime(date) {
  return date.toUTCString().replace(' GMT', ' UTC');
}

/** Capitalise first letter. */
function ucfirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Inline CSS ───────────────────────────────────────────────────────────────

function buildCss() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      font-size: 15px;
      line-height: 1.6;
    }

    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Layout ── */
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px 60px;
    }

    /* ── Header ── */
    .site-header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: #fff;
      padding: 48px 24px 40px;
      margin-bottom: 40px;
    }
    .site-header .inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
      flex-wrap: wrap;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -1px;
      color: #fff;
    }
    .brand-logo span { color: #93c5fd; }
    .header-meta { margin-top: 8px; }
    .header-url {
      font-size: 17px;
      font-weight: 600;
      color: #bfdbfe;
      word-break: break-all;
    }
    .header-date {
      font-size: 13px;
      color: #93c5fd;
      margin-top: 4px;
    }

    /* ── Score Circle ── */
    .score-circle-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 6px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.12);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .score-number {
      font-size: 42px;
      font-weight: 800;
      line-height: 1;
      color: #fff;
    }
    .score-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #bfdbfe;
      margin-top: 2px;
    }
    .grade-badge {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      background: rgba(255,255,255,0.2);
      border-radius: 8px;
      padding: 2px 14px;
      letter-spacing: 2px;
    }

    /* ── Section ── */
    .section {
      margin-bottom: 40px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
    }

    /* ── Summary Cards ── */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
      padding: 20px;
      border-top: 4px solid #e2e8f0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    .card.score-great { border-top-color: #16a34a; }
    .card.score-ok    { border-top-color: #d97706; }
    .card.score-warn  { border-top-color: #f59e0b; }
    .card.score-fail  { border-top-color: #dc2626; }

    .card-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .card-score {
      font-size: 36px;
      font-weight: 800;
      line-height: 1;
    }
    .card-score.score-great { color: #16a34a; }
    .card-score.score-ok    { color: #d97706; }
    .card-score.score-warn  { color: #f59e0b; }
    .card-score.score-fail  { color: #dc2626; }

    .card-weight {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 6px;
    }
    .card-bar-track {
      height: 4px;
      background: #f1f5f9;
      border-radius: 99px;
      margin-top: 10px;
      overflow: hidden;
    }
    .card-bar-fill {
      height: 4px;
      border-radius: 99px;
    }

    /* ── Breakdown Table ── */
    .breakdown-table-wrap {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
      margin-bottom: 40px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      background: #f1f5f9;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
      padding: 12px 16px;
      text-align: left;
    }
    tbody tr {
      border-top: 1px solid #f1f5f9;
    }
    tbody tr:hover { background: #f8fafc; }
    tbody td {
      padding: 12px 16px;
      font-size: 14px;
      vertical-align: middle;
    }

    /* ── Top Issues ── */
    .issues-list {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .issue-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid #f1f5f9;
    }
    .issue-item:last-child { border-bottom: none; }
    .issue-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .issue-body { flex: 1; min-width: 0; }
    .issue-name { font-weight: 600; color: #1e293b; }
    .issue-category {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 1px 8px;
      border-radius: 99px;
      background: #eff6ff;
      color: #2563eb;
      margin-right: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .issue-details { font-size: 13px; color: #64748b; margin-top: 2px; }

    /* ── Category Detail Sections ── */
    .category-section {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
      margin-bottom: 24px;
    }
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      user-select: none;
    }
    .category-header:hover { background: #f8fafc; }
    .category-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .category-icon { font-size: 20px; }
    .category-name {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }
    .category-score-pill {
      font-size: 13px;
      font-weight: 700;
      padding: 3px 12px;
      border-radius: 99px;
      color: #fff;
    }
    .category-checks-area { padding: 0 0 0 0; }

    .check-table { width: 100%; }
    .check-table thead th {
      padding: 10px 16px;
      background: #f8fafc;
    }
    .check-table tbody td {
      padding: 10px 16px;
    }
    .check-table tbody tr:last-child td { border-bottom: none; }

    /* Check status cell */
    td.status-ok   { color: #16a34a; font-weight: 600; }
    td.status-warn { color: #d97706; font-weight: 600; }
    td.status-fail { color: #dc2626; font-weight: 600; }

    .icon-ok   { }
    .icon-warn { }
    .icon-fail { }

    /* ── Summary Meta ── */
    .summary-meta {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .summary-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px 24px;
    }
    .meta-item { }
    .meta-key {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #94a3b8;
    }
    .meta-val {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 2px;
      word-break: break-all;
    }

    /* ── Footer ── */
    .site-footer {
      text-align: center;
      padding: 32px 24px;
      font-size: 13px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      margin-top: 48px;
    }
    .site-footer strong { color: #64748b; }

    /* ── No-issues banner ── */
    .no-issues {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 20px 24px;
      color: #15803d;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
      .site-header .inner { flex-direction: column; align-items: flex-start; }
      .score-circle { width: 90px; height: 90px; }
      .score-number { font-size: 32px; }
      .cards-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `.trim();
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_META = {
  meta:        { label: 'Meta Tags',         icon: '🏷️' },
  performance: { label: 'Performance',        icon: '⚡' },
  links:       { label: 'Links',              icon: '🔗' },
  images:      { label: 'Images',             icon: '🖼️' },
  headers:     { label: 'Headers & Security', icon: '🔒' },
  sitemap:     { label: 'Sitemap',            icon: '🗺️' },
  robots:      { label: 'Robots.txt',         icon: '🤖' },
  structured:  { label: 'Structured Data',    icon: '📋' },
  content:     { label: 'Content Quality',    icon: '📝' },
};

const ORDERED_CATEGORIES = [
  'meta', 'performance', 'links', 'images',
  'headers', 'sitemap', 'robots', 'structured', 'content',
];

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildHeader(url, overallScore, dateStr) {
  const { score, grade } = overallScore;
  const circleColor = scoreColor(score);

  return `
  <header class="site-header">
    <div class="inner">
      <div>
        <div class="header-brand">
          <div class="brand-logo">seo<span>scan</span></div>
        </div>
        <div class="header-meta">
          <div class="header-url">🌐 ${esc(url)}</div>
          <div class="header-date">📅 Report generated: ${esc(dateStr)}</div>
        </div>
      </div>
      <div class="score-circle-wrap">
        <div class="score-circle" style="border-color: ${circleColor}80; background: ${circleColor}18;">
          <span class="score-number" style="color: ${circleColor === '#16a34a' ? '#bbf7d0' : circleColor === '#d97706' ? '#fde68a' : '#fecaca'};">${score}</span>
          <span class="score-label">/ 100</span>
        </div>
        <div class="grade-badge" style="background: ${circleColor}33; color: ${circleColor === '#16a34a' ? '#bbf7d0' : circleColor === '#d97706' ? '#fde68a' : '#fecaca'};">Grade ${esc(grade)}</div>
      </div>
    </div>
  </header>`;
}

function buildSummaryCards(overallScore) {
  const cards = ORDERED_CATEGORIES.map((cat) => {
    const data = overallScore.breakdown[cat];
    if (!data) return '';
    const meta = CATEGORY_META[cat] ?? { label: ucfirst(cat), icon: '📊' };
    const cls = scoreClass(data.score);
    const color = scoreColor(data.score);
    const fillWidth = Math.max(0, Math.min(100, data.score));

    return `
    <div class="card ${cls}">
      <div class="card-label">${esc(meta.icon)} ${esc(meta.label)}</div>
      <div class="card-score ${cls}">${data.score}</div>
      <div class="card-weight">Weight: ${data.weight}% &middot; Weighted: ${data.weighted.toFixed(1)}</div>
      <div class="card-bar-track">
        <div class="card-bar-fill" style="width: ${fillWidth}%; background: ${color};"></div>
      </div>
    </div>`;
  });

  return `
  <section class="section">
    <h2 class="section-title">Category Overview</h2>
    <div class="cards-grid">
      ${cards.join('')}
    </div>
  </section>`;
}

function buildBreakdownTable(overallScore) {
  const rows = ORDERED_CATEGORIES.map((cat) => {
    const data = overallScore.breakdown[cat];
    if (!data) return '';
    const meta = CATEGORY_META[cat] ?? { label: ucfirst(cat), icon: '📊' };
    const cls = scoreClass(data.score);
    const color = scoreColor(data.score);
    const barWidth = Math.max(0, Math.min(100, data.score));

    return `
      <tr>
        <td>${esc(meta.icon)} <strong>${esc(meta.label)}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="flex:1; height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden; min-width:80px;">
              <div style="width:${barWidth}%; height:8px; background:${color}; border-radius:99px;"></div>
            </div>
            <strong style="color:${color}; min-width:40px; text-align:right;">${data.score}<small style="font-weight:400; color:#94a3b8;">/100</small></strong>
          </div>
        </td>
        <td><span class="${cls}" style="color:${color}; font-weight:700;">${data.weight}%</span></td>
        <td style="color:${color}; font-weight:700;">${data.weighted.toFixed(1)}</td>
      </tr>`;
  });

  return `
  <section class="section">
    <h2 class="section-title">Score Breakdown</h2>
    <div class="breakdown-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Score</th>
            <th>Weight</th>
            <th>Weighted Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
          <tr style="background:#f8fafc;">
            <td><strong>Overall</strong></td>
            <td><strong style="color:${scoreColor(overallScore.score)}; font-size:15px;">${overallScore.score}/100</strong></td>
            <td><strong>100%</strong></td>
            <td><strong style="color:${scoreColor(overallScore.score)};">${overallScore.score}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

function buildTopIssues(results) {
  const issues = [];
  for (const cat of ORDERED_CATEGORIES) {
    const result = results[cat];
    if (!result || !Array.isArray(result.checks)) continue;
    for (const check of result.checks) {
      const s = String(check.status ?? '').toLowerCase();
      if (s === 'fail' || s === 'error' || s === 'bad') {
        issues.push({ category: cat, check });
      }
    }
  }

  if (issues.length === 0) {
    return `
    <section class="section">
      <h2 class="section-title">Top Issues</h2>
      <div class="no-issues">✅ No failed checks detected — great work!</div>
    </section>`;
  }

  const items = issues.map(({ category, check }) => {
    const meta = CATEGORY_META[category] ?? { label: ucfirst(category), icon: '📊' };
    const detailHtml = check.details
      ? `<div class="issue-details">${esc(check.details)}</div>`
      : '';
    return `
    <div class="issue-item">
      <div class="issue-icon">❌</div>
      <div class="issue-body">
        <div class="issue-name">
          <span class="issue-category">${esc(meta.icon)} ${esc(meta.label)}</span>
          ${esc(check.name ?? '')}
        </div>
        ${detailHtml}
      </div>
    </div>`;
  });

  return `
  <section class="section">
    <h2 class="section-title">Top Issues <span style="font-size:14px; font-weight:400; color:#64748b;">(${issues.length} failed check${issues.length !== 1 ? 's' : ''})</span></h2>
    <div class="issues-list">
      ${items.join('')}
    </div>
  </section>`;
}

function buildChecksTable(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return '<p style="padding:16px 24px; color:#94a3b8; font-size:14px;">No checks available.</p>';
  }

  const hasValue   = checks.some((c) => c.value   !== undefined && c.value   !== null && c.value   !== '');
  const hasDetails = checks.some((c) => c.details  !== undefined && c.details !== null && c.details !== '');

  const thValue   = hasValue   ? '<th>Value</th>'   : '';
  const thDetails = hasDetails ? '<th>Details</th>' : '';

  const rows = checks.map((check) => {
    const sc  = statusClass(check.status);
    const ico = statusIcon(check.status);
    const tdValue   = hasValue   ? `<td>${esc(check.value ?? '')}</td>` : '';
    const tdDetails = hasDetails ? `<td style="color:#64748b; font-size:13px;">${esc(check.details ?? '')}</td>` : '';
    return `
      <tr>
        <td>${ico} <span style="font-weight:500;">${esc(check.name ?? '')}</span></td>
        <td class="${sc}">${esc(ucfirst(check.status ?? ''))}</td>
        ${tdValue}
        ${tdDetails}
      </tr>`;
  });

  return `
  <table class="check-table">
    <thead>
      <tr>
        <th>Check</th>
        <th>Status</th>
        ${thValue}
        ${thDetails}
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
  </table>`;
}

function buildSummaryMeta(result) {
  const skipKeys = new Set(['score', 'checks', 'errors']);
  const entries = Object.entries(result).filter(([k, v]) => {
    if (skipKeys.has(k)) return false;
    if (v === null || v === undefined) return false;
    if (typeof v === 'object' && !Array.isArray(v)) return false;
    return true;
  });

  if (entries.length === 0) return '';

  const items = entries.map(([key, val]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    const display = Array.isArray(val) ? val.slice(0, 5).join(', ') + (val.length > 5 ? ` +${val.length - 5} more` : '') : val;
    return `
    <div class="meta-item">
      <div class="meta-key">${esc(label)}</div>
      <div class="meta-val">${esc(display)}</div>
    </div>`;
  });

  return `
  <div class="summary-meta">
    <div class="summary-meta-grid">
      ${items.join('')}
    </div>
  </div>`;
}

function buildCategorySection(category, result, overallScore) {
  const meta = CATEGORY_META[category] ?? { label: ucfirst(category), icon: '📊' };
  const data = overallScore.breakdown[category];
  const score = data?.score ?? result?.score ?? 0;
  const color = scoreColor(score);

  const summaryHtml = buildSummaryMeta(result);
  const checksHtml  = buildChecksTable(result.checks);

  return `
  <div class="category-section">
    <div class="category-header">
      <div class="category-title-row">
        <span class="category-icon">${esc(meta.icon)}</span>
        <span class="category-name">${esc(meta.label)}</span>
      </div>
      <span class="category-score-pill" style="background:${color};">${score}/100</span>
    </div>
    <div class="category-checks-area">
      ${summaryHtml}
      ${checksHtml}
    </div>
  </div>`;
}

function buildDetailedResults(results, overallScore) {
  const sections = ORDERED_CATEGORIES
    .filter((cat) => results[cat])
    .map((cat) => buildCategorySection(cat, results[cat], overallScore))
    .join('');

  return `
  <section class="section">
    <h2 class="section-title">Detailed Results</h2>
    ${sections}
  </section>`;
}

function buildFooter() {
  return `
  <footer class="site-footer">
    <strong>seoscan</strong> &mdash; Open-source SEO audit tool &mdash;
    <a href="https://github.com/seoscan/seoscan">github.com/seoscan/seoscan</a>
  </footer>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates a full, self-contained HTML SEO report.
 *
 * @param {string} url - The audited URL.
 * @param {Record<string, { score: number, checks?: any[], [key: string]: any }>} results - Per-category results.
 * @param {{ score: number, grade: string, breakdown: Record<string, { score: number, weight: number, weighted: number }> }} overallScore - Output of calculateOverallScore().
 * @returns {string} Complete HTML document string.
 */
export default function generateHtml(url, results, overallScore) {
  const now = new Date();
  const dateStr = formatDateTime(now);
  const isoDate = now.toISOString();

  const css    = buildCss();
  const header = buildHeader(url, overallScore, dateStr);
  const cards  = buildSummaryCards(overallScore);
  const table  = buildBreakdownTable(overallScore);
  const issues = buildTopIssues(results);
  const detail = buildDetailedResults(results, overallScore);
  const footer = buildFooter();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="seoscan">
  <meta name="date" content="${esc(isoDate)}">
  <title>SEO Audit Report — ${esc(url)}</title>
  <style>
${css}
  </style>
</head>
<body>

${header}

<div class="container">
  ${cards}
  ${table}
  ${issues}
  ${detail}
</div>

${footer}

</body>
</html>`;
}
