/* Node unit tests for engine.js and narrative.js (pure modules). */
import assert from 'node:assert/strict';
import {
  normalizeWeights, computeResults, assignRanks, computeFlipPoints,
  computeConfidence, computeDrivers, computeRisks, analyzeDecision,
  computeRegret, computeSatisficing, computeDominance, computeRobustness,
  IMPORTANCE_TO_WEIGHT, DEFAULT_RATING,
} from '../js/engine.js';
import { verdictSentence, executiveSummary, tradeOffLine } from '../js/narrative.js';

const decision = {
  title: 'Choose a vendor',
  description: 'Q3 contract award',
  options: [
    { id: 1, name: 'Vendor A', description: '' },
    { id: 2, name: 'Vendor B', description: '' },
    { id: 3, name: 'Vendor C', description: '' },
  ],
  criteria: [
    { id: 10, name: 'Cost', description: '' },
    { id: 20, name: 'Quality', description: '' },
    { id: 30, name: 'Risk', description: '' },
  ],
  weights: { 10: 5, 20: 3, 30: 1 },
  ratings: {
    '1-10': 5, '1-20': 3, '1-30': 2,
    '2-10': 2, '2-20': 5, '2-30': 4,
    '3-10': 3, '3-20': 3, '3-30': 3,
  },
  normalizedWeights: {},
};

/* 1. Weight normalization matches legacy geometric mapping and sums to 100. */
const w = normalizeWeights(decision.weights);
const sum = Object.values(w).reduce((s, v) => s + v, 0);
assert.ok(Math.abs(sum - 100) < 1e-9, 'weights sum to 100');
const expectedCost = (IMPORTANCE_TO_WEIGHT[5] / (10 + 3.16 + 1)) * 100;
assert.ok(Math.abs(w[10] - expectedCost) < 1e-9, 'cost weight matches legacy mapping');

/* 2. Scoring: manual check for Vendor A. */
decision.normalizedWeights = w;
const results = computeResults(decision);
const a = results.find((r) => r.option.id === 1);
const manual = 5 * (w[10] / 100) + 3 * (w[20] / 100) + 2 * (w[30] / 100);
assert.ok(Math.abs(a.totalScore - manual) < 1e-6, 'Vendor A score matches manual calc');
assert.equal(results[0].option.id, 1, 'Vendor A wins with cost-heavy weights');

/* 3. Missing ratings default to DEFAULT_RATING. */
const sparse = { ...decision, ratings: {}, normalizedWeights: {} };
const sparseResults = computeResults(sparse);
for (const r of sparseResults) {
  assert.ok(Math.abs(r.totalScore - DEFAULT_RATING) < 1e-6, 'all-default scores equal DEFAULT_RATING');
}

/* 4. Ties share a rank; next rank skips. */
const ranked = assignRanks(sparseResults);
assert.ok(ranked.every((r) => r.rank === 1 && r.isTied), 'all tied at rank 1');
const rankedDistinct = assignRanks(computeResults(decision));
assert.deepEqual(rankedDistinct.map((r) => r.rank), [1, 2, 3], 'distinct scores rank 1..3');

/* 5. Flip points: increasing Quality weight should eventually flip to Vendor B. */
const flips = computeFlipPoints(decision);
const qualityFlip = flips.find((f) => f.criterionId === 20);
assert.ok(qualityFlip.flipAt !== null, 'quality has a flip point');
assert.equal(qualityFlip.challenger, 'Vendor B', 'quality flip crowns Vendor B');
// Verify the flip really happens at the reported weight.
const trial = { ...w, 20: qualityFlip.flipAt };
const othersTotal = w[10] + w[30];
trial[10] = (w[10] / othersTotal) * (100 - qualityFlip.flipAt);
trial[30] = (w[30] / othersTotal) * (100 - qualityFlip.flipAt);
const flipped = computeResults(decision, trial);
assert.notEqual(flipped[0].option.id, 1, 'winner actually changes at reported flip point');

/* 6. What-if override renormalizes (weights not summing to 100 still work). */
const override = computeResults(decision, { 10: 50, 20: 50, 30: 50 });
const equalManual = (5 + 3 + 2) / 3;
assert.ok(Math.abs(override.find((r) => r.option.id === 1).totalScore - equalManual) < 1e-6,
  'override weights renormalize to equal thirds');

/* 7. Confidence, drivers, risks, and full analysis produce sane shapes. */
const analysis = analyzeDecision(structuredClone(decision));
assert.ok(['High', 'Medium', 'Low'].includes(analysis.confidence.level));
assert.ok(analysis.drivers.length > 0 && 'delta' in analysis.drivers[0]);
const risky = computeRisks(analysis.ranked, decision);
assert.ok(Array.isArray(risky));
const drivers = computeDrivers(analysis.ranked, decision);
assert.ok(Math.abs(drivers[0].delta) >= Math.abs(drivers[drivers.length - 1].delta),
  'drivers sorted by magnitude');

