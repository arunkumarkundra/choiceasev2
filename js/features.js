/* ==========================================================================
   Choicease — features.js
   Premium-feature scaffold. Everything is FREE today; this file is the one
   switch to flip when a feature (e.g. the PowerPoint deck) goes paid.

   To make PPTX paid later:
   1. Set PREMIUM_FEATURES.pptx = true.
   2. Wire validateLicenseKey() to your payment provider (see the
      implementation guide, §"Making PPTX a paid feature").
   Nothing else in the app needs to change — app.js already routes the PPTX
   button through requireFeature().
   ========================================================================== */

export const PREMIUM_FEATURES = {
  pptx: false, // ← flip to true when the PowerPoint deck becomes a paid feature
};

const LICENSE_PREFIX = 'choicease.license.';

/** Is this feature usable right now? Free features always are. */
export function isUnlocked(feature) {
  if (!PREMIUM_FEATURES[feature]) return true;
  try {
    return localStorage.getItem(LICENSE_PREFIX + feature) === 'valid';
  } catch {
    return false;
  }
}

/**
 * Validate a license key with your payment provider and, if valid, unlock
 * the feature on this device. Returns { ok, message }.
 *
 * STUB: replace the body with a real check, e.g. Gumroad's license API:
 *   POST https://api.gumroad.com/v2/licenses/verify
 *   { product_id: '...', license_key: key }
 * or Lemon Squeezy's /v1/licenses/validate. Both are callable from the
 * browser; no server of your own is required.
 */
export async function validateLicenseKey(feature, key) {
  if (!key || key.trim().length < 8) {
    return { ok: false, message: 'That doesn\u2019t look like a license key.' };
  }
  return { ok: false, message: 'License validation is not configured yet.' };
}

export function storeLicense(feature) {
  try {
    localStorage.setItem(LICENSE_PREFIX + feature, 'valid');
  } catch {
    /* private mode: unlock lasts for the session via memory fallback */
  }
}
