/**
 * performance.js — Page performance check module
 *
 * Measures TTFB, page size, compression, HTTP/2, and resource optimisation
 * signals that affect Core Web Vitals and overall SEO health.
 */

import { fetchPage, fetchHead } from '../utils/fetcher.js';
import { parsePage } from '../utils/parser.js';
import { printTable, statusIcon } from '../utils/display.js';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const TTFB_OK = 200;    // ms
const TTFB_WARN = 500;  // ms

const SIZE_OK = 100 * 1024;   // 100 KB
const SIZE_WARN = 500 * 1024; // 500 KB

// ---------------------------------------------------------------------------
// Score deductions
// ---------------------------------------------------------------------------

const DEDUCTIONS = {
  ttfbFail: 20,
  ttfbWarn: 10,
  sizeFail: 15,
  sizeWarn: 7,
  noCompression: 15,
  noHttp2: 5,
  imagesWithoutDimensions: 10, // capped
  imagesWithoutLazy: 5,        // capped
  renderBlocking: 10,          // capped
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format bytes to a human-readable string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Detect the HTTP version from an axios response.
 * Node.js's http module exposes httpVersion on the raw socket/response.
 *
 * @param {import('axios').AxiosResponse} response
 * @returns {string} e.g. "2.0", "1.1"
 */
function detectHttpVersion(response) {
  // axios populates request.res which is a Node.js IncomingMessage
  const res = response.request?.res || response.request?._response;
  if (res?.httpVersion) return res.httpVersion;
  // Check alt-svc and other headers that indicate HTTP/2+ support
  const altSvc = response.headers['alt-svc'] || '';
  if (altSvc.includes('h2') || altSvc.includes('h3')) return '2.0';
  // Check for server headers typical of HTTP/2-capable servers
  const server = (response.headers['server'] || '').toLowerCase();
  const via = (response.headers['via'] || '').toLowerCase();
  if (via.includes('2.0') || via.includes('h2')) return '2.0';
  // Note: Node.js http module only speaks HTTP/1.1, so we can't truly detect
  // HTTP/2 without using the http2 module. Return 'unknown' instead of
  // falsely reporting 1.1 when the server likely supports h2.
  return 'unknown';
}

/**
 * Parse an HTML size from the response.
 *
 * @param {import('axios').AxiosResponse} response
 * @returns {number} byte count
 */
function getHtmlSize(response) {
  const contentLength = response.headers['content-length'];
  if (contentLength) return parseInt(contentLength, 10);
  // Fall back to measuring the actual response body
  const body = response.data;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (Buffer.isBuffer(body)) return body.length;
  return 0;
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Run all performance checks against the given URL.
 *
 * @param {string} url - The page URL to audit.
 * @returns {Promise<{score: number, checks: Array, metrics: object}>}
 */
export default async function checkPerformance(url) {
  const startTime = Date.now();
  const response = await fetchPage(url);
  const totalTime = Date.now() - startTime;

  const $ = parsePage(response.data);

  // --- Gather raw metrics ---------------------------------------------------

  // TTFB: approximated from the time until first byte received.
  // axios exposes timing via the underlying socket when the 'socket' event fires.
  // We use the total round-trip as a conservative proxy here, since axios does
  // not expose granular TTFB by default without interceptors.  The fetcher is
  // expected to attach a `ttfb` property when available; otherwise fall back.
  const ttfb = response.config?.metadata?.ttfb ?? totalTime;

  const htmlSize = getHtmlSize(response);

  // Check both standard header and our preserved original (axios strips it after decompress)
  const contentEncoding = (response.headers['content-encoding'] || response.headers['x-original-content-encoding'] || '').toLowerCase();
  const compression = contentEncoding.includes('gzip')
    ? 'gzip'
    : contentEncoding.includes('br')
      ? 'brotli'
      : contentEncoding.includes('deflate')
        ? 'deflate'
        : null;

  const httpVersion = detectHttpVersion(response);
  const http2 = httpVersion.startsWith('2');

  // Images without width/height attributes
  const allImages = $('img');
  const imagesWithoutDimensions = allImages
    .filter((_, el) => {
      const $el = $(el);
      return !$el.attr('width') || !$el.attr('height');
    })
    .length;

  // Images without loading="lazy"
  const imagesWithoutLazy = allImages
    .filter((_, el) => {
      const $el = $(el);
      // Detect native loading="lazy" OR JS-based lazy loading (LiteSpeed, lazysizes, etc.)
      const hasNativeLazy = ($el.attr('loading') || '').toLowerCase() === 'lazy';
      const hasDataSrc = !!($el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-lazyload'));
      const hasLazyClass = /lazy|litespeed|lazyload/i.test($el.attr('class') || '');
      return !hasNativeLazy && !hasDataSrc && !hasLazyClass;
    })
    .length;

  // Render-blocking resources: <script> and <link rel="stylesheet"> in <head>
  // without async, defer, or media attributes that would defer loading.
  const headEl = $('head');
  let renderBlockingCount = 0;

  // Detect if a cache/optimization plugin is combining resources
  const hasOptimizer = $('link[data-optimized], script[data-optimized]').length > 0
    || $('script[src*="litespeed"], link[href*="litespeed"]').length > 0
    || $('script[src*="autoptimize"], link[href*="autoptimize"]').length > 0
    || $('script[src*="wp-rocket"], link[href*="wp-rocket"]').length > 0;

  headEl.find('script').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || '';
    // Inline scripts without src are still potentially render-blocking
    const isAsync = $el.attr('async') !== undefined;
    const isDefer = $el.attr('defer') !== undefined;
    const type = ($el.attr('type') || '').toLowerCase();
    // module scripts are deferred by default; data URLs are not real resources
    const isModuleType = type === 'module';
    // Optimized/combined scripts from cache plugins are already bundled — not truly blocking
    const isOptimized = $el.attr('data-optimized') !== undefined
      || /litespeed|autoptimize|wp-rocket/.test(src);
    if (!isAsync && !isDefer && !isModuleType && !isOptimized) {
      renderBlockingCount++;
    }
  });

  headEl.find('link[rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const media = ($el.attr('media') || '').toLowerCase();
    const href = ($el.attr('href') || '');
    // Optimized/combined stylesheets from cache plugins
    const isOptimized = $el.attr('data-optimized') !== undefined
      || /litespeed|autoptimize|wp-rocket/.test(href);
    // media="print" or other non-screen media are not render-blocking
    if ((!media || media === 'all' || media === 'screen') && !isOptimized) {
      renderBlockingCount++;
    }
  });

  // --- Run individual checks ------------------------------------------------

  const checks = [];
  let score = 100;

  // 1. TTFB
  {
    let status;
    let note;
    if (ttfb < TTFB_OK) {
      status = 'ok';
      note = `TTFB is ${ttfb}ms — excellent (under ${TTFB_OK}ms).`;
    } else if (ttfb < TTFB_WARN) {
      status = 'warn';
      score -= DEDUCTIONS.ttfbWarn;
      note = `TTFB is ${ttfb}ms — acceptable but could be improved (target: <${TTFB_OK}ms).`;
    } else {
      status = 'fail';
      score -= DEDUCTIONS.ttfbFail;
      note = `TTFB is ${ttfb}ms — slow. Investigate server response time, caching, or CDN usage.`;
    }
    checks.push({ name: 'TTFB', status, value: `${ttfb}ms`, note });
  }

  // 2. Total time
  {
    const note = `Total fetch time was ${totalTime}ms (includes DNS, TCP, TLS, transfer).`;
    checks.push({
      name: 'Total load time',
      status: totalTime < 2000 ? 'ok' : totalTime < 4000 ? 'warn' : 'fail',
      value: `${totalTime}ms`,
      note,
    });
  }

  // 3. HTML page size
  {
    let status;
    let note;
    if (htmlSize <= SIZE_OK) {
      status = 'ok';
      note = `HTML size is ${formatBytes(htmlSize)} — well within the ${formatBytes(SIZE_OK)} target.`;
    } else if (htmlSize <= SIZE_WARN) {
      status = 'warn';
      score -= DEDUCTIONS.sizeWarn;
      note = `HTML size is ${formatBytes(htmlSize)}. Consider minifying HTML and removing inline scripts/styles.`;
    } else {
      status = 'fail';
      score -= DEDUCTIONS.sizeFail;
      note = `HTML size is ${formatBytes(htmlSize)} — very large. Minify HTML and avoid large inline resources.`;
    }
    checks.push({ name: 'HTML page size', status, value: formatBytes(htmlSize), note });
  }

  // 4. Compression
  {
    if (compression) {
      checks.push({
        name: 'Compression',
        status: 'ok',
        value: compression,
        note: `Response is compressed with ${compression}. Good for transfer speed.`,
      });
    } else {
      score -= DEDUCTIONS.noCompression;
      checks.push({
        name: 'Compression',
        status: 'fail',
        value: 'none',
        note: 'Response is not compressed. Enable gzip or Brotli on your server to reduce transfer size.',
      });
    }
  }

  // 5. HTTP/2
  {
    if (http2) {
      checks.push({
        name: 'HTTP/2',
        status: 'ok',
        value: `HTTP/${httpVersion}`,
        note: 'Server supports HTTP/2. Multiplexing reduces latency for multiple resources.',
      });
    } else if (httpVersion === 'unknown') {
      checks.push({
        name: 'HTTP/2',
        status: 'info',
        value: 'Unknown',
        note: 'Cannot determine HTTP version (Node.js limitation). Check your server config manually.',
      });
    } else {
      score -= DEDUCTIONS.noHttp2;
      checks.push({
        name: 'HTTP/2',
        status: 'warn',
        value: `HTTP/${httpVersion}`,
        note: 'Server is using HTTP/1.1. Upgrading to HTTP/2 can improve parallel resource loading.',
      });
    }
  }

  // 6. Images without width/height
  {
    const total = allImages.length;
    if (total === 0) {
      checks.push({
        name: 'Image dimensions',
        status: 'ok',
        value: 'N/A',
        note: 'No images found on this page.',
      });
    } else if (imagesWithoutDimensions === 0) {
      checks.push({
        name: 'Image dimensions',
        status: 'ok',
        value: `${total} image(s)`,
        note: 'All images have explicit width and height attributes — prevents layout shift (CLS).',
      });
    } else {
      const ratio = imagesWithoutDimensions / total;
      const deduction = Math.round(DEDUCTIONS.imagesWithoutDimensions * Math.min(ratio, 1));
      score -= deduction;
      checks.push({
        name: 'Image dimensions',
        status: imagesWithoutDimensions <= 2 ? 'warn' : 'fail',
        value: `${imagesWithoutDimensions}/${total} missing`,
        note: `${imagesWithoutDimensions} image(s) are missing width and/or height. This can cause Cumulative Layout Shift (CLS).`,
      });
    }
  }

  // 7. Images without lazy loading
  {
    const total = allImages.length;
    if (total === 0) {
      checks.push({
        name: 'Lazy loading',
        status: 'ok',
        value: 'N/A',
        note: 'No images found on this page.',
      });
    } else if (imagesWithoutLazy === 0) {
      checks.push({
        name: 'Lazy loading',
        status: 'ok',
        value: `${total} image(s)`,
        note: 'All images use loading="lazy" — reduces initial page load weight.',
      });
    } else {
      // Only penalise if a significant fraction lack lazy loading
      if (imagesWithoutLazy > Math.max(1, total * 0.3)) {
        score -= DEDUCTIONS.imagesWithoutLazy;
      }
      checks.push({
        name: 'Lazy loading',
        status: imagesWithoutLazy <= 2 ? 'warn' : 'fail',
        value: `${imagesWithoutLazy}/${total} missing`,
        note: `${imagesWithoutLazy} image(s) do not use loading="lazy". Consider lazy-loading below-the-fold images.`,
      });
    }
  }

  // 8. Render-blocking resources
  {
    if (renderBlockingCount === 0) {
      checks.push({
        name: 'Render-blocking resources',
        status: 'ok',
        value: '0',
        note: 'No render-blocking scripts or stylesheets detected in <head>.',
      });
    } else {
      const deduction = Math.min(
        DEDUCTIONS.renderBlocking,
        Math.ceil(renderBlockingCount / 2) * 3
      );
      score -= deduction;
      checks.push({
        name: 'Render-blocking resources',
        status: renderBlockingCount <= 2 ? 'warn' : 'fail',
        value: `${renderBlockingCount}`,
        note: `${renderBlockingCount} render-blocking resource(s) in <head>. Use async/defer for scripts and load non-critical CSS asynchronously.`,
      });
    }
  }

  // Clamp score to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const metrics = {
    ttfb,
    totalTime,
    htmlSize,
    compression: compression || 'none',
    http2,
    renderBlockingCount,
    imagesWithoutDimensions,
    imagesWithoutLazy,
  };

  return { score, checks, metrics };
}

