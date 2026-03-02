/**
 * JSON report generator for seoscan.
 */

/**
 * Generates a pretty-printed JSON SEO report.
 *
 * @param {string} url - The audited URL.
 * @param {Record<string, { score: number, checks?: any[], [key: string]: any }>} results - Per-category results.
 * @param {{ score: number, grade: string, breakdown: Record<string, { score: number, weight: number, weighted: number }> }} overallScore - Output of calculateOverallScore().
 * @returns {string} Pretty-printed JSON string (2-space indent).
 */
export default function generateJson(url, results, overallScore) {
  const report = {
    tool: 'seoscan',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    url,
    overall: {
      score: overallScore.score,
      grade: overallScore.grade,
      breakdown: overallScore.breakdown,
    },
    results,
  };

  return JSON.stringify(report, null, 2);
}
