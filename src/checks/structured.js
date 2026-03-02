import * as cheerio from 'cheerio';
import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

/**
 * Required properties for common schema.org types.
 * Keys are lowercase @type values; values are arrays of required property names.
 */
const REQUIRED_PROPERTIES = {
  article: ['headline', 'author'],
  newsarticle: ['headline', 'author'],
  bloggingpost: ['headline', 'author'],
  product: ['name'],
  faqpage: ['mainEntity'],
  breadcrumblist: ['itemListElement'],
  organization: ['name'],
  website: ['name'],
  person: ['name'],
  event: ['name', 'startDate'],
  recipe: ['name', 'recipeIngredient'],
  review: ['reviewRating', 'itemReviewed'],
  howto: ['name', 'step'],
  jobposting: ['title', 'hiringOrganization'],
  localbusiness: ['name', 'address'],
  videoobject: ['name', 'description', 'thumbnailUrl'],
  imageobject: ['url'],
};

/**
 * Normalises a @type value to lowercase for lookup.
 *
 * @param {string} type
 * @returns {string}
 */
function normaliseType(type) {
  // Strip schema.org URL prefix if present
  return type.replace(/^https?:\/\/schema\.org\//i, '').toLowerCase();
}

/**
 * Validates a parsed JSON-LD object against known required properties.
 * Returns a list of issue strings.
 *
 * @param {object} obj - the parsed JSON-LD object
 * @returns {string[]}
 */
function validateJsonLd(obj) {
  const issues = [];

  const rawType = obj['@type'];
  if (!rawType) {
    issues.push('JSON-LD object missing @type');
    return issues;
  }

  const types = Array.isArray(rawType) ? rawType : [rawType];

  for (const type of types) {
    const key = normaliseType(type);
    const required = REQUIRED_PROPERTIES[key];
    if (!required) continue; // Unknown type — skip validation

    for (const prop of required) {
      // Check case-insensitively
      const hasProp = Object.keys(obj).some(
        (k) => k.toLowerCase() === prop.toLowerCase() && obj[k] !== null && obj[k] !== undefined,
      );
      if (!hasProp) {
        issues.push(`${type} missing required property: ${prop}`);
      }
    }
  }

  return issues;
}

/**
 * Recursively extracts all @type values from a JSON-LD structure,
 * including nested objects in arrays and plain objects.
 *
 * @param {unknown} obj
 * @returns {string[]}
 */
function extractTypes(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const types = [];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      types.push(...extractTypes(item));
    }
    return types;
  }

  const rawType = obj['@type'];
  if (rawType) {
    const arr = Array.isArray(rawType) ? rawType : [rawType];
    types.push(...arr);
  }

  // Recurse into values
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      types.push(...extractTypes(value));
    }
  }

  return types;
}

/**
 * Extracts microdata itemtype values from HTML using cheerio.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string[]}
 */
function extractMicrodata($) {
  const types = [];
  $('[itemscope]').each((_i, el) => {
    const itemtype = $(el).attr('itemtype');
    if (itemtype) {
      // itemtype may contain multiple space-separated URLs
      for (const t of itemtype.trim().split(/\s+/)) {
        if (t) types.push(t);
      }
    }
  });
  return types;
}

/**
 * Audits structured data (JSON-LD and Microdata) on the given page.
 *
 * Scoring:
 *   Start at 60.
 *   +20 if any valid JSON-LD found.
 *   +10 if all JSON-LD objects pass validation.
 *   -10 per validation issue.
 *   Score clamped to [0, 100].
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   structured: {
 *     jsonld: object[],
 *     microdata: string[],
 *     types: string[],
 *     issues: string[]
 *   }
 * }>}
 */
