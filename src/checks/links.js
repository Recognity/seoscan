/**
 * links.js — Link audit check module
 *
 * Extracts all links from a page, classifies them as internal/external/nofollow,
 * samples up to 20 for broken-status checks, and flags generic or empty anchor
 * text.
 */

import { fetchPage, fetchHead } from '../utils/fetcher.js';
import { parsePage } from '../utils/parser.js';
import { printTable, statusIcon } from '../utils/display.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of links to probe for broken-status checks. */
const MAX_PROBE = 20;

/**
 * Anchor text strings that are considered generic / unhelpful for SEO.
 * Compared case-insensitively after trimming whitespace.
 */
const GENERIC_ANCHOR_PATTERNS = [
  'click here',
  'click here!',
  'here',
  'read more',
  'read more...',
  'more',
  'more...',
  'link',
  'this link',
  'this page',
  'this',
  'learn more',
  'learn more...',
  'continue',
  'continue reading',
  'go here',
  'see here',
  'view',
  'view more',
  'details',
  'info',
  'information',
  'website',
  'web site',
  'url',
  'http',
  'https',
];

// ---------------------------------------------------------------------------
// Score deductions
// ---------------------------------------------------------------------------

const DEDUCTIONS = {
  brokenLinkPerLink: 20,   // per broken link, capped at 3 links (-60 max)
  brokenLinkCap: 60,
  noInternalLinks: 5,
  highGenericRatio: 10,    // >50% anchors are generic
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially relative href to an absolute URL string.
 *
 * @param {string} href
 * @param {string} baseUrl - The page URL being audited.
 * @returns {string|null} Absolute URL, or null if href is not a navigable link.
 */
function resolveUrl(href, baseUrl) {
  if (!href) return null;
  const trimmed = href.trim();
  // Skip fragment-only, javascript:, mailto:, tel: and similar non-HTTP hrefs
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('data:') ||
    trimmed === ''
  ) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Determine if a URL is internal relative to the base URL.
 *
 * @param {string} absoluteUrl
 * @param {string} baseUrl
 * @returns {boolean}
 */
function isInternal(absoluteUrl, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const target = new URL(absoluteUrl);
    return target.hostname === base.hostname;
  } catch {
    return false;
  }
}

/**
 * Test whether an anchor text string is generic.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isGenericAnchor(text) {
  const normalised = text.trim().toLowerCase();
  return GENERIC_ANCHOR_PATTERNS.includes(normalised);
}

/**
 * Probe a URL and return its HTTP status code. Returns null on network error.
 * Uses a HEAD request first; falls back to GET if the server rejects HEAD.
 *
 * @param {string} url
 * @returns {Promise<{url: string, status: number|null, redirectUrl: string|null}>}
 */
async function probeUrl(url) {
  try {
    const response = await fetchHead(url);
    const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    const redirectUrl = finalUrl !== url ? finalUrl : null;
    return { url, status: response.status, redirectUrl };
  } catch (err) {
    if (err.response) {
      return { url, status: err.response.status, redirectUrl: null };
    }
    // Network error / DNS failure / timeout
    return { url, status: null, redirectUrl: null };
  }
}

/**
 * Determine the status category from an HTTP status code.
 *
 * @param {number|null} statusCode
 * @returns {'ok'|'redirect'|'broken'|'unknown'}
 */
