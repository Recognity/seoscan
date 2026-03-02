import * as cheerio from 'cheerio';
import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

/**
 * Checks whether an image src URL uses a modern format (webp or avif).
 *
 * @param {string} src
 * @returns {boolean}
 */
function isModernFormat(src) {
  if (!src) return false;
  const lower = src.toLowerCase().split('?')[0];
  return lower.endsWith('.webp') || lower.endsWith('.avif');
}

/**
 * Resolves a potentially relative URL against a base URL.
 *
 * @param {string} src
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(src, baseUrl) {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

/**
 * Audits all images on the given page URL.
 *
 * Scoring:
 *   Start at 100.
 *   -5 per missing alt (no attribute at all), capped at -40.
 *   -5 per alt too long (>125 chars), capped at -20.
 *   -10 if more than 50% of images are missing width/height dimensions.
 *   -10 if no images use lazy loading at all (only penalised when >=3 images).
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   images: {
 *     total: number,
 *     missingAlt: string[],
 *     emptyAlt: string[],
 *     altTooLong: string[],
 *     missingDimensions: string[],
 *     noLazy: string[],
 *     modernFormat: string[]
 *   },
 *   summary: {
 *     total: number,
 *     missingAltCount: number,
 *     emptyAltCount: number,
 *     altTooLongCount: number,
 *     missingDimensionsCount: number,
 *     noLazyCount: number,
 *     modernFormatCount: number
 *   }
 * }>}
 */
export default async function checkImages(url) {
  const checks = [];

  const images = {
    total: 0,
    missingAlt: /** @type {string[]} */ ([]),
    emptyAlt: /** @type {string[]} */ ([]),
    altTooLong: /** @type {string[]} */ ([]),
    missingDimensions: /** @type {string[]} */ ([]),
    noLazy: /** @type {string[]} */ ([]),
    modernFormat: /** @type {string[]} */ ([]),
  };

  let score = 100;

  try {
    const response = await fetch(url);

    if (response.status !== 200) {
      checks.push({
        name: 'Page fetch',
        status: 'fail',
        detail: `HTTP ${response.status} — could not retrieve page`,
      });
      return { score: 0, checks, images, summary: buildSummary(images) };
    }

    const $ = cheerio.load(response.data);

    // Collect all <img> elements
    const imgElements = $('img');

    imgElements.each((_i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      const resolvedSrc = src ? resolveUrl(src, url) : '(no src)';

      images.total += 1;

      // --- Alt attribute checks ---
      const hasAlt = $(el).attr('alt') !== undefined;
      if (!hasAlt) {
        images.missingAlt.push(resolvedSrc);
      } else {
        const altValue = $(el).attr('alt');
        if (altValue === '') {
          // Empty alt is acceptable for decorative images; track but don't penalise score
          images.emptyAlt.push(resolvedSrc);
        } else if (altValue.length > 125) {
          images.altTooLong.push(resolvedSrc);
        }
      }

      // --- Dimension checks ---
      const hasWidth = $(el).attr('width') !== undefined;
      const hasHeight = $(el).attr('height') !== undefined;
      if (!hasWidth || !hasHeight) {
        images.missingDimensions.push(resolvedSrc);
      }

      // --- Lazy loading check ---
      const loading = ($(el).attr('loading') || '').toLowerCase();
      const hasLazy =
        loading === 'lazy' ||
        $(el).attr('data-lazy') !== undefined ||
        $(el).attr('data-src') !== undefined; // common lazy-load marker
      if (!hasLazy) {
        images.noLazy.push(resolvedSrc);
      }

      // --- Modern format check ---
      if (isModernFormat(src)) {
        images.modernFormat.push(resolvedSrc);
      }
    });

    // ----------------------------------------------------------------
    // Build checks array
    // ----------------------------------------------------------------

    // Total images
    checks.push({
      name: 'Total images',
      status: 'pass',
      detail: `${images.total} image(s) found`,
    });

    // Missing alt
    if (images.total === 0) {
      checks.push({
        name: 'Alt attributes',
        status: 'pass',
        detail: 'No images on page',
      });
    } else if (images.missingAlt.length === 0) {
      checks.push({
        name: 'Alt attributes',
        status: 'pass',
        detail: 'All images have alt attributes',
      });
    } else {
      const pct = Math.round((images.missingAlt.length / images.total) * 100);
      checks.push({
        name: 'Alt attributes',
        status: 'fail',
        detail: `${images.missingAlt.length} image(s) missing alt attribute (${pct}%)`,
      });
    }

    // Empty alt (informational — decorative images)
    if (images.emptyAlt.length > 0) {
      checks.push({
        name: 'Empty alt (decorative)',
        status: 'pass',
        detail: `${images.emptyAlt.length} image(s) have empty alt (OK for decorative)`,
      });
    }

    // Alt too long
    if (images.altTooLong.length === 0) {
      checks.push({
        name: 'Alt text length',
        status: 'pass',
        detail: 'No alt texts exceed 125 characters',
      });
    } else {
      checks.push({
        name: 'Alt text length',
        status: 'warn',
        detail: `${images.altTooLong.length} image(s) have alt text exceeding 125 characters`,
      });
    }

    // Missing dimensions
    if (images.total > 0) {
      const dimPct = images.missingDimensions.length / images.total;
      if (dimPct > 0.5) {
        checks.push({
          name: 'Image dimensions',
          status: 'fail',
          detail: `${images.missingDimensions.length}/${images.total} images missing width/height (${Math.round(dimPct * 100)}%)`,
        });
      } else if (images.missingDimensions.length > 0) {
        checks.push({
          name: 'Image dimensions',
          status: 'warn',
          detail: `${images.missingDimensions.length}/${images.total} images missing width/height`,
        });
      } else {
        checks.push({
          name: 'Image dimensions',
          status: 'pass',
          detail: 'All images have width and height attributes',
        });
      }
    }

    // Lazy loading
    if (images.total >= 3) {
      const lazyCount = images.total - images.noLazy.length;
      if (lazyCount === 0) {
        checks.push({
          name: 'Lazy loading',
          status: 'fail',
          detail: 'No images use lazy loading',
        });
      } else {
        checks.push({
          name: 'Lazy loading',
          status: 'pass',
          detail: `${lazyCount}/${images.total} images use lazy loading`,
        });
      }
    } else if (images.total > 0) {
      checks.push({
        name: 'Lazy loading',
        status: 'pass',
        detail: `${images.total} image(s) — lazy loading not required`,
      });
    }

    // Modern format
    if (images.total === 0) {
      checks.push({
        name: 'Modern formats (WebP/AVIF)',
        status: 'pass',
        detail: 'No images on page',
      });
    } else if (images.modernFormat.length === 0) {
      checks.push({
        name: 'Modern formats (WebP/AVIF)',
        status: 'warn',
        detail: 'No images use WebP or AVIF format',
      });
    } else {
      const modernPct = Math.round((images.modernFormat.length / images.total) * 100);
      checks.push({
        name: 'Modern formats (WebP/AVIF)',
        status: 'pass',
        detail: `${images.modernFormat.length}/${images.total} images use modern format (${modernPct}%)`,
      });
    }

    // ----------------------------------------------------------------
    // Scoring
    // ----------------------------------------------------------------

    // -5 per missing alt, max -40
    const missingAltPenalty = Math.min(images.missingAlt.length * 5, 40);
    score -= missingAltPenalty;

    // -5 per alt too long, max -20
    const altTooLongPenalty = Math.min(images.altTooLong.length * 5, 20);
    score -= altTooLongPenalty;

    // -10 if >50% missing dimensions
    if (images.total > 0 && images.missingDimensions.length / images.total > 0.5) {
      score -= 10;
    }

    // -10 if no lazy loading at all (only when >= 3 images)
    if (images.total >= 3 && images.noLazy.length === images.total) {
      score -= 10;
    }

    score = Math.max(0, score);
  } catch (err) {
    checks.push({
      name: 'Page fetch',
      status: 'fail',
      detail: `Error fetching page: ${err.message}`,
    });
    score = 0;
  }

  return {
    score,
    checks,
    images,
    summary: buildSummary(images),
  };
}

