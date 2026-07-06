/* ==========================================================================
   Choicease — share.js
   The sharing centerpiece: one beautiful, self-contained PNG (results card +
   link QR + import instructions), an instantly-openable share link, and the
   #ChoiceaseDecision community tag. Native share sheet first; graceful
   download-and-copy fallback everywhere else.
   ========================================================================== */

import { decision, exportSnapshot } from './state.js';
import { encodeDecisionLink } from './link.js';
import { toast, copyToClipboard, downloadBlob, safeFilename } from './ui.js';

export const APP_URL = 'https://choicease.com';
export const COMMUNITY_TAG = 'ChoiceaseDecision';

const BRAND = {
  ink: '#111A28',
  slate: '#5C6B7E',
  line: '#E3E7ED',
  paper: '#F5F6F8',
  petrol: '#0E6B63',
  petrolDark: '#0A4F49',
  gold: '#C9A227',
};

/* ------------------------------ Share text ------------------------------- */

export function buildShareText(analysis, link) {
  const ranked = analysis?.ranked || [];
  const top = ranked[0];
  const url = link?.url && !link.oversized ? link.url : APP_URL;
  if (!top) {
    return `Weighing a big decision? I've been using Choicease — free, private, and it actually helps you think. ${url} #${COMMUNITY_TAG}`;
  }
  const fit = Math.round((top.totalScore / 5) * 100);
  const runnerUp = ranked[1];
  const lines = [
    `Decision made ✅ ${decision.title || 'A tough call'}`,
    ``,
    `🏆 ${top.option.name} takes it (${fit}% fit${runnerUp ? `, edging out ${runnerUp.option.name}` : ''})`,
    `${decision.options.length} options · ${decision.criteria.length} criteria · properly weighed, not gut-felt`,
    ``,
    link?.url && !link.oversized
      ? `Open my full analysis (and tweak it yourself): ${url}`
      : `Try it yourself — free, private, no sign-up: ${url}`,
    `#${COMMUNITY_TAG}`,
  ];
  return lines.join('\n');
}

/* --------------------------- Share link ---------------------------------- */

export function buildShareLink() {
  return encodeDecisionLink(exportSnapshot());
}

/* ------------------------ The shareable image ---------------------------- */

