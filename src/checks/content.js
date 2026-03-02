import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import * as cheerio from 'cheerio';
import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

// Resolve the directory of this file so we can load stopwords relative to the
// project root rather than the caller's cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// Use createRequire to load JSON files (works in all Node >=18 ESM contexts
// without needing the import assertions / with attributes syntax).
const require = createRequire(import.meta.url);

/** @type {string[]} */
let EN_STOPWORDS = [];
/** @type {string[]} */
let FR_STOPWORDS = [];

try {
  EN_STOPWORDS = require(path.join(projectRoot, 'stopwords', 'en.json'));
} catch {
  EN_STOPWORDS = [];
}

try {
  FR_STOPWORDS = require(path.join(projectRoot, 'stopwords', 'fr.json'));
} catch {
  FR_STOPWORDS = [];
}

const EN_STOPWORDS_SET = new Set(EN_STOPWORDS.map((w) => w.toLowerCase()));
const FR_STOPWORDS_SET = new Set(FR_STOPWORDS.map((w) => w.toLowerCase()));

/**
 * Tags whose text content should be excluded from the body text extraction.
 */
const EXCLUDED_TAGS = new Set([
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'noscript',
  'iframe',
  'aside',
  'form',
  'button',
  'select',
  'option',
  'input',
  'textarea',
  'label',
  'svg',
  'canvas',
]);

/**
 * Extracts clean readable text from an HTML page, stripping navigation,
 * headers, footers, scripts, and styles.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string}
 */
