/* ==========================================================================
   Choicease — state.js
   Single source of truth for the decision being built.
   No DOM access in this module.
   ========================================================================== */

export const LIMITS = {
  TITLE: 100,
  DESCRIPTION: 500,
  NAME: 100,
  ITEM_DESCRIPTION: 250,
  MAX_OPTIONS: 12,
  MAX_CRITERIA: 12,
  SOFT_MAX_CRITERIA: 7, // cognitive-load nudge threshold
};

export const SCHEMA_VERSION = '1.1'; // kept identical to legacy exports for compatibility

/** The one mutable store for the app. */
export const decision = createEmptyDecision();

export function createEmptyDecision() {
  return {
    title: '',
    description: '',
    options: [],   // { id, name, description }
    criteria: [],  // { id, name, description }
    weights: {},   // criterionId -> importance rating 1..5
    normalizedWeights: {}, // criterionId -> percentage (0..100)
    ratings: {},   // `${optionId}-${criterionId}` -> 0..5 (0.1 precision)
    timestamp: null,
  };
}

/** Replace store contents in place (keeps the exported reference stable). */
export function replaceDecision(next) {
  const empty = createEmptyDecision();
  for (const key of Object.keys(empty)) {
    decision[key] = next[key] !== undefined ? next[key] : empty[key];
  }
}

export function resetDecision() {
  replaceDecision(createEmptyDecision());
  clearDraft();
}

/* --------------------------------------------------------------------------
   Sanitization — user text is stored as plain text; rendering always escapes.
   -------------------------------------------------------------------------- */

export function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  let out = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  if (maxLength) out = out.slice(0, maxLength);
  return out;
}

let idCounter = 0;
export function makeId() {
  // Time-based, matches legacy numeric-string style; counter avoids same-ms collisions.
  idCounter = (idCounter + 1) % 1000;
  return Number(`${Date.now()}${String(idCounter).padStart(3, '0')}`);
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

export function setFrame(title, description) {
  decision.title = sanitizeText(title, LIMITS.TITLE);
  decision.description = sanitizeText(description, LIMITS.DESCRIPTION);
  saveDraft();
}

export function addOption(name, description) {
  const clean = sanitizeText(name, LIMITS.NAME);
  if (!clean) return { ok: false, error: 'Enter a name for the option.' };
  if (decision.options.length >= LIMITS.MAX_OPTIONS) {
    return { ok: false, error: `You can compare up to ${LIMITS.MAX_OPTIONS} options.` };
  }
  const duplicate = decision.options.some(
    (o) => o.name.toLowerCase() === clean.toLowerCase(),
  );
  if (duplicate) return { ok: false, error: `"${clean}" is already on the list.` };

  decision.options.push({
    id: makeId(),
    name: clean,
    description: sanitizeText(description, LIMITS.ITEM_DESCRIPTION),
  });
  saveDraft();
  return { ok: true };
}

export function removeOption(optionId) {
  decision.options = decision.options.filter((o) => o.id !== optionId);
  for (const key of Object.keys(decision.ratings)) {
    if (key.startsWith(`${optionId}-`)) delete decision.ratings[key];
  }
  saveDraft();
}

export function addCriterion(name, description) {
  const clean = sanitizeText(name, LIMITS.NAME);
  if (!clean) return { ok: false, error: 'Enter a name for the criterion.' };
  if (decision.criteria.length >= LIMITS.MAX_CRITERIA) {
    return { ok: false, error: `You can weigh up to ${LIMITS.MAX_CRITERIA} criteria.` };
  }
  const duplicate = decision.criteria.some(
    (c) => c.name.toLowerCase() === clean.toLowerCase(),
  );
  if (duplicate) return { ok: false, error: `"${clean}" is already on the list.` };

  const id = makeId();
  decision.criteria.push({
    id,
    name: clean,
    description: sanitizeText(description, LIMITS.ITEM_DESCRIPTION),
  });
  decision.weights[id] = 3; // sensible default: medium importance, visible and overridable
  saveDraft();
  return { ok: true };
}

export function removeCriterion(criterionId) {
  decision.criteria = decision.criteria.filter((c) => c.id !== criterionId);
  delete decision.weights[criterionId];
  delete decision.normalizedWeights[criterionId];
  for (const key of Object.keys(decision.ratings)) {
    if (key.endsWith(`-${criterionId}`)) delete decision.ratings[key];
  }
  saveDraft();
}

export function setImportance(criterionId, rating) {
  const r = Math.min(5, Math.max(1, Math.round(Number(rating) || 3)));
  decision.weights[criterionId] = r;
  saveDraft();
}

export function setRating(optionId, criterionId, value) {
  let v = Number(value);
  if (!Number.isFinite(v)) v = 3;
  v = Math.min(5, Math.max(0, Math.round(v * 10) / 10));
  decision.ratings[`${optionId}-${criterionId}`] = v;
  saveDraft();
  return v;
}

/* --------------------------------------------------------------------------
   Draft autosave — "the app already knew": work survives an accidental reload.
   Stored locally only; nothing leaves the browser.
   -------------------------------------------------------------------------- */

const DRAFT_KEY = 'choicease.draft.v1';

export function saveDraft() {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...decision, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage may be unavailable (private mode); the app still works */
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || (!data.title && !data.options?.length && !data.criteria?.length)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------------
   Import validation (shared by JSON and QR import) — backward compatible
   with every legacy Choicease export.
   -------------------------------------------------------------------------- */

export function validateImportedData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.options) || !Array.isArray(data.criteria)) return false;
  const validItem = (item) =>
    item && (typeof item.id === 'number' || typeof item.id === 'string') &&
    typeof item.name === 'string' && item.name.trim().length > 0;
  if (!data.options.every(validItem) || !data.criteria.every(validItem)) return false;
  return true;
}

