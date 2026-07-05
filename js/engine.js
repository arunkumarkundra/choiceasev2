/* ==========================================================================
   Choicease — engine.js
   Pure computation: weights, scores, ranks, confidence, sensitivity,
   drivers, risks, what-if. No DOM access; fully unit-testable.
   ========================================================================== */

/** Rating scale labels (0–5). */
export const RATING_LABELS = {
  0: 'Unacceptable', 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent',
};

/** Importance labels (1–5). */
export const IMPORTANCE_LABELS = {
  1: 'Marginal', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Critical',
};

/**
 * Importance rating -> raw weight. Geometric progression (base 1.77828 = 10^(1/4)),
 * identical to the legacy engine, so imported decisions score exactly the same.
 */
export const IMPORTANCE_TO_WEIGHT = { 1: 1, 2: 1.78, 3: 3.16, 4: 5.62, 5: 10 };

/** Rating used when a cell was never rated. 3 = "Good", the neutral midpoint. */
export const DEFAULT_RATING = 3;

/* --------------------------------------------------------------------------
   Weights
   -------------------------------------------------------------------------- */

/** importanceRatings: { criterionId: 1..5 } -> { criterionId: percentage } */
export function normalizeWeights(importanceRatings) {
  const entries = Object.entries(importanceRatings || {});
  const total = entries.reduce(
    (sum, [, rating]) => sum + (IMPORTANCE_TO_WEIGHT[rating] || IMPORTANCE_TO_WEIGHT[3]),
    0,
  );
  const normalized = {};
  if (total <= 0) return normalized;
  for (const [id, rating] of entries) {
    const mapped = IMPORTANCE_TO_WEIGHT[rating] || IMPORTANCE_TO_WEIGHT[3];
    normalized[id] = (mapped / total) * 100;
  }
  return normalized;
}

/** Ensure a decision object has up-to-date normalized weights; returns them. */
export function ensureNormalizedWeights(decision) {
  decision.normalizedWeights = normalizeWeights(decision.weights);
  return decision.normalizedWeights;
}

/* --------------------------------------------------------------------------
   Scoring
   -------------------------------------------------------------------------- */

/**
 * Compute scored, sorted results.
 * @param {object} decision - { options, criteria, weights, ratings, normalizedWeights? }
 * @param {object} [weightOverridePct] - optional { criterionId: pct } for what-if runs
 * @returns {Array<{option, totalScore, criteriaScores}>} sorted descending
 */
export function computeResults(decision, weightOverridePct = null) {
  const weightsPct = weightOverridePct
    ? renormalizePct(weightOverridePct)
    : (hasAllWeights(decision) ? decision.normalizedWeights : normalizeWeights(decision.weights));

  const results = decision.options.map((option) => {
    let totalScore = 0;
    const criteriaScores = {};
    for (const criterion of decision.criteria) {
      const rating = getRating(decision, option.id, criterion.id);
      const weight = (weightsPct[criterion.id] || 0) / 100;
      const weighted = rating * weight;
      criteriaScores[criterion.id] = {
        criterionName: criterion.name,
        rating,
        weightPct: weight * 100,
        weighted,
      };
      totalScore += weighted;
    }
    return {
      option: { id: option.id, name: option.name, description: option.description || '' },
      totalScore: Math.round(totalScore * 1e6) / 1e6,
      criteriaScores,
    };
  });

  results.sort((a, b) => b.totalScore - a.totalScore);
  return results;
}

export function getRating(decision, optionId, criterionId) {
  const value = decision.ratings[`${optionId}-${criterionId}`];
  return Number.isFinite(value) ? value : DEFAULT_RATING;
}

function hasAllWeights(decision) {
  const nw = decision.normalizedWeights;
  if (!nw) return false;
  return decision.criteria.every((c) => Number.isFinite(nw[c.id]));
}

function renormalizePct(pcts) {
  const total = Object.values(pcts).reduce((s, v) => s + (Number(v) || 0), 0);
  const out = {};
  if (total <= 0) return out;
  for (const [id, v] of Object.entries(pcts)) out[id] = ((Number(v) || 0) / total) * 100;
  return out;
}

/* --------------------------------------------------------------------------
   Ranking (ties share a rank, next rank skips accordingly)
   -------------------------------------------------------------------------- */

export function assignRanks(results, epsilon = 1e-6) {
  const ranked = [];
  let i = 0;
  let rank = 1;
  while (i < results.length) {
    const group = [results[i]];
    let j = i + 1;
    while (j < results.length && Math.abs(results[j].totalScore - results[i].totalScore) < epsilon) {
      group.push(results[j]);
      j += 1;
    }
    for (const r of group) ranked.push({ ...r, rank, isTied: group.length > 1 });
    rank += group.length;
    i = j;
  }
  return ranked;
}

/* --------------------------------------------------------------------------
   Sensitivity — flip points per criterion
   For each criterion, sweep its weight 0→100% (others rescaled proportionally)
   and record the nearest weight at which the winner changes.
   -------------------------------------------------------------------------- */

export function computeFlipPoints(decision) {
  const basePct = normalizeWeights(decision.weights);
  const baseResults = computeResults(decision);
  if (baseResults.length < 2) return [];
  const baseWinnerId = baseResults[0].option.id;

  const flips = [];
  for (const criterion of decision.criteria) {
    const currentPct = basePct[criterion.id] || 0;
    let flipAt = null;
    let challenger = null;

    for (let w = 0; w <= 100; w += 1) {
      const trial = buildTrialWeights(basePct, criterion.id, w);
      const trialResults = computeResults(decision, trial);
      if (trialResults[0].option.id !== baseWinnerId) {
        // Record the flip nearest to the current weight.
        if (flipAt === null || Math.abs(w - currentPct) < Math.abs(flipAt - currentPct)) {
          flipAt = w;
          challenger = trialResults[0].option.name;
        }
      }
    }

    flips.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      currentPct,
      flipAt,        // null = winner is robust to this criterion across 0–100%
      challenger,
      distance: flipAt === null ? null : Math.abs(flipAt - currentPct),
    });
  }

  flips.sort((a, b) => {
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });
  return flips;
}