function categoriseStatus(statusCode) {
  if (statusCode === null) return 'unknown';
  if (statusCode >= 200 && statusCode < 300) return 'ok';
  if (statusCode >= 300 && statusCode < 400) return 'redirect';
  if (statusCode >= 400) return 'broken';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Run all link checks against the given URL.
 *
 * @param {string} url - The page URL to audit.
 * @returns {Promise<{
 *   score: number,
 *   checks: Array,
 *   links: {
 *     internal: Array,
 *     external: Array,
 *     broken: Array,
 *     nofollow: Array,
 *     redirects: Array
 *   },
 *   summary: {
 *     internalCount: number,
 *     externalCount: number,
 *     brokenCount: number,
 *     nofollowCount: number
 *   }
 * }>}
 */
export default async function checkLinks(url) {
  const response = await fetchPage(url);
  const $ = parsePage(response.data);

  // --- Extract all anchor elements -----------------------------------------

  /**
   * @type {Array<{
   *   href: string,
   *   absoluteUrl: string,
   *   anchorText: string,
   *   isNofollow: boolean,
   *   internal: boolean
   * }>}
   */
  const rawLinks = [];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const absoluteUrl = resolveUrl(href, url);
    if (!absoluteUrl) return; // skip fragment-only / non-navigable links

    const anchorText = $el.text().trim();
    const rel = ($el.attr('rel') || '').toLowerCase();
    const isNofollow = rel.includes('nofollow');
    const internal = isInternal(absoluteUrl, url);

    rawLinks.push({ href, absoluteUrl, anchorText, isNofollow, internal });
  });

  // Deduplicate by absoluteUrl for probing (keep all occurrences in full list)
  const uniqueUrls = [...new Set(rawLinks.map(l => l.absoluteUrl))];

  // --- Classify links -------------------------------------------------------

  const internalLinks = rawLinks.filter(l => l.internal);
  const externalLinks = rawLinks.filter(l => !l.internal);
  const nofollowLinks = rawLinks.filter(l => l.isNofollow);

  // --- Identify generic / empty anchors ------------------------------------

  const emptyAnchorCount = rawLinks.filter(l => l.anchorText === '').length;
  const genericAnchorCount = rawLinks.filter(
    l => l.anchorText !== '' && isGenericAnchor(l.anchorText)
  ).length;
  const totalAnchorsWithText = rawLinks.filter(l => l.anchorText !== '').length;
  const genericRatio = totalAnchorsWithText > 0
    ? genericAnchorCount / totalAnchorsWithText
    : 0;

  // --- Probe links for broken / redirect status ----------------------------

  // Prioritise internal links and external links, sampling up to MAX_PROBE total
  const prioritised = [
    ...internalLinks.map(l => l.absoluteUrl),
    ...externalLinks.map(l => l.absoluteUrl),
  ];
  // Deduplicate while preserving priority order
  const seen = new Set();
  const probeList = [];
  for (const u of prioritised) {
    if (!seen.has(u)) {
      seen.add(u);
      probeList.push(u);
      if (probeList.length >= MAX_PROBE) break;
    }
  }

  // Run probes concurrently (but not in one giant burst — group in batches of 5)
  const BATCH_SIZE = 5;
  /** @type {Array<{url: string, status: number|null, redirectUrl: string|null}>} */
  const probeResults = [];
  for (let i = 0; i < probeList.length; i += BATCH_SIZE) {
    const batch = probeList.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(u => probeUrl(u)));
    probeResults.push(...results);
  }

  // Build a lookup map
  /** @type {Map<string, {status: number|null, redirectUrl: string|null}>} */
  const probeMap = new Map(probeResults.map(r => [r.url, { status: r.status, redirectUrl: r.redirectUrl }]));

  // Classify probed links
  const brokenLinks = probeResults
    .filter(r => categoriseStatus(r.status) === 'broken' || categoriseStatus(r.status) === 'unknown')
    .map(r => ({
      url: r.url,
      status: r.status,
      anchorText: rawLinks.find(l => l.absoluteUrl === r.url)?.anchorText || '',
    }));

  const redirectLinks = probeResults
    .filter(r => categoriseStatus(r.status) === 'redirect' && r.redirectUrl)
    .map(r => ({
      url: r.url,
      redirectUrl: r.redirectUrl,
      status: r.status,
    }));

  // --- Build checks array ---------------------------------------------------

  const checks = [];
  let score = 100;

  // 1. Internal links count
  {
    const count = internalLinks.length;
    if (count === 0) {
      score -= DEDUCTIONS.noInternalLinks;
      checks.push({
        name: 'Internal links',
        status: 'warn',
        value: '0',
        note: 'No internal links found. Internal linking helps distribute PageRank and aids navigation.',
      });
    } else {
      checks.push({
        name: 'Internal links',
        status: 'ok',
        value: String(count),
        note: `${count} internal link(s) found — good for site structure and crawlability.`,
      });
    }
  }

  // 2. External links count
  {
    const count = externalLinks.length;
    checks.push({
      name: 'External links',
      status: 'ok',
      value: String(count),
      note: count > 0
        ? `${count} external link(s) found.`
        : 'No external links found.',
    });
  }

  // 3. Broken links
  {
    const count = brokenLinks.length;
    const probeCount = probeList.length;
    if (count === 0) {
      checks.push({
        name: 'Broken links',
        status: 'ok',
        value: `0/${probeCount} probed`,
        note: `No broken links found in the ${probeCount} link(s) probed.`,
      });
    } else {
      const deduction = Math.min(
        DEDUCTIONS.brokenLinkCap,
        count * DEDUCTIONS.brokenLinkPerLink
      );
      score -= deduction;
      const sample = brokenLinks
        .slice(0, 3)
        .map(l => `${l.url} (${l.status ?? 'network error'})`)
        .join('; ');
      checks.push({
        name: 'Broken links',
        status: 'fail',
        value: `${count}/${probeCount} probed`,
        note: `${count} broken link(s) detected. Examples: ${sample}`,
      });
    }
  }

  // 4. Nofollow links
  {
    const count = nofollowLinks.length;
    if (count === 0) {
      checks.push({
        name: 'Nofollow links',
        status: 'ok',
        value: '0',
        note: 'No nofollow links found.',
      });
    } else {
      checks.push({
        name: 'Nofollow links',
        status: 'ok',
        value: String(count),
        note: `${count} link(s) have rel="nofollow". Review that these are intentional (e.g. paid / UGC links).`,
      });
    }
  }

  // 5. Generic anchor text
  {
    if (rawLinks.length === 0) {
      checks.push({
        name: 'Anchor text quality',
        status: 'ok',
        value: 'N/A',
        note: 'No links found on this page.',
      });
    } else if (genericRatio > 0.5) {
      score -= DEDUCTIONS.highGenericRatio;
      checks.push({
        name: 'Anchor text quality',
        status: 'fail',
        value: `${genericAnchorCount} generic`,
        note: `${Math.round(genericRatio * 100)}% of anchors use generic text (e.g. "click here", "read more"). Use descriptive, keyword-rich anchor text.`,
      });
    } else if (genericAnchorCount > 0) {
      checks.push({
        name: 'Anchor text quality',
        status: 'warn',
        value: `${genericAnchorCount} generic`,
        note: `${genericAnchorCount} link(s) use generic anchor text. Descriptive anchors improve SEO and accessibility.`,
      });
    } else {
      checks.push({
        name: 'Anchor text quality',
        status: 'ok',
        value: 'All descriptive',
        note: 'No generic anchor text found.',
      });
    }
  }

  // 6. Empty anchor text
  {
    if (emptyAnchorCount === 0) {
      checks.push({
        name: 'Empty anchors',
        status: 'ok',
        value: '0',
        note: 'All links have anchor text.',
      });
    } else {
      checks.push({
        name: 'Empty anchors',
        status: 'warn',
        value: String(emptyAnchorCount),
        note: `${emptyAnchorCount} link(s) have empty anchor text. Add descriptive text or aria-label for accessibility and SEO.`,
      });
    }
  }

  // 7. Redirect chains
  {
    if (redirectLinks.length === 0) {
      checks.push({
        name: 'Redirect links',
        status: 'ok',
        value: '0',
        note: 'No redirecting links detected in the probed sample.',
      });
    } else {
      checks.push({
        name: 'Redirect links',
        status: 'warn',
        value: String(redirectLinks.length),
        note: `${redirectLinks.length} link(s) redirect to another URL. Update them to point directly to the final destination where possible.`,
      });
    }
  }

  // Clamp score to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const summary = {
    internalCount: internalLinks.length,
    externalCount: externalLinks.length,
    brokenCount: brokenLinks.length,
    nofollowCount: nofollowLinks.length,
  };

  const links = {
    internal: internalLinks.map(l => ({ url: l.absoluteUrl, anchorText: l.anchorText })),
    external: externalLinks.map(l => ({ url: l.absoluteUrl, anchorText: l.anchorText })),
    broken: brokenLinks,
    nofollow: nofollowLinks.map(l => ({ url: l.absoluteUrl, anchorText: l.anchorText })),
    redirects: redirectLinks,
  };

  return { score, checks, links, summary };
}

