/* ==========================================================================
   Choicease — results.js
   Step 6. Answer first: the Verdict Card. Depth on demand: drivers, full
   ranking, score matrix, sensitivity, live what-if — in that order.
   ========================================================================== */

import { decision } from './state.js';
import {
  analyzeDecision, computeResults, assignRanks, normalizeWeights, RATING_LABELS,
} from './engine.js';
import { verdictSentence, tradeOffLine, executiveSummary } from './narrative.js';
import { esc, $, $$ } from './ui.js';

let lastAnalysis = null;
let whatIfWeights = null;

export function getLastAnalysis() {
  return lastAnalysis;
}

export function renderResults() {
  lastAnalysis = analyzeDecision(decision);
  const { ranked, confidence, drivers, flipPoints, risks } = lastAnalysis;
  whatIfWeights = { ...decision.normalizedWeights };

  renderVerdict(ranked, confidence, drivers, risks);
  renderDrivers(drivers, ranked);
  renderRanking(ranked);
  renderMatrix(ranked);
  renderSensitivity(flipPoints);
  renderWhatIf();
  renderMethod();
}

/* ---------------------------- Verdict card ------------------------------- */

function renderVerdict(ranked, confidence, drivers, risks) {
  const card = $('#verdictCard');
  if (!ranked.length) {
    card.innerHTML = '<p class="empty-note">Nothing to analyze yet.</p>';
    return;
  }
  const top = ranked[0];
  const pct = Math.round((top.totalScore / 5) * 100);
  const runnerUp = ranked[1];

  card.innerHTML = `
    <p class="verdict__eyebrow">Recommendation${decision.title ? ` · ${esc(decision.title)}` : ''}</p>
    <h2 class="verdict__sentence">${esc(verdictSentence(ranked, confidence))}</h2>

    <div class="verdict__stats">
      <div class="stat">
        <span class="stat__value mono">${top.totalScore.toFixed(2)}<span class="stat__unit">/5</span></span>
        <span class="stat__label">Weighted score (${pct}% fit)</span>
      </div>
      ${runnerUp ? `
        <div class="stat">
          <span class="stat__value mono">+${(top.totalScore - runnerUp.totalScore).toFixed(2)}</span>
          <span class="stat__label">Lead over ${esc(runnerUp.option.name)}</span>
        </div>` : ''}
      <div class="stat">
        <span class="stat__value mono">${decision.options.length} × ${decision.criteria.length}</span>
        <span class="stat__label">Options × criteria</span>
      </div>
      <div class="stat stat--confidence">
        <span class="confidence-band confidence-band--${confidence.level.toLowerCase()}" aria-hidden="true">
          ${[1, 2, 3].map((i) => `<i class="${i <= confidence.score ? 'is-filled' : ''}"></i>`).join('')}
        </span>
        <span class="stat__label">Confidence: <strong>${confidence.level}</strong></span>
      </div>
    </div>

    <p class="verdict__confidence-reason">${esc(sentenceCase(confidence.reason))}</p>
    <p class="verdict__tradeoff">${esc(tradeOffLine(ranked, drivers, risks))}</p>
  `;
}

