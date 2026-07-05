/* ==========================================================================
   Choicease — narrative.js
   Turns numbers into executive language: the verdict sentence, the
   trade-off line, and the exportable executive summary.
   Pure functions; no DOM access.
   ========================================================================== */

import { RATING_LABELS } from './engine.js';

const pct = (score) => Math.round((score / 5) * 100);

/** One sentence a partner could read aloud. */
export function verdictSentence(ranked, confidence) {
  if (!ranked.length) return 'No options to evaluate yet.';
  const top = ranked[0];
  if (ranked.length === 1) {
    return `${top.option.name} scores ${top.totalScore.toFixed(2)} of 5 against your criteria.`;
  }
  if (top.isTied) {
    const tied = ranked.filter((r) => r.rank === 1).map((r) => r.option.name);
    return `${joinNames(tied)} are tied — sharpen the weights or ratings to separate them.`;
  }
  const runnerUp = ranked[1];
  const lead = (top.totalScore - runnerUp.totalScore).toFixed(2);
  return `Recommend ${top.option.name} — it leads ${runnerUp.option.name} by ${lead} points on your weighted criteria.`;
}

/** The key trade-off: strongest counter-argument to the recommendation. */
export function tradeOffLine(ranked, drivers, risks) {
  if (ranked.length < 2) return '';
  const runnerUp = ranked[1];
  const counter = drivers.find((d) => d.delta < -0.01);
  if (counter) {
    return `Trade-off: ${runnerUp.option.name} is stronger on ${counter.criterionName} ` +
      `(${counter.runnerUpRating.toFixed(1)} vs ${counter.topRating.toFixed(1)}).`;
  }
  if (risks.length) {
    return `Watch-out: the recommended option rates only "${risks[0].ratingLabel}" on ${risks[0].criterionName}.`;
  }
  return `The recommendation leads on every material criterion.`;
}

/** Multi-paragraph executive summary for the report and clipboard. */
export function executiveSummary(decision, analysis) {
  const { ranked, confidence, drivers, flipPoints, risks } = analysis;
  if (!ranked.length) return '';
  const top = ranked[0];
  const lines = [];

  lines.push(verdictSentence(ranked, confidence));
  lines.push(
    `Confidence: ${confidence.level} — ${confidence.reason}`,
  );

  const topDrivers = drivers.filter((d) => d.delta > 0.005).slice(0, 3);
  if (topDrivers.length) {
    lines.push(
      `The result is driven by ${joinNames(topDrivers.map((d) => d.criterionName))}, ` +
      `which together account for ${Math.round(topDrivers.reduce((s, d) => s + d.weightPct, 0))}% of the decision weight.`,
    );
  }

  const nearestFlip = flipPoints.find((f) => f.distance !== null);
  if (nearestFlip) {
    lines.push(
      `Sensitivity: the ranking flips to ${nearestFlip.challenger} if the weight on ` +
      `"${nearestFlip.criterionName}" moves from ${Math.round(nearestFlip.currentPct)}% to ${nearestFlip.flipAt}%.`,
    );
  } else if (ranked.length > 1) {
    lines.push('Sensitivity: no single-criterion weight change overturns the ranking — the result is robust.');
  }

  if (risks.length) {
    lines.push(
      `Key risk: ${top.option.name} rates "${risks[0].ratingLabel}" on ${risks[0].criterionName} ` +
      `(${risks[0].rating.toFixed(1)}/5 at ${Math.round(risks[0].weightPct)}% weight) — mitigate before committing.`,
    );
  }

  return lines.join('\n\n');
}

/** Compact scoreboard line, e.g. for share text. */
export function scoreboardLine(ranked) {
  return ranked
    .slice(0, 3)
    .map((r) => `${r.rank}. ${r.option.name} — ${pct(r.totalScore)}%`)
    .join('\n');
}

export function ratingLabel(rating) {
  return RATING_LABELS[Math.round(rating)] || '';
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
