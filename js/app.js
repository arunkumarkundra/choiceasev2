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
import {
  shareNative, shareToX, shareToWhatsApp, downloadShareImage,
  copyShareText, copyShareLink, copySummary, canNativeShare,
} from './share.js';
import { exportJSON, exportCSV, exportPDF, exportPPTX, exportQR } from './exporters.js';
import { importJSONFile, importQRFile } from './importers.js';
import { hasDecisionFragment, decodeDecisionFragment, clearDecisionFragment } from './link.js';
import { sampleDecision } from './assist.js';
import {
  $, $$, toast, openModal, closeModal, wireModalDismissal, confirmDialog,
} from './ui.js';

function boot() {
  initWizard({ onResults: renderResults });
  wireModalDismissal();
  wireHeader();
  wireImports();
  wireSample();
  wireResultActions();
  wirePanels();
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
  // pako loads deferred; retry briefly if it isn't ready yet.
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

/* ------------------------------- Header ---------------------------------- */

function wireHeader() {
  $('#howItWorksBtn').addEventListener('click', () => openModal('howItWorksModal'));
  $('#howItWorksStart').addEventListener('click', () => closeModal('howItWorksModal'));
  $('#brandHome').addEventListener('click', (e) => {
    e.preventDefault();
    goToStep(1);
  });
}

/* ------------------------------- Imports --------------------------------- */

function wireImports() {
  $('#importJSONInput').addEventListener('change', async (e) => {
    const result = await importJSONFile(e.target.files[0]);
    e.target.value = '';
    if (result.ok) afterImport();
  });
  $('#importQRInput').addEventListener('change', async (e) => {
    toast('Hang tight — reading your QR magic… ✨');
    const result = await importQRFile(e.target.files[0]);
    e.target.value = '';
    if (result.ok) afterImport();
  });
}

function afterImport() {
  syncFrameInputs();
  renderOptions();
  renderCriteria();
  const complete = decision.options.length >= 2 && decision.criteria.length >= 2;
  goToStep(complete ? 6 : 1);
}

/* --------------------------- Sample decision ----------------------------- */

function wireSample() {
  $('#loadSampleBtn').addEventListener('click', () => {
    loadImportedData(sampleDecision());
    syncFrameInputs();
    renderOptions();
    renderCriteria();
    goToStep(6);
    toast('Sample decision loaded — poke around, then start your own. 🚗');
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
  /* Advanced analytics toggle */
  $('#advancedToggleBtn').addEventListener('click', toggleAdvanced);

  /* Share */
  const nativeBtn = $('#shareNativeBtn');
  if (!canNativeShare()) nativeBtn.textContent = '📸 Image + text';
  nativeBtn.addEventListener('click', () => shareNative(getLastAnalysis()));
  $('#shareXBtn').addEventListener('click', () => shareToX(getLastAnalysis()));
  $('#shareWhatsAppBtn').addEventListener('click', () => shareToWhatsApp(getLastAnalysis()));
  $('#copyLinkBtn').addEventListener('click', () => copyShareLink());
  $('#shareImageBtn').addEventListener('click', () => downloadShareImage(getLastAnalysis()));
  $('#shareCopyBtn').addEventListener('click', () => copyShareText(getLastAnalysis()));
  $('#copySummaryBtn').addEventListener('click', () => copySummary(currentExecutiveSummary()));

  /* Save menu */
  const exportBtn = $('#exportMenuBtn');
  const exportMenu = $('#exportMenu');
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = exportMenu.classList.toggle('is-open');
    exportBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => {
    exportMenu.classList.remove('is-open');
    exportBtn.setAttribute('aria-expanded', 'false');
  });
  exportMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-export]');
    if (!item) return;
    exportMenu.classList.remove('is-open');
    const analysis = getLastAnalysis();
    if (!analysis) {
      toast('Run the analysis first.', 'warn');
      return;
    }
    switch (item.dataset.export) {
      case 'pdf': exportPDF(analysis, currentExecutiveSummary()); break;
      case 'pptx': exportPPTX(analysis, currentExecutiveSummary()); break;
      case 'csv': exportCSV(analysis); break;
      case 'json': exportJSON(); break;
      case 'qr': exportQR(); break;
      default: break;
    }
  });

  /* Advanced-section report buttons */
  $('#advPdfBtn').addEventListener('click', () => {
    const analysis = getLastAnalysis();
    if (analysis) exportPDF(analysis, currentExecutiveSummary());
  });
  $('#advPptxBtn').addEventListener('click', () => {
    const analysis = getLastAnalysis();
    if (analysis) exportPPTX(analysis, currentExecutiveSummary());
  });

  /* Navigation */
  $('#resultsBackBtn').addEventListener('click', () => goToStep(5));
  $('#startOverBtn').addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Start a new decision? The current one will be cleared — export or copy its link first if you want to keep it.',
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
