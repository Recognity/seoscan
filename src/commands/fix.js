/**
 * src/commands/fix.js — seoscan fix <url>
 *
 * Runs the full SEO audit then uses AI to generate actionable code fixes for
 * every failed / warned check. Works with OpenAI or Anthropic (BYOK).
 * Falls back gracefully (dry-run output) when no AI key is configured.
 */

import chalk from 'chalk';

import checkMeta    from '../checks/meta.js';
import checkImages  from '../checks/images.js';
import checkHeaders from '../checks/headers.js';
import checkRobots  from '../checks/robots.js';
import checkContent from '../checks/content.js';
import checkSitemap from '../checks/sitemap.js';

import { getAIConfig, generateCompletion, formatTotalCost } from '../ai/client.js';
import * as prompts from '../ai/prompts.js';
import { printHeader } from '../utils/display.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(title) {
  console.log('');
  console.log(chalk.bold.cyan(`── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`));
}

function fixItem(n, label, before, fix, html) {
  console.log('');
  console.log(`  ${chalk.bold(`${n}. ${label}`)}`);
  if (before) console.log(`     ${chalk.dim('Before:')} ${chalk.red(before)}`);
  if (fix)    console.log(`     ${chalk.dim('Fix:   ')} ${chalk.green(fix)}`);
  if (html)   console.log(`\n     ${chalk.gray(html)}`);
}

function warn(msg) {
  console.log(chalk.yellow(`  ⚠  ${msg}`));
}

function aiLabel(config) {
  return config
    ? chalk.dim(`(${config.provider} / ${config.model})`)
    : chalk.dim('(no AI key — showing issues only)');
}

