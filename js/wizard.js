/* ==========================================================================
   Choicease — wizard.js
   Steps 1–5. Playful-warm voice. Gated tab navigation (back always;
   forward only when prerequisites are met, disabled tabs visibly greyed).
   Edit-in-place, bias alerts, context-aware AI assist, starter criteria.
   ========================================================================== */

import {
  decision, setFrame, addOption, removeOption, updateOption,
  addCriterion, removeCriterion, updateCriterion,
  setImportance, setRating, LIMITS,
} from './state.js';
import { normalizeWeights, IMPORTANCE_LABELS, RATING_LABELS, DEFAULT_RATING } from './engine.js';
import {
  HELPER_GPT_URL, criteriaPrompt, weightsPrompt, ratingsPrompt, suggestStarterSet,
} from './assist.js';
import { esc, $, $$, toast, copyToClipboard, scrollToElement } from './ui.js';

export const STEP_COUNT = 6;
let currentStep = 1;
let onEnterResults = null;

export function initWizard({ onResults }) {
  onEnterResults = onResults;
  wireStepOne();
  wireItemStep('option', { add: addOption, remove: removeOption, update: updateOption, render: renderOptions });
  wireItemStep('criterion', { add: addCriterion, remove: removeCriterion, update: updateCriterion, render: renderCriteria });
  wireNavigation();
  wireAssist();
  renderOptions();
  renderCriteria();
  goToStep(1, { scroll: false });
}

export function getCurrentStep() {
  return currentStep;
}

/* --------------------------- Step prerequisites -------------------------- */

/** Highest step the user is allowed to open right now. */
export function maxReachableStep() {
  if (!decision.title) return 1;
  if (decision.options.length < LIMITS.MIN_OPTIONS) return 2;
  if (decision.criteria.length < LIMITS.MIN_CRITERIA) return 3;
  return 6; // weights/ratings never hard-gate; defaults are disclosed
}

function gateMessage(target) {
  if (target > 1 && !decision.title) return 'Name your decision first — one line is enough.';
  if (target > 2 && decision.options.length < LIMITS.MIN_OPTIONS) return 'Add at least two options to compare.';
  if (target > 3 && decision.criteria.length < LIMITS.MIN_CRITERIA) return 'Add at least two criteria — one criterion is just a preference.';
  return null;
}

/* ------------------------------ Navigation ------------------------------- */

export function goToStep(step, { scroll = true } = {}) {
  currentStep = Math.min(STEP_COUNT, Math.max(1, step));

  for (let i = 1; i <= STEP_COUNT; i += 1) {
    $(`#step-${i}`)?.classList.toggle('is-hidden', i !== currentStep);
  }
  renderStepper();

  if (currentStep === 3) renderStarterChips();
  if (currentStep === 4) renderWeighting();
  if (currentStep === 5) renderRatingMatrix();
  if (currentStep === 6 && onEnterResults) onEnterResults();

  if (scroll) scrollToElement($(`#step-${currentStep}`));
}

function renderStepper() {
  const reachable = maxReachableStep();
  $$('#stepper .stepper__item').forEach((item, index) => {
    const step = index + 1;
    const disabled = step > reachable;
    item.classList.toggle('is-active', step === currentStep);
    item.classList.toggle('is-done', step < currentStep && !disabled);
    item.classList.toggle('is-disabled', disabled);
    item.setAttribute('aria-current', step === currentStep ? 'step' : 'false');
    item.setAttribute('aria-disabled', String(disabled));
    item.title = disabled ? (gateMessage(step) || '') : '';
  });
  const fill = $('#progressFill');
  if (fill) fill.style.width = `${((currentStep - 1) / (STEP_COUNT - 1)) * 100}%`;
}

function wireNavigation() {
  const go = (target) => {
    captureFrame();
    const gate = gateMessage(target);
    if (gate) {
      toast(gate, 'warn');
      return;
    }
    goToStep(target);
  };

  $('#toStep2').addEventListener('click', () => go(2));
  $('#toStep1').addEventListener('click', () => goToStep(1));
  $('#toStep3').addEventListener('click', () => go(3));
  $('#backTo2').addEventListener('click', () => goToStep(2));
  $('#toStep4').addEventListener('click', () => go(4));
  $('#backTo3').addEventListener('click', () => goToStep(3));
  $('#toStep5').addEventListener('click', () => go(5));
  $('#backTo4').addEventListener('click', () => goToStep(4));
  $('#toStep6').addEventListener('click', () => go(6));

  $$('#stepper .stepper__item').forEach((item, index) => {
    item.addEventListener('click', () => {
      const target = index + 1;
      if (target === currentStep) return;
      captureFrame();
      if (target > maxReachableStep()) {
        toast(gateMessage(target) || 'Finish the earlier steps first.', 'warn');
        return;
      }
      goToStep(target);
    });
  });
}

