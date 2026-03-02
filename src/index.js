import { program } from 'commander';
import chalk from 'chalk';

import checkMeta, { displayMeta } from './checks/meta.js';
import checkPerformance, { displayPerformance } from './checks/performance.js';
import checkLinks, { displayLinks } from './checks/links.js';
import checkImages, { displayImages } from './checks/images.js';
import checkHeaders, { displayHeaders } from './checks/headers.js';
import checkSitemap, { displaySitemap } from './checks/sitemap.js';
import checkRobots, { displayRobots } from './checks/robots.js';
import checkStructured, { displayStructured } from './checks/structured.js';
import checkContent, { displayContent } from './checks/content.js';
import { crawl } from './crawler.js';
import { calculateOverallScore } from './report/scorer.js';
import generateMarkdown from './report/markdown.js';
import generateHtml from './report/html.js';
import generateJson from './report/json.js';
import { printHeader, printScore, gradeFromScore, colorScore } from './utils/display.js';

import { writeFileSync } from 'fs';
import { fixCommand } from './commands/fix.js';

async function runAllChecks(url) {
  const spinner = (msg) => process.stderr.write(chalk.dim(`  ${msg}...\n`));
  spinner('meta');       const meta        = await checkMeta(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('performance'); const performance = await checkPerformance(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('links');      const links       = await checkLinks(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('images');     const images      = await checkImages(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('headers');    const headers     = await checkHeaders(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('sitemap');    const sitemap     = await checkSitemap(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('robots');     const robots      = await checkRobots(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('structured'); const structured  = await checkStructured(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  spinner('content');    const content     = await checkContent(url).catch(e => ({ score: 0, error: e.message, checks: [] }));
  return { meta, performance, links, images, headers, sitemap, robots, structured, content };
}

export function setupCLI() {
  program
    .name('seoscan')
    .description('Full SEO audit CLI')
    .version('1.0.0');

  // ── Main command: seoscan <url> ──────────────────────────────────────────
  program
    .argument('[url]', 'URL to audit')
    .action(async (url) => {
      if (!url) { program.help(); return; }
      printHeader(`\nseoscan — Full SEO Audit\n${url}\n`);
      const results = await runAllChecks(url);
      const overall = calculateOverallScore(results);

      console.log();
      displayMeta(results.meta);
      displayPerformance(results.performance);
      displayLinks(results.links);
      displayImages(results.images);
      displayHeaders(results.headers);
      displaySitemap(results.sitemap);
      displayRobots(results.robots);
      displayStructured(results.structured);
      displayContent(results.content);

      console.log();
      printScore(overall.score, `Overall SEO Score`);
    });

  // ── seoscan meta <url> ───────────────────────────────────────────────────
  program
    .command('meta <url>')
    .description('Check meta tags, headings, OG, and Twitter cards')
    .action(async (url) => {
      printHeader(`\nMeta Tags — ${url}\n`);
      const result = await checkMeta(url);
      displayMeta(result);
      printScore(result.score, 'Meta score');
    });

  // ── seoscan performance <url> ────────────────────────────────────────────
  program
    .command('performance <url>')
    .description('Check page load performance and optimisation')
    .action(async (url) => {
      printHeader(`\nPerformance — ${url}\n`);
      const result = await checkPerformance(url);
      displayPerformance(result);
      printScore(result.score, 'Performance score');
    });

  // ── seoscan links <url> ──────────────────────────────────────────────────
  program
    .command('links <url>')
    .description('Audit internal/external links and broken links')
    .action(async (url) => {
      printHeader(`\nLinks — ${url}\n`);
      const result = await checkLinks(url);
      displayLinks(result);
      printScore(result.score, 'Links score');
    });

  // ── seoscan images <url> ─────────────────────────────────────────────────
  program
    .command('images <url>')
    .description('Audit image alt text, dimensions, and formats')
    .action(async (url) => {
      printHeader(`\nImages — ${url}\n`);
      const result = await checkImages(url);
      displayImages(result);
      printScore(result.score, 'Images score');
    });

  // ── seoscan headers <url> ────────────────────────────────────────────────
  program
    .command('headers <url>')
    .description('Check HTTP security and cache headers')
    .action(async (url) => {
      printHeader(`\nHTTP Headers — ${url}\n`);
      const result = await checkHeaders(url);
      displayHeaders(result);
      printScore(result.score, 'Headers score');
    });

  // ── seoscan sitemap <url> ────────────────────────────────────────────────
  program
    .command('sitemap <url>')
    .description('Validate sitemap.xml')
    .action(async (url) => {
      printHeader(`\nSitemap — ${url}\n`);
      const result = await checkSitemap(url);
      displaySitemap(result);
      printScore(result.score, 'Sitemap score');
    });

  // ── seoscan robots <url> ─────────────────────────────────────────────────
  program
    .command('robots <url>')
    .description('Parse and validate robots.txt')
    .action(async (url) => {
      printHeader(`\nRobots.txt — ${url}\n`);
      const result = await checkRobots(url);
      displayRobots(result);
      printScore(result.score, 'Robots score');
    });

  // ── seoscan structured <url> ─────────────────────────────────────────────
  program
    .command('structured <url>')
    .description('Detect and validate structured data (JSON-LD, Microdata)')
    .action(async (url) => {
      printHeader(`\nStructured Data — ${url}\n`);
      const result = await checkStructured(url);
      displayStructured(result);
      printScore(result.score, 'Structured data score');
    });

  // ── seoscan content <url> ────────────────────────────────────────────────
  program
    .command('content <url>')
    .description('Analyse content quality, keywords, and readability')
    .action(async (url) => {
      printHeader(`\nContent Analysis — ${url}\n`);
      const result = await checkContent(url);
      displayContent(result);
      printScore(result.score, 'Content score');
    });

  // ── seoscan crawl <url> ──────────────────────────────────────────────────
  program
    .command('crawl <url>')
    .description('Crawl site and find broken links, orphan pages, redirects')
    .option('-d, --depth <n>', 'Max crawl depth', '2')
    .option('-m, --max <n>', 'Max pages to crawl', '50')
    .action(async (url, opts) => {
      printHeader(`\nCrawl — ${url}\n`);
      console.log(chalk.dim(`  Crawling with depth=${opts.depth}, max=${opts.max}…\n`));

      const result = await crawl(url, {
        depth: parseInt(opts.depth, 10),
        max: parseInt(opts.max, 10),
        onProgress: ({ url: u, found }) => {
          process.stderr.write(chalk.dim(`  [${found}] ${u}\n`));
        },
      });

      console.log(chalk.bold('\nCrawl Summary'));
      console.log(`  Pages found:     ${chalk.cyan(result.summary.pageCount)}`);
      console.log(`  Broken links:    ${result.summary.brokenCount > 0 ? chalk.red(result.summary.brokenCount) : chalk.green(0)}`);
      console.log(`  Redirect chains: ${chalk.yellow(result.summary.redirectCount)}`);
      console.log(`  Orphan pages:    ${result.summary.orphanCount > 0 ? chalk.yellow(result.summary.orphanCount) : chalk.green(0)}`);

      if (result.brokenLinks.length > 0) {
        console.log(chalk.bold('\nBroken Links:'));
        for (const b of result.brokenLinks) {
          console.log(`  ${chalk.red('❌')} [${b.status}] ${b.url}`);
        }
      }

      if (result.orphans.length > 0) {
        console.log(chalk.bold('\nOrphan Pages:'));
        for (const o of result.orphans) {
          console.log(`  ${chalk.yellow('⚠️')} ${o}`);
        }
      }

      if (result.redirectChains.length > 0) {
        console.log(chalk.bold('\nRedirect Chains:'));
        for (const r of result.redirectChains) {
          console.log(`  ${chalk.yellow('↪')} ${r.from} → ${r.to}`);
        }
      }
    });

  // ── seoscan report <url> ─────────────────────────────────────────────────
  program
    .command('report <url>')
    .description('Generate full SEO report')
    .option('--format <fmt>', 'Output format: md, html, json', 'md')
    .option('--output <file>', 'Write to file instead of stdout')
    .action(async (url, opts) => {
      printHeader(`\nGenerating ${opts.format.toUpperCase()} report for ${url}…\n`);
      const results = await runAllChecks(url);
      const overall = calculateOverallScore(results);

      let output;
      if (opts.format === 'html') {
        output = generateHtml(url, results, overall);
      } else if (opts.format === 'json') {
        output = generateJson(url, results, overall);
      } else {
        output = generateMarkdown(url, results, overall);
      }

      if (opts.output) {
        writeFileSync(opts.output, output, 'utf8');
        console.log(chalk.green(`\n✅ Report saved to ${opts.output}`));
        printScore(overall.score, 'Overall score');
      } else {
        console.log(output);
      }
    });

  // ── seoscan fix <url> ────────────────────────────────────────────────────
  program
    .command('fix <url>')
    .description('Run audit then generate AI-powered fixes (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)')
    .option('--dry-run', 'Show issues without calling AI (no key required)')
    .action(async (url, opts) => {
      await fixCommand(url, { dryRun: opts.dryRun || false });
    });

  // ── seoscan compare <url1> <url2> ────────────────────────────────────────
  program
    .command('compare <url1> <url2>')
    .description('Side-by-side SEO comparison of two URLs')
    .action(async (url1, url2) => {
      printHeader(`\nComparing:\n  A: ${url1}\n  B: ${url2}\n`);
      console.log(chalk.dim('  Running audit on both URLs…\n'));

      const [r1, r2] = await Promise.all([runAllChecks(url1), runAllChecks(url2)]);
      const o1 = calculateOverallScore(r1);
      const o2 = calculateOverallScore(r2);

      const categories = ['meta', 'performance', 'links', 'images', 'headers', 'sitemap', 'robots', 'structured', 'content'];
      const labels = { meta: 'Meta Tags', performance: 'Performance', links: 'Links', images: 'Images', headers: 'HTTP Headers', sitemap: 'Sitemap', robots: 'Robots.txt', structured: 'Structured Data', content: 'Content' };

      console.log(chalk.bold('Category Comparison\n'));
      const maxLen = Math.max(...categories.map(c => labels[c].length));

      for (const cat of categories) {
        const s1 = r1[cat]?.score ?? 0;
        const s2 = r2[cat]?.score ?? 0;
        const label = labels[cat].padEnd(maxLen);
        const c1 = colorScore(s1);
        const c2 = colorScore(s2);
        let winner = '';
        if (s1 > s2) winner = chalk.green(' ← A wins');
        else if (s2 > s1) winner = chalk.blue(' → B wins');
        else winner = chalk.dim(' (tie)');
        console.log(`  ${chalk.bold(label)}  A: ${c1}  B: ${c2}${winner}`);
      }

      console.log();
      console.log(`  ${'Overall'.padEnd(maxLen)}  A: ${colorScore(o1.score)} (${o1.grade})  B: ${colorScore(o2.score)} (${o2.grade})`);
      console.log();

      if (o1.score > o2.score) {
        console.log(chalk.green(`\n  Winner: A — ${url1}`));
      } else if (o2.score > o1.score) {
        console.log(chalk.blue(`\n  Winner: B — ${url2}`));
      } else {
        console.log(chalk.dim('\n  It\'s a tie!'));
      }
    });

  return program;
}

// Helper re-export for bin
export { colorScore };
