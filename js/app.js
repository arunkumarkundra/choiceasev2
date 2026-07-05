/* ==========================================================================
   Choicease — app.js
   Entry point: wires the wizard, results, sharing, exports, imports,
   modals, and draft resume. No business logic lives here.
   ========================================================================== */

import { decision, resetDecision, loadDraft, loadImportedData } from './state.js';
import {
  initWizard, goToStep, syncFrameInputs, renderOptions, renderCriteria,
} from './wizard.js';
import { renderResults, getLastAnalysis, currentExecutiveSummary } from './results.js';
import {
  shareNative, shareToX, shareToWhatsApp, shareToLinkedIn, copyShareText,
  copySummary, canNativeShare,
} from './share.js';
import { exportJSON, exportCSV, exportPDF, exportQR } from './exporters.js';
import { importJSONFile, importQRFile } from './importers.js';
import {
  $, $$, toast, openModal, closeModal, wireModalDismissal, confirmDialog,
} from './ui.js';

function boot() {
  initWizard({ onResults: renderResults });
  wireModalDismissal();
  wireHeader();
  wireImports();
  wireResultActions();
  wirePanels();
  offerDraftResume();
  $('#year').textContent = String(new Date().getFullYear());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
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
    toast('Reading QR image…');
    const result = await importQRFile(e.target.files[0]);
    e.target.value = '';
    if (result.ok) afterImport();
  });
}

function afterImport() {
  syncFrameInputs();
  renderOptions();
  renderCriteria();
  const complete = decision.options.length >= 2 && decision.criteria.length >= 1;
  goToStep(complete ? 6 : 1);
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
    const complete = draft.options?.length >= 2 && draft.criteria?.length >= 1
      && Object.keys(draft.ratings || {}).length > 0;
    goToStep(complete ? 6 : 1, { scroll: false });
    toast('Draft restored.');
  });
  $('#draftDismiss').addEventListener('click', () => {
    banner.classList.add('is-hidden');
  });
}

/* ---------------------------- Result actions ----------------------------- */

function wireResultActions() {
  /* Share */
  const nativeBtn = $('#shareNativeBtn');
  if (!canNativeShare()) nativeBtn.textContent = 'Copy share text';
  nativeBtn.addEventListener('click', () => shareNative(getLastAnalysis()));
  $('#shareXBtn').addEventListener('click', () => shareToX(getLastAnalysis()));
  $('#shareWhatsAppBtn').addEventListener('click', () => shareToWhatsApp(getLastAnalysis()));
  $('#shareLinkedInBtn').addEventListener('click', () => shareToLinkedIn());
  $('#shareCopyBtn').addEventListener('click', () => copyShareText(getLastAnalysis()));
  $('#copySummaryBtn').addEventListener('click', () => copySummary(currentExecutiveSummary()));

  /* Export menu */
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
      case 'csv': exportCSV(analysis); break;
      case 'json': exportJSON(); break;
      case 'qr': exportQR(); break;
      default: break;
    }
  });

  /* Refine & restart */
  $('#refineBtn').addEventListener('click', () => goToStep(4));
  $('#startOverBtn').addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Start a new decision? The current one will be cleared. Export it first if you want to keep it.',
      'Start new decision',
    );
    if (!confirmed) return;
    resetDecision();
    syncFrameInputs();
    renderOptions();
    renderCriteria();
    goToStep(1);
    toast('Fresh start. Frame the new decision.');
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
