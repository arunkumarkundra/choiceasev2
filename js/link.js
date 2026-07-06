/* ==========================================================================
   Choicease — link.js
   Share-link encoding: the whole decision lives in the URL fragment
   (choicease.com/#d=...). Fragments are never sent to any server, so the
   privacy promise holds. deflate → base64url.
   ========================================================================== */

const APP_ORIGIN = 'https://choicease.com/';
const FRAGMENT_PREFIX = '#d=';
/** Practical ceiling: browsers handle far more, but messaging apps and QR
    codes of the link get unwieldy beyond this. */
export const LINK_SOFT_LIMIT = 6000;

/** @returns {{url: string, length: number, oversized: boolean} | null} */
export function encodeDecisionLink(snapshot) {
  if (!window.pako) return null;
  try {
    const json = JSON.stringify(snapshot);
    const compressed = window.pako.deflate(json);
    const payload = toBase64Url(compressed);
    const url = `${APP_ORIGIN}${FRAGMENT_PREFIX}${payload}`;
    return { url, length: url.length, oversized: url.length > LINK_SOFT_LIMIT };
  } catch (err) {
    console.error('Link encoding failed:', err);
    return null;
  }
}

/** Reads #d=... from a hash string. @returns decision object or null. */
export function decodeDecisionFragment(hash) {
  if (!hash || !hash.startsWith(FRAGMENT_PREFIX) || !window.pako) return null;
  try {
    const payload = hash.slice(FRAGMENT_PREFIX.length);
    const bytes = fromBase64Url(payload);
    const inflated = window.pako.inflate(bytes, { to: 'string' });
    const json = typeof inflated === 'string' ? inflated : new TextDecoder().decode(inflated);
    return JSON.parse(json);
  } catch (err) {
    console.error('Link decoding failed:', err);
    return null;
  }
}

export function hasDecisionFragment() {
  return window.location.hash.startsWith(FRAGMENT_PREFIX);
}

export function clearDecisionFragment() {
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ base64url -------------------------------- */

function toBase64Url(u8) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) u8[i] = binary.charCodeAt(i);
  return u8;
}
