/* ==========================================================================
   Choicease — wizard.js
   Steps 1–5: frame the decision, list options, set criteria, weigh, rate.
   Rendering + interaction only; all math lives in engine.js.
   ========================================================================== */

import {
  decision, setFrame, addOption, removeOption, addCriterion, removeCriterion,
  setImportance, setRating, LIMITS,
} from './state.js';
import {
  normalizeWeights, getRating, IMPORTANCE_LABELS, RATING_LABELS,
} from './engine.js';
import { esc, $, $$, toast, scrollToElement } from './ui.js';

export const STEP_COUNT = 6;
let currentStep = 1;
let onEnterResults = null;

export function initWizard({ onResults }) {
  onEnterResults = onResults;
  wireStepOne();
  wireStepTwo();
  wireStepThree();
  wireNavigation();
  renderOptions();
  renderCriteria();
  goToStep(1, { scroll: false });
}

export function getCurrentStep() {
  return currentStep;
}

/* ------------------------------ Navigation ------------------------------- */

export function goToStep(step, { scroll = true } = {}) {
  currentStep = Math.min(STEP_COUNT, Math.max(1, step));

  for (let i = 1; i <= STEP_COUNT; i += 1) {
    $(`#step-${i}`)?.classList.toggle('is-hidden', i !== currentStep);
  }
  renderStepper();

  if (currentStep === 4) renderWeighting();
  if (currentStep === 5) renderRatingMatrix();
  if (currentStep === 6 && onEnterResults) onEnterResults();

  if (scroll) scrollToElement($(`#step-${currentStep}`));
}

function renderStepper() {
  $$('#stepper .stepper__item').forEach((item, index) => {
    const step = index + 1;
    item.classList.toggle('is-active', step === currentStep);
    item.classList.toggle('is-done', step < currentStep);
    item.setAttribute('aria-current', step === currentStep ? 'step' : 'false');
  });
  const fill = $('#progressFill');
  if (fill) fill.style.width = `${((currentStep - 1) / (STEP_COUNT - 1)) * 100}%`;
}

function wireNavigation() {
  $('#toStep2').addEventListener('click', () => {
    captureFrame();
    if (!decision.title) {
      toast('Give the decision a title first.', 'warn');
      $('#decisionTitle').focus();
      return;
    }
    goToStep(2);
  });

  $('#toStep1').addEventListener('click', () => goToStep(1));
  $('#toStep3').addEventListener('click', () => {
    if (decision.options.length < 2) {
      toast('Add at least two options to compare.', 'warn');
      return;
    }
    goToStep(3);
  });
  $('#backTo2').addEventListener('click', () => goToStep(2));
  $('#toStep4').addEventListener('click', () => {
    if (decision.criteria.length < 1) {
      toast('Add at least one criterion.', 'warn');
      return;
    }
    goToStep(4);
  });
  $('#backTo3').addEventListener('click', () => goToStep(3));
  $('#toStep5').addEventListener('click', () => goToStep(5));
  $('#backTo4').addEventListener('click', () => goToStep(4));
  $('#toStep6').addEventListener('click', () => goToStep(6));

  // Stepper items act as shortcuts to any step already reachable.
  $$('#stepper .stepper__item').forEach((item, index) => {
    item.addEventListener('click', () => {
      const target = index + 1;
      if (target === currentStep) return;
      if (target > 1 && !decision.title) return;
      if (target > 2 && decision.options.length < 2) return;
      if (target > 3 && decision.criteria.length < 1) return;
      captureFrame();
      goToStep(target);
    });
  });
}

/* ------------------------------- Step 1 ---------------------------------- */

function wireStepOne() {
  $('#decisionTitle').addEventListener('change', captureFrame);
  $('#decisionDescription').addEventListener('change', captureFrame);
}

function captureFrame() {
  setFrame($('#decisionTitle').value, $('#decisionDescription').value);
}