export default async function checkStructured(url) {
  const checks = [];
  let score = 60;

  const structured = {
    jsonld: /** @type {object[]} */ ([]),
    microdata: /** @type {string[]} */ ([]),
    types: /** @type {string[]} */ ([]),
    issues: /** @type {string[]} */ ([]),
  };

  try {
    const response = await fetch(url);

    if (response.status !== 200) {
      checks.push({
        name: 'Page fetch',
        status: 'fail',
        detail: `HTTP ${response.status} — could not retrieve page`,
      });
      return { score: 0, checks, structured };
    }

    const $ = cheerio.load(response.data);

    // ----------------------------------------------------------------
    // JSON-LD extraction
    // ----------------------------------------------------------------
    const jsonLdScripts = $('script[type="application/ld+json"]');

    jsonLdScripts.each((_i, el) => {
      const raw = $(el).html() || '';
      try {
        const parsed = JSON.parse(raw.trim());
        // Normalise to array to handle both single objects and @graph arrays
        const items = Array.isArray(parsed)
          ? parsed
          : parsed['@graph']
            ? parsed['@graph']
            : [parsed];
        structured.jsonld.push(...items.filter((item) => item && typeof item === 'object'));
      } catch (e) {
        structured.issues.push(`Invalid JSON-LD: ${e.message}`);
        checks.push({
          name: 'JSON-LD parse',
          status: 'fail',
          detail: `Failed to parse JSON-LD block: ${e.message}`,
        });
      }
    });

    // ----------------------------------------------------------------
    // Collect types from JSON-LD
    // ----------------------------------------------------------------
    for (const item of structured.jsonld) {
      const types = extractTypes(item);
      structured.types.push(...types);
    }

    // ----------------------------------------------------------------
    // Microdata extraction
    // ----------------------------------------------------------------
    const microdataTypes = extractMicrodata($);
    structured.microdata = microdataTypes;
    // Add microdata types to the combined types list (avoid duplicates)
    for (const t of microdataTypes) {
      const shortType = t.replace(/^https?:\/\/schema\.org\//i, '');
      if (!structured.types.includes(shortType) && !structured.types.includes(t)) {
        structured.types.push(shortType || t);
      }
    }

    // ----------------------------------------------------------------
    // Checks
    // ----------------------------------------------------------------

    // JSON-LD presence
    if (structured.jsonld.length === 0) {
      checks.push({
        name: 'JSON-LD',
        status: 'warn',
        detail: 'No JSON-LD structured data found',
      });
    } else {
      score += 20;
      checks.push({
        name: 'JSON-LD',
        status: 'pass',
        detail: `${structured.jsonld.length} JSON-LD block(s) found`,
      });
    }

    // Microdata presence
    if (structured.microdata.length === 0) {
      checks.push({
        name: 'Microdata',
        status: 'warn',
        detail: 'No Microdata (itemscope/itemtype) found',
      });
    } else {
      checks.push({
        name: 'Microdata',
        status: 'pass',
        detail: `${structured.microdata.length} Microdata item(s) found`,
      });
    }

    // Schema types found
    const uniqueTypes = [...new Set(structured.types)];
    if (uniqueTypes.length > 0) {
      checks.push({
        name: 'Schema types',
        status: 'pass',
        detail: uniqueTypes.join(', '),
      });
    } else {
      checks.push({
        name: 'Schema types',
        status: 'warn',
        detail: 'No schema types detected',
      });
    }

    // ----------------------------------------------------------------
    // Validation of JSON-LD objects
    // ----------------------------------------------------------------
    let validationIssueCount = 0;

    for (const item of structured.jsonld) {
      const itemIssues = validateJsonLd(item);
      if (itemIssues.length > 0) {
        structured.issues.push(...itemIssues);
        validationIssueCount += itemIssues.length;
      }
    }

    if (structured.jsonld.length > 0 && validationIssueCount === 0) {
      score += 10;
      checks.push({
        name: 'JSON-LD validation',
        status: 'pass',
        detail: 'All JSON-LD objects pass basic validation',
      });
    } else if (validationIssueCount > 0) {
      checks.push({
        name: 'JSON-LD validation',
        status: 'fail',
        detail: `${validationIssueCount} validation issue(s) found`,
      });

      // -10 per validation issue
      score -= validationIssueCount * 10;

      // Add individual issue checks
      for (const issue of structured.issues.filter((i) =>
        i.startsWith('Article') ||
        i.startsWith('NewsArticle') ||
        i.startsWith('Product') ||
        i.startsWith('FAQ') ||
        i.includes('missing required') ||
        i.includes('@type'),
      )) {
        checks.push({
          name: 'Validation issue',
          status: 'warn',
          detail: issue,
        });
      }
    }

    // Overall structured data summary
    if (structured.jsonld.length === 0 && structured.microdata.length === 0) {
      checks.push({
        name: 'Overall',
        status: 'warn',
        detail: 'No structured data found on this page',
      });
    }

    score = Math.max(0, Math.min(100, score));
  } catch (err) {
    checks.push({
      name: 'Page fetch',
      status: 'fail',
      detail: `Error: ${err.message}`,
    });
    score = 0;
  }

  return { score, checks, structured };
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
 * Displays the structured data check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   structured: object
 * }} result
 */
