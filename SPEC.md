# seoscan — Full SEO Audit CLI

## Overview
One command to audit any website's SEO. No login, no API key for basic features. Just `seoscan https://example.com` and get a full report.

## Tech Stack
- **Runtime:** Node.js (>=18)
- **CLI:** Commander.js
- **HTTP:** axios
- **HTML parsing:** cheerio
- **Output:** chalk + cli-table3
- **Package name:** `seoscan`
- **Binary name:** `seoscan`
- **License:** MIT

## Commands

### `seoscan <url>` (main command)
Full audit of a URL. Runs ALL checks below and outputs a scored report.

### `seoscan crawl <url> [--depth <n>] [--max <pages>]`
- Crawls the site starting from the URL
- Default depth: 2, max pages: 50
- Discovers all internal pages
- Outputs: page count, broken links (4xx/5xx), redirect chains, orphan pages

### Individual check commands:

#### `seoscan meta <url>`
- Title tag (present, length 30-60 chars)
- Meta description (present, length 120-160 chars)
- H1 tag (present, unique)
- H2-H6 structure (hierarchy check)
- Canonical URL
- Open Graph tags (og:title, og:description, og:image)
- Twitter card tags
- Robots meta tag
- Language/hreflang
- Output: table with status ✅/⚠️/❌ per check

#### `seoscan performance <url>`
- Page load time (TTFB, full load)
- Page size (HTML + total resources)
- Number of requests
- Image optimization: images without width/height, uncompressed, no lazy loading
- Render-blocking resources count
- Gzip/Brotli compression check
- HTTP/2 check
- Output: metrics table with color coding

#### `seoscan links <url>`
- Internal links count + list
- External links count + list
- Broken links (4xx, 5xx)
- Nofollow links
- Anchor text analysis (empty anchors, generic text like "click here")
- Redirect chains (301/302)
- Output: summary table + broken links detail

#### `seoscan images <url>`
- Total images
- Missing alt text (count + list)
- Empty alt text
- Alt text too long (>125 chars)
- Missing dimensions (width/height)
- Large images (>200KB without optimization hints)
- Modern format usage (webp/avif)
- Lazy loading check
- Output: summary + problem images table

#### `seoscan headers <url>`
- Security headers: X-Frame-Options, CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Cache headers: Cache-Control, ETag, Last-Modified, Expires
- SSL certificate: valid, expiry date, issuer
- HTTP version (1.1 vs 2)
- Output: checklist with ✅/❌

#### `seoscan sitemap <url>`
- Checks /sitemap.xml and /sitemap_index.xml
- Parses sitemap: URL count, last modified dates
- Checks if sitemap is referenced in robots.txt
- Validates URLs in sitemap are accessible (sample check, first 10)
- Output: sitemap stats table

#### `seoscan robots <url>`
- Fetches and parses robots.txt
- Shows allowed/disallowed paths
- Checks for sitemap reference
- Detects common mistakes (blocking CSS/JS, blocking important paths)
- Output: parsed rules table

#### `seoscan structured <url>`
- Detects JSON-LD structured data
- Detects Microdata
- Lists schema types found (Article, Product, FAQ, BreadcrumbList, etc.)
- Basic validation (required properties present)
- Output: schema types table

#### `seoscan content <url>`
- Word count
- Reading time
- Keyword density (top 10 words/phrases, excluding stop words)
- Readability score (Flesch-Kincaid or similar simple metric)
- Paragraph count, avg paragraph length
- Output: content analysis table

### `seoscan report <url> [--format md|html|json] [--output file]`
- Runs ALL checks
- Generates comprehensive report
- Scoring system:
  - Each check category: 0-100
  - Overall score: weighted average
  - Grade: A (90+), B (80+), C (70+), D (60+), F (<60)
- Default: markdown to stdout
- `--html`: styled HTML report
- `--json`: machine-readable

### `seoscan compare <url1> <url2>`
- Runs the full audit on both URLs
- Side-by-side comparison
- Highlights where one is better/worse
- Use case: compare yourself to a competitor

## Project Structure
```
seoscan/
├── package.json
├── README.md
├── bin/
│   └── seoscan.js
├── src/
│   ├── index.js              # Commander setup with all commands
│   ├── crawler.js             # Site crawler (BFS with depth limit)
│   ├── checks/
│   │   ├── meta.js
│   │   ├── performance.js
│   │   ├── links.js
│   │   ├── images.js
│   │   ├── headers.js
│   │   ├── sitemap.js
│   │   ├── robots.js
│   │   ├── structured.js
│   │   └── content.js
│   ├── report/
│   │   ├── scorer.js          # Scoring system
│   │   ├── markdown.js        # Markdown report generator
│   │   ├── html.js            # HTML report generator
│   │   └── json.js            # JSON report generator
│   └── utils/
│       ├── fetcher.js         # HTTP fetch with timeout, retries, user-agent
│       ├── parser.js          # HTML parsing helpers (cheerio)
│       └── display.js         # Table formatting
├── test/
│   ├── meta.test.js
│   ├── links.test.js
│   └── scorer.test.js
└── stopwords/
    ├── en.json
    └── fr.json
```

## Scoring Weights
- Meta tags: 20%
- Performance: 15%
- Links: 15%
- Images: 10%
- Headers/Security: 10%
- Sitemap & Robots: 10%
- Structured Data: 10%
- Content Quality: 10%

## Constraints
- Plain JS, ESM modules, no build step
- No external API calls for basic audit (everything client-side)
- Respectful crawling: 200ms delay between requests, proper User-Agent
- Timeout per request: 10s
- Total audit timeout: 120s
- Graceful error handling (site down, blocked, etc.)
- Stop words in French AND English

## Done Criteria
- `seoscan https://example.com` produces a full scored report
- All individual commands work standalone
- `seoscan compare` works
- `seoscan report --format html --output report.html` generates a nice file
- README with usage examples
- Tests pass
- Clean git commit
