import * as cheerio from 'cheerio';
import { URL } from 'url';

/**
 * Loads HTML into a cheerio instance.
 *
 * @param {string} html
 * @returns {import('cheerio').CheerioAPI}
 */
export function parse(html) {
  return cheerio.load(html);
}

/**
 * Safely resolves a URL against a base URL.
 * Returns null if resolution fails or if href is empty/anchor-only.
 *
 * @param {string} href
 * @param {string} baseUrl
 * @returns {string|null}
 */
function resolveUrl(href, baseUrl) {
  if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Determines if a resolved URL is internal relative to the base URL.
 *
 * @param {string} resolvedHref
 * @param {string} baseUrl
 * @returns {boolean}
 */
function isInternalUrl(resolvedHref, baseUrl) {
  try {
    const resolved = new URL(resolvedHref);
    const base = new URL(baseUrl);
    return resolved.hostname === base.hostname;
  } catch {
    return false;
  }
}

/**
 * Detects whether an image src points to a modern image format (WebP, AVIF).
 *
 * @param {string} src
 * @returns {boolean}
 */
function isModernImageFormat(src) {
  if (!src) return false;
  const lower = src.toLowerCase();
  return lower.endsWith('.webp') || lower.endsWith('.avif') || lower.includes('.webp?') || lower.includes('.avif?');
}

/**
 * Extracts SEO-relevant metadata from an HTML string.
 *
 * @param {string} html
 * @returns {{
 *   title: string|null,
 *   description: string|null,
 *   h1: string[],
 *   h2: string[],
 *   h3: string[],
 *   h4: string[],
 *   h5: string[],
 *   h6: string[],
 *   canonical: string|null,
 *   og: Record<string, string>,
 *   twitter: Record<string, string>,
 *   robots: string|null,
 *   lang: string|null,
 *   hreflang: Array<{ hreflang: string, href: string }>
 * }}
 */
export function extractMeta(html) {
  const $ = parse(html);

  // Title
  const title = $('title').first().text().trim() || null;

  // Meta description
  const description =
    $('meta[name="description"]').attr('content')?.trim() ?? null;

  // Headings
  const headings = (tag) =>
    $(tag)
      .map((_, el) => $(el).text().trim())
      .get();

  const h1 = headings('h1');
  const h2 = headings('h2');
  const h3 = headings('h3');
  const h4 = headings('h4');
  const h5 = headings('h5');
  const h6 = headings('h6');

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? null;

  // Open Graph tags: og:title, og:description, og:image, og:url, etc.
  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property && content !== undefined) {
      const key = property.replace(/^og:/, '');
      og[key] = content;
    }
  });

  // Twitter card tags
  const twitter = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content !== undefined) {
      const key = name.replace(/^twitter:/, '');
      twitter[key] = content;
    }
  });

  // Robots meta
  const robots =
    $('meta[name="robots"]').attr('content')?.trim() ??
    $('meta[name="Robots"]').attr('content')?.trim() ??
    null;

  // Language from <html lang="...">
  const lang = $('html').attr('lang')?.trim() ?? null;

  // Hreflang: <link rel="alternate" hreflang="..." href="...">
  const hreflang = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hreflangVal = $(el).attr('hreflang')?.trim();
    const href = $(el).attr('href')?.trim();
    if (hreflangVal && href) {
      hreflang.push({ hreflang: hreflangVal, href });
    }
  });

  return {
    title,
    description,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    canonical,
    og,
    twitter,
    robots,
    lang,
    hreflang,
  };
}

/**
 * Extracts all links from an HTML string, categorized as internal or external.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{
 *   internal: Array<{ href: string, text: string, rel: string, isNofollow: boolean }>,
 *   external: Array<{ href: string, text: string, rel: string, isNofollow: boolean }>,
 *   all: Array<{ href: string, text: string, rel: string, isNofollow: boolean }>
 * }}
 */
export function extractLinks(html, baseUrl) {
  const $ = parse(html);
  const internal = [];
  const external = [];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href')?.trim() ?? '';
    const text = $(el).text().trim();
    const rel = $(el).attr('rel')?.trim() ?? '';
    const isNofollow = rel.split(/\s+/).includes('nofollow');

    const resolved = resolveUrl(rawHref, baseUrl);
    if (!resolved) return;

    const entry = { href: resolved, text, rel, isNofollow };

    if (isInternalUrl(resolved, baseUrl)) {
      internal.push(entry);
    } else {
      external.push(entry);
    }
  });

  const all = [...internal, ...external];

  return { internal, external, all };
}

/**
 * Extracts all images from an HTML string.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Array<{
 *   src: string,
 *   alt: string,
 *   width: string|null,
 *   height: string|null,
 *   loading: string|null,
 *   isModernFormat: boolean
 * }>}
 */
export function extractImages(html, baseUrl) {
  const $ = parse(html);
  const images = [];

  $('img').each((_, el) => {
    const rawSrc =
      $(el).attr('src')?.trim() ??
      $(el).attr('data-src')?.trim() ??
      '';

    // Resolve relative src
    let src = rawSrc;
    if (rawSrc && baseUrl) {
      try {
        src = new URL(rawSrc, baseUrl).href;
      } catch {
        src = rawSrc;
      }
    }

    const alt = $(el).attr('alt') ?? '';
    const width = $(el).attr('width')?.trim() ?? null;
    const height = $(el).attr('height')?.trim() ?? null;
    const loading = $(el).attr('loading')?.trim() ?? null;
    const isModernFormat = isModernImageFormat(rawSrc);

    images.push({ src, alt, width, height, loading, isModernFormat });
  });

  return images;
}

/**
 * Parses microdata items from the DOM.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {object[]}
 */
function extractMicrodata($) {
  const items = [];

  $('[itemscope]').each((_, el) => {
    const type = $(el).attr('itemtype') ?? null;
    const properties = {};

    $(el)
      .find('[itemprop]')
      .each((_, propEl) => {
        const propName = $(propEl).attr('itemprop');
        if (!propName) return;

        let value;
        const tagName = propEl.tagName?.toLowerCase();
        if (tagName === 'meta') {
          value = $(propEl).attr('content') ?? $(propEl).text().trim();
        } else if (tagName === 'a') {
          value = $(propEl).attr('href') ?? $(propEl).text().trim();
        } else if (tagName === 'img') {
          value = $(propEl).attr('src') ?? '';
        } else if (tagName === 'time') {
          value = $(propEl).attr('datetime') ?? $(propEl).text().trim();
        } else {
          value = $(propEl).text().trim();
        }

        if (properties[propName] === undefined) {
          properties[propName] = value;
        } else if (Array.isArray(properties[propName])) {
          properties[propName].push(value);
        } else {
          properties[propName] = [properties[propName], value];
        }
      });

    items.push({ type, properties });
  });

  return items;
}

/**
 * Extracts structured data (JSON-LD and Microdata) from an HTML string.
 *
 * @param {string} html
 * @returns {{ jsonld: object[], microdata: object[] }}
 */
export function extractStructuredData(html) {
  const $ = parse(html);

  // JSON-LD
  const jsonld = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        jsonld.push(...parsed);
      } else {
        jsonld.push(parsed);
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  });

  // Microdata
  const microdata = extractMicrodata($);

  return { jsonld, microdata };
}

// Alias for check modules
export const parsePage = parse;
