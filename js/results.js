/* ==========================================================================
   Choicease — results.js
   Step 6, two layers:
   • CASUAL (default): title/date header, playful winner card, leaderboard,
     plain-language callouts, actions. Zero jargon.
   • ADVANCED (opt-in): professional analytics accordions in narrative order —
     exec summary → drivers → ranking → heatmap → sensitivity → what-if →
     alternative lenses (regret, satisficing, dominance, robustness) →
     risks → method.
   ========================================================================== */

import { decision } from './state.js';
import {
  analyzeDecision, computeResults, assignRanks, computeSatisficing,
  RATING_LABELS,
} from './engine.js';
import {
  casualWinnerLine, casualSubLine, casualCallouts,
  verdictSentence, tradeOffLine, executiveSummary,
} from './narrative.js';
import { esc, $, $$ } from './ui.js';

let lastAnalysis = null;
let whatIfWeights = null;
let satisficingBar = 3;
let advancedBuilt = false;

export function getLastAnalysis() {
  return lastAnalysis;
}

export function currentExecutiveSummary() {
  if (!lastAnalysis) return '';
  return executiveSummary(decision, lastAnalysis);
}

export function renderResults() {
  lastAnalysis = analyzeDecision(decision);
  whatIfWeights = { ...decision.normalizedWeights };
  satisficingBar = 3;
  advancedBuilt = false;

  renderCasualLayer();

  // Advanced section resets collapsed; content builds lazily on first open.
  const adv = $('#advancedSection');
  adv.classList.add('is-hidden');
  const toggle = $('#advancedToggleBtn');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '🤓 Show advanced analytics';
}

/* ========================== CASUAL LAYER ================================== */

function renderCasualLayer() {
  const { ranked, confidence } = lastAnalysis;
  const container = $('#casualResults');

  const dateLine = new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  container.innerHTML = `
    <header class="result-head">
      <p class="result-head__eyebrow">Your results are in 🎉</p>
      <h2 class="result-head__title">${esc(decision.title || 'Your decision')}</h2>
      ${decision.description ? `<p class="result-head__desc">${esc(decision.description)}</p>` : ''}
      <p class="result-head__meta mono">${esc(dateLine)} · ${decision.options.length} options · ${decision.criteria.length} criteria</p>
    </header>

    <div class="winner-card">
      <h3 class="winner-card__line">${esc(casualWinnerLine(ranked))}</h3>
      <p class="winner-card__sub">${esc(casualSubLine(ranked, confidence))}</p>
    </div>

    <div class="leaderboard">
      ${renderLeaderboard(ranked)}
    </div>

    <div class="callouts">
      ${casualCallouts(decision, lastAnalysis).map((note) => `
        <div class="callout callout--${note.tone}">${esc(note.text)}</div>
      `).join('')}
    </div>
  `;
}

