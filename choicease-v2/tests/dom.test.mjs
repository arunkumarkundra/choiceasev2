/* DOM smoke test — boots the real index.html in jsdom, drives the full
   6-step flow, and asserts every view renders without errors. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  // strip external <script src> tags — CDN libs aren't needed for this test
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '');

const dom = new JSDOM(html, { url: 'https://choicease.com/', pretendToBeVisual: true });
const { window } = dom;

for (const key of ['document', 'localStorage', 'HTMLElement', 'Image',
  'FileReader', 'Blob', 'atob', 'btoa']) {
  if (window[key] !== undefined) {
    try { globalThis[key] = window[key]; } catch { /* read-only global */ }
  }
}
globalThis.window = window;
window.matchMedia = window.matchMedia || (() => ({ matches: false }));
window.scrollTo = () => {};
window.getComputedStyle = window.getComputedStyle.bind(window);

// Boot the app (module side effects run boot()).
await import('../js/app.js');
const { $, $$ } = await import('../js/ui.js');
const { decision } = await import('../js/state.js');

const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));
const setValue = (selector, value) => {
  const el = $(selector);
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

/* Step 1 → 2 */
assert.ok(!$('#step-1').classList.contains('is-hidden'), 'step 1 visible on boot');
setValue('#decisionTitle', 'Pick a laptop for the team');
setValue('#decisionDescription', '30 analysts, refresh in Q4');
click($('#toStep2'));
assert.ok(!$('#step-2').classList.contains('is-hidden'), 'advanced to step 2');
assert.equal(decision.title, 'Pick a laptop for the team');

/* Step 2: add three options */
for (const name of ['ThinkPad X1', 'MacBook Pro', 'Dell XPS']) {
  $('#optionName').value = name;
  click($('#addOptionBtn'));
}
assert.equal(decision.options.length, 3, 'three options added');
assert.equal($$('#optionsList .item-card').length, 3, 'three option cards rendered');
click($('#toStep3'));
assert.ok(!$('#step-3').classList.contains('is-hidden'), 'advanced to step 3');

/* Step 3: add criteria */
for (const name of ['Price', 'Performance', 'Battery']) {
  $('#criterionName').value = name;
  click($('#addCriterionBtn'));
}
assert.equal(decision.criteria.length, 3, 'three criteria added');
click($('#toStep4'));
assert.ok(!$('#step-4').classList.contains('is-hidden'), 'advanced to step 4');

/* Step 4: weighting UI rendered; select importance 5 for Price */
assert.equal($$('#weightingList .weight-row').length, 3, 'weight rows rendered');
const priceRow = $('#weightingList .weight-row');
click(priceRow.querySelector('[data-importance="5"]'));
assert.equal(decision.weights[decision.criteria[0].id], 5, 'importance updated');
const pctText = priceRow.querySelector('[data-weight-display]').textContent;
assert.ok(/%$/.test(pctText), 'live weight % shown');
click($('#toStep5'));

/* Step 5: rating matrix rendered; nudge one rating */
assert.equal($$('#ratingMatrix .rating-block').length, 3, 'one block per criterion');
assert.equal($$('#ratingMatrix .rating-row').length, 9, '3×3 rating rows');
const firstRow = $('#ratingMatrix .rating-row');
const slider = firstRow.querySelector('[data-slider]');
slider.value = '4.5';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(decision.ratings[firstRow.dataset.key], 4.5, 'rating captured at 0.1 precision');
click($('#toStep6'));

/* Step 6: verdict + all panels render */
assert.ok(!$('#step-6').classList.contains('is-hidden'), 'advanced to verdict');
const verdictHTML = $('#verdictCard').innerHTML;
assert.ok(verdictHTML.includes('Recommend') || verdictHTML.includes('tied'), 'verdict sentence present');
assert.ok(verdictHTML.includes('Confidence'), 'confidence shown');
for (const id of ['panelDrivers', 'panelRanking', 'panelMatrix', 'panelSensitivity', 'panelWhatIf', 'panelMethod']) {
  assert.ok($(`#${id} .panel__body`).innerHTML.trim().length > 0, `${id} rendered`);
}
assert.ok($$('#panelMatrix table.matrix td').length >= 9, 'matrix populated');

/* What-if: move a slider, results update */
const wSlider = $('#panelWhatIf [data-whatif-slider]');
wSlider.value = '90';
wSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.ok($$('#whatIfResults .whatif-rank').length === 3, 'what-if rankings update');

/* Export menu opens; JSON export path executes (download stubbed) */
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};
window.URL.createObjectURL = globalThis.URL.createObjectURL;
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL;
click($('#exportMenuBtn'));
assert.ok($('#exportMenu').classList.contains('is-open'), 'export menu opens');
click($('#exportMenu [data-export="json"]'));
assert.ok(!$('#exportMenu').classList.contains('is-open'), 'export menu closes after choice');

/* Share text builds from live analysis */
const { buildShareText } = await import('../js/share.js');
const { getLastAnalysis } = await import('../js/results.js');
const text = buildShareText(getLastAnalysis());
assert.ok(text.includes('choicease') || text.includes('Choicease'), 'share text brands correctly');
assert.ok(!/reddit/i.test(document.body.innerHTML), 'no Reddit references anywhere');
assert.ok(!/reddit/i.test(text), 'no Reddit in share text');

/* Draft autosave round trip */
assert.ok(window.localStorage.getItem('choicease.draft.v1'), 'draft autosaved');

/* How-it-works modal opens/closes */
click($('#howItWorksBtn'));
assert.ok($('#howItWorksModal').classList.contains('is-open'), 'modal opens');
click($('#howItWorksModal .modal__close'));
assert.ok(!$('#howItWorksModal').classList.contains('is-open'), 'modal closes');

console.log('DOM SMOKE TEST PASSED — full 6-step flow, panels, what-if, export menu, share, draft, modal');
