/* ==========================================================================
   Choicease — narrative.js
   Two registers, deliberately:
   • CASUAL — the default results layer. Playful, warm, zero jargon.
   • PRO — advanced analytics, PDF, PPTX. Impeccable consulting prose.
   Pure functions; no DOM access.
   ========================================================================== */

import { RATING_LABELS } from './engine.js';

const pct = (score) => Math.round((score / 5) * 100);

/* ============================== CASUAL VOICE ============================== */

/** Playful winner line for the results page. */
export function casualWinnerLine(ranked) {
  if (!ranked.length) return 'Nothing to judge yet!';
  const top = ranked[0];
  if (ranked.length === 1) {
    return `${top.option.name} scores ${pct(top.totalScore)}% — solid, but it ran unopposed 😄`;
  }
  if (top.isTied) {
    const tied = ranked.filter((r) => r.rank === 1).map((r) => r.option.name);
    return `It's a photo finish — ${joinNames(tied)} are neck and neck! 🤝`;
  }
  return `🏆 ${top.option.name} takes it!`;
}

/** One friendly sub-line under the winner. */
export function casualSubLine(ranked, confidence) {
  if (ranked.length < 2) return 'Add another option next time for a real showdown.';
  const top = ranked[0];
  if (top.isTied) return 'Tweak a weight or a rating to break the tie — the What-If sliders are great for this.';
  const runnerUp = ranked[1];
  const gapPct = confidence.gapPct;
  if (gapPct >= 12) return `A clear win — ${runnerUp.option.name} wasn't close on the things you care about.`;
  if (gapPct >= 5) return `${runnerUp.option.name} put up a good fight, but your priorities point one way.`;
  return `${runnerUp.option.name} is right on its heels — this one's genuinely close.`;
}

/**
 * Plain-language callouts a casual user should see — no jargon, each with a
 * clear "so what". Returns [{ tone: 'info'|'warn', text }].
 */
export function casualCallouts(decision, analysis) {
  const { ranked, confidence, flipPoints } = analysis;
  const notes = [];
  if (ranked.length < 2) return notes;

  const top = ranked[0];
  if (top.isTied) {
    notes.push({
      tone: 'warn',
      text: `Dead heat at the top. The numbers can't pick between them — your gut gets the casting vote, or sharpen a rating to break the tie.`,
    });
  } else if (confidence.gapPct < 3) {
    notes.push({
      tone: 'warn',
      text: `The top two are within a whisker. A small change of heart flips this — worth a second look at what matters most before you commit.`,
    });
  }

  const nearestFlip = flipPoints.find((f) => f.distance !== null && f.distance <= 10);
  if (nearestFlip && !top.isTied) {
    notes.push({
      tone: 'info',
      text: `Heads up: if "${nearestFlip.criterionName}" matters a bit more to you than you said, the winner changes. If you're sure about your priorities, you're good.`,
    });
  }

  if (confidence.coverage < 0.999) {
    const skippedPct = Math.round((1 - confidence.coverage) * 100);
    notes.push({
      tone: 'info',
      text: `You left ${skippedPct}% of ratings untouched, so those scores used the middle-of-the-road default. Rating them yourself would firm this up.`,
    });
  }

  const weights = Object.values(decision.normalizedWeights || {});
  const maxWeight = Math.max(0, ...weights);
  if (maxWeight >= 50 && decision.criteria.length >= 3) {
    notes.push({
      tone: 'info',
      text: `One factor carries over half the decision. That's fine if it truly dominates — just know the other criteria barely move the needle.`,
    });
  }

  if (!notes.length) {
    notes.push({
      tone: 'good',
      text: `Nice and clear-cut — the winner leads comfortably and holds up when we stress-test your priorities.`,
    });
  }
  return notes;
}

/* ================================ PRO VOICE =============================== */

/** One sentence a partner could read aloud. */
export function verdictSentence(ranked) {
  if (!ranked.length) return 'No options were evaluated.';
  const top = ranked[0];
  if (ranked.length === 1) {
    return `${top.option.name} scores ${top.totalScore.toFixed(2)} of 5.00 against the stated criteria.`;
  }
  if (top.isTied) {
    const tied = ranked.filter((r) => r.rank === 1).map((r) => r.option.name);
    return `${joinNames(tied)} are statistically tied; the analysis cannot separate them under the current weights and ratings.`;
  }
  const runnerUp = ranked[1];
  return `Recommend ${top.option.name} — it leads ${runnerUp.option.name} by ${(top.totalScore - runnerUp.totalScore).toFixed(2)} points on the weighted criteria.`;
}

/** Strongest counter-argument / key trade-off. */
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
  return 'The recommendation leads on every material criterion.';
}

/** Multi-paragraph executive summary for reports. */
export function executiveSummary(decision, analysis) {
  const { ranked, confidence, drivers, flipPoints, risks, robustness, regret } = analysis;
  if (!ranked.length) return '';
  const top = ranked[0];
  const lines = [];

  lines.push(verdictSentence(ranked));
  lines.push(`Confidence: ${confidence.level} — ${confidence.reason}`);

  const topDrivers = drivers.filter((d) => d.delta > 0.005).slice(0, 3);
  if (topDrivers.length) {
    lines.push(
      `The result is driven by ${joinNames(topDrivers.map((d) => d.criterionName))}, ` +
      `which together account for ${Math.round(topDrivers.reduce((s, d) => s + d.weightPct, 0))}% of the decision weight.`,
    );
  }

  if (robustness && robustness.trials > 0) {
    lines.push(
      `Robustness: ${top.option.name} remains the leading option in ${Math.round(robustness.winnerHoldRate * 100)}% ` +
      `of ${robustness.trials} scenarios in which every criterion weight is independently perturbed by up to ±${Math.round(robustness.jitter * 100)}%.`,
    );
  }

  const nearestFlip = flipPoints.find((f) => f.distance !== null);
  if (nearestFlip) {
    lines.push(
      `Sensitivity: the ranking flips to ${nearestFlip.challenger} if the weight on ` +
      `"${nearestFlip.criterionName}" moves from ${Math.round(nearestFlip.currentPct)}% to ${nearestFlip.flipAt}%.`,
    );
  } else if (ranked.length > 1) {
    lines.push('Sensitivity: no single-criterion weight change overturns the ranking; the result is structurally robust.');
  }

  if (regret?.length && regret[0].option.id !== top.option.id) {
    lines.push(
      `Alternative lens: under a minimax-regret criterion, ${regret[0].option.name} would be preferred — ` +
      `it carries the smallest worst-case regret. The divergence indicates the recommendation trades a modest downside risk for higher expected fit.`,
    );
  }

  if (risks.length) {
    lines.push(
      `Key risk: ${top.option.name} rates "${risks[0].ratingLabel}" on ${risks[0].criterionName} ` +
      `(${risks[0].rating.toFixed(1)}/5 at ${Math.round(risks[0].weightPct)}% weight); mitigation is advised before committing.`,
    );
  }

  return lines.join('\n\n');
}

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