// ---------------------------------------------------------------------------
// Display helper
// ---------------------------------------------------------------------------

/**
 * Print the performance check result as a formatted table to stdout.
 *
 * @param {object} result - The object returned by checkPerformance().
 */
export function displayPerformance(result) {
  const { score, checks, metrics } = result;

  console.log('');
  console.log(`Performance — Score: ${score}/100`);
  console.log('');

  const rows = checks.map(check => [
    statusIcon(check.status),
    check.name,
    check.value != null ? String(check.value) : '',
    check.note,
  ]);

  printTable(
    ['', 'Check', 'Value', 'Note'],
    rows,
    [3, 28, 20, 50]
  );

  console.log('');
  console.log('Raw metrics:');
  const metricRows = [
    ['TTFB', `${metrics.ttfb}ms`],
    ['Total time', `${metrics.totalTime}ms`],
    ['HTML size', formatBytesDisplay(metrics.htmlSize)],
    ['Compression', metrics.compression],
    ['HTTP/2', metrics.http2 ? 'yes' : 'no'],
    ['Render-blocking', String(metrics.renderBlockingCount)],
    ['Images w/o dimensions', String(metrics.imagesWithoutDimensions)],
    ['Images w/o lazy', String(metrics.imagesWithoutLazy)],
  ];

  printTable(['Metric', 'Value'], metricRows, [30, 20]);
}

/** Duplicated here so displayPerformance is self-contained. */
function formatBytesDisplay(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