function buildTrialWeights(basePct, targetId, targetValue) {
  const othersTotal = Object.entries(basePct)
    .filter(([id]) => String(id) !== String(targetId))
    .reduce((s, [, v]) => s + v, 0);
  const remaining = 100 - targetValue;
  const trial = {};
  for (const [id, v] of Object.entries(basePct)) {
    if (String(id) === String(targetId)) {
      trial[id] = targetValue;
    } else {
      trial[id] = othersTotal > 0 ? (v / othersTotal) * remaining : remaining / Math.max(1, Object.keys(basePct).length - 1);
    }
  }
  return trial;
}

/* --------------------------------------------------------------------------
   Confidence — honest, explainable grade for the recommendation
   -------------------------------------------------------------------------- */

export function computeConfidence(rankedResults, flipPoints, decision) {
  if (rankedResults.length < 2) {
    return { level: 'High', score: 3, reason: 'Only one option was evaluated.' };
  }
  const top = rankedResults[0];
  const runnerUp = rankedResults[1];
  const gap = top.totalScore - runnerUp.totalScore; // scale 0–5
  const gapPct = (gap / 5) * 100;

  const nearestFlip = flipPoints.find((f) => f.distance !== null);
  const fragile = nearestFlip && nearestFlip.distance <= 10;
  const somewhatFragile = nearestFlip && nearestFlip.distance <= 20;

  const expected = decision.options.length * decision.criteria.length;
  const actual = Object.keys(decision.ratings || {}).length;
  const coverage = expected > 0 ? actual / expected : 1;

  let score; // 3 High, 2 Medium, 1 Low
  if (top.isTied) score = 1;
  else if (gapPct >= 8 && !fragile) score = 3;
  else if (gapPct >= 3 && !fragile) score = 2;
  else score = 1;
  if (score === 3 && (somewhatFragile || coverage < 0.9)) score = 2;

  const reasons = [];
  if (top.isTied) {
    reasons.push(`"${top.option.name}" is tied at the top — the analysis cannot separate the leaders.`);
  } else {
    reasons.push(`the lead over "${runnerUp.option.name}" is ${gap.toFixed(2)} points (${gapPct.toFixed(0)}% of the scale)`);
  }
  if (nearestFlip && nearestFlip.distance !== null) {
    if (fragile) {
      reasons.push(`the result flips if "${nearestFlip.criterionName}" shifts by ~${Math.round(nearestFlip.distance)} points of weight`);
    } else {
      reasons.push(`the nearest flip point ("${nearestFlip.criterionName}") is ${Math.round(nearestFlip.distance)} weight-points away`);
    }
  } else {
    reasons.push('no single criterion weight change (0–100%) overturns the result');
  }
  if (coverage < 0.9) {
    reasons.push(`${Math.round((1 - coverage) * 100)}% of ratings used defaults`);
  }

  const level = score === 3 ? 'High' : score === 2 ? 'Medium' : 'Low';
  return { level, score, reason: reasons.join('; ') + '.', gap, gapPct };
}

/* --------------------------------------------------------------------------
   Drivers — why the winner wins (advantage vs runner-up per criterion)
   -------------------------------------------------------------------------- */

export function computeDrivers(rankedResults, decision, count = 5) {
  if (rankedResults.length < 2) return [];
  const top = rankedResults[0];
  const runnerUp = rankedResults[1];
  const drivers = decision.criteria.map((criterion) => {
    const a = top.criteriaScores[criterion.id];
    const b = runnerUp.criteriaScores[criterion.id];
    const delta = (a?.weighted || 0) - (b?.weighted || 0);
    return {
      criterionId: criterion.id,
      criterionName: criterion.name,
      weightPct: a?.weightPct || 0,
      topRating: a?.rating ?? DEFAULT_RATING,
      runnerUpRating: b?.rating ?? DEFAULT_RATING,
      delta, // + favors winner, − favors runner-up
    };
  });
  drivers.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return drivers.slice(0, count);
}

/* --------------------------------------------------------------------------
   Risks — weak spots in the recommended option
   -------------------------------------------------------------------------- */

export function computeRisks(rankedResults, decision) {
  if (!rankedResults.length) return [];
  const top = rankedResults[0];
  const risks = [];
  for (const criterion of decision.criteria) {
    const cell = top.criteriaScores[criterion.id];
    if (!cell) continue;
    if (cell.rating <= 2 && cell.weightPct >= 8) {
      risks.push({
        criterionName: criterion.name,
        rating: cell.rating,
        ratingLabel: RATING_LABELS[Math.round(cell.rating)] || '',
        weightPct: cell.weightPct,
        severity: cell.weightPct * (2.5 - cell.rating),
      });
    }
  }
  risks.sort((a, b) => b.severity - a.severity);
  return risks;
}

/* --------------------------------------------------------------------------
   Convenience: everything the results view needs, in one call
   -------------------------------------------------------------------------- */

export function analyzeDecision(decision) {
  ensureNormalizedWeights(decision);
  const results = computeResults(decision);
  const ranked = assignRanks(results);
  const flipPoints = computeFlipPoints(decision);
  const confidence = computeConfidence(ranked, flipPoints, decision);
  const drivers = computeDrivers(ranked, decision);
  const risks = computeRisks(ranked, decision);
  return { ranked, flipPoints, confidence, drivers, risks };
}