/**
 * The shareable PNG: the branded results card. The share TEXT carries the
 * live link that recreates the decision.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function createShareImage(analysis) {
  return drawResultsCard(analysis);
}

function drawResultsCard(analysis) {
  const ranked = analysis?.ranked || [];
  const W = 1000;
  const headerH = 170;
  const rowH = 76;
  const shownRows = Math.min(ranked.length, 6);
  const moreNote = ranked.length > shownRows ? 34 : 0;
  const footerH = 86;
  const pad = 44;
  const H = headerH + shownRows * rowH + moreNote + footerH + pad;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  /* Header band */
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = BRAND.petrol;
  ctx.fillRect(0, headerH - 6, W, 6);

  ctx.fillStyle = '#8FB8B3';
  ctx.font = '600 17px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CHOICEASE · DECISION RESULT', pad, 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Arial, sans-serif';
  const titleLines = wrapText(ctx, decision.title || 'A decision, decided', W - pad * 2, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, pad, 92 + i * 40));

  ctx.fillStyle = '#B8C2CF';
  ctx.font = '400 17px Arial, sans-serif';
  const meta = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(meta, pad, headerH - 24);

  /* Leaderboard */
  const maxScore = Math.max(...ranked.map((r) => r.totalScore), 0.01);
  ranked.slice(0, shownRows).forEach((r, i) => {
    const y = headerH + 24 + i * rowH;
    const isTop = r.rank === 1;

    /* rank medallion */
    ctx.beginPath();
    ctx.arc(pad + 22, y + 22, 22, 0, Math.PI * 2);
    ctx.fillStyle = isTop ? BRAND.petrol : BRAND.paper;
    ctx.fill();
    if (!isTop) {
      ctx.strokeStyle = BRAND.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = isTop ? '#ffffff' : BRAND.slate;
    ctx.font = 'bold 19px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${r.rank}${r.isTied ? '=' : ''}`, pad + 22, y + 29);

    /* name + trophy */
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.ink;
    ctx.font = `${isTop ? 'bold 23px' : '600 21px'} Arial, sans-serif`;
    const name = truncate(ctx, r.option.name, W - pad * 2 - 300);
    ctx.fillText(`${name}${isTop ? '  🏆' : ''}`, pad + 62, y + 20);

    /* score bar */
    const barX = pad + 62;
    const barW = W - pad * 2 - 200;
    ctx.fillStyle = BRAND.paper;
    roundRect(ctx, barX, y + 30, barW, 14, 7);
    ctx.fill();
    ctx.fillStyle = isTop ? BRAND.petrol : BRAND.slate;
    roundRect(ctx, barX, y + 30, Math.max(10, (r.totalScore / maxScore) * barW), 14, 7);
    ctx.fill();

    /* score */
    ctx.fillStyle = isTop ? BRAND.petrolDark : BRAND.slate;
    ctx.font = 'bold 21px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round((r.totalScore / 5) * 100)}%`, W - pad, y + 27);
    ctx.font = '400 15px Arial, sans-serif';
    ctx.fillText(`${r.totalScore.toFixed(2)}/5`, W - pad, y + 47);
    ctx.textAlign = 'left';
  });

  if (moreNote) {
    ctx.fillStyle = BRAND.slate;
    ctx.font = 'italic 16px Arial, sans-serif';
    ctx.fillText(`…and ${ranked.length - shownRows} more — full ranking inside`, pad, headerH + 24 + shownRows * rowH + 14);
  }

  /* Footer */
  const fy = H - footerH;
  ctx.strokeStyle = BRAND.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, fy);
  ctx.lineTo(W - pad, fy);
  ctx.stroke();

  ctx.fillStyle = BRAND.slate;
  ctx.font = '400 16px Arial, sans-serif';
  ctx.fillText(`${decision.options.length} options · ${decision.criteria.length} criteria · weighted analysis`, pad, fy + 34);
  ctx.fillStyle = BRAND.petrolDark;
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Decide it yourself → choicease.com', W - pad, fy + 34);
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.slate;
  ctx.font = '400 15px Arial, sans-serif';
  ctx.fillText(`#${COMMUNITY_TAG}`, pad, fy + 60);

  return canvas;
}

/* --------------------------- Share actions ------------------------------- */

export async function shareNative(analysis) {
  const link = buildShareLink();
  const text = buildShareText(analysis, link);
  try {
    const canvas = await createShareImage(analysis);
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], 'choicease-results.png', { type: 'image/png' });
    const payload = { title: `Decision: ${decision.title || 'my choice'}`, text, files: [file] };

    if (navigator.canShare && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    // Fallback: download the image + copy the text (legacy pattern).
    downloadBlob(blob, safeFilename(decision.title, 'png'));
    await copyToClipboard(text);
    toast('Results image downloaded and share text (with your link) copied — paste it anywhere. 🎉');
  } catch (err) {
    console.error('Share failed:', err);
    await copyToClipboard(text);
    toast('Share text copied. The image hiccuped — try Share again in a moment.', 'warn');
  }
}

export function shareToX(analysis) {
  const link = buildShareLink();
  const text = buildShareText(analysis, link);
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function shareToWhatsApp(analysis) {
  const link = buildShareLink();
  const text = buildShareText(analysis, link);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function canNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/* ------------------------------- helpers --------------------------------- */

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed.'))), 'image/png');
  });
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = truncateRaw(ctx, lines[maxLines - 1], maxWidth);
  }
  return lines;
}

function truncate(ctx, text, maxWidth) {
  return ctx.measureText(text).width <= maxWidth ? text : truncateRaw(ctx, text, maxWidth);
}

function truncateRaw(ctx, text, maxWidth) {
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
