/* DOM smoke test v2.1 — boots the real index.html in jsdom and drives the
   full flow: gating, edit-in-place, bias alerts, casual results, advanced
   analytics (all lenses), what-if, satisficing slider, sample decision,
   share text, exports menu. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as pako from 'pako';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '');

const dom = new JSDOM(html, { url: 'https://choicease.com/', pretendToBeVisual: true });
const { window } = dom;
for (const key of ['document', 'localStorage', 'HTMLElement', 'Image', 'FileReader', 'Blob']) {
  try { globalThis[key] = window[key]; } catch { /* read-only */ }
}
globalThis.window = window;
window.pako = pako; // fragment decoder availability
window.matchMedia = window.matchMedia || (() => ({ matches: false }));
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};
window.URL.createObjectURL = globalThis.URL.createObjectURL;
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL;

await import('../js/app.js');
const { $, $$ } = await import('../js/ui.js');
const { decision } = await import('../js/state.js');

const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));
const setValue = (sel, value) => {
  const el = $(sel);
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const stepVisible = (n) => !$(`#step-${n}`).classList.contains('is-hidden');

/* ---- Gating: forward tabs disabled until prerequisites ---- */
assert.ok(stepVisible(1), 'boots on step 1');
const tabs = $$('#stepper .stepper__item');
assert.ok(tabs[5].classList.contains('is-disabled'), 'results tab disabled with no title');
click($('#toStep2'));
assert.ok(stepVisible(1), 'cannot advance without a title');

setValue('#decisionTitle', 'Pick a laptop for the team');
setValue('#decisionDescription', '30 analysts, refresh in Q4');
click($('#toStep2'));
assert.ok(stepVisible(2), 'advanced to step 2 with title');

/* Options: duplicates blocked, bias alert, edit-in-place */
for (const name of ['ThinkPad X1', 'MacBook Pro']) {
  $('#optionName').value = name;
  click($('#addOptionBtn'));
}
assert.equal(decision.options.length, 2);
assert.ok(!$('#optionsFewNote').classList.contains('is-hidden'), 'too-few-options bias alert shows at 2');
$('#optionName').value = 'thinkpad x1';
click($('#addOptionBtn'));
assert.equal(decision.options.length, 2, 'case-insensitive duplicate rejected');
$('#optionName').value = 'Dell XPS';
click($('#addOptionBtn'));
assert.ok($('#optionsFewNote').classList.contains('is-hidden'), 'bias alert clears at 3');

// edit-in-place
click($('#optionsList [data-edit-option]'));
const editor = $('#optionsList .item-card.is-editing');
assert.ok(editor, 'inline editor opens');
editor.querySelector('[data-edit-name]').value = 'ThinkPad X1 Carbon';
click(editor.querySelector('[data-edit-save]'));
assert.equal(decision.options[0].name, 'ThinkPad X1 Carbon', 'edit-in-place saves');

/* Criteria: min 2 gate, then proceed */
click($('#toStep3'));
assert.ok(stepVisible(3));
$('#criterionName').value = 'Price';
click($('#addCriterionBtn'));
click($('#toStep4'));
assert.ok(stepVisible(3), 'blocked with only 1 criterion');
for (const name of ['Performance', 'Battery']) {
  $('#criterionName').value = name;
  click($('#addCriterionBtn'));
}
click($('#toStep4'));
assert.ok(stepVisible(4), 'advanced with 2+ criteria');

/* Weights: equal-weight nudge, then differentiate */
assert.ok(!$('#equalWeightNote').classList.contains('is-hidden'), 'equal-weight nudge shows (all default 3)');
click($('#weightingList .weight-row [data-importance="5"]'));
assert.ok($('#equalWeightNote').classList.contains('is-hidden'), 'nudge clears after differentiation');

/* Ratings: default 2.5 prefill, 0.1 precision */
click($('#toStep5'));
assert.ok(stepVisible(5));
const firstRow = $('#ratingMatrix .rating-row');
assert.equal(firstRow.querySelector('[data-number]').value, '2.5', 'sliders prefill at 2.5 midpoint');
const slider = firstRow.querySelector('[data-slider]');
slider.value = '4.7';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(decision.ratings[firstRow.dataset.key], 4.7);

/* Results: casual layer */
click($('#toStep6'));
assert.ok(stepVisible(6));
const casual = $('#casualResults').innerHTML;
assert.ok(casual.includes('Pick a laptop for the team'), 'title shown');
assert.ok(/takes it|photo finish/.test(casual), 'playful winner line');
assert.ok($$('#casualResults .board-row').length === 3, 'leaderboard rows');
assert.ok($$('#casualResults .callout').length >= 1, 'plain-language callouts present');
assert.ok($('#advancedSection').classList.contains('is-hidden'), 'advanced hidden by default');

/* Advanced analytics: toggle builds everything */
click($('#advancedToggleBtn'));
assert.ok(!$('#advancedSection').classList.contains('is-hidden'), 'advanced opens');
for (const id of ['panelExec', 'panelDrivers', 'panelRanking', 'panelMatrix', 'panelSensitivity', 'panelWhatIf', 'panelLenses', 'panelRisks', 'panelMethod']) {
  assert.ok($(`#${id} .panel__body`).innerHTML.trim().length > 0, `${id} rendered`);
}
assert.ok($('#panelExec .weight-strip'), 'weights strip demoted into exec summary');
assert.ok($('#panelLenses').innerHTML.includes('Regret'), 'regret lens present');
assert.ok($('#panelLenses').innerHTML.includes('Robustness'), 'robustness lens present');
assert.ok($('#panelLenses').innerHTML.includes('Dominance'), 'dominance lens present');

/* Satisficing slider interacts */
const satSlider = $('#satisficingSlider');
satSlider.value = '4.5';
satSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.ok($('#satisficingResults').innerHTML.includes('4.5'), 'satisficing bar updates');

/* What-if updates */
const wSlider = $('#panelWhatIf [data-whatif-slider]');
wSlider.value = '95';
wSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal($$('#whatIfResults .whatif-rank').length, 3, 'what-if rankings update');

/* Share text: tag present, no Reddit anywhere */
const { buildShareText, buildShareLink } = await import('../js/share.js');
const { getLastAnalysis } = await import('../js/results.js');
const link = buildShareLink();
assert.ok(link && link.url.includes('#d='), 'share link builds');
const text = buildShareText(getLastAnalysis(), link);
assert.ok(text.includes('#ChoiceaseDecision'), 'community tag in share text');
assert.ok(text.includes(link.url), 'live link in share text');
assert.ok(!/reddit/i.test(document.body.innerHTML) && !/reddit/i.test(text), 'no Reddit references');

/* Save menu: five formats incl. PPTX */
click($('#exportMenuBtn'));
assert.ok($('#exportMenu').classList.contains('is-open'));
assert.equal($$('#exportMenu [data-export]').length, 5, 'PDF, PPTX, CSV, JSON, QR');
click($('#exportMenu [data-export="json"]'));
assert.ok(!$('#exportMenu').classList.contains('is-open'));

/* Sample decision loads straight to results */
click($('#loadSampleBtn'));
assert.ok(stepVisible(6), 'sample lands on results');
assert.ok($('#casualResults').innerHTML.includes('family car'), 'sample content rendered');
assert.equal(decision.options.length, 4);

console.log('DOM SMOKE TEST PASSED — gating, editing, bias alerts, casual + advanced layers, lenses, what-if, share, sample');