/**
 * Builds the summary object from the images data.
 *
 * @param {object} images
 * @returns {object}
 */
function buildSummary(images) {
  return {
    total: images.total,
    missingAltCount: images.missingAlt.length,
    emptyAltCount: images.emptyAlt.length,
    altTooLongCount: images.altTooLong.length,
    missingDimensionsCount: images.missingDimensions.length,
    noLazyCount: images.noLazy.length,
    modernFormatCount: images.modernFormat.length,
  };
}

/**
 * Returns a status symbol coloured with chalk.
 *
 * @param {'pass'|'warn'|'fail'} status
 * @returns {string}
 */
function statusSymbol(status) {
  if (status === 'pass') return chalk.green('PASS');
  if (status === 'warn') return chalk.yellow('WARN');
  return chalk.red('FAIL');
}

/**
 * Displays the image check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   images: object,
 *   summary: object
 * }} result
 */
export function displayImages(result) {
  const { score, checks, summary, images } = result;

  console.log('');
  console.log(chalk.bold.underline('Image Audit'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // Summary table
  const summaryTable = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Count')],
    colWidths: [35, 10],
  });

  summaryTable.push(
    ['Total images', summary.total],
    [chalk.red('Missing alt'), summary.missingAltCount],
    [chalk.gray('Empty alt (decorative)'), summary.emptyAltCount],
    [chalk.yellow('Alt too long (>125 chars)'), summary.altTooLongCount],
    [chalk.yellow('Missing dimensions'), summary.missingDimensionsCount],
    [chalk.yellow('No lazy loading'), summary.noLazyCount],
    [chalk.green('Modern format (WebP/AVIF)'), summary.modernFormatCount],
  );

  console.log('');
  console.log(summaryTable.toString());

  // Checks table
  const checksTable = new Table({
    head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Detail')],
    colWidths: [30, 8, 55],
  });

  for (const check of checks) {
    checksTable.push([check.name, statusSymbol(check.status), check.detail]);
  }

  console.log('');
  console.log(checksTable.toString());

  // Problem images table (if any issues)
  if (images.missingAlt.length > 0) {
    console.log('');
    console.log(chalk.bold('Images missing alt attribute:'));
    const missingTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('Image URL')],
      colWidths: [5, 85],
    });
    images.missingAlt.slice(0, 20).forEach((src, i) => {
      missingTable.push([i + 1, src]);
    });
    if (images.missingAlt.length > 20) {
      missingTable.push(['...', `and ${images.missingAlt.length - 20} more`]);
    }
    console.log(missingTable.toString());
  }

  if (images.altTooLong.length > 0) {
    console.log('');
    console.log(chalk.bold('Images with alt text > 125 characters:'));
    const longAltTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('Image URL')],
      colWidths: [5, 85],
    });
    images.altTooLong.slice(0, 20).forEach((src, i) => {
      longAltTable.push([i + 1, src]);
    });
    console.log(longAltTable.toString());
  }
}