function extractBodyText($) {
  // Clone to avoid mutating the document
  const $body = $.root().clone();

  // Remove excluded tags
  for (const tag of EXCLUDED_TAGS) {
    $body.find(tag).remove();
  }

  // Get the text content, collapse whitespace
  const raw = $body.text();
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Tokenises a text string into lowercase words (letters only, min 2 chars).
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenise(text) {
  return text
    .toLowerCase()
    .split(/[\s\u00A0\u2019\u2018\u201C\u201D.,!?;:()\[\]{}"'<>\/\\|@#$%^&*+=~`]+/)
    .filter((w) => w.length >= 2 && /^[a-z\u00C0-\u024F]+$/.test(w));
}

/**
 * Counts the frequency of each word in the token array.
 *
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function wordFrequency(tokens) {
  const freq = new Map();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

/**
 * Detects the likely language of the text by counting how many tokens match
 * English vs French stopwords.
 *
 * @param {string[]} tokens
 * @returns {'en' | 'fr' | 'unknown'}
 */
function detectLanguage(tokens) {
  let enMatches = 0;
  let frMatches = 0;

  for (const token of tokens) {
    if (EN_STOPWORDS_SET.has(token)) enMatches += 1;
    if (FR_STOPWORDS_SET.has(token)) frMatches += 1;
  }

  if (enMatches === 0 && frMatches === 0) return 'unknown';
  return frMatches > enMatches ? 'fr' : 'en';
}

/**
 * Returns the stopwords set for the detected language.
 *
 * @param {'en' | 'fr' | 'unknown'} lang
 * @returns {Set<string>}
 */
function getStopwordsForLang(lang) {
  if (lang === 'fr') return FR_STOPWORDS_SET;
  // Default to English (also covers 'unknown')
  return EN_STOPWORDS_SET;
}

/**
 * Splits text into sentences using . ! ? as delimiters.
 * Filters out empty strings and very short fragments.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * Computes a simple readability score on a 0–100 scale based on:
 *   - Average sentence length (words per sentence)
 *   - Average word length (characters per word)
 *
 * Shorter sentences and shorter words → higher (easier) score.
 *
 * @param {string[]} tokens
 * @param {string[]} sentences
 * @returns {number}
 */
function computeReadabilityScore(tokens, sentences) {
  if (tokens.length === 0 || sentences.length === 0) return 50;

  const avgSentenceLength = tokens.length / sentences.length;
  const avgWordLength =
    tokens.reduce((sum, w) => sum + w.length, 0) / tokens.length;

  // Ideal avg sentence length: 15–20 words; ideal avg word length: 4–5 chars.
  // We map these to a score component in [0, 50] each.

  // Sentence length component: score decreases as sentences get longer
  // 10 words → 50 pts; 30 words → 0 pts (linear interpolation)
  const sentScore = Math.max(0, Math.min(50, 50 - (avgSentenceLength - 10) * 2.5));

  // Word length component: score decreases as words get longer
  // 4 chars → 50 pts; 8 chars → 0 pts (linear interpolation)
  const wordScore = Math.max(0, Math.min(50, 50 - (avgWordLength - 4) * 12.5));

  return Math.round(sentScore + wordScore);
}

/**
 * Audits the text content of the given URL.
 *
 * Scoring:
 *   Start at 100.
 *   -30 if word count < 300.
 *   -10 if word count 300–600.
 *   -10 if readability score < 40 (hard to read).
 *   -10 if fewer than 3 paragraphs.
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   content: {
 *     wordCount: number,
 *     readingTime: number,
 *     paragraphCount: number,
 *     avgParagraphLength: number,
 *     topKeywords: Array<{word: string, count: number}>,
 *     readabilityScore: number,
 *     language: string
 *   }
 * }>}
 */
export default async function checkContent(url) {
  const checks = [];
  let score = 100;

  const content = {
    wordCount: 0,
    readingTime: 0,
    paragraphCount: 0,
    avgParagraphLength: 0,
    topKeywords: /** @type {Array<{word: string, count: number}>} */ ([]),
    readabilityScore: 0,
    language: 'unknown',
  };

  try {
    const response = await fetch(url);

    if (response.status !== 200) {
      checks.push({
        name: 'Page fetch',
        status: 'fail',
        detail: `HTTP ${response.status} — could not retrieve page`,
      });
      return { score: 0, checks, content };
    }

    const $ = cheerio.load(response.data);

    // ----------------------------------------------------------------
    // Extract body text
    // ----------------------------------------------------------------
    const bodyText = extractBodyText($);
    const tokens = tokenise(bodyText);

    content.wordCount = tokens.length;
    content.readingTime = Math.max(1, Math.ceil(tokens.length / 200));

    // ----------------------------------------------------------------
    // Paragraph analysis
    // ----------------------------------------------------------------
    const paragraphs = $('p')
      .map((_i, el) => $(el).text().trim())
      .get()
      .filter((text) => text.length > 0);

    content.paragraphCount = paragraphs.length;

    if (paragraphs.length > 0) {
      const totalParagraphWords = paragraphs.reduce(
        (sum, p) => sum + p.split(/\s+/).filter(Boolean).length,
        0,
      );
      content.avgParagraphLength = Math.round(totalParagraphWords / paragraphs.length);
    }

    // ----------------------------------------------------------------
    // Language detection
    // ----------------------------------------------------------------
    content.language = detectLanguage(tokens);
    const stopwords = getStopwordsForLang(content.language);

    // ----------------------------------------------------------------
    // Top keywords (excluding stopwords)
    // ----------------------------------------------------------------
    const freq = wordFrequency(tokens);
    const keywords = [];

    for (const [word, count] of freq.entries()) {
      if (!stopwords.has(word) && word.length >= 3) {
        keywords.push({ word, count });
      }
    }

    // Sort descending by count
    keywords.sort((a, b) => b.count - a.count);
    content.topKeywords = keywords.slice(0, 10);

    // ----------------------------------------------------------------
    // Readability
    // ----------------------------------------------------------------
    const sentences = splitSentences(bodyText);
    content.readabilityScore = computeReadabilityScore(tokens, sentences);

    // ----------------------------------------------------------------
    // Build checks
    // ----------------------------------------------------------------

    // Word count check
    if (content.wordCount < 300) {
      checks.push({
        name: 'Word count',
        status: 'fail',
        detail: `Only ${content.wordCount} words — aim for 600+`,
      });
      score -= 30;
    } else if (content.wordCount < 600) {
      checks.push({
        name: 'Word count',
        status: 'warn',
        detail: `${content.wordCount} words — consider expanding to 600+ for better SEO`,
      });
      score -= 10;
    } else {
      checks.push({
        name: 'Word count',
        status: 'pass',
        detail: `${content.wordCount} words`,
      });
    }

    // Reading time
    checks.push({
      name: 'Reading time',
      status: 'pass',
      detail: `~${content.readingTime} minute(s) at 200 wpm`,
    });

    // Paragraph count
    if (content.paragraphCount < 3) {
      checks.push({
        name: 'Paragraph count',
        status: 'warn',
        detail: `${content.paragraphCount} paragraph(s) — consider using more <p> tags`,
      });
      score -= 10;
    } else {
      checks.push({
        name: 'Paragraph count',
        status: 'pass',
        detail: `${content.paragraphCount} paragraphs, avg ${content.avgParagraphLength} words each`,
      });
    }

    // Readability
    if (content.readabilityScore < 40) {
      checks.push({
        name: 'Readability',
        status: 'fail',
        detail: `Score ${content.readabilityScore}/100 — content may be difficult to read`,
      });
      score -= 10;
    } else if (content.readabilityScore < 60) {
      checks.push({
        name: 'Readability',
        status: 'warn',
        detail: `Score ${content.readabilityScore}/100 — readability could be improved`,
      });
    } else {
      checks.push({
        name: 'Readability',
        status: 'pass',
        detail: `Score ${content.readabilityScore}/100 — good readability`,
      });
    }

    // Keywords found
    if (content.topKeywords.length > 0) {
      const topThree = content.topKeywords
        .slice(0, 3)
        .map((k) => `${k.word} (${k.count})`)
        .join(', ');
      checks.push({
        name: 'Top keywords',
        status: 'pass',
        detail: `Top 3: ${topThree}`,
      });
    } else {
      checks.push({
        name: 'Top keywords',
        status: 'warn',
        detail: 'Could not extract keywords — page may have insufficient text',
      });
    }

    // Language detection
    checks.push({
      name: 'Detected language',
      status: content.language === 'unknown' ? 'warn' : 'pass',
      detail:
        content.language === 'unknown'
          ? 'Language could not be detected'
          : `Detected: ${content.language === 'en' ? 'English' : 'French'}`,
    });

    score = Math.max(0, score);
  } catch (err) {
    checks.push({
      name: 'Page fetch',
      status: 'fail',
      detail: `Error: ${err.message}`,
    });
    score = 0;
  }

  return { score, checks, content };
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
 * Displays the content check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   content: object
 * }} result
 */
export function displayContent(result) {
  const { score, checks, content } = result;

  console.log('');
  console.log(chalk.bold.underline('Content Analysis'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // Summary table
  const summaryTable = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value')],
    colWidths: [30, 60],
  });

  summaryTable.push(
    ['Word count', content.wordCount],
    ['Reading time', `~${content.readingTime} minute(s)`],
    ['Paragraph count', content.paragraphCount],
    ['Avg paragraph length', `${content.avgParagraphLength} words`],
    ['Readability score', `${content.readabilityScore} / 100`],
    ['Detected language', content.language === 'unknown' ? chalk.gray('Unknown') : content.language === 'en' ? 'English' : 'French'],
  );

  console.log('');
  console.log(summaryTable.toString());

  // Checks table
  const checksTable = new Table({
    head: [chalk.cyan('Check'), chalk.cyan('Status'), chalk.cyan('Detail')],
    colWidths: [25, 8, 57],
  });

  for (const check of checks) {
    checksTable.push([check.name, statusSymbol(check.status), check.detail]);
  }

  console.log('');
  console.log(checksTable.toString());

  // Keywords table
  if (content.topKeywords.length > 0) {
    console.log('');
    console.log(chalk.bold('Top Keywords:'));

    const kwTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('Keyword'), chalk.cyan('Occurrences'), chalk.cyan('Density')],
      colWidths: [5, 25, 15, 15],
    });

    const totalWords = content.wordCount;
    content.topKeywords.forEach((kw, i) => {
      const density =
        totalWords > 0 ? ((kw.count / totalWords) * 100).toFixed(2) + '%' : '0%';
      kwTable.push([i + 1, kw.word, kw.count, density]);
    });

    console.log(kwTable.toString());
  }
}
