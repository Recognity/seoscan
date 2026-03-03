import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

/**
 * List of security headers to check for, with human-readable names.
 */
const SECURITY_HEADERS = [
  { key: 'x-frame-options', name: 'X-Frame-Options' },
  { key: 'content-security-policy', name: 'Content-Security-Policy' },
  { key: 'strict-transport-security', name: 'Strict-Transport-Security (HSTS)' },
  { key: 'x-content-type-options', name: 'X-Content-Type-Options' },
  { key: 'referrer-policy', name: 'Referrer-Policy' },
  { key: 'permissions-policy', name: 'Permissions-Policy' },
];

/**
 * List of cache headers to check for.
 */
const CACHE_HEADERS = [
  { key: 'cache-control', name: 'Cache-Control' },
  { key: 'etag', name: 'ETag' },
  { key: 'last-modified', name: 'Last-Modified' },
  { key: 'expires', name: 'Expires' },
];

/**
 * Audits HTTP headers returned by the given URL.
 *
 * Scoring:
 *   Start at 100.
 *   -10 per missing security header, capped at -60.
 *   -5 per missing cache header, capped at -20.
 *   -10 if URL is not HTTPS.
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   headers: {
 *     security: Record<string, string|null>,
 *     cache: Record<string, string|null>,
 *     ssl: { isHttps: boolean, hasHsts: boolean }
 *   }
 * }>}
 */
export default async function checkHeaders(url) {
  const checks = [];

  const headersResult = {
    security: /** @type {Record<string, string|null>} */ ({}),
    cache: /** @type {Record<string, string|null>} */ ({}),
    ssl: {
      isHttps: false,
      hasHsts: false,
    },
  };

  let score = 100;

  // Normalise the URL to check if HTTPS
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    checks.push({ name: 'URL parse', status: 'fail', detail: `Invalid URL: ${url}` });
    return { score: 0, checks, headers: headersResult };
  }

  headersResult.ssl.isHttps = parsedUrl.protocol === 'https:';

  try {
    // Add cache-bust param to bypass CDN/LiteSpeed/Varnish cache
    // This ensures we check headers from the origin server, not cached responses
    const bustUrl = new URL(url);
    bustUrl.searchParams.set('_seoscan', Date.now());
    const freshUrl = bustUrl.toString();

    // Use HEAD first to get headers with less bandwidth; fall back to GET
    let response;
    try {
      response = await fetch(freshUrl, { method: 'HEAD' });
      // Some servers return 405 for HEAD; fall back to GET
      if (response.status === 405 || response.status === 501) {
        response = await fetch(freshUrl);
      }
    } catch {
      response = await fetch(freshUrl);
    }

    if (response.status === 0 || (response.status >= 500 && response.status < 600)) {
      checks.push({
        name: 'Page fetch',
        status: 'fail',
        detail: `HTTP ${response.status} — server error`,
      });
      return { score: 0, checks, headers: headersResult };
    }

    const rawHeaders = response.headers;

    // Helper: get header value case-insensitively (axios already lowercases keys)
    const getHeader = (key) => {
      const val = rawHeaders[key.toLowerCase()];
      if (val === undefined || val === null) return null;
      return String(val);
    };

    // ----------------------------------------------------------------
    // HTTPS / SSL
    // ----------------------------------------------------------------
    if (!headersResult.ssl.isHttps) {
      checks.push({
        name: 'HTTPS',
        status: 'fail',
        detail: 'Site is not served over HTTPS',
      });
      score -= 10;
    } else {
      checks.push({
        name: 'HTTPS',
        status: 'pass',
        detail: 'Site is served over HTTPS',
      });
    }

    // HSTS
    const hsts = getHeader('strict-transport-security');
    headersResult.ssl.hasHsts = hsts !== null;
    if (hsts) {
      checks.push({
        name: 'HSTS',
        status: 'pass',
        detail: `Strict-Transport-Security: ${hsts}`,
      });
    } else if (headersResult.ssl.isHttps) {
      checks.push({
        name: 'HSTS',
        status: 'warn',
        detail: 'HTTPS site is missing Strict-Transport-Security header',
      });
    }

    // ----------------------------------------------------------------
    // Security headers
    // ----------------------------------------------------------------
    let securityPenalty = 0;

    for (const header of SECURITY_HEADERS) {
      const value = getHeader(header.key);
      headersResult.security[header.key] = value;

      if (value !== null) {
        checks.push({
          name: header.name,
          status: 'pass',
          detail: value.length > 80 ? value.slice(0, 77) + '...' : value,
        });
      } else {
        // CSP is complex to configure — warn instead of fail, lower penalty
        const isCsp = header.key === 'content-security-policy';
        securityPenalty += isCsp ? 5 : 10;
        checks.push({
          name: header.name,
          status: isCsp ? 'warn' : 'fail',
          detail: isCsp
            ? 'Header not present (complex to configure — consider adding a basic policy)'
            : 'Header not present',
        });
      }
    }

    securityPenalty = Math.min(securityPenalty, 60);
    score -= securityPenalty;

    // ----------------------------------------------------------------
    // Cache/CDN plugin detection (bonus info)
    // ----------------------------------------------------------------
    const lsCache = getHeader('x-litespeed-cache') || getHeader('x-litespeed-cache-control');
    const cfCache = getHeader('cf-cache-status');
    const varnish = getHeader('x-varnish');
    const fastly = getHeader('x-served-by');
    const cachePlugin = lsCache ? 'LiteSpeed Cache' : cfCache ? 'Cloudflare' : varnish ? 'Varnish' : fastly ? 'Fastly' : null;
    if (cachePlugin) {
      checks.push({
        name: 'Cache/CDN',
        status: 'pass',
        detail: `${cachePlugin} detected — server-side caching active`,
      });
    }

    // ----------------------------------------------------------------
    // Cache headers
    // ----------------------------------------------------------------
    let missingCacheCount = 0;

    for (const header of CACHE_HEADERS) {
      const value = getHeader(header.key);
      headersResult.cache[header.key] = value;

      if (value !== null) {
        checks.push({
          name: header.name,
          status: 'pass',
          detail: value,
        });
      } else {
        missingCacheCount += 1;
        checks.push({
          name: header.name,
          status: 'warn',
          detail: 'Header not present',
        });
      }
    }

    const cachePenalty = Math.min(missingCacheCount * 5, 20);
    score -= cachePenalty;

    // ----------------------------------------------------------------
    // HTTP version detection
    // ----------------------------------------------------------------
    // axios uses the http/https module under the hood; the HTTP version is
    // exposed on the underlying socket / response object if available.
    // We inspect response internals best-effort.
    const httpVersion = detectHttpVersion(response);
    if (httpVersion) {
      checks.push({
        name: 'HTTP version',
        status: httpVersion === '2' || httpVersion === '2.0' ? 'pass' : 'warn',
        detail: `HTTP/${httpVersion}`,
      });
    } else {
      checks.push({
        name: 'HTTP version',
        status: 'warn',
        detail: 'HTTP version could not be determined',
      });
    }

    score = Math.max(0, score);
  } catch (err) {
    checks.push({
      name: 'Page fetch',
      status: 'fail',
      detail: `Error: ${err.message}`,
    });
    score = 0;
  }

  return { score, checks, headers: headersResult };
}