/* ------------------------------- Step 1 ---------------------------------- */

function wireStepOne() {
  $('#decisionTitle').addEventListener('change', () => { captureFrame(); renderStepper(); });
  $('#decisionDescription').addEventListener('change', captureFrame);
}

function captureFrame() {
  setFrame($('#decisionTitle').value, $('#decisionDescription').value);
}

export function syncFrameInputs() {
  $('#decisionTitle').value = decision.title;
  $('#decisionDescription').value = decision.description;
}

/* --------------------- Steps 2 & 3 (shared machinery) -------------------- */

const ITEM_CONFIG = {
  option: {
    nameInput: '#optionName', descInput: '#optionDescription', addBtn: '#addOptionBtn',
    list: '#optionsList', count: '#optionsCount', items: () => decision.options,
    removeAttr: 'data-remove-option', editAttr: 'data-edit-option',
  },
  criterion: {
    nameInput: '#criterionName', descInput: '#criterionDescription', addBtn: '#addCriterionBtn',
    list: '#criteriaList', count: '#criteriaCount', items: () => decision.criteria,
    removeAttr: 'data-remove-criterion', editAttr: 'data-edit-criterion',
  },
};

function wireItemStep(kind, actions) {
  const cfg = ITEM_CONFIG[kind];
  const add = () => {
    const nameInput = $(cfg.nameInput);
    const descInput = $(cfg.descInput);
    const result = actions.add(nameInput.value, descInput.value);
    if (!result.ok) {
      toast(result.error, 'warn');
      return;
    }
    nameInput.value = '';
    descInput.value = '';
    nameInput.focus();
    actions.render();
    renderStepper();
  };
  $(cfg.addBtn).addEventListener('click', add);
  $(cfg.nameInput).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
  $(cfg.descInput).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });

  $(cfg.list).addEventListener('click', (e) => {
    const removeBtn = e.target.closest(`[${cfg.removeAttr}]`);
    if (removeBtn) {
      actions.remove(Number(removeBtn.getAttribute(cfg.removeAttr)));
      actions.render();
      renderStepper();
      return;
    }
    const editBtn = e.target.closest(`[${cfg.editAttr}]`);
    if (editBtn) {
      openInlineEditor(kind, Number(editBtn.getAttribute(cfg.editAttr)), actions);
      return;
    }
    const saveBtn = e.target.closest('[data-edit-save]');
    if (saveBtn) {
      commitInlineEditor(kind, saveBtn.closest('.item-card'), actions);
      return;
    }
    const cancelBtn = e.target.closest('[data-edit-cancel]');
    if (cancelBtn) actions.render();
  });

  $(cfg.list).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.item-card__edit-input')) {
      e.preventDefault();
      commitInlineEditor(kind, e.target.closest('.item-card'), actions);
    }
    if (e.key === 'Escape' && e.target.matches('.item-card__edit-input')) {
      actions.render();
    }
  });
}

function openInlineEditor(kind, id, actions) {
  const cfg = ITEM_CONFIG[kind];
  const item = cfg.items().find((x) => x.id === id);
  if (!item) return;
  actions.render(); // close any other open editor first
  const card = $(`#${cfg.list.slice(1)} [data-item-id="${id}"]`);
  if (!card) return;
  card.classList.add('is-editing');
  card.innerHTML = `
    <div class="item-card__editor">
      <input type="text" class="item-card__edit-input" data-edit-name value="${esc(item.name)}"
             maxlength="${LIMITS.NAME}" aria-label="Edit name">
      <input type="text" class="item-card__edit-input" data-edit-desc value="${esc(item.description || '')}"
             maxlength="${LIMITS.ITEM_DESCRIPTION}" placeholder="Description (optional)" aria-label="Edit description">
      <div class="item-card__editor-actions">
        <button type="button" class="btn btn--primary btn--small" data-edit-save>Save</button>
        <button type="button" class="btn btn--ghost btn--small" data-edit-cancel>Cancel</button>
      </div>
    </div>`;
  card.querySelector('[data-edit-name]').focus();
}

function commitInlineEditor(kind, card, actions) {
  if (!card) return;
  const id = Number(card.dataset.itemId);
  const name = card.querySelector('[data-edit-name]').value;
  const desc = card.querySelector('[data-edit-desc]').value;
  const result = actions.update(id, name, desc);
  if (!result.ok) {
    toast(result.error, 'warn');
    return;
  }
  actions.render();
  toast('Updated. ✔');
}

