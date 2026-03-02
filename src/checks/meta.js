/**
 * meta.js — SEO meta tag check module
 *
 * Fetches a URL, parses all meta-related SEO signals, and returns a structured
 * result with a 0-100 score plus per-check details.
 */

import { fetchPage } from '../utils/fetcher.js';
import { parsePage } from '../utils/parser.js';
import { printTable, statusIcon } from '../utils/display.js';

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

const DEDUCTIONS = {
  titleMissing: 20,
  titleWrongLength: 5,
  descMissing: 15,
  descWrongLength: 5,
  noH1: 15,
  multipleH1: 10,
  noCanonical: 5,
  noOG: 10,
  noTwitterCard: 5,
  noLang: 5,
};

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

// ---------------------------------------------------------------------------
// Core check logic
// ---------------------------------------------------------------------------

/**
 * Run all meta / on-page SEO checks against the given URL.
 *
 * @param {string} url - The page URL to audit.
 * @returns {Promise<{score: number, checks: Array, raw: object}>}
 */
export default async function checkMeta(url) {
  const response = await fetchPage(url);
  const $ = parsePage(response.data);

  // --- Extract raw values ---------------------------------------------------

  const title = $('title').first().text().trim() || null;

  const descriptionTag = $('meta[name="description"]').first();
  const description = descriptionTag.length ? descriptionTag.attr('content')?.trim() || null : null;

  const h1Elements = $('h1');
  const h1Texts = h1Elements.map((_, el) => $(el).text().trim()).get();
  const h1 = h1Texts.length > 0 ? h1Texts[0] : null;

  // Build a map of heading tags and their counts for hierarchy checking
  const headingCounts = {};
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
    headingCounts[tag] = $(tag).length;
  });

  const canonicalTag = $('link[rel="canonical"]').first();
  const canonical = canonicalTag.length ? canonicalTag.attr('href')?.trim() || null : null;

  const og = {
    title: $('meta[property="og:title"]').attr('content')?.trim() || null,
    description: $('meta[property="og:description"]').attr('content')?.trim() || null,
    image: $('meta[property="og:image"]').attr('content')?.trim() || null,
  };

  const twitter = {
    card: $('meta[name="twitter:card"]').attr('content')?.trim() || null,
    title: $('meta[name="twitter:title"]').attr('content')?.trim() || null,
    description: $('meta[name="twitter:description"]').attr('content')?.trim() || null,
  };

  const robotsMeta = $('meta[name="robots"]').attr('content')?.trim() || null;

  const lang = $('html').attr('lang')?.trim() || null;

  const hreflangLinks = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({
      hreflang: $(el).attr('hreflang'),
      href: $(el).attr('href'),
    }))
    .get();

  const h2s = $('h2').map((_, el) => $(el).text().trim()).get();

  // --- Run individual checks ------------------------------------------------

  const checks = [];
  let score = 100;

  // 1. Title tag — present
  if (!title) {
    score -= DEDUCTIONS.titleMissing;
    checks.push({
      name: 'Title tag',
      status: 'fail',
      value: '(missing)',
      note: 'No <title> tag found. Title is critical for SEO and click-through rates.',
    });
  } else {
    const len = title.length;
    if (len < TITLE_MIN || len > TITLE_MAX) {
      score -= DEDUCTIONS.titleWrongLength;
      checks.push({
        name: 'Title tag',
        status: 'warn',
        value: title,
        note: `Title is ${len} chars. Recommended range is ${TITLE_MIN}–${TITLE_MAX} characters.`,
      });
    } else {
      checks.push({
        name: 'Title tag',
        status: 'ok',
        value: title,
        note: `Title is ${len} chars — within the recommended ${TITLE_MIN}–${TITLE_MAX} range.`,
      });
    }
  }

  // 2. Meta description — present
  if (!description) {
    score -= DEDUCTIONS.descMissing;
    checks.push({
      name: 'Meta description',
      status: 'fail',
      value: '(missing)',
      note: 'No meta description tag found. Add one to improve snippet appearance in SERPs.',
    });
  } else {
    const len = description.length;
    if (len < DESC_MIN || len > DESC_MAX) {
      score -= DEDUCTIONS.descWrongLength;
      checks.push({
        name: 'Meta description',
        status: 'warn',
        value: description,
        note: `Description is ${len} chars. Recommended range is ${DESC_MIN}–${DESC_MAX} characters.`,
      });
    } else {
      checks.push({
        name: 'Meta description',
        status: 'ok',
        value: description,
        note: `Description is ${len} chars — within the recommended ${DESC_MIN}–${DESC_MAX} range.`,
      });
    }
  }

  // 3. H1 — present
  if (h1Texts.length === 0) {
    score -= DEDUCTIONS.noH1;
    checks.push({
      name: 'H1 tag',
      status: 'fail',
      value: '(missing)',
      note: 'No H1 tag found. Every page should have exactly one H1.',
    });
  } else if (h1Texts.length > 1) {
    // 4. H1 — unique
    score -= DEDUCTIONS.multipleH1;
    checks.push({
      name: 'H1 tag',
      status: 'warn',
      value: h1Texts.join(' | '),
      note: `Found ${h1Texts.length} H1 tags. Only one H1 is recommended per page.`,
    });
  } else {
    checks.push({
      name: 'H1 tag',
      status: 'ok',
      value: h1Texts[0],
      note: 'Exactly one H1 tag found.',
    });
  }

  // 5. Heading hierarchy (H2–H6)
  {
    const issues = [];
    // Check that H2 exists if H1 exists and there is significant content
    if (headingCounts.h1 > 0 && headingCounts.h2 === 0) {
      issues.push('No H2 headings found — consider adding subheadings for structure.');
    }
    // Check for skipped levels: e.g. H1 -> H3 without H2
    const levels = [1, 2, 3, 4, 5, 6];
    let lastUsed = 0;
    const skipped = [];
    for (const level of levels) {
      const count = headingCounts[`h${level}`] || 0;
      if (count > 0) {
        if (lastUsed > 0 && level > lastUsed + 1) {
          skipped.push(`H${lastUsed} → H${level} (H${lastUsed + 1} skipped)`);
        }
        lastUsed = level;
      }
    }
    if (skipped.length > 0) {
      issues.push(`Heading levels skipped: ${skipped.join(', ')}.`);
    }

    const hierarchySummary = levels
      .map(l => `H${l}:${headingCounts[`h${l}`] || 0}`)
      .join(', ');

    if (issues.length > 0) {
      checks.push({
        name: 'Heading hierarchy',
        status: 'warn',
        value: hierarchySummary,
        note: issues.join(' '),
      });
    } else {
      checks.push({
        name: 'Heading hierarchy',
        status: 'ok',
        value: hierarchySummary,
        note: 'Heading structure looks correct.',
      });
    }
  }

  // 6. Canonical URL
  if (!canonical) {
    score -= DEDUCTIONS.noCanonical;
    checks.push({
      name: 'Canonical URL',
      status: 'warn',
      value: '(missing)',
      note: 'No canonical link tag found. Add one to prevent duplicate content issues.',
    });
  } else {
    checks.push({
      name: 'Canonical URL',
      status: 'ok',
      value: canonical,
      note: 'Canonical link tag present.',
    });
  }

  // 7. Open Graph tags
  const ogPresent = og.title && og.description && og.image;
  const ogMissing = [];
  if (!og.title) ogMissing.push('og:title');
  if (!og.description) ogMissing.push('og:description');
  if (!og.image) ogMissing.push('og:image');

  if (!ogPresent) {
    score -= DEDUCTIONS.noOG;
    checks.push({
      name: 'Open Graph tags',
      status: ogMissing.length === 3 ? 'fail' : 'warn',
      value: ogMissing.length === 3 ? '(missing)' : `Missing: ${ogMissing.join(', ')}`,
      note: `OG tags control appearance when shared on social media. Missing: ${ogMissing.join(', ')}.`,
    });
  } else {
    checks.push({
      name: 'Open Graph tags',
      status: 'ok',
      value: og.title,
      note: 'og:title, og:description, and og:image are all present.',
    });
  }

  // 8. Twitter card
  if (!twitter.card) {
    score -= DEDUCTIONS.noTwitterCard;
    checks.push({
      name: 'Twitter card',
      status: 'warn',
      value: '(missing)',
      note: 'No twitter:card meta tag found. Add one to control Twitter link previews.',
    });
  } else {
    checks.push({
      name: 'Twitter card',
      status: 'ok',
      value: twitter.card,
      note: 'Twitter card meta tag is present.',
    });
  }

  // 9. Robots meta
  if (!robotsMeta) {
    checks.push({
      name: 'Robots meta',
      status: 'ok',
      value: '(not set — default index/follow)',
      note: 'No robots meta tag present. Defaults to index, follow — which is fine.',
    });
  } else {
    const isBlocking =
      /noindex/i.test(robotsMeta) || /nofollow/i.test(robotsMeta);
    checks.push({
      name: 'Robots meta',
      status: isBlocking ? 'warn' : 'ok',
      value: robotsMeta,
      note: isBlocking
        ? `Robots meta contains restrictive directives: "${robotsMeta}". Ensure this is intentional.`
        : `Robots meta is set to "${robotsMeta}".`,
    });
  }

  // 10. Lang attribute
  if (!lang) {
    score -= DEDUCTIONS.noLang;
    checks.push({
      name: 'Language attribute',
      status: 'warn',
      value: '(missing)',
      note: 'No lang attribute on <html>. Add one to help search engines identify the page language.',
    });
  } else {
    checks.push({
      name: 'Language attribute',
      status: 'ok',
      value: lang,
      note: `Language attribute is set to "${lang}".`,
    });
  }

  // 11. Hreflang
  if (hreflangLinks.length > 0) {
    checks.push({
      name: 'Hreflang',
      status: 'ok',
      value: `${hreflangLinks.length} hreflang link(s)`,
      note: `Hreflang tags found for: ${hreflangLinks.map(l => l.hreflang).join(', ')}.`,
    });
  } else {
    checks.push({
      name: 'Hreflang',
      status: 'ok',
      value: '(none)',
      note: 'No hreflang tags present. Only relevant for multilingual / multi-region sites.',
    });
  }

  // Clamp score to [0, 100]
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    checks,
    raw: {
      title,
      description,
      h1,
      h2: h2s,
      canonical,
      og,
      twitter,
      robots: robotsMeta,
      lang,
      hreflang: hreflangLinks,
    },
  };
}

// ---------------------------------------------------------------------------
// Display helper
// ---------------------------------------------------------------------------

/**
 * Print the meta check result as a formatted table to stdout.
 *
 * @param {object} result - The object returned by checkMeta().
 */
export function displayMeta(result) {
  const { score, checks } = result;

  console.log('');
  console.log(`Meta / On-Page SEO — Score: ${score}/100`);
  console.log('');

  const rows = checks.map(check => [
    statusIcon(check.status),
    check.name,
    check.value != null ? String(check.value).slice(0, 80) : '',
    check.note,
  ]);

  printTable(
    ['', 'Check', 'Value', 'Note'],
    rows,
    [3, 22, 30, 50]
  );
}