// Parse JSON safely, return null on failure
function tryParseJSON(text) {
  try {
    const trimmed = text.trim();
    // Strip possible markdown code fences
    const clean = trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ── Main fix command ──────────────────────────────────────────────────────────

/**
 * @param {string}  url
 * @param {{ dryRun: boolean }} opts
 */
export async function fixCommand(url, opts = {}) {
  const aiConfig = getAIConfig();
  let dryRun = opts.dryRun;

  printHeader(`\nSeoscan Fix — ${url}\n`);

  if (!aiConfig && !dryRun) {
    console.log(chalk.yellow('\n  No AI key configured.'));
    console.log(chalk.dim('  Set OPENAI_API_KEY or ANTHROPIC_API_KEY to generate AI-powered fixes.'));
    console.log(chalk.dim('  Or add ai: config to ~/.seoscan/config.yml\n'));
    console.log(chalk.dim('  Running in dry-run mode (showing issues without AI fixes)...\n'));
    dryRun = true;
  } else if (aiConfig) {
    console.log(`  AI: ${aiLabel(aiConfig)}`);
  }

  // ── Run audit ───────────────────────────────────────────────────────────────

  const spinner = (msg) => process.stderr.write(chalk.dim(`  checking ${msg}...\n`));
  spinner('meta');
  const meta = await checkMeta(url).catch(() => ({ score: 0, checks: [], raw: {} }));
  spinner('images');
  const images = await checkImages(url).catch(() => ({ score: 0, checks: [], images: { missingAlt: [], total: 0 }, summary: {} }));
  spinner('headers');
  const headers = await checkHeaders(url).catch(() => ({ score: 0, checks: [], headers: { security: {}, ssl: {} } }));
  spinner('robots');
  const robots = await checkRobots(url).catch(() => ({ score: 0, checks: [] }));
  spinner('sitemap');
  const sitemap = await checkSitemap(url).catch(() => ({ score: 0, checks: [] }));
  spinner('content');
  const content = await checkContent(url).catch(() => ({ score: 0, checks: [] }));

  console.log('');

  // ── 1. Meta Fixes ───────────────────────────────────────────────────────────

  const raw = meta.raw || {};
  const metaIssues = meta.checks?.filter(c => c.status === 'fail' || c.status === 'warn') || [];

  if (metaIssues.length > 0) {
    section('Meta Fixes');
    let n = 0;

    // Title
    const titleCheck = metaIssues.find(c => c.name === 'Title tag');
    if (titleCheck) {
      n++;
      if (dryRun) {
        fixItem(n, `Title tag — ${titleCheck.note}`, raw.title, null, null);
      } else {
        const p = prompts.fixMetaTitle(raw.title, url, raw.h1, raw.description);
        const res = await generateCompletion(p.system, p.user).catch(e => {
          warn(`AI error: ${e.message}`); return null;
        });
        const newTitle = res?.text || '(AI unavailable)';
        const html = `<title>${newTitle}</title>`;
        fixItem(n, `Title tag (${raw.title ? raw.title.length + ' chars' : 'missing'}, should be 30-60)`,
          raw.title, newTitle, html);
        if (res?.costStr) console.log(`     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }

    // Description
    const descCheck = metaIssues.find(c => c.name === 'Meta description');
    if (descCheck) {
      n++;
      if (dryRun) {
        fixItem(n, `Meta description — ${descCheck.note}`, raw.description, null, null);
      } else {
        const p = prompts.fixMetaDescription(raw.description, url, raw.title, raw.h1);
        const res = await generateCompletion(p.system, p.user).catch(e => {
          warn(`AI error: ${e.message}`); return null;
        });
        const newDesc = res?.text || '(AI unavailable)';
        const html = `<meta name="description" content="${newDesc}" />`;
        fixItem(n, `Meta description (${raw.description ? raw.description.length + ' chars' : 'missing'}, should be 120-160)`,
          raw.description, newDesc, html);
        if (res?.costStr) console.log(`     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }

    // H1
    const h1Check = metaIssues.find(c => c.name === 'H1 tag');
    if (h1Check && h1Check.status === 'fail') {
      n++;
      if (dryRun) {
        fixItem(n, 'H1 tag — missing', null, null, null);
      } else {
        const p = prompts.fixH1(url, raw.title, raw.description);
        const res = await generateCompletion(p.system, p.user).catch(e => {
          warn(`AI error: ${e.message}`); return null;
        });
        const newH1 = res?.text || '(AI unavailable)';
        fixItem(n, 'H1 tag (missing)', null, newH1, `<h1>${newH1}</h1>`);
        if (res?.costStr) console.log(`     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }

    // OG tags
    const ogCheck = metaIssues.find(c => c.name === 'Open Graph tags');
    if (ogCheck) {
      n++;
      if (dryRun) {
        fixItem(n, `Open Graph tags — ${ogCheck.value}`, null, null, null);
      } else {
        const p = prompts.generateOGTags(raw.title, raw.description, url);
        const res = await generateCompletion(p.system, p.user).catch(e => {
          warn(`AI error: ${e.message}`); return null;
        });
        fixItem(n, `Open Graph tags (${ogCheck.value})`, null, null, res?.text || '(AI unavailable)');
        if (res?.costStr) console.log(`     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }

    if (n === 0) {
      console.log(chalk.green('  ✅ No meta issues found.'));
    }
  } else {
    console.log(chalk.green('\n  ✅ Meta tags look good — no fixes needed.'));
  }

  // ── 2. Image Alt Text Fixes ─────────────────────────────────────────────────

  const missingAlt = images.images?.missingAlt || [];

  if (missingAlt.length > 0) {
    section(`Image Alt Text Fixes (${missingAlt.length} image${missingAlt.length === 1 ? '' : 's'})`);

    if (dryRun) {
      console.log('');
      missingAlt.slice(0, 10).forEach((src, i) => {
        console.log(`  ${i + 1}. ${chalk.dim(src)}`);
      });
      if (missingAlt.length > 10) {
        console.log(chalk.dim(`  ... and ${missingAlt.length - 10} more`));
      }
    } else {
      const p = prompts.generateAltText(missingAlt, raw.title || '');
      const res = await generateCompletion(p.system, p.user).catch(e => {
        warn(`AI error: ${e.message}`); return null;
      });

      if (res) {
        const parsed = tryParseJSON(res.text);
        if (parsed && Array.isArray(parsed)) {
          console.log('');
          parsed.forEach((item, i) => {
            const shortSrc = item.src.length > 60
              ? '...' + item.src.slice(-57)
              : item.src;
            console.log(`  ${i + 1}. ${chalk.dim(shortSrc)}`);
            console.log(`     ${chalk.gray(`<img src="${shortSrc}" alt="${item.alt}" />`)}`);
          });
          console.log(`\n     ${chalk.dim('Cost: ' + res.costStr)}`);
        } else {
          // Fallback: show raw text
          console.log('');
          console.log(chalk.gray(res.text));
          console.log(`\n     ${chalk.dim('Cost: ' + res.costStr)}`);
        }
      }
    }
  } else if (images.summary?.total > 0) {
    console.log(chalk.green('\n  ✅ All images have alt attributes.'));
  }

  // ── 3. Security Header Fixes ────────────────────────────────────────────────

  const missingSecHeaders = (headers.checks || [])
    .filter(c => c.status === 'fail' && c.detail === 'Header not present')
    .map(c => c.name);

  if (missingSecHeaders.length > 0) {
    section(`Security Header Fixes (${missingSecHeaders.length} missing)`);

    if (dryRun) {
      console.log('');
      missingSecHeaders.forEach(h => {
        console.log(`  ${chalk.red('✗')} ${h}`);
      });
    } else {
      const p = prompts.fixSecurityHeaders(missingSecHeaders);
      const res = await generateCompletion(p.system, p.user).catch(e => {
        warn(`AI error: ${e.message}`); return null;
      });

      if (res) {
        console.log('');
        // Indent each line for readability
        res.text.split('\n').forEach(line => {
          console.log(`  ${chalk.gray(line)}`);
        });
        console.log(`\n     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }
  } else {
    console.log(chalk.green('\n  ✅ All security headers present.'));
  }

  // ── 4. Robots.txt Fixes ─────────────────────────────────────────────────────

  const robotsIssues = (robots.checks || [])
    .filter(c => c.status === 'fail' || c.status === 'warn')
    .map(c => c.detail || c.name);

  if (robotsIssues.length > 0) {
    section('Robots.txt Fixes');

    if (dryRun) {
      console.log('');
      robotsIssues.forEach(issue => {
        console.log(`  ${chalk.yellow('⚠')} ${issue}`);
      });
    } else {
      const p = prompts.generateRobotsTxt(url, robotsIssues);
      const res = await generateCompletion(p.system, p.user).catch(e => {
        warn(`AI error: ${e.message}`); return null;
      });

      if (res) {
        console.log('');
        console.log(chalk.bold('  Suggested robots.txt:'));
        console.log('');
        res.text.split('\n').forEach(line => {
          console.log(`  ${chalk.gray(line)}`);
        });
        console.log(`\n     ${chalk.dim('Cost: ' + res.costStr)}`);
      }
    }
  }

  // ── 5. Content Issues (informational) ──────────────────────────────────────

  const contentIssues = (content.checks || []).filter(c => c.status === 'fail' || c.status === 'warn');

  if (contentIssues.length > 0) {
    section('Content Issues');
    console.log('');
    contentIssues.forEach(c => {
      const icon = c.status === 'fail' ? chalk.red('✗') : chalk.yellow('⚠');
      const note = c.note || c.detail || '';
      console.log(`  ${icon} ${chalk.bold(c.name)}${note ? ': ' + chalk.dim(note) : ''}`);
    });
    if (!dryRun) {
      console.log(chalk.dim('\n  (Content rewrites not generated — too context-dependent for automated fixes)'));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log('');
  console.log(chalk.bold('─'.repeat(62)));

  if (!dryRun && aiConfig) {
    const total = formatTotalCost();
    console.log(`  Total AI cost this run: ${chalk.cyan(total)}`);
    console.log(`  Provider: ${aiConfig.provider} / ${aiConfig.model}`);
  } else if (dryRun && !aiConfig) {
    console.log(chalk.dim('  Run with OPENAI_API_KEY or ANTHROPIC_API_KEY set to generate AI fixes.'));
  } else if (dryRun) {
    console.log(chalk.dim('  Dry-run complete. Remove --dry-run to generate AI fixes.'));
  }

  console.log('');
}