function renderLeaderboard(ranked) {
  const max = Math.max(...ranked.map((r) => r.totalScore), 0.01);
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '');
  return ranked.map((r) => `
    <div class="board-row ${r.rank === 1 ? 'is-top' : ''} ${r.isTied ? 'is-tied' : ''}">
      <span class="board-row__rank">
        <span class="board-row__medal">${medal(r.rank)}</span>
        <span class="board-row__num mono">${r.rank}${r.isTied ? '=' : ''}</span>
      </span>
      <div class="board-row__main">
        <div class="board-row__head">
          <span class="board-row__name">${esc(r.option.name)}${r.isTied ? ' <span class="tie-badge">tied</span>' : ''}</span>
          <span class="board-row__score mono">${Math.round((r.totalScore / 5) * 100)}% <small>· ${r.totalScore.toFixed(2)}/5</small></span>
        </div>
        <div class="board-row__bar"><i style="width:${(r.totalScore / max) * 100}%"></i></div>
        ${r.option.description ? `<span class="board-row__desc">${esc(r.option.description)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

/* ======================== ADVANCED ANALYTICS ============================== */

export function toggleAdvanced() {
  const section = $('#advancedSection');
  const toggle = $('#advancedToggleBtn');
  const opening = section.classList.contains('is-hidden');
  section.classList.toggle('is-hidden', !opening);
  toggle.setAttribute('aria-expanded', String(opening));
  toggle.textContent = opening ? 'Hide advanced analytics' : '🤓 Show advanced analytics';
  if (opening && !advancedBuilt) {
    buildAdvanced();
    advancedBuilt = true;
  }
  if (opening) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function buildAdvanced() {
  renderExecSummary();
  renderDrivers();
  renderRankingTable();
  renderHeatmap();
  renderSensitivity();
  renderWhatIf();
  renderLenses();
  renderRisks();
  renderMethod();
}

const panelBody = (id) => $(`#${id} .panel__body`);

/* 1 — Executive summary (with the demoted weights strip) */

function renderExecSummary() {
  const { ranked, confidence } = lastAnalysis;
  const body = panelBody('panelExec');
  const top = ranked[0];
  const confClass = confidence.level.toLowerCase();
  const weights = decision.criteria
    .map((c) => ({ name: c.name, pct: decision.normalizedWeights[c.id] || 0 }))
    .sort((a, b) => b.pct - a.pct);
  const maxPct = Math.max(...weights.map((w) => w.pct), 1);

  body.innerHTML = `
    <p class="pro-verdict">${esc(verdictSentence(ranked))}</p>

    <div class="conf-line">
      <span class="conf-chip conf-chip--${confClass}">Confidence: ${confidence.level}</span>
      <span class="conf-reason">${esc(sentenceCase(confidence.reason))}</span>
    </div>

    <p class="pro-tradeoff">${esc(tradeOffLine(ranked, lastAnalysis.drivers, lastAnalysis.risks))}</p>

    <div class="exec-stats">
      <div class="stat"><span class="stat__value mono">${top.totalScore.toFixed(2)}<span class="stat__unit">/5</span></span><span class="stat__label">Winning score</span></div>
      ${ranked[1] ? `<div class="stat"><span class="stat__value mono">+${(top.totalScore - ranked[1].totalScore).toFixed(2)}</span><span class="stat__label">Margin over #2</span></div>` : ''}
      <div class="stat"><span class="stat__value mono">${Math.round(lastAnalysis.robustness.winnerHoldRate * 100)}%</span><span class="stat__label">Robustness hold rate</span></div>
      <div class="stat"><span class="stat__value mono">${Math.round(confidence.coverage * 100)}%</span><span class="stat__label">Ratings coverage</span></div>
    </div>

    <h4 class="subhead">Criteria weights</h4>
    <div class="weight-strip">
      ${weights.map((w) => `
        <div class="weight-strip__row">
          <span class="weight-strip__name">${esc(w.name)}</span>
          <div class="weight-strip__bar"><i style="width:${(w.pct / maxPct) * 100}%"></i></div>
          <span class="weight-strip__pct mono">${Math.round(w.pct)}%</span>
        </div>
      `).join('')}
    </div>
  `;
}

function sentenceCase(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/* 2 — Why this wins (tornado) */

function renderDrivers() {
  const { ranked, drivers } = lastAnalysis;
  const body = panelBody('panelDrivers');
  if (ranked.length < 2) {
    body.innerHTML = '<p class="empty-note">Driver analysis requires at least two options.</p>';
    return;
  }
  const maxAbs = Math.max(0.01, ...drivers.map((d) => Math.abs(d.delta)));
  body.innerHTML = `
    <p class="panel__lede">Weighted advantage of <strong>${esc(ranked[0].option.name)}</strong> over <strong>${esc(ranked[1].option.name)}</strong>, by criterion. Bars to the right favor the recommendation.</p>
    <div class="tornado">
      ${drivers.map((d) => {
        const width = Math.round((Math.abs(d.delta) / maxAbs) * 100);
        const favors = d.delta >= 0;
        return `
          <div class="tornado__row">
            <span class="tornado__name">${esc(d.criterionName)}
              <span class="tornado__meta mono">${Math.round(d.weightPct)}% · ${d.topRating.toFixed(1)} vs ${d.runnerUpRating.toFixed(1)}</span>
            </span>
            <div class="tornado__track">
              <div class="tornado__half tornado__half--left">${!favors ? `<i style="width:${width}%"></i>` : ''}</div>
              <div class="tornado__half tornado__half--right">${favors ? `<i style="width:${width}%"></i>` : ''}</div>
            </div>
            <span class="tornado__delta mono">${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta).toFixed(2)}</span>
          </div>`;
      }).join('')}
    </div>
  `;
}

/* 3 — Full ranking table */

function renderRankingTable() {
  const { ranked } = lastAnalysis;
  panelBody('panelRanking').innerHTML = `
    <div class="matrix-scroll">
      <table class="matrix">
        <thead><tr><th>#</th><th style="text-align:left">Option</th><th>Score /5</th><th>Fit</th><th>Gap to #1</th></tr></thead>
        <tbody>
          ${ranked.map((r) => `
            <tr class="${r.rank === 1 ? 'is-top' : ''}">
              <td class="mono">${r.rank}${r.isTied ? '=' : ''}</td>
              <th scope="row">${esc(r.option.name)}</th>
              <td class="mono">${r.totalScore.toFixed(2)}</td>
              <td class="mono">${Math.round((r.totalScore / 5) * 100)}%</td>
              <td class="mono">${r.rank === 1 ? '—' : `−${(ranked[0].totalScore - r.totalScore).toFixed(2)}`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* 4 — Heatmap */

function renderHeatmap() {
  const { ranked } = lastAnalysis;
  panelBody('panelMatrix').innerHTML = `
    <p class="panel__lede">Ratings on the 0–5 scale; shading encodes performance. Column weights beneath each criterion.</p>
    <div class="matrix-scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col" style="text-align:left">Option</th>
            ${decision.criteria.map((c) => `
              <th scope="col"><span>${esc(c.name)}</span>
                <span class="matrix__weight mono">${Math.round(decision.normalizedWeights[c.id] || 0)}%</span></th>`).join('')}
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((r) => `
            <tr class="${r.rank === 1 ? 'is-top' : ''}">
              <th scope="row">${esc(r.option.name)}</th>
              ${decision.criteria.map((c) => {
                const rating = r.criteriaScores[c.id]?.rating ?? 0;
                return `<td class="mono" style="background:${heat(rating)}"
                            title="${esc(c.name)}: ${rating.toFixed(1)} (${RATING_LABELS[Math.round(rating)]})">${rating.toFixed(1)}</td>`;
              }).join('')}
              <td class="mono matrix__total">${r.totalScore.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function heat(rating) {
  const t = Math.min(1, Math.max(0, rating / 5));
  if (t < 0.5) return `rgba(178, 58, 47, ${0.18 * (1 - t / 0.5)})`;
  return `rgba(30, 122, 70, ${0.20 * ((t - 0.5) / 0.5)})`;
}

/* 5 — Sensitivity & flip points */

function renderSensitivity() {
  const { flipPoints } = lastAnalysis;
  const body = panelBody('panelSensitivity');
  if (!flipPoints.length || decision.options.length < 2) {
    body.innerHTML = '<p class="empty-note">Sensitivity analysis requires at least two options.</p>';
    return;
  }
  body.innerHTML = `
    <p class="panel__lede">The exact weight at which each criterion would overturn the recommendation. Short distances indicate a fragile result.</p>
    <div class="flips">
      ${flipPoints.map((f) => `
        <div class="flip flip--${f.criticality}">
          <span class="flip__name">${esc(f.criterionName)}</span>
          <span class="flip__detail">
            ${f.flipAt === null
              ? `<span class="flip__robust">Stable — no weight (0–100%) flips the result</span>`
              : `Now <span class="mono">${Math.round(f.currentPct)}%</span> → flips at <span class="mono">${f.flipAt}%</span> to <strong>${esc(f.challenger)}</strong>
                 <span class="flip__distance mono">Δ ${Math.round(f.distance)} pts</span>`}
          </span>
          <span class="flip__badge flip__badge--${f.criticality}">${f.criticality === 'critical' ? 'Critical' : f.criticality === 'moderate' ? 'Moderate' : 'Stable'}</span>
        </div>
      `).join('')}
    </div>
    <p class="legend-note"><span class="dot dot--risk"></span> Critical: small weight changes flip the decision &nbsp;
       <span class="dot dot--warn"></span> Moderate: medium sensitivity &nbsp;
       <span class="dot dot--good"></span> Stable: robust to weight changes</p>
  `;
}

/* 6 — What-if studio */

function renderWhatIf() {
  const body = panelBody('panelWhatIf');
  if (decision.options.length < 2) {
    body.innerHTML = '<p class="empty-note">What-if analysis requires at least two options.</p>';
    return;
  }
  body.innerHTML = `
    <p class="panel__lede">Drag the weights and watch the ranking respond in real time. Weights renormalize to 100% internally; your saved weights are untouched.</p>
    <div id="whatIfAlert" class="whatif-alert is-hidden" role="status" aria-live="polite"></div>
    <div class="whatif">
      <div class="whatif__controls">
        ${decision.criteria.map((c) => `
          <label class="whatif__row" data-criterion="${c.id}">
            <span class="whatif__name">${esc(c.name)}</span>
            <input type="range" min="0" max="100" step="1"
                   value="${Math.round(whatIfWeights[c.id] || 0)}" data-whatif-slider
                   aria-label="What-if weight for ${esc(c.name)}">
            <span class="whatif__value mono" data-whatif-value>${Math.round(whatIfWeights[c.id] || 0)}%</span>
          </label>
        `).join('')}
        <button type="button" class="btn btn--ghost btn--small" id="whatIfReset">Reset to saved weights</button>
      </div>
      <div class="whatif__results" id="whatIfResults" aria-live="polite"></div>
    </div>
  `;

  body.querySelector('.whatif__controls').addEventListener('input', (e) => {
    if (!e.target.matches('[data-whatif-slider]')) return;
    const row = e.target.closest('.whatif__row');
    whatIfWeights[row.dataset.criterion] = Number(e.target.value);
    row.querySelector('[data-whatif-value]').textContent = `${Math.round(whatIfWeights[row.dataset.criterion])}%`;
    updateWhatIfResults();
  });
  $('#whatIfReset').addEventListener('click', () => {
    whatIfWeights = { ...decision.normalizedWeights };
    $$('#panelWhatIf .whatif__row').forEach((row) => {
      const id = row.dataset.criterion;
      row.querySelector('[data-whatif-slider]').value = Math.round(whatIfWeights[id] || 0);
      row.querySelector('[data-whatif-value]').textContent = `${Math.round(whatIfWeights[id] || 0)}%`;
    });
    updateWhatIfResults();
  });

  updateWhatIfResults();
}

function updateWhatIfResults() {
  const ranked = assignRanks(computeResults(decision, whatIfWeights));
  const savedWinnerId = lastAnalysis?.ranked?.[0]?.option.id;
  const winner = ranked[0];
  const alert = $('#whatIfAlert');
  if (savedWinnerId !== undefined && winner && winner.option.id !== savedWinnerId && !winner.isTied) {
    alert.textContent = `Under these weights the recommendation flips to ${winner.option.name}.`;
    alert.classList.remove('is-hidden');
  } else {
    alert.classList.add('is-hidden');
  }
  const max = Math.max(...ranked.map((r) => r.totalScore), 0.01);
  $('#whatIfResults').innerHTML = ranked.map((r) => `
    <div class="whatif-rank ${r.rank === 1 ? 'is-top' : ''}">
      <span class="mono whatif-rank__pos">${r.rank}${r.isTied ? '=' : ''}</span>
      <span class="whatif-rank__name">${esc(r.option.name)}</span>
      <div class="whatif-rank__bar"><i style="width:${(r.totalScore / max) * 100}%"></i></div>
      <span class="mono whatif-rank__score">${r.totalScore.toFixed(2)}</span>
    </div>
  `).join('');
}

/* 7 — Alternative lenses: regret, satisficing, dominance, robustness */

function renderLenses() {
  const { ranked, regret, dominance, robustness } = lastAnalysis;
  const body = panelBody('panelLenses');
  if (ranked.length < 2) {
    body.innerHTML = '<p class="empty-note">Alternative lenses require at least two options.</p>';
    return;
  }
  const top = ranked[0];
  const regretLeader = regret[0];
  const agrees = regretLeader.option.id === top.option.id;

  body.innerHTML = `
    <p class="panel__lede">The weighted score answers "what fits my priorities best". These lenses answer different questions — worst-case protection, minimum standards, and structural robustness. Convergence across lenses is strong evidence; divergence is an insight in itself.</p>

    <h4 class="subhead">Regret minimization <span class="subhead__q">— "Which choice will I regret least if things go badly?"</span></h4>
    <p class="lens-note">${agrees
      ? `<strong>${esc(top.option.name)}</strong> also minimizes worst-case regret — the recommendation is regret-proof.`
      : `Under this lens <strong>${esc(regretLeader.option.name)}</strong> comes first: the weighted recommendation accepts a larger worst-case regret in exchange for higher expected fit.`}</p>
    <div class="matrix-scroll">
      <table class="matrix">
        <thead><tr><th style="text-align:left">Option</th><th>Worst-case regret</th><th style="text-align:left">Driven by</th><th>Total regret</th></tr></thead>
        <tbody>
          ${regret.map((row, i) => `
            <tr class="${i === 0 ? 'is-top' : ''}">
              <th scope="row">${esc(row.option.name)}</th>
              <td class="mono">${row.maxRegret.toFixed(2)}</td>
              <td style="text-align:left">${esc(row.maxRegretCriterion || '—')}</td>
              <td class="mono">${row.totalRegret.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <h4 class="subhead">Satisficing <span class="subhead__q">— "Which options are good enough on everything?"</span></h4>
    <div class="satisficing-control">
      <label for="satisficingSlider">Minimum acceptable rating on every criterion:</label>
      <input type="range" id="satisficingSlider" min="0" max="5" step="0.5" value="${satisficingBar}">
      <span class="mono" id="satisficingValue">${satisficingBar.toFixed(1)}</span>
    </div>
    <div id="satisficingResults"></div>

    <h4 class="subhead">Dominance check <span class="subhead__q">— "Can anything be eliminated outright?"</span></h4>
    ${dominance.length
      ? `<ul class="lens-list">${dominance.map((d) => `
          <li><strong>${esc(d.dominated)}</strong> is dominated by <strong>${esc(d.by)}</strong> — equal or worse on every criterion. It can be eliminated regardless of how the weights are set.</li>`).join('')}</ul>`
      : '<p class="lens-note">No option is dominated — every option is best at something, so none can be eliminated on structure alone.</p>'}

    <h4 class="subhead">Robustness <span class="subhead__q">— "Does the winner survive if my weights are a bit off?"</span></h4>
    <p class="lens-note"><strong>${esc(robustness.baseWinnerName)}</strong> remains the leading option in
      <strong class="mono">${Math.round(robustness.winnerHoldRate * 100)}%</strong> of ${robustness.trials} scenarios
      in which every criterion weight is independently perturbed by up to ±${Math.round(robustness.jitter * 100)}%.</p>
    <div class="weight-strip">
      ${robustness.winShare.filter((w) => w.share > 0).map((w) => `
        <div class="weight-strip__row">
          <span class="weight-strip__name">${esc(w.option.name)}</span>
          <div class="weight-strip__bar"><i style="width:${w.share * 100}%"></i></div>
          <span class="weight-strip__pct mono">${Math.round(w.share * 100)}%</span>
        </div>
      `).join('')}
    </div>
  `;

  const slider = $('#satisficingSlider');
  slider.addEventListener('input', () => {
    satisficingBar = Number(slider.value);
    $('#satisficingValue').textContent = satisficingBar.toFixed(1);
    renderSatisficingResults();
  });
  renderSatisficingResults();
}

function renderSatisficingResults() {
  const rows = computeSatisficing(decision, satisficingBar);
  const passes = rows.filter((r) => r.passes);
  $('#satisficingResults').innerHTML = `
    <p class="lens-note">${passes.length
      ? `${passes.length} of ${rows.length} option(s) clear a ${satisficingBar.toFixed(1)} bar on every criterion.`
      : `No option clears a ${satisficingBar.toFixed(1)} bar on every criterion — lower the bar or accept a targeted weakness.`}</p>
    <div class="satisficing-grid">
      ${rows.map((r) => `
        <div class="satisficing-item ${r.passes ? 'is-pass' : 'is-fail'}">
          <span class="satisficing-item__name">${r.passes ? '✅' : '✖'} ${esc(r.option.name)}</span>
          ${r.passes ? '' : `<span class="satisficing-item__fails">falls short on ${r.failures.map((f) => `${esc(f.criterionName)} (${f.rating.toFixed(1)})`).join(', ')}</span>`}
        </div>
      `).join('')}
    </div>
  `;
}

/* 8 — Risks & weaknesses */

function renderRisks() {
  const { ranked, risks } = lastAnalysis;
  const body = panelBody('panelRisks');
  if (!ranked.length) return;
  if (!risks.length) {
    body.innerHTML = `
      <div class="risk-clear">✅ No material weaknesses identified — <strong>${esc(ranked[0].option.name)}</strong> rates at least "Fair" on every criterion carrying meaningful weight.</div>`;
    return;
  }
  body.innerHTML = `
    <p class="panel__lede">Areas where <strong>${esc(ranked[0].option.name)}</strong> is vulnerable, ordered by exposure (weakness × weight).</p>
    ${risks.map((r) => `
      <div class="risk risk--${r.severity}">
        <div class="risk__head">${r.severity === 'high' ? '🔴' : '🟡'} ${esc(r.criterionName)}
          <span class="risk__badge">${r.severity === 'high' ? 'High' : 'Medium'}</span></div>
        <div class="risk__detail">Rated ${r.rating.toFixed(1)}/5 ("${r.ratingLabel}") on a criterion carrying ${Math.round(r.weightPct)}% of the decision weight.
          Validate this area before committing; negotiate safeguards or contingencies where possible.</div>
      </div>
    `).join('')}
  `;
}

/* 9 — Method & assumptions */

function renderMethod() {
  panelBody('panelMethod').innerHTML = `
    <p class="panel__lede">Weighted multi-criteria decision analysis, fully traceable.</p>
    <ul class="method-list">
      <li>Importance ratings (1–5) map to geometric weights (1 → 1.00, 2 → 1.78, 3 → 3.16, 4 → 5.62, 5 → 10.00), then normalize to 100%. The geometric scale keeps "Critical" meaningfully heavier than "Marginal".</li>
      <li>Options are rated 0–5 per criterion at 0.1 precision. Unrated cells default to 2.5 — the exact scale midpoint — and are disclosed in the confidence assessment.</li>
      <li>Final score = Σ (rating × normalized weight). Identical scores share a rank.</li>
      <li>Sensitivity sweeps each criterion's weight 0–100% (others rescaled proportionally) to locate exact flip points.</li>
      <li>Robustness perturbs all weights simultaneously (±20%, ${lastAnalysis.robustness.trials} randomized scenarios) and reports how often the winner holds.</li>
      <li>Regret = (best rating on a criterion − option's rating) × weight; the minimax-regret ranking minimizes the worst case.</li>
      <li>Confidence reflects the winning margin, the distance to the nearest flip point, and rating coverage — deliberately conservative.</li>
      <li>Everything runs in your browser. No data leaves your device.</li>
    </ul>
  `;
}
