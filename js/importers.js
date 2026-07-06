/* ==========================================================================
   Choicease — importers.js
   Restores decisions from JSON files or QR images. Fully backward
   compatible with legacy Choicease exports (v1.x chunked QR format).
   ========================================================================== */

import {
  validateImportedData, dataIntegrityWarnings, loadImportedData,
} from './state.js';
import { toast } from './ui.js';

/** @returns {Promise<{ok: boolean, warnings?: string[]}>} */
export function importJSONFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false });
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast('Choose a .json file exported from Choicease.', 'warn');
      return resolve({ ok: false });
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        resolve(applyImportedData(data));
      } catch (err) {
        console.error('JSON import failed:', err);
        toast('That file could not be read as a Choicease export.', 'error');
        resolve({ ok: false });
      }
    };
    reader.onerror = () => {
      toast('Could not read the selected file.', 'error');
      resolve({ ok: false });
    };
    reader.readAsText(file);
  });
}

/** @returns {Promise<{ok: boolean, warnings?: string[]}>} */
export function importQRFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false });
    if (!window.jsQR || !window.pako) {
      toast('QR libraries did not load. Check your connection and retry.', 'error');
      return resolve({ ok: false });
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const payloads = scanImageForQRCodes(img);
          if (!payloads.length) throw new Error('No QR codes detected in the image.');
          const json = reassembleQRData(payloads);
          const data = JSON.parse(json);
          resolve(applyImportedData(data));
        } catch (err) {
          console.error('QR import failed:', err);
          toast(qrErrorMessage(err), 'error');
          resolve({ ok: false });
        }
      };
      img.onerror = () => {
        toast('Could not load that image.', 'error');
        resolve({ ok: false });
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      toast('Could not read the selected file.', 'error');
      resolve({ ok: false });
    };
    reader.readAsDataURL(file);
  });
}

function applyImportedData(data) {
  if (!validateImportedData(data)) {
    toast('That file is not a valid Choicease export.', 'error');
    return { ok: false };
  }
  const warnings = dataIntegrityWarnings(data);
  loadImportedData(data);
  if (warnings.length) {
    toast(`Imported with ${warnings.length} warning(s) — some data was incomplete.`, 'warn');
    console.warn('Import warnings:', warnings);
  } else {
    toast('Decision imported. Review any step, or jump to the verdict.');
  }
  return { ok: true, warnings };
}

function qrErrorMessage(err) {
  const msg = String(err?.message || '');
  if (msg.includes('No QR')) return 'No Choicease QR codes were found in that image.';
  if (msg.includes('Missing chunks')) return 'Some QR parts are missing — use the complete exported image.';
  return 'That image could not be imported. Try the original exported PNG or a JSON file.';
}

/* --------------------------------------------------------------------------
   QR scanning — handles single QR and vertically stacked multi-QR images
   (the format Choicease has always exported).
   -------------------------------------------------------------------------- */

function scanImageForQRCodes(img) {
  const payloads = [];
  let currentY = 0;
  let attempts = 0;
  const MAX_ATTEMPTS = 24;

  while (currentY < img.height && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const sliceHeight = img.height - currentY;
    if (sliceHeight < 80) break;

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = sliceHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, currentY, img.width, sliceHeight, 0, 0, img.width, sliceHeight);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const found = window.jsQR(imageData.data, imageData.width, imageData.height);
    if (!found || !found.data) break;

    payloads.push(found.data);
    const bottom = Math.max(
      found.location.bottomLeftCorner.y,
      found.location.bottomRightCorner.y,
    );
    currentY += Math.ceil(bottom) + 8;
  }
  return payloads;
}

export function reassembleQRData(payloads) {
  // Single QR without chunk metadata: try direct decode paths.
  if (payloads.length === 1 && !payloads[0].includes('|')) {
    return decodeSinglePayload(payloads[0]);
  }

  const chunks = [];
  let totalChunks = null;

  for (const payload of payloads) {
    const separator = payload.indexOf('|');
    if (separator === -1) continue;
    let meta;
    try {
      meta = JSON.parse(payload.slice(0, separator));
    } catch {
      continue;
    }
    if (typeof meta.i !== 'number' || typeof meta.t !== 'number') continue;
    if (totalChunks === null) totalChunks = meta.t;
    if (meta.t !== totalChunks || meta.i < 0 || meta.i >= totalChunks) continue;
    if (chunks[meta.i] === undefined) chunks[meta.i] = payload.slice(separator + 1);
  }

  if (totalChunks === null) throw new Error('No QR chunk metadata found.');
  const missing = [];
  for (let i = 0; i < totalChunks; i += 1) {
    if (chunks[i] === undefined) missing.push(i + 1);
  }
  if (missing.length) {
    throw new Error(`Missing chunks: ${missing.join(', ')} of ${totalChunks}.`);
  }

  return inflateBase64(chunks.join(''));
}

function decodeSinglePayload(payload) {
  // Path 1: base64(deflate(json))
  try {
    return inflateBase64(payload);
  } catch {
    /* fall through */
  }
  // Path 2: plain JSON in the QR
  JSON.parse(payload); // throws if not JSON
  return payload;
}

function inflateBase64(base64) {
  const binary = atob(base64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) u8[i] = binary.charCodeAt(i);
  const inflated = window.pako.inflate(u8, { to: 'string' });
  // pako 2.x honors {to:'string'}; guard for versions that return bytes.
  return typeof inflated === 'string' ? inflated : new TextDecoder().decode(inflated);
}
