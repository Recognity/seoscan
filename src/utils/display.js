import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Returns an icon representing an audit result status.
 *
 * @param {string} status - One of: 'ok', 'pass', 'warn', 'fail', 'error'
 * @returns {string}
 */
export function statusIcon(status) {
  switch (status?.toLowerCase()) {
    case 'ok':
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
    case 'error':
    default:
      return '❌';
  }
}

/**
 * Maps a numeric score (0–100) to a letter grade.
 *
 * @param {number} score
 * @returns {'A'|'B'|'C'|'D'|'F'}
 */
export function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Returns a chalk-colored string representation of the score.
 * Green for scores >= 80, yellow for >= 60, red for < 60.
 *
 * @param {number} score
 * @returns {string}
 */
export function colorScore(score) {
  const str = String(score);
  if (score >= 80) return chalk.green(str);
  if (score >= 60) return chalk.yellow(str);
  return chalk.red(str);
}

/**
 * Creates a cli-table3 Table instance and returns its string representation.
 *
 * @param {string[]} head - Column header labels
 * @param {Array<string[]>} rows - Array of row arrays
 * @returns {string}
 */
export function createTable(head, rows) {
  const table = new Table({
    head: head.map((h) => chalk.bold(h)),
    style: {
      head: [],
      border: [],
    },
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}

/**
 * Prints a formatted table to stdout.
 *
 * @param {string[]} head - Column header labels
 * @param {Array<string[]>} rows - Array of row arrays
 * @returns {void}
 */
export function printTable(head, rows) {
  console.log(createTable(head, rows));
}

/**
 * Prints a bold chalk header line to stdout.
 *
 * @param {string} text
 * @returns {void}
 */
export function printHeader(text) {
  console.log(chalk.bold(text));
}

/**
 * Prints a formatted score line with a colored score value, grade letter, and label.
 *
 * @param {number} score - Numeric score from 0–100
 * @param {string} label - Descriptive label (e.g. 'Overall SEO Score')
 * @returns {void}
 */
export function printScore(score, label) {
  const grade = gradeFromScore(score);
  const colored = colorScore(score);

  let gradeColored;
  if (score >= 80) {
    gradeColored = chalk.green.bold(grade);
  } else if (score >= 60) {
    gradeColored = chalk.yellow.bold(grade);
  } else {
    gradeColored = chalk.red.bold(grade);
  }

  console.log(`${chalk.bold(label)}: ${colored}/100 (${gradeColored})`);
}