/** Push store values back into the step-1 inputs (used after import/draft). */
export function syncFrameInputs() {
  $('#decisionTitle').value = decision.title;
  $('#decisionDescription').value = decision.description;
}

/* ------------------------------- Step 2 ---------------------------------- */

function wireStepTwo() {
  const add = () => {
    const nameInput = $('#optionName');
    const descInput = $('#optionDescription');
    const result = addOption(nameInput.value, descInput.value);
    if (!result.ok) {
      toast(result.error, 'warn');
      return;
    }
    nameInput.value = '';
    descInput.value = '';
    nameInput.focus();
    renderOptions();
  };
  $('#addOptionBtn').addEventListener('click', add);
  $('#optionName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
  $('#optionsList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-option]');
    if (!btn) return;
    removeOption(Number(btn.dataset.removeOption));
    renderOptions();
  });
}

export function renderOptions() {
  const list = $('#optionsList');
  if (!decision.options.length) {
    list.innerHTML = `<p class="empty-note">No options yet. Add the choices you are deciding between — at least two.</p>`;
  } else {
    list.innerHTML = decision.options.map((option) => `
      <div class="item-card">
        <div class="item-card__body">
          <span class="item-card__name">${esc(option.name)}</span>
          ${option.description ? `<span class="item-card__desc">${esc(option.description)}</span>` : ''}
        </div>
        <button class="item-card__remove" data-remove-option="${option.id}"
                aria-label="Remove ${esc(option.name)}" title="Remove">&times;</button>
      </div>
    `).join('');
  }
  $('#optionsCount').textContent = `${decision.options.length} of ${LIMITS.MAX_OPTIONS}`;
}

/* ------------------------------- Step 3 ---------------------------------- */

function wireStepThree() {
  const add = () => {
    const nameInput = $('#criterionName');
    const descInput = $('#criterionDescription');
    const result = addCriterion(nameInput.value, descInput.value);
    if (!result.ok) {
      toast(result.error, 'warn');
      return;
    }
    nameInput.value = '';
    descInput.value = '';
    nameInput.focus();
    renderCriteria();
  };
  $('#addCriterionBtn').addEventListener('click', add);
  $('#criterionName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
  $('#criteriaList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-criterion]');
    if (!btn) return;
    removeCriterion(Number(btn.dataset.removeCriterion));
    renderCriteria();
  });
}

export function renderCriteria() {
  const list = $('#criteriaList');
  if (!decision.criteria.length) {
    list.innerHTML = `<p class="empty-note">No criteria yet. Add what actually matters in this decision — cost, quality, risk, fit.</p>`;
  } else {
    list.innerHTML = decision.criteria.map((criterion) => `
      <div class="item-card">
        <div class="item-card__body">
          <span class="item-card__name">${esc(criterion.name)}</span>
          ${criterion.description ? `<span class="item-card__desc">${esc(criterion.description)}</span>` : ''}
        </div>
        <button class="item-card__remove" data-remove-criterion="${criterion.id}"
                aria-label="Remove ${esc(criterion.name)}" title="Remove">&times;</button>
      </div>
    `).join('');
  }
  $('#criteriaCount').textContent = `${decision.criteria.length} of ${LIMITS.MAX_CRITERIA}`;
  $('#criteriaOverloadNote').classList.toggle(
    'is-hidden',
    decision.criteria.length <= LIMITS.SOFT_MAX_CRITERIA,
  );
}

/* ------------------------------- Step 4 ---------------------------------- */

