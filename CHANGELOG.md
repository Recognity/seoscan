# Changelog

## [1.0.2] - 2026-03-03

### Fixed
- Compression detection: capture original content-encoding header before axios decompression (Brotli/gzip now detected on LiteSpeed, Cloudflare, etc.)
- Lazy loading: detect JS-based lazy loading (LiteSpeed, lazysizes) via data-src attributes and CSS classes, not just native loading="lazy"
- HTTP/2 false positive: Node.js http module can't negotiate h2 — report "Unknown" instead of penalizing
- Anthropic model: claude-3-5-haiku-latest no longer available, fallback to claude-3-haiku-20240307

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-03-02

### Added
- Initial release
- **meta** — Audit title, description, Open Graph, Twitter Cards, canonical
- **performance** — Measure response time, page size, compression, resource count
- **links** — Check internal/external links, find broken links (4xx/5xx)
- **images** — Audit alt attributes, file sizes, lazy loading, modern formats
- **headers** — Check security headers (HSTS, CSP, X-Frame-Options, etc.)
- **sitemap** — Validate XML sitemap presence and structure
- **robots** — Analyze robots.txt rules and directives
- **structured** — Detect and validate JSON-LD, microdata, RDFa structured data
- **content** — Analyze word count, readability score, heading structure, keyword density
- **crawl** — Deep crawl up to N pages with configurable depth and delay
- **report** — Full SEO audit combining all checks, scored A-F (0-100)
- **compare** — Compare two URLs or two audit snapshots side by side
- **fix** — AI-powered fix suggestions with copy-paste code snippets (BYOK)
  - `--dry-run` mode shows issues without calling AI
  - Generates Apache `.htaccess` and Nginx config for security headers
  - Rewrites title and meta description with proper character counts
- BYOK AI: supports OpenAI (`gpt-4o-mini` default) and Anthropic (`claude-3-5-haiku-latest`)
- Config via `~/.seoscan/config.yml` or environment variables
- Cost tracking for AI operations

### Fixed
- Anthropic model name updated from `claude-3-5-haiku-20241022` to `claude-3-5-haiku-latest`
