/* ==========================================================================
   Choicease — share.js
   Smooth, seamless sharing. Native share sheet where available; X and
   WhatsApp as first-class targets everywhere; LinkedIn and copy as backup.
   ========================================================================== */

import { decision } from './state.js';
import { toast, copyToClipboard } from './ui.js';

const APP_URL = 'https://choicease.com';

/** Engaging, human share text built from the live result. */
export function buildShareText(analysis) {
  const ranked = analysis?.ranked || [];
  const top = ranked[0];
  if (!top) {
    return `I'm weighing a decision with Choicease — free, private, structured decision analysis in the browser. ${APP_URL}`;
  }
  const pct = Math.round((top.totalScore / 5) * 100);
  const runnerUp = ranked[1];
  const lines = [
    `Decision made: ${decision.title || 'a tough call'} ✅`,
    ``,
    `→ ${top.option.name} came out on top (${pct}% fit${runnerUp ? `, ahead of ${runnerUp.option.name}` : ''})`,
    `Weighed ${decision.options.length} options against ${decision.criteria.length} criteria — with sensitivity checks, not gut feel.`,
    ``,
    `Analyzed with Choicease — free, private, no sign-up.`,
  ];
  return lines.join('\n');
}

function encodedText(analysis) {
  return encodeURIComponent(buildShareText(analysis));
}

export function canNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** One-tap share: native sheet first, graceful fallback to copy. */
export async function shareNative(analysis) {
  const text = buildShareText(analysis);
  if (canNativeShare()) {
    try {
      await navigator.share({ title: 'Choicease decision', text, url: APP_URL });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user closed the sheet — not an error
    }
  }
  await copyToClipboard(`${text}\n${APP_URL}`);
  toast('Share text copied — paste it anywhere.');
}

export function shareToX(analysis) {
  const url = `https://twitter.com/intent/tweet?text=${encodedText(analysis)}&url=${encodeURIComponent(APP_URL)}`;
  window.open(url, '_blank', 'noopener');
}

export function shareToWhatsApp(analysis) {
  const url = `https://wa.me/?text=${encodedText(analysis)}%0A${encodeURIComponent(APP_URL)}`;
  window.open(url, '_blank', 'noopener');
}

export function shareToLinkedIn() {
  const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(APP_URL)}`;
  window.open(url, '_blank', 'noopener');
}

export async function copyShareText(analysis) {
  await copyToClipboard(`${buildShareText(analysis)}\n${APP_URL}`);
  toast('Share text copied to clipboard.');
}

export async function copySummary(summaryText) {
  if (!summaryText) {
    toast('Nothing to copy yet.', 'warn');
    return;
  }
  await copyToClipboard(summaryText);
  toast('Executive summary copied.');
}