export function renderWeighting() {
  const container = $('#weightingList');
  container.innerHTML = decision.criteria.map((criterion) => {
    const current = decision.weights[criterion.id] || 3;
    return `
      <div class="weight-row" data-criterion="${criterion.id}">
        <div class="weight-row__meta">
          <span class="weight-row__name">${esc(criterion.name)}</span>
          ${criterion.description ? `<span class="weight-row__desc">${esc(criterion.description)}</span>` : ''}
        </div>
        <div class="weight-row__scale" role="radiogroup" aria-label="Importance of ${esc(criterion.name)}">
          ${[1, 2, 3, 4, 5].map((v) => `
            <button type="button"
                    class="weight-pip ${v === current ? 'is-selected' : ''}"
                    data-importance="${v}"
                    role="radio" aria-checked="${v === current}"
                    aria-label="${IMPORTANCE_LABELS[v]}"
                    title="${IMPORTANCE_LABELS[v]}">${v}</button>
          `).join('')}
        </div>
        <div class="weight-row__value">
          <span class="mono" data-weight-display>–</span>
        </div>
      </div>
    `;
  }).join('');

  updateWeightDisplays();

  container.onclick = (e) => {
    const pip = e.target.closest('[data-importance]');
    if (!pip) return;
    const row = pip.closest('.weight-row');
    const criterionId = Number(row.dataset.criterion);
    setImportance(criterionId, Number(pip.dataset.importance));
    row.querySelectorAll('.weight-pip').forEach((p) => {
      const selected = p === pip;
      p.classList.toggle('is-selected', selected);
      p.setAttribute('aria-checked', String(selected));
    });
    updateWeightDisplays();
  };
}

function updateWeightDisplays() {
  const normalized = normalizeWeights(decision.weights);
  $$('#weightingList .weight-row').forEach((row) => {
    const id = row.dataset.criterion;
    const display = row.querySelector('[data-weight-display]');
    display.textContent = `${Math.round(normalized[id] || 0)}%`;
  });
}

/* ------------------------------- Step 5 ---------------------------------- */

export function renderRatingMatrix() {
  const container = $('#ratingMatrix');
  const normalized = normalizeWeights(decision.weights);

  container.innerHTML = decision.criteria.map((criterion) => `
    <section class="rating-block">
      <header class="rating-block__head">
        <span class="rating-block__name">${esc(criterion.name)}</span>
        <span class="rating-block__weight mono">${Math.round(normalized[criterion.id] || 0)}% weight</span>
      </header>
      ${criterion.description ? `<p class="rating-block__desc">${esc(criterion.description)}</p>` : ''}
      <div class="rating-block__rows">
        ${decision.options.map((option) => {
          const value = getRating(decision, option.id, criterion.id);
          const key = `${option.id}-${criterion.id}`;
          return `
            <div class="rating-row" data-key="${key}">
              <span class="rating-row__option">${esc(option.name)}</span>
              <input type="range" min="0" max="5" step="0.1" value="${value}"
                     class="rating-row__slider" data-slider
                     aria-label="Rating for ${esc(option.name)} on ${esc(criterion.name)}">
              <input type="number" min="0" max="5" step="0.1" value="${value.toFixed(1)}"
                     class="rating-row__number mono" data-number inputmode="decimal"
                     aria-label="Numeric rating for ${esc(option.name)} on ${esc(criterion.name)}">
              <span class="rating-row__label" data-label>${RATING_LABELS[Math.round(value)]}</span>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');

  container.oninput = (e) => {
    const row = e.target.closest('.rating-row');
    if (!row) return;
    const [optionId, criterionId] = row.dataset.key.split('-').map(Number);
    const value = setRating(optionId, criterionId, e.target.value);
    row.querySelector('[data-slider]').value = value;
    if (e.target.matches('[data-slider]')) {
      row.querySelector('[data-number]').value = value.toFixed(1);
    }
    row.querySelector('[data-label]').textContent = RATING_LABELS[Math.round(value)];
  };

  container.onchange = (e) => {
    if (!e.target.matches('[data-number]')) return;
    const row = e.target.closest('.rating-row');
    const [optionId, criterionId] = row.dataset.key.split('-').map(Number);
    const value = setRating(optionId, criterionId, e.target.value);
    e.target.value = value.toFixed(1);
    row.querySelector('[data-slider]').value = value;
    row.querySelector('[data-label]').textContent = RATING_LABELS[Math.round(value)];
  };
}