/**
 * Attempts to determine the HTTP version from an axios response.
 * axios exposes the underlying Node http/https IncomingMessage on
 * response.request.res; that object has an `httpVersion` property.
 *
 * @param {object} response - the structured response from fetcher.js
 * @returns {string|null}
 */
function detectHttpVersion(response) {
  try {
    // Our fetcher wraps the axios response; the raw request object may be
    // accessible if the response wasn't fully abstracted.
    // We try common paths used by axios internals.
    const req = response._axiosRaw?.request ?? null;
    if (req) {
      const httpVer =
        req.res?.httpVersion ??
        req._redirectable?._currentRequest?.res?.httpVersion ??
        null;
      if (httpVer) return httpVer;
    }
    return null;
  } catch {
    return null;
  }
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
 * Displays the headers check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   headers: object
 * }} result
 */
export function displayHeaders(result) {
  const { score, checks, headers } = result;

  console.log('');
  console.log(chalk.bold.underline('HTTP Headers Audit'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // SSL summary
  console.log('');
  console.log(chalk.bold('SSL / Transport'));
  const sslTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [30, 60],
  });
  sslTable.push(
    ['HTTPS', headers.ssl.isHttps ? chalk.green('Yes') : chalk.red('No')],
    ['HSTS', headers.ssl.hasHsts ? chalk.green('Yes') : chalk.red('No')],
  );
  console.log(sslTable.toString());

  // Security headers table
  console.log('');
  console.log(chalk.bold('Security Headers'));
  const secTable = new Table({
    head: [chalk.cyan('Header'), chalk.cyan('Present'), chalk.cyan('Value')],
    colWidths: [32, 10, 48],
  });
  for (const header of SECURITY_HEADERS) {
    const value = headers.security[header.key];
    const present = value !== null ? chalk.green('Yes') : chalk.red('No');
    const displayValue = value
      ? value.length > 46
        ? value.slice(0, 43) + '...'
        : value
      : chalk.gray('—');
    secTable.push([header.name, present, displayValue]);
  }
  console.log(secTable.toString());

  // Cache headers table
  console.log('');
  console.log(chalk.bold('Cache Headers'));
  const cacheTable = new Table({
    head: [chalk.cyan('Header'), chalk.cyan('Present'), chalk.cyan('Value')],
    colWidths: [22, 10, 58],
  });
  for (const header of CACHE_HEADERS) {
    const value = headers.cache[header.key];
    const present = value !== null ? chalk.green('Yes') : chalk.yellow('No');
    const displayValue = value
      ? value.length > 56
        ? value.slice(0, 53) + '...'
        : value
      : chalk.gray('—');
    cacheTable.push([header.name, present, displayValue]);
  }
  console.log(cacheTable.toString());

  // All checks table
  console.log('');
  console.log(chalk.bold('All Checks'));
  const checksTable = new Table({
    head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Detail')],
    colWidths: [35, 8, 47],
  });
  for (const check of checks) {
    checksTable.push([check.name, statusSymbol(check.status), check.detail]);
  }
  console.log(checksTable.toString());
}
