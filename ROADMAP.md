# seoscan — Roadmap

## V1.0 ✅ (Shipped)
- [x] 12 commands : meta, performance, links, images, headers, sitemap, robots, structured, content, crawl, report, compare
- [x] AI fix (BYOK OpenAI/Anthropic) — dry-run sans clé, auto-fix avec
- [x] PDF reports (Recognity-branded)
- [x] npm published, GitHub public

## V1.1 — Polish (Mars 2026)
- [x] Fix compression detection (Brotli/gzip via interceptor — axios strips header)
- [x] Fix lazy loading (LiteSpeed JS lazy-load : data-src, classes lazy/litespeed/lazyload)
- [x] Fix HTTP/2 false positive (Node.js limitation → "info/Unknown" au lieu de pénaliser)
- [ ] Freemium gate : 3 audits/jour (local counter), license key Pro
- [ ] `--format json` export
- [ ] Badges npm/GitHub dans README

## V2.0 — Pro ($49/mo)
- [ ] `seoscan fix --apply` : auto-patch .htaccess / nginx.conf / meta tags via WP REST API
- [ ] `seoscan monitor <url>` — cron hebdo, diff scores, alerte si régression
- [ ] `seoscan keywords <url>` — extraction mots-clés + densité + suggestions AI
- [ ] `seoscan backlinks <url>` — analyse backlinks via CommonCrawl (gratuit)
- [ ] White-label PDF (custom logo, couleurs, footer)
- [ ] `seoscan batch <urls.txt>` — audit en masse, rapport consolidé
- [ ] WordPress-specific checks : mu-plugins, cache plugin, REST API detection
- [ ] Scoring pondéré amélioré (Core Web Vitals weight)

## V3.0 — Agency ($149/mo)
- [ ] SEMrush API (BYOK) : keywords volume, difficulty, position tracking
- [ ] DataForSEO alternative (BYOK, moins cher)
- [ ] `seoscan competitor <url>` — gap analysis vs concurrents
- [ ] Dashboard HTML statique généré (shareable link)
- [ ] Historique : courbes de progression SEO dans le PDF
- [ ] Intégration Google Search Console (BYOK service account)
- [ ] `seoscan ci` — mode CI/CD (exit code non-zero si score < seuil)

## Coûts
- AI fix : ~$0.001/audit (gpt-4o-mini)
- SEMrush : ~$0.05/audit (BYOK)
- DataForSEO : ~$0.005/audit (BYOK)
- Infra : zéro (BYOK, CLI local)