export function dataIntegrityWarnings(data) {
  const warnings = [];
  const optionIds = (data.options || []).map((o) => String(o.id));
  const criterionIds = (data.criteria || []).map((c) => String(c.id));

  for (const key of Object.keys(data.ratings || {})) {
    const [optionId, criterionId] = String(key).split('-');
    if (!optionIds.includes(optionId)) warnings.push(`Rating found for a missing option (id ${optionId}).`);
    if (!criterionIds.includes(criterionId)) warnings.push(`Rating found for a missing criterion (id ${criterionId}).`);
  }
  for (const key of Object.keys(data.weights || {})) {
    if (!criterionIds.includes(String(key))) warnings.push(`Weight found for a missing criterion (id ${key}).`);
  }
  const expected = optionIds.length * criterionIds.length;
  const actual = Object.keys(data.ratings || {}).length;
  if (expected > 0 && actual < expected) {
    warnings.push(`${expected - actual} rating(s) missing — defaults will be used until you rate them.`);
  }
  return warnings;
}

export function loadImportedData(data) {
  const next = createEmptyDecision();
  next.title = sanitizeText(data.title || '', LIMITS.TITLE);
  next.description = sanitizeText(data.description || '', LIMITS.DESCRIPTION);
  next.options = (data.options || []).map((o) => ({
    id: o.id, // preserve original ids — ratings reference them
    name: sanitizeText(o.name || '', LIMITS.NAME),
    description: sanitizeText(o.description || '', LIMITS.ITEM_DESCRIPTION),
  }));
  next.criteria = (data.criteria || []).map((c) => ({
    id: c.id,
    name: sanitizeText(c.name || '', LIMITS.NAME),
    description: sanitizeText(c.description || '', LIMITS.ITEM_DESCRIPTION),
  }));
  next.weights = { ...(data.weights || {}) };
  // Every criterion needs an importance rating; default absent ones to 3.
  for (const c of next.criteria) {
    if (!(c.id in next.weights)) next.weights[c.id] = 3;
  }
  next.ratings = {};
  for (const [key, value] of Object.entries(data.ratings || {})) {
    const v = parseFloat(value);
    if (Number.isFinite(v)) next.ratings[key] = Math.min(5, Math.max(0, v));
  }
  next.normalizedWeights = { ...(data.normalizedWeights || {}) };
  next.timestamp = data.timestamp || null;
  replaceDecision(next);
  saveDraft();
}

/** Snapshot in the exact legacy export schema (JSON, QR). */
export function exportSnapshot() {
  return {
    title: decision.title,
    description: decision.description,
    timestamp: new Date().toISOString(),
    options: decision.options,
    criteria: decision.criteria,
    weights: decision.weights,
    normalizedWeights: decision.normalizedWeights,
    ratings: decision.ratings,
    version: SCHEMA_VERSION,
  };
}
