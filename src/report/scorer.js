/**
 * Scoring module for seoscan.
 *
 * Each check category returns a result object with a `score` property (0–100).
 * This module combines them into a weighted overall score and letter grade.
 */

/** @type {Record<string, number>} */
const WEIGHTS = {
  meta: 20,
  performance: 15,
  links: 15,
  images: 10,
  headers: 10,
  sitemap: 5,
  robots: 5,
  structured: 10,
  content: 10,
};

// Sanity check: weights must sum to 100.
const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (WEIGHT_TOTAL !== 100) {
  throw new Error(`Scoring weights must sum to 100, but got ${WEIGHT_TOTAL}`);
}

/**
 * Returns the letter grade for a numeric score (0–100).
 *
 * @param {number} score
 * @returns {'A' | 'B' | 'C' | 'D' | 'F'}
 */
export function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculates the overall SEO score from individual category results.
 *
 * Each value in `results` must have a `.score` property (0–100).
 * Categories not present in `results` are treated as having a score of 0.
 *
 * @param {Record<string, { score: number, [key: string]: any }>} results
 * @returns {{
 *   score: number,
 *   grade: 'A' | 'B' | 'C' | 'D' | 'F',
 *   breakdown: Record<string, { score: number, weight: number, weighted: number }>
 * }}
 */
export function calculateOverallScore(results) {
  const breakdown = {};
  let totalWeighted = 0;

  for (const [category, weight] of Object.entries(WEIGHTS)) {
    const categoryResult = results[category];
    // Gracefully handle missing or malformed category results.
    const score =
      categoryResult != null && typeof categoryResult.score === 'number'
        ? Math.max(0, Math.min(100, categoryResult.score))
        : 0;

    const weighted = (score * weight) / 100;
    totalWeighted += weighted;

    breakdown[category] = {
      score,
      weight,
      weighted: Math.round(weighted * 100) / 100,
    };
  }

  const score = Math.round(totalWeighted);

  return {
    score,
    grade: gradeFromScore(score),
    breakdown,
  };
}

export default { calculateOverallScore, gradeFromScore };
