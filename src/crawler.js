import { fetch } from './utils/fetcher.js';
import { extractLinks } from './utils/parser.js';

const CRAWL_DELAY = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return url;
  }
}

export async function crawl(startUrl, { depth = 2, max = 50, onProgress } = {}) {
  const base = new URL(startUrl);
  const visited = new Set();
  const queue = [{ url: normalizeUrl(startUrl), depth: 0 }];
  const pages = [];
  const brokenLinks = [];
  const redirectChains = [];
  const orphans = [];

  while (queue.length > 0 && pages.length < max) {
    const { url, depth: currentDepth } = queue.shift();
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    visited.add(normalized);

    if (onProgress) onProgress({ url: normalized, found: pages.length, queued: queue.length });

    let result;
    try {
      result = await fetch(normalized);
    } catch (err) {
      brokenLinks.push({ url: normalized, status: 'error', error: err.message });
      await sleep(CRAWL_DELAY);
      continue;
    }

    const { data, status, headers, timing, url: finalUrl, redirectChain } = result;

    if (redirectChain && redirectChain.length > 1) {
      redirectChains.push({ from: normalized, chain: redirectChain, to: finalUrl });
    }

    if (status >= 400) {
      brokenLinks.push({ url: normalized, status });
      await sleep(CRAWL_DELAY);
      continue;
    }

    const contentType = headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      await sleep(CRAWL_DELAY);
      continue;
    }

    const pageInfo = {
      url: normalizeUrl(finalUrl || normalized),
      status,
      timing,
      inLinks: [],
      outLinks: [],
    };

    if (typeof data === 'string') {
      const links = extractLinks(data, finalUrl || normalized);
      pageInfo.outLinks = links.all.map(l => l.href);

      if (currentDepth < depth) {
        for (const link of links.internal) {
          const linkNorm = normalizeUrl(link.href);
          if (!visited.has(linkNorm) && !queue.find(q => normalizeUrl(q.url) === linkNorm)) {
            queue.push({ url: link.href, depth: currentDepth + 1 });
          }
        }
      }
    }

    pages.push(pageInfo);
    await sleep(CRAWL_DELAY);
  }

  // Detect orphans: pages with no inLinks from other pages
  const allOutLinks = new Set(pages.flatMap(p => p.outLinks.map(normalizeUrl)));
  const startNorm = normalizeUrl(startUrl);

  for (const page of pages) {
    if (page.url === startNorm) continue;
    if (!allOutLinks.has(page.url)) {
      orphans.push(page.url);
    }
  }

  return {
    pages,
    brokenLinks,
    redirectChains,
    orphans,
    summary: {
      pageCount: pages.length,
      brokenCount: brokenLinks.length,
      redirectCount: redirectChains.length,
      orphanCount: orphans.length,
    },
  };
}