// ---------------------------------------------------------------------------
// Display helper
// ---------------------------------------------------------------------------

/**
 * Print the link check result as a formatted table to stdout.
 *
 * @param {object} result - The object returned by checkLinks().
 */
export function displayLinks(result) {
  const { score, checks, links, summary } = result;

  console.log('');
  console.log(`Links — Score: ${score}/100`);
  console.log('');

  // Summary line
  console.log(
    `Internal: ${summary.internalCount}  |  ` +
    `External: ${summary.externalCount}  |  ` +
    `Broken: ${summary.brokenCount}  |  ` +
    `Nofollow: ${summary.nofollowCount}`
  );
  console.log('');

  const checkRows = checks.map(check => [
    statusIcon(check.status),
    check.name,
    check.value != null ? String(check.value) : '',
    check.note,
  ]);

  printTable(
    ['', 'Check', 'Value', 'Note'],
    checkRows,
    [3, 22, 20, 55]
  );

  // Broken links detail table (if any)
  if (links.broken.length > 0) {
    console.log('');
    console.log('Broken links detail:');

    const brokenRows = links.broken.map(l => [
      String(l.status ?? 'error'),
      l.url,
      l.anchorText || '(empty)',
    ]);

    printTable(
      ['Status', 'URL', 'Anchor text'],
      brokenRows,
      [8, 60, 30]
    );
  }

  // Redirect links detail table (if any)
  if (links.redirects.length > 0) {
    console.log('');
    console.log('Redirecting links:');

    const redirectRows = links.redirects.map(l => [
      String(l.status),
      l.url,
      l.redirectUrl,
    ]);

    printTable(
      ['Status', 'Original URL', 'Redirect target'],
      redirectRows,
      [8, 50, 50]
    );
  }
}