export function displayStructured(result) {
  const { score, checks, structured } = result;

  console.log('');
  console.log(chalk.bold.underline('Structured Data Audit'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // Summary table
  const summaryTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [30, 60],
  });

  summaryTable.push(
    ['JSON-LD blocks', structured.jsonld.length],
    ['Microdata items', structured.microdata.length],
    ['Schema types found', [...new Set(structured.types)].length],
    [
      'Issues',
      structured.issues.length > 0
        ? chalk.yellow(structured.issues.length)
        : chalk.green('0'),
    ],
  );

  console.log('');
  console.log(summaryTable.toString());

  // Schema types table
  const uniqueTypes = [...new Set(structured.types)];
  if (uniqueTypes.length > 0) {
    console.log('');
    console.log(chalk.bold('Schema Types Detected:'));

    const typesTable = new Table({
      head: [chalk.cyan('#'), chalk.cyan('Type'), chalk.cyan('Source')],
      colWidths: [5, 40, 45],
    });

    const jsonLdTypes = new Set(
      structured.jsonld.flatMap((item) =>
        extractTypesFromItem(item),
      ),
    );
    const microdataShort = new Set(
      structured.microdata.map((t) => t.replace(/^https?:\/\/schema\.org\//i, '')),
    );

    uniqueTypes.forEach((type, i) => {
      const shortType = type.replace(/^https?:\/\/schema\.org\//i, '');
      const source = jsonLdTypes.has(type) || jsonLdTypes.has(shortType)
        ? 'JSON-LD'
        : microdataShort.has(shortType)
          ? 'Microdata'
          : 'Unknown';
      typesTable.push([i + 1, type, source]);
    });

    console.log(typesTable.toString());
  }

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

  // Issues detail
  if (structured.issues.length > 0) {
    console.log('');
    console.log(chalk.bold.yellow('Validation Issues:'));
    structured.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
  }

  // Raw JSON-LD preview (first item)
  if (structured.jsonld.length > 0) {
    console.log('');
    console.log(chalk.bold('JSON-LD Preview (first block):'));
    const preview = JSON.stringify(structured.jsonld[0], null, 2);
    const lines = preview.split('\n').slice(0, 20);
    console.log(chalk.gray(lines.join('\n')));
    if (preview.split('\n').length > 20) {
      console.log(chalk.gray('  ... (truncated)'));
    }
  }
}

/**
 * Extracts @type values from a single JSON-LD item (non-recursive, top-level only).
 *
 * @param {object} item
 * @returns {string[]}
 */
function extractTypesFromItem(item) {
  if (!item || typeof item !== 'object') return [];
  const rawType = item['@type'];
  if (!rawType) return [];
  return Array.isArray(rawType) ? rawType : [rawType];
}