function sentenceCase(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/* ------------------------------- Drivers --------------------------------- */

function renderDrivers(drivers, ranked) {
  const body = $('#panelDrivers .panel__body');
  if (ranked.length < 2) {
    body.innerHTML = '<p class="empty-note">Add a second option to see what drives the comparison.</p>';
    return;
  }
  const maxAbs = Math.max(0.01, ...drivers.map((d) => Math.abs(d.delta)));
  const winner = esc(ranked[0].option.name);
  const runnerUp = esc(ranked[1].option.name);

  body.innerHTML = `
    <p class="panel__lede">Weighted advantage of <strong>${winner}</strong> over <strong>${runnerUp}</strong>, by criterion. Bars to the right favor the recommendation.</p>
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
              <div class="tornado__half tornado__half--left">
                ${!favors ? `<i style="width:${width}%"></i>` : ''}
              </div>
              <div class="tornado__half tornado__half--right">
                ${favors ? `<i style="width:${width}%"></i>` : ''}
              </div>
            </div>
            <span class="tornado__delta mono">${d.delta >= 0 ? '+' : '−'}${Math.abs(d.delta).toFixed(2)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ------------------------------- Ranking --------------------------------- */

function renderRanking(ranked) {
  const body = $('#panelRanking .panel__body');
  const max = Math.max(...ranked.map((r) => r.totalScore), 0.01);
  body.innerHTML = `
    <div class="ranking">
      ${ranked.map((r) => `
        <div class="ranking__row ${r.rank === 1 ? 'is-top' : ''}">
          <span class="ranking__rank mono">${r.rank}${r.isTied ? '=' : ''}</span>
          <div class="ranking__main">
            <div class="ranking__head">
              <span class="ranking__name">${esc(r.option.name)}</span>
              <span class="ranking__score mono">${r.totalScore.toFixed(2)} · ${Math.round((r.totalScore / 5) * 100)}%</span>
            </div>
            <div class="ranking__bar"><i style="width:${(r.totalScore / max) * 100}%"></i></div>
            ${r.option.description ? `<span class="ranking__desc">${esc(r.option.description)}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ---------------------------- Score matrix ------------------------------- */

function renderMatrix(ranked) {
  const body = $('#panelMatrix .panel__body');
  body.innerHTML = `
    <p class="panel__lede">Ratings on the 0–5 scale; shading encodes performance. Column weights shown beneath each criterion.</p>
    <div class="matrix-scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col">Option</th>
            ${decision.criteria.map((c) => `
              <th scope="col">
                <span>${esc(c.name)}</span>
                <span class="matrix__weight mono">${Math.round(decision.normalizedWeights[c.id] || 0)}%</span>
              </th>`).join('')}
            <th scope="col" class="matrix__total-head">Score</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((r) => `
            <tr class="${r.rank === 1 ? 'is-top' : ''}">
              <th scope="row">${esc(r.option.name)}</th>
              ${decision.criteria.map((c) => {
                const cell = r.criteriaScores[c.id];
                const rating = cell ? cell.rating : 0;
                return `<td class="mono" style="background:${heat(rating)}"
                            title="${esc(c.name)}: ${rating.toFixed(1)} (${RATING_LABELS[Math.round(rating)]})">
                          ${rating.toFixed(1)}
                        </td>`;
              }).join('')}
              <td class="mono matrix__total">${r.totalScore.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** 0–5 rating -> calm red→neutral→green scale, kept light for readability. */
function heat(rating) {
  const t = Math.min(1, Math.max(0, rating / 5));
  if (t < 0.5) {
    const k = t / 0.5; // red -> neutral
    return `rgba(178, 58, 47, ${0.18 * (1 - k)})`;
  }
  const k = (t - 0.5) / 0.5; // neutral -> green
  return `rgba(30, 122, 70, ${0.20 * k})`;
}

/* ---------------------------- Sensitivity -------------------------------- */

function renderSensitivity(flipPoints) {
  const body = $('#panelSensitivity .panel__body');
  if (!flipPoints.length || decision.options.length < 2) {
    body.innerHTML = '<p class="empty-note">Sensitivity needs at least two options.</p>';
    return;
  }
  body.innerHTML = `
    <p class="panel__lede">How far each criterion's weight would have to move before the recommendation changes. Short distances mean a fragile result.</p>
    <div class="flips">
      ${flipPoints.map((f) => {
        const robust = f.distance === null;
        const fragile = !robust && f.distance <= 10;
        return `
          <div class="flip ${fragile ? 'flip--fragile' : ''}">
            <span class="flip__name">${esc(f.criterionName)}</span>
            <span class="flip__detail">
              ${robust
                ? `<span class="flip__robust">Robust — no weight (0–100%) flips the result</span>`
                : `Now <span class="mono">${Math.round(f.currentPct)}%</span> → flips at <span class="mono">${f.flipAt}%</span> to <strong>${esc(f.challenger)}</strong>
                   <span class="flip__distance mono">Δ ${Math.round(f.distance)} pts</span>`}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ------------------------------ What-if ---------------------------------- */

function renderWhatIf() {
  const body = $('#panelWhatIf .panel__body');
  if (decision.options.length < 2) {
    body.innerHTML = '<p class="empty-note">What-if analysis needs at least two options.</p>';
    return;
  }
  body.innerHTML = `
    <p class="panel__lede">Drag the weights and watch the ranking respond. Weights renormalize to 100% behind the scenes; your saved weights are untouched.</p>
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
        <button type="button" class="btn btn--ghost" id="whatIfReset">Reset to saved weights</button>
      </div>
      <div class="whatif__results" id="whatIfResults" aria-live="polite"></div>
    </div>
  `;

  const controls = $('#panelWhatIf .whatif__controls');
  controls.addEventListener('input', (e) => {
    if (!e.target.matches('[data-whatif-slider]')) return;
    const row = e.target.closest('.whatif__row');
    const id = row.dataset.criterion;
    whatIfWeights[id] = Number(e.target.value);
    row.querySelector('[data-whatif-value]').textContent = `${Math.round(whatIfWeights[id])}%`;
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

/* ---------------------------- Methodology -------------------------------- */

function renderMethod() {
  const body = $('#panelMethod .panel__body');
  body.innerHTML = `
    <p class="panel__lede">Weighted multi-criteria decision analysis, fully traceable.</p>
    <ul class="method-list">
      <li>Each criterion's importance (1–5) maps to a geometric weight (1 → 1.0, 2 → 1.78, 3 → 3.16, 4 → 5.62, 5 → 10.0), then weights are normalized to 100%. The geometric scale keeps "Critical" meaningfully heavier than "Marginal".</li>
      <li>Each option is rated 0–5 per criterion (0 = Unacceptable … 5 = Excellent, 0.1 precision). Unrated cells default to 3 (Good) and are flagged in the confidence note.</li>
      <li>Final score = Σ (rating × normalized weight). Identical scores share a rank.</li>
      <li>Sensitivity sweeps every criterion's weight from 0–100% (others rescaled proportionally) to find the exact flip points reported above.</li>
      <li>Confidence reflects the winning margin, the distance to the nearest flip point, and rating coverage — it is deliberately conservative.</li>
      <li>Everything runs in your browser. No data leaves your device.</li>
    </ul>
  `;
}

/** Executive summary text for clipboard / share / PDF. */
export function currentExecutiveSummary() {
  if (!lastAnalysis) return '';
  return executiveSummary(decision, lastAnalysis);
}