function itemCardHTML(item, cfg) {
  return `
    <div class="item-card" data-item-id="${item.id}">
      <div class="item-card__body">
        <span class="item-card__name">${esc(item.name)}</span>
        ${item.description ? `<span class="item-card__desc">${esc(item.description)}</span>` : ''}
      </div>
      <div class="item-card__actions">
        <button class="item-card__icon" ${cfg.editAttr}="${item.id}"
                aria-label="Edit ${esc(item.name)}" title="Edit">✎</button>
        <button class="item-card__icon item-card__icon--remove" ${cfg.removeAttr}="${item.id}"
                aria-label="Remove ${esc(item.name)}" title="Remove">&times;</button>
      </div>
    </div>`;
}

export function renderOptions() {
  const cfg = ITEM_CONFIG.option;
  const list = $(cfg.list);
  const items = decision.options;
  list.innerHTML = items.length
    ? items.map((o) => itemCardHTML(o, cfg)).join('')
    : `<p class="empty-note">Nothing on the table yet. Add the choices you're weighing — even the long shots.</p>`;
  $(cfg.count).textContent = `${items.length} added`;

  $('#optionsFewNote').classList.toggle('is-hidden', !(items.length >= 1 && items.length < LIMITS.SOFT_MIN_OPTIONS));
  $('#optionsManyNote').classList.toggle('is-hidden', items.length <= LIMITS.SOFT_MAX_OPTIONS);
}

export function renderCriteria() {
  const cfg = ITEM_CONFIG.criterion;
  const list = $(cfg.list);
  const items = decision.criteria;
  list.innerHTML = items.length
    ? items.map((c) => itemCardHTML(c, cfg)).join('')
    : `<p class="empty-note">What actually decides this? Cost, quality, gut-feel-made-honest — add what matters.</p>`;
  $(cfg.count).textContent = `${items.length} added`;
  $('#criteriaOverloadNote').classList.toggle('is-hidden', items.length <= LIMITS.SOFT_MAX_CRITERIA);
}

/* ------------------------- Starter criteria chips ------------------------ */

function renderStarterChips() {
  const container = $('#starterChips');
  const set = suggestStarterSet(decision.title);
  if (!set || decision.criteria.length >= 3) {
    container.classList.add('is-hidden');
    return;
  }
  container.classList.remove('is-hidden');
  container.innerHTML = `
    <span class="starter-chips__label">Looks like a <strong>${esc(set.label.toLowerCase())}</strong> decision — want a head start?</span>
    <div class="starter-chips__row">
      ${set.criteria.map((c, i) => `
        <button type="button" class="chip" data-starter="${i}" title="${esc(c.description)}">+ ${esc(c.name)}</button>
      `).join('')}
      <button type="button" class="chip chip--all" data-starter-all>Add all</button>
    </div>`;

  container.onclick = (e) => {
    const all = e.target.closest('[data-starter-all]');
    const one = e.target.closest('[data-starter]');
    const addFrom = (c) => addCriterion(c.name, c.description);
    if (all) {
      let added = 0;
      for (const c of set.criteria) {
        if (addFrom(c).ok) added += 1;
      }
      toast(added ? `Added ${added} starter criteria — tweak them to fit. ✨` : 'Those are already on your list.');
    } else if (one) {
      const c = set.criteria[Number(one.dataset.starter)];
      const result = addFrom(c);
      toast(result.ok ? `Added "${c.name}" ✨` : result.error, result.ok ? 'info' : 'warn');
    } else {
      return;
    }
    renderCriteria();
    renderStepper();
    renderStarterChips();
  };
}

/* --------------------------- AI assist wiring ---------------------------- */

function wireAssist() {
  $$('[data-gpt-link]').forEach((a) => { a.href = HELPER_GPT_URL; });
  const prompts = { criteria: criteriaPrompt, weights: weightsPrompt, ratings: ratingsPrompt };
  $$('[data-copy-prompt]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      captureFrame();
      const builder = prompts[btn.dataset.copyPrompt];
      if (!builder) return;
      await copyToClipboard(builder(decision));
      toast('Prompt copied — paste it into ChatGPT, Claude, or Gemini. It already knows your decision. 🤖');
    });
  });
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
    setImportance(Number(row.dataset.criterion), Number(pip.dataset.importance));
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
    row.querySelector('[data-weight-display]').textContent =
      `${Math.round(normalized[row.dataset.criterion] || 0)}%`;
  });
  const ratings = Object.values(decision.weights);
  const allSame = ratings.length >= 3 && ratings.every((r) => r === ratings[0]);
  $('#equalWeightNote').classList.toggle('is-hidden', !allSame);
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
          const stored = decision.ratings[`${option.id}-${criterion.id}`];
          const value = Number.isFinite(stored) ? stored : DEFAULT_RATING;
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
