import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

/**
 * Extracts the origin (scheme + host + optional port) from a URL string.
 *
 * @param {string} url
 * @returns {string}
 */
function getOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * Parses a sitemap XML string and returns all <loc> entries plus <lastmod> dates.
 *
 * Handles both regular sitemaps (<url><loc>…) and sitemap index files
 * (<sitemap><loc>…).
 *
 * @param {string} xml
 * @returns {{ urls: string[], lastModified: string }}
 */
function parseSitemapXml(xml) {
  const urls = [];
  let latestLastMod = '';

  // Extract all <loc> values
  const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const loc = match[1].trim();
    if (loc) urls.push(loc);
  }

  // Extract all <lastmod> values and find the most recent
  const lastModRegex = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/gi;
  const dates = [];
  while ((match = lastModRegex.exec(xml)) !== null) {
    const d = match[1].trim();
    if (d) dates.push(d);
  }
  if (dates.length > 0) {
    // Sort lexicographically; ISO dates sort correctly this way
    dates.sort((a, b) => (a > b ? -1 : 1));
    latestLastMod = dates[0];
  }

  return { urls, lastModified: latestLastMod };
}

/**
 * Checks whether the robots.txt content references a sitemap via a
 * "Sitemap:" directive.
 *
 * @param {string} robotsContent
 * @returns {boolean}
 */
function robotsReferencesSitemap(robotsContent) {
  return /^\s*Sitemap\s*:/im.test(robotsContent);
}

/**
 * Spot-checks whether a URL is accessible (returns 2xx status).
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isUrlAccessible(url) {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    if (resp.status === 405 || resp.status === 501) {
      // Server doesn't allow HEAD; try GET
      const getResp = await fetch(url);
      return getResp.status >= 200 && getResp.status < 300;
    }
    return resp.status >= 200 && resp.status < 300;
  } catch {
    return false;
  }
}

/**
 * Audits the sitemap for the given URL.
 *
 * Scoring:
 *   Start at 100.
 *   -40 if no sitemap found.
 *   -10 if sitemap is not referenced in robots.txt.
 *   -10 per inaccessible sample URL (max -30).
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   sitemap: {
 *     found: boolean,
 *     url: string,
 *     urlCount: number,
 *     urls: string[],
 *     lastModified: string,
 *     referencedInRobots: boolean
 *   }
 * }>}
 */
