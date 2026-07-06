/* ==========================================================================
   Choicease — app.js
   Entry point: wiring only. Boot order: link-fragment import → draft resume
   → normal flow.
   ========================================================================== */

import { decision, resetDecision, loadDraft, loadImportedData, validateImportedData } from './state.js';
import {
  initWizard, goToStep, syncFrameInputs, renderOptions, renderCriteria,
} from './wizard.js';
import {
  renderResults, getLastAnalysis, currentExecutiveSummary, toggleAdvanced,
} from './results.js';
import { shareNative, shareToX, shareToWhatsApp, buildShareLink, canNativeShare } from './share.js';
import { exportPDF, exportPPTX } from './exporters.js';
import { hasDecisionFragment, decodeDecisionFragment, clearDecisionFragment } from './link.js';
import { isUnlocked, validateLicenseKey, storeLicense } from './features.js';
import {
  $, $$, toast, openModal, closeModal, wireModalDismissal, confirmDialog,
} from './ui.js';

function boot() {
  initWizard({ onResults: onResultsEntered });
  wireModalDismissal();
  wireHeader();
  wireResultActions();
  wirePanels();
  wirePremium();
  $('#year').textContent = String(new Date().getFullYear());

  if (!importFromFragmentIfPresent()) {
    offerDraftResume();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

function onResultsEntered() {
  renderResults();
  updateGalleryMailto();
}

/* ------------------------- Link-fragment import -------------------------- */

function importFromFragmentIfPresent() {
  if (!hasDecisionFragment()) return false;
  const attempt = () => {
    const data = decodeDecisionFragment(window.location.hash);
    if (data && validateImportedData(data)) {
      loadImportedData(data);
      clearDecisionFragment();
      afterImport();
      toast('Decision opened from the link — explore it, tweak it, make it yours. ✨');
      return true;
    }
    return false;
  };
  if (window.pako) {
    if (!attempt()) toast('That link could not be read — it may be incomplete.', 'error');
  } else {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.pako) {
        clearInterval(timer);
        if (!attempt()) toast('That link could not be read — it may be incomplete.', 'error');
      } else if (tries > 40) {
        clearInterval(timer);
        toast('Could not load the decoder — check your connection and reload.', 'error');
      }
    }, 150);
  }
  return true;
}

function afterImport() {
  syncFrameInputs();
  renderOptions();
  renderCriteria();
  const complete = decision.options.length >= 2 && decision.criteria.length >= 2;
  goToStep(complete ? 6 : 1);
}

/* ------------------------------- Header ---------------------------------- */

function wireHeader() {
  $('#howItWorksBtn').addEventListener('click', () => openModal('howItWorksModal'));
  $('#howItWorksStart').addEventListener('click', () => closeModal('howItWorksModal'));
  $('#brandHome').addEventListener('click', (e) => {
    e.preventDefault();
    goToStep(1);
  });
}

/* --------------------------- Draft resume -------------------------------- */

function offerDraftResume() {
  const draft = loadDraft();
  if (!draft) return;
  const banner = $('#draftBanner');
  const title = draft.title ? `“${draft.title}”` : 'an unfinished decision';
  $('#draftBannerText').textContent = `Pick up where you left off — ${title} is saved on this device.`;
  banner.classList.remove('is-hidden');

  $('#draftResume').addEventListener('click', () => {
    loadImportedData(draft);
    syncFrameInputs();
    renderOptions();
    renderCriteria();
    banner.classList.add('is-hidden');
    const complete = draft.options?.length >= 2 && draft.criteria?.length >= 2
      && Object.keys(draft.ratings || {}).length > 0;
    goToStep(complete ? 6 : 1, { scroll: false });
    toast('Draft restored — right where you left it.');
  });
  $('#draftDismiss').addEventListener('click', () => banner.classList.add('is-hidden'));
}

/* ---------------------------- Result actions ----------------------------- */

function wireResultActions() {
  /* Actions row: Back · Share · Post on 𝕏 · WhatsApp · Start afresh */
  $('#resultsBackBtn').addEventListener('click', () => goToStep(5));

  const nativeBtn = $('#shareNativeBtn');
  if (!canNativeShare()) {
    nativeBtn.textContent = '↗️ Share';
    nativeBtn.title = 'Downloads the results image and copies the share text with your link';
  }
  nativeBtn.addEventListener('click', () => shareNative(getLastAnalysis()));
  $('#shareXBtn').addEventListener('click', () => shareToX(getLastAnalysis()));
  $('#shareWhatsAppBtn').addEventListener('click', () => shareToWhatsApp(getLastAnalysis()));

  $('#startOverBtn').addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Start a new decision? The current one will be cleared — copy its link first if you want to keep it.',
      'Start afresh',
    );
    if (!confirmed) return;
    resetDecision();
    syncFrameInputs();
    renderOptions();
    renderCriteria();
    goToStep(1);
    toast('Clean slate. What are we deciding? ✨');
  });

  /* Advanced analytics & reports */
  const advToggle = $('#advancedToggleBtn');
  advToggle.addEventListener('click', () => {
    const opened = toggleAdvanced();
    advToggle.textContent = opened ? 'Hide Advanced Analytics and Reports' : 'Show Advanced Analytics and Reports';
  });

  $('#advPdfBtn').addEventListener('click', () => {
    const analysis = getLastAnalysis();
    if (analysis) exportPDF(analysis, currentExecutiveSummary());
  });
  $('#advPptxBtn').addEventListener('click', () => {
    const analysis = getLastAnalysis();
    if (!analysis) return;
    if (!isUnlocked('pptx')) {
      openModal('premiumModal');
      return;
    }
    exportPPTX(analysis, currentExecutiveSummary());
  });
}

/* -------------------- Gallery submission mailto -------------------------- */

function updateGalleryMailto() {
  const anchor = $('#gallerySubmitMailto');
  if (!anchor) return;
  const link = buildShareLink();
  const subject = `Decision Gallery submission: ${decision.title || 'my decision'}`;
  const body = [
    'Hi Choicease team,',
    '',
    `I'd like my decision "${decision.title || 'Untitled'}" to be considered for the Decision Gallery.`,
    '',
    'Here is the link that opens it live:',
    link && !link.oversized ? link.url : '(link too large — happy to share details another way)',
    '',
    'A one-line story about it (feel free to edit):',
    decision.description || '',
    '',
    'I confirm I\'m happy for this decision to be published in the public gallery.',
  ].join('\n');
  anchor.href = `mailto:contact@choicease.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* --------------------------- Collapsible panels -------------------------- */

function wirePanels() {
  $$('.panel__toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const panel = toggle.closest('.panel');
      const open = panel.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  });
}

/* --------------------------- Premium scaffold ---------------------------- */

function wirePremium() {
  const submit = $('#licenseSubmitBtn');
  if (!submit) return;
  submit.addEventListener('click', async () => {
    const key = $('#licenseKeyInput').value;
    const feedback = $('#licenseFeedback');
    feedback.textContent = 'Checking…';
    const result = await validateLicenseKey('pptx', key);
    feedback.textContent = result.message || (result.ok ? 'Unlocked!' : 'Invalid key.');
    if (result.ok) {
      storeLicense('pptx');
      closeModal('premiumModal');
      toast('PowerPoint export unlocked. 🎉');
    }
  });
}