/* 8. Narrative renders without placeholders. */
const sentence = verdictSentence(analysis.ranked, analysis.confidence);
assert.ok(sentence.includes('Vendor A'), 'verdict names the winner');
const summary = executiveSummary(decision, analysis);
assert.ok(summary.length > 100 && !summary.includes('undefined'), 'summary is substantive');
const tradeoff = tradeOffLine(analysis.ranked, analysis.drivers, analysis.risks);
assert.ok(typeof tradeoff === 'string' && !tradeoff.includes('undefined'));

/* 9. Single-option edge case. */
const solo = {
  ...decision,
  options: [decision.options[0]],
  ratings: { '1-10': 4, '1-20': 4, '1-30': 4 },
  normalizedWeights: {},
};
const soloAnalysis = analyzeDecision(solo);
assert.equal(soloAnalysis.ranked.length, 1);
assert.ok(verdictSentence(soloAnalysis.ranked, soloAnalysis.confidence).includes('Vendor A'));

/* 10. Legacy compatibility: ratings keyed as strings, weights as string keys. */
const legacy = {
  title: 'Legacy', description: '', normalizedWeights: {},
  options: [{ id: 1755501234567, name: 'Old A' }, { id: 1755501234568, name: 'Old B' }],
  criteria: [{ id: 1755501234569, name: 'Old crit' }],
  weights: { 1755501234569: 4 },
  ratings: { '1755501234567-1755501234569': 4.5, '1755501234568-1755501234569': 2.0 },
};
const legacyRanked = assignRanks(computeResults(legacy));
assert.equal(legacyRanked[0].option.name, 'Old A');
assert.ok(Math.abs(legacyRanked[0].totalScore - 4.5) < 1e-6, 'single-criterion score equals rating');

/* 11. DEFAULT_RATING standardized to 2.5. */
assert.equal(DEFAULT_RATING, 2.5, 'default rating is the 0-5 midpoint');

/* 12. Regret: perfect-on-everything option has zero regret; ordering sane. */
const regret = computeRegret(decision);
assert.equal(regret.length, 3);
for (const row of regret) assert.ok(row.maxRegret >= 0 && row.totalRegret >= row.maxRegret - 1e-9);
// Manual check: Vendor A regret on Quality = (5-3)*w20, on Risk = (4-2)*w30, 0 on Cost.
const aRow = regret.find((r) => r.option.id === 1);
const expectedMaxA = Math.max(2 * (w[20] / 100), 2 * (w[30] / 100));
assert.ok(Math.abs(aRow.maxRegret - expectedMaxA) < 1e-6, 'Vendor A max regret matches manual calc');

/* 13. Satisficing: bar 3 → only Vendor C (all 3s) and none fail below bar 2. */
const sat3 = computeSatisficing(decision, 3);
assert.equal(sat3.find((r) => r.option.id === 3).passes, true, 'Vendor C clears bar 3 everywhere');
assert.equal(sat3.find((r) => r.option.id === 1).passes, false, 'Vendor A fails bar 3 (Risk=2)');
assert.ok(sat3.find((r) => r.option.id === 1).failures.some((f) => f.criterionName === 'Risk'));
const sat2 = computeSatisficing(decision, 2);
assert.ok(sat2.every((r) => r.passes), 'all options clear bar 2');

/* 14. Dominance: add a strictly-worse clone and confirm it is flagged. */
const withClone = structuredClone(decision);
withClone.options.push({ id: 4, name: 'Vendor D', description: '' });
withClone.ratings['4-10'] = 1; withClone.ratings['4-20'] = 2; withClone.ratings['4-30'] = 2;
const dom = computeDominance(withClone);
assert.ok(dom.some((d) => d.dominated === 'Vendor D'), 'strictly worse option is dominated');
assert.equal(computeDominance(decision).length, 0, 'no dominance among the originals');

/* 15. Robustness: deterministic (seeded), shares sum to 1, decisive case holds high. */
const rob1 = computeRobustness(decision, { trials: 300, seed: 7 });
const rob2 = computeRobustness(decision, { trials: 300, seed: 7 });
assert.deepEqual(rob1, rob2, 'seeded robustness is deterministic');
const shareSum = rob1.winShare.reduce((s, x) => s + x.share, 0);
assert.ok(Math.abs(shareSum - 1) < 1e-9, 'win shares sum to 1');
assert.ok(rob1.winnerHoldRate > 0.5, 'clear winner holds in most perturbations');

/* 16. analyzeDecision exposes every lens. */
const full = analyzeDecision(structuredClone(decision));
for (const key of ['ranked', 'flipPoints', 'confidence', 'drivers', 'risks', 'regret', 'dominance', 'robustness']) {
  assert.ok(key in full, `analysis includes ${key}`);
}

console.log('ALL ENGINE TESTS PASSED (16/16)');
