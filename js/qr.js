/* ==========================================================================
   Choicease — qr.js
   QR generation on the battle-tested stack from the live app:
   qrcodejs 1.0.0 (davidshimjs) + jsQR self-verification. Every QR is
   scanned back before it's accepted — no unreadable code ever ships.
   ========================================================================== */

/**
 * Generate a single QR code as a canvas, then verify it by scanning it back.
 * @returns {Promise<HTMLCanvasElement>}
 */
export function generateQRCanvas(text, { size = 768, verify = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!window.QRCode) {
      reject(new Error('QR library not loaded.'));
      return;
    }
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(host);

    const cleanup = () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    };

    try {
      // qrcodejs renders into the host as a <canvas> (modern) or <img> (fallback).
      // eslint-disable-next-line no-new
      new window.QRCode(host, {
        text,
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch (err) {
      cleanup();
      reject(new Error(`QR generation failed: ${err.message}`));
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 15;

    function collect() {
      attempts += 1;
      const canvas = host.querySelector('canvas');
      const img = host.querySelector('img');

      let output = null;
      if (canvas && canvas.width > 0) {
        output = canvas;
      } else if (img && img.complete && img.naturalWidth > 0) {
        // Copy <img> onto a canvas so downstream composition is uniform.
        output = document.createElement('canvas');
        output.width = size;
        output.height = size;
        output.getContext('2d').drawImage(img, 0, 0, size, size);
      }

      if (output) {
        if (verify && !verifyQRCanvas(output, text)) {
          cleanup();
          reject(new Error('Generated QR failed readability verification.'));
          return;
        }
        // Detach from the throwaway host before cleanup.
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = output.width;
        finalCanvas.height = output.height;
        finalCanvas.getContext('2d').drawImage(output, 0, 0);
        cleanup();
        resolve(finalCanvas);
        return;
      }

      if (attempts < MAX_ATTEMPTS) {
        setTimeout(collect, 200);
      } else {
        cleanup();
        reject(new Error('QR rendering timed out.'));
      }
    }

    setTimeout(collect, 120);
  });
}

/** Scan a rendered QR canvas back and confirm it decodes to the payload. */
export function verifyQRCanvas(canvas, expectedText) {
  if (!window.jsQR) return true; // can't verify without the scanner; don't block
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = window.jsQR(data.data, data.width, data.height);
    return Boolean(found && found.data === expectedText);
  } catch {
    return false;
  }
}

/**
 * Sequentially generate many QR canvases (legacy pattern: one at a time with a
 * breather between, each self-verified). Rejects on the first failure with a
 * chunk-specific message.
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export function generateQRSequence(payloads, { size = 768 } = {}) {
  return payloads.reduce(
    (chain, payload, index) => chain.then((canvases) =>
      generateQRCanvas(payload, { size })
        .then((canvas) => new Promise((resolve) => {
          canvases.push(canvas);
          setTimeout(() => resolve(canvases), 80); // stability breather (legacy)
        }))
        .catch((err) => {
          throw new Error(`QR ${index + 1} of ${payloads.length}: ${err.message}`);
        })),
    Promise.resolve([]),
  );
}
