import Table from 'cli-table3';
import chalk from 'chalk';
import { fetch } from '../utils/fetcher.js';

/**
 * Paths that are suspicious to block (bad practice for SEO / site functionality).
 * Note: /wp-admin/ blocking is intentional and OK; we skip that one.
 */
const SUSPICIOUS_DISALLOW = [
  { pattern: /^\/css\//i, label: 'Blocking /css/' },
  { pattern: /^\/js\//i, label: 'Blocking /js/' },
  { pattern: /^\/images?\//i, label: 'Blocking /images/' },
  { pattern: /^\/assets\//i, label: 'Blocking /assets/' },
  { pattern: /^\/static\//i, label: 'Blocking /static/' },
  { pattern: /^\/fonts?\//i, label: 'Blocking /fonts/' },
  { pattern: /^\/media\//i, label: 'Blocking /media/' },
];

/**
 * Parses a robots.txt content string into structured rules.
 *
 * Returns an array of rule groups, each containing a `userAgents` list and
 * `directives` (Allow, Disallow, Sitemap, Crawl-delay, etc.).
 *
 * @param {string} content
 * @returns {{
 *   userAgents: string[],
 *   directives: Array<{type: string, value: string}>
 * }[]}
 */
function parseRobotsTxt(content) {
  const groups = [];
  let currentGroup = null;

  for (const rawLine of content.split(/\r?\n/)) {
    // Strip inline comments and trim
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      // Start a new group if we hit user-agent after directives, or create first group
      if (!currentGroup || currentGroup.directives.length > 0) {
        currentGroup = { userAgents: [], directives: [] };
        groups.push(currentGroup);
      }
      currentGroup.userAgents.push(value);
    } else if (currentGroup) {
      currentGroup.directives.push({ type: field, value });
    }
    // Lines before any user-agent are ignored
  }

  return groups;
}

/**
 * Extracts all Sitemap directives from the parsed groups.
 *
 * @param {{userAgents: string[], directives: Array<{type: string, value: string}>}[]} groups
 * @returns {string[]}
 */
function extractSitemaps(groups) {
  const sitemaps = [];
  for (const group of groups) {
    for (const dir of group.directives) {
      if (dir.type === 'sitemap' && dir.value) {
        sitemaps.push(dir.value);
      }
    }
  }
  return sitemaps;
}

/**
 * Checks if any group with user-agent * blocks everything via Disallow: /
 *
 * @param {{userAgents: string[], directives: Array<{type: string, value: string}>}[]} groups
 * @returns {boolean}
 */
function blocksEverything(groups) {
  for (const group of groups) {
    if (!group.userAgents.includes('*')) continue;
    for (const dir of group.directives) {
      if (dir.type === 'disallow' && dir.value === '/') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds suspicious Disallow rules in groups targeting all crawlers (*).
 *
 * @param {{userAgents: string[], directives: Array<{type: string, value: string}>}[]} groups
 * @returns {string[]} List of issue descriptions
 */
function findSuspiciousRules(groups) {
  const issues = [];
  for (const group of groups) {
    // Check all-crawlers group AND specific-bot groups
    for (const dir of group.directives) {
      if (dir.type !== 'disallow') continue;
      for (const suspicious of SUSPICIOUS_DISALLOW) {
        if (suspicious.pattern.test(dir.value)) {
          issues.push(
            `${suspicious.label} (User-agent: ${group.userAgents.join(', ')})`,
          );
        }
      }
    }
  }
  return issues;
}

/**
 * Flattens all rules from parsed groups into a simple array for display.
 *
 * @param {{userAgents: string[], directives: Array<{type: string, value: string}>}[]} groups
 * @returns {Array<{userAgent: string, type: string, value: string}>}
 */
function flattenRules(groups) {
  const rules = [];
  for (const group of groups) {
    const agents = group.userAgents.join(', ') || '*';
    for (const dir of group.directives) {
      rules.push({ userAgent: agents, type: dir.type, value: dir.value });
    }
  }
  return rules;
}

/**
 * Audits the robots.txt for the given URL.
 *
 * Scoring:
 *   Start at 100.
 *   -30 if robots.txt not found.
 *   -10 if no sitemap reference.
 *   -20 if blocking everything (Disallow: /).
 *   -5 per suspicious rule.
 *
 * @param {string} url
 * @returns {Promise<{
 *   score: number,
 *   checks: Array<{name: string, status: 'pass'|'warn'|'fail', detail: string}>,
 *   robots: {
 *     found: boolean,
 *     content: string,
 *     rules: Array<{userAgent: string, type: string, value: string}>,
 *     sitemapReferenced: boolean,
 *     issues: string[]
 *   }
 * }>}
 */
export default async function checkRobots(url) {
  const checks = [];
  let score = 100;

  const robotsResult = {
    found: false,
    content: '',
    rules: /** @type {Array<{userAgent: string, type: string, value: string}>} */ ([]),
    sitemapReferenced: false,
    issues: /** @type {string[]} */ ([]),
  };

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    checks.push({ name: 'URL parse', status: 'fail', detail: `Invalid URL: ${url}` });
    return { score: 0, checks, robots: robotsResult };
  }

  const robotsUrl = `${origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl);

    if (response.status !== 200 || !response.data) {
      robotsResult.found = false;
      checks.push({
        name: 'robots.txt found',
        status: 'fail',
        detail: `robots.txt not found (HTTP ${response.status})`,
      });
      score -= 30;
    } else {
      robotsResult.found = true;
      robotsResult.content =
        typeof response.data === 'string' ? response.data : String(response.data);

      checks.push({
        name: 'robots.txt found',
        status: 'pass',
        detail: `robots.txt found at ${robotsUrl}`,
      });

      // Parse the robots.txt
      const groups = parseRobotsTxt(robotsResult.content);
      robotsResult.rules = flattenRules(groups);

      // Sitemap reference (also look in top-level, standalone Sitemap: lines)
      const sitemaps = extractSitemaps(groups);
      // Also scan raw content for Sitemap: lines not inside a user-agent group
      const rawSitemapMatch = /^\s*Sitemap\s*:/im.test(robotsResult.content);
      robotsResult.sitemapReferenced = sitemaps.length > 0 || rawSitemapMatch;

      if (robotsResult.sitemapReferenced) {
        const sitemapList = sitemaps.length > 0 ? sitemaps.join(', ') : '(referenced)';
        checks.push({
          name: 'Sitemap reference',
          status: 'pass',
          detail: `Sitemap directive found: ${sitemapList}`,
        });
      } else {
        checks.push({
          name: 'Sitemap reference',
          status: 'warn',
          detail: 'No Sitemap: directive found in robots.txt',
        });
        score -= 10;
      }

      // Check if blocking everything
      const isBlockingAll = blocksEverything(groups);
      if (isBlockingAll) {
        const issue = 'Disallow: / for * blocks all crawlers from the entire site';
        robotsResult.issues.push(issue);
        checks.push({
          name: 'Block all check',
          status: 'fail',
          detail: issue,
        });
        score -= 20;
      } else {
        checks.push({
          name: 'Block all check',
          status: 'pass',
          detail: 'Site is not blocking all crawlers',
        });
      }

      // Check for suspicious rules
      const suspiciousIssues = findSuspiciousRules(groups);
      robotsResult.issues.push(...suspiciousIssues);

      if (suspiciousIssues.length === 0) {
        checks.push({
          name: 'Suspicious rules',
          status: 'pass',
          detail: 'No suspicious Disallow rules detected',
        });
      } else {
        for (const issue of suspiciousIssues) {
          checks.push({
            name: 'Suspicious rule',
            status: 'warn',
            detail: issue,
          });
        }
        score -= Math.min(suspiciousIssues.length * 5, 25);
      }

      // Rule count info
      checks.push({
        name: 'Rule count',
        status: 'pass',
        detail: `${robotsResult.rules.length} directive(s) parsed across ${groups.length} user-agent group(s)`,
      });
    }
  } catch (err) {
    robotsResult.found = false;
    checks.push({
      name: 'robots.txt found',
      status: 'fail',
      detail: `Error fetching robots.txt: ${err.message}`,
    });
    score -= 30;
  }

  score = Math.max(0, score);

  return { score, checks, robots: robotsResult };
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
 * Capitalises the first letter of a string.
 *
 * @param {string} str
 * @returns {string}
 */
function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Displays the robots.txt check result as formatted tables in the console.
 *
 * @param {{
 *   score: number,
 *   checks: Array<{name: string, status: string, detail: string}>,
 *   robots: object
 * }} result
 */
export function displayRobots(result) {
  const { score, checks, robots } = result;

  console.log('');
  console.log(chalk.bold.underline('Robots.txt Audit'));
  console.log(
    `Score: ${score >= 80 ? chalk.green(score) : score >= 60 ? chalk.yellow(score) : chalk.red(score)} / 100`,
  );

  // Summary table
  const summaryTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [30, 60],
  });

  summaryTable.push(
    ['Found', robots.found ? chalk.green('Yes') : chalk.red('No')],
    ['Sitemap referenced', robots.sitemapReferenced ? chalk.green('Yes') : chalk.red('No')],
    ['Total directives', robots.rules.length],
    ['Issues', robots.issues.length > 0 ? chalk.yellow(robots.issues.length) : chalk.green('0')],
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

  // Rules table (truncated to 30)
  if (robots.rules.length > 0) {
    console.log('');
    console.log(chalk.bold('Parsed Rules:'));

    const rulesTable = new Table({
      head: [chalk.cyan('User-Agent'), chalk.cyan('Directive'), chalk.cyan('Value')],
      colWidths: [25, 15, 50],
    });

    robots.rules.slice(0, 30).forEach((rule) => {
      const typeColour =
        rule.type === 'disallow'
          ? chalk.red(capitalise(rule.type))
          : rule.type === 'allow'
            ? chalk.green(capitalise(rule.type))
            : chalk.gray(capitalise(rule.type));
      rulesTable.push([rule.userAgent, typeColour, rule.value || chalk.gray('(empty)')]);
    });

    if (robots.rules.length > 30) {
      rulesTable.push(['...', '...', `and ${robots.rules.length - 30} more`]);
    }

    console.log(rulesTable.toString());
  }

  // Issues
  if (robots.issues.length > 0) {
    console.log('');
    console.log(chalk.bold.red('Issues detected:'));
    robots.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${chalk.yellow(issue)}`);
    });
  }
}