export default async function checkSitemap(url) {
  const checks = [];
  let score = 100;

  const sitemapResult = {
    found: false,
    url: '',
    urlCount: 0,
    urls: /** @type {string[]} */ ([]),
    lastModified: '',
    referencedInRobots: false,
  };

  const origin = getOrigin(url);
  if (!origin) {
    checks.push({ name: 'URL parse', status: 'fail', detail: `Cannot parse URL: ${url}` });
    return { score: 0, checks, sitemap: sitemapResult };
  }

  // ----------------------------------------------------------------
  // Try to find the sitemap
  // ----------------------------------------------------------------
  const candidateUrls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];

  let sitemapXml = null;
  let sitemapUrl = '';

  for (const candidate of candidateUrls) {
    try {
      const resp = await fetch(candidate);
      if (resp.status === 200 && typeof resp.data === 'string' && resp.data.includes('<')) {
        sitemapXml = resp.data;
        sitemapUrl = candidate;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  if (!sitemapXml) {
    sitemapResult.found = false;
    checks.push({
      name: 'Sitemap found',
      status: 'fail',
      detail: `No sitemap found at ${candidateUrls.join(' or ')}`,
    });
    score -= 40;
  } else {
    sitemapResult.found = true;
    sitemapResult.url = sitemapUrl;

    checks.push({
      name: 'Sitemap found',
      status: 'pass',
      detail: `Sitemap found at ${sitemapUrl}`,
    });

    // Parse sitemap
    const parsed = parseSitemapXml(sitemapXml);
    sitemapResult.urls = parsed.urls;
    sitemapResult.urlCount = parsed.urls.length;
    sitemapResult.lastModified = parsed.lastModified;

    checks.push({
      name: 'URL count',
      status: parsed.urls.length > 0 ? 'pass' : 'warn',
      detail:
        parsed.urls.length > 0
          ? `${parsed.urls.length} URL(s) in sitemap`
          : 'Sitemap contains no URLs',
    });

    if (parsed.lastModified) {
      checks.push({
        name: 'Last modified',
        status: 'pass',
        detail: `Most recent lastmod: ${parsed.lastModified}`,
      });
    } else {
      checks.push({
        name: 'Last modified',
        status: 'warn',
        detail: 'No lastmod dates found in sitemap',
      });
    }
  }

  // ----------------------------------------------------------------
  // Check robots.txt for sitemap reference
  // ----------------------------------------------------------------
  let robotsContent = '';
  try {
    const robotsResp = await fetch(`${origin}/robots.txt`);
    if (robotsResp.status === 200 && typeof robotsResp.data === 'string') {
      robotsContent = robotsResp.data;
    }
  } catch {
    // robots.txt is best-effort
  }

  if (robotsContent) {
    const referenced = robotsReferencesSitemap(robotsContent);
    sitemapResult.referencedInRobots = referenced;

    if (referenced) {
      checks.push({
        name: 'Referenced in robots.txt',
        status: 'pass',
        detail: 'robots.txt includes a Sitemap: directive',
      });
    } else {
      checks.push({
        name: 'Referenced in robots.txt',
        status: 'warn',
        detail: 'robots.txt does not reference the sitemap',
      });
      score -= 10;
    }
  } else {
    checks.push({
      name: 'Referenced in robots.txt',
      status: 'warn',
      detail: 'robots.txt not found or empty — cannot check sitemap reference',
    });
    score -= 10;
  }

  // ----------------------------------------------------------------
  // Spot-check first 5 sitemap URLs for accessibility
  // ----------------------------------------------------------------
  if (sitemapResult.found && sitemapResult.urls.length > 0) {
    const sample = sitemapResult.urls.slice(0, 5);
    let inaccessibleCount = 0;

    for (const sampleUrl of sample) {
      const accessible = await isUrlAccessible(sampleUrl);
      if (!accessible) {
        inaccessibleCount += 1;
        checks.push({
          name: 'URL accessible',
          status: 'fail',
          detail: `Inaccessible: ${sampleUrl}`,
        });
      } else {
        checks.push({
          name: 'URL accessible',
          status: 'pass',
          detail: `OK: ${sampleUrl}`,
        });
      }
    }

    // -10 per inaccessible URL, max -30
    const accessPenalty = Math.min(inaccessibleCount * 10, 30);
    score -= accessPenalty;

    if (inaccessibleCount === 0) {
      checks.push({
        name: 'Sample URL check',
        status: 'pass',
        detail: `All ${sample.length} sampled URL(s) are accessible`,
      });
    }
  }

  score = Math.max(0, score);

  return { score, checks, sitemap: sitemapResult };
}

/**
 * Returns a coloured status string for console display.
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
 * Displays the sitemap check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   sitemap: object
 * }} result
 */
export function displaySitemap(result) {
  const { score, checks, sitemap } = result;

  console.log('');
  console.log(chalk.bold.underline('Sitemap Audit'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // Summary table
  const summaryTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [30, 60],
  });

  summaryTable.push(
    ['Sitemap found', sitemap.found ? chalk.green('Yes') : chalk.red('No')],
    ['Sitemap URL', sitemap.url || chalk.gray('—')],
    ['URL count', sitemap.urlCount],
    ['Last modified', sitemap.lastModified || chalk.gray('—')],
    [
      'Referenced in robots.txt',
      sitemap.referencedInRobots ? chalk.green('Yes') : chalk.red('No'),
    ],
  );

  console.log('');
  console.log(summaryTable.toString());

  // Checks table
  const checksTable = new Table({
    head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Detail')],
    colWidths: [28, 8, 54],
  });

  // Deduplicate the per-URL accessible checks into a summary row
  const urlChecks = checks.filter((c) => c.name === 'URL accessible');
  const otherChecks = checks.filter(
    (c) => c.name !== 'URL accessible' && c.name !== 'Sample URL check',
  );
  const sampleSummaryCheck = checks.find((c) => c.name === 'Sample URL check');

  for (const check of otherChecks) {
    checksTable.push([check.name, statusSymbol(check.status), check.detail]);
  }

  if (urlChecks.length > 0) {
    const failCount = urlChecks.filter((c) => c.status === 'fail').length;
    if (failCount > 0) {
      checksTable.push([
        'Sample URL check',
        statusSymbol('fail'),
        `${failCount}/${urlChecks.length} sampled URL(s) inaccessible`,
      ]);
    } else if (sampleSummaryCheck) {
      checksTable.push([
        sampleSummaryCheck.name,
        statusSymbol(sampleSummaryCheck.status),
        sampleSummaryCheck.detail,
      ]);
    }
  }

  console.log('');
  console.log(checksTable.toString());

  // Inaccessible URLs detail
  const failedUrls = urlChecks.filter((c) => c.status === 'fail');
  if (failedUrls.length > 0) {
    console.log('');
    console.log(chalk.bold('Inaccessible sitemap URLs:'));
    const failTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('URL')],
      colWidths: [5, 85],
    });
    failedUrls.forEach((c, i) => {
      failTable.push([i + 1, c.detail.replace('Inaccessible: ', '')]);
    });
    console.log(failTable.toString());
  }

  // Sample of sitemap URLs
  if (sitemap.urls.length > 0) {
    console.log('');
    console.log(chalk.bold(`Sitemap URLs (first ${Math.min(10, sitemap.urls.length)}):`));
    const urlTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('URL')],
      colWidths: [5, 85],
    });
    sitemap.urls.slice(0, 10).forEach((u, i) => {
      urlTable.push([i + 1, u]);
    });
    if (sitemap.urls.length > 10) {
      urlTable.push(['...', `and ${sitemap.urls.length - 10} more`]);
    }
    console.log(urlTable.toString());
  }
}
