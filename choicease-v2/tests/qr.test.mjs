/* QR chunk format round-trip test — verifies byte-for-byte compatibility
   with the legacy Choicease QR format: {"i","t","v":"1.1"}|<base64 chunk>. */
import assert from 'node:assert/strict';
import * as pako from 'pako';

globalThis.window = { pako };

const { u8ToBase64 } = await import('../js/exporters.js');
const { reassembleQRData } = await import('../js/importers.js');

// Build a realistic snapshot (long descriptions to force multiple chunks).
const snapshot = {
  title: 'Site selection for the new distribution hub',
  description: 'x'.repeat(400),
  timestamp: new Date().toISOString(),
  options: Array.from({ length: 8 }, (_, i) => ({
    id: 1755501230000 + i,
    name: `Location ${i + 1}`,
    description: Array.from({length: 40}, () => Math.random().toString(36).slice(2, 8)).join(' '),
  })),
  criteria: Array.from({ length: 8 }, (_, i) => ({
    id: 1755501240000 + i,
    name: `Criterion ${i + 1}`,
    description: Array.from({length: 35}, () => Math.random().toString(36).slice(2, 8)).join(' '),
  })),
  weights: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [1755501240000 + i, (i % 5) + 1])),
  normalizedWeights: {},
  ratings: {},
  version: '1.1',
};
for (const o of snapshot.options) {
  for (const c of snapshot.criteria) {
    snapshot.ratings[`${o.id}-${c.id}`] = Math.round(Math.random() * 50) / 10;
  }
}

// EXPORT SIDE — identical to exporters.exportQR internals.
const json = JSON.stringify(snapshot);
const compressed = pako.deflate(json);
const base64 = u8ToBase64(compressed);
const CHUNK = 1500;
const chunks = [];
for (let i = 0; i < base64.length; i += CHUNK) chunks.push(base64.slice(i, i + CHUNK));
assert.ok(chunks.length >= 2, `test should exercise multi-chunk path (got ${chunks.length})`);
const payloads = chunks.map((chunk, i) => `${JSON.stringify({ i, t: chunks.length, v: '1.1' })}|${chunk}`);
for (const p of payloads) assert.ok(p.length <= 2800, 'each payload fits legacy QR budget');

// IMPORT SIDE — shuffled order, as jsQR may find codes in any order.
const shuffled = [...payloads].reverse();
const restored = JSON.parse(reassembleQRData(shuffled));
assert.deepEqual(restored, snapshot, 'multi-chunk round trip is lossless');

// Single-chunk round trip.
const small = { ...snapshot, options: snapshot.options.slice(0, 2), criteria: snapshot.criteria.slice(0, 2), ratings: {}, description: '' };
const smallB64 = u8ToBase64(pako.deflate(JSON.stringify(small)));
assert.ok(smallB64.length <= CHUNK, 'small snapshot fits one chunk');
const singlePayload = [`${JSON.stringify({ i: 0, t: 1, v: '1.1' })}|${smallB64}`];
assert.deepEqual(JSON.parse(reassembleQRData(singlePayload)), small, 'single-chunk round trip is lossless');

// Missing chunk raises a clear error.
assert.throws(() => reassembleQRData([payloads[0]]), /Missing chunks/, 'missing chunk detected');

console.log(`QR ROUND-TRIP TESTS PASSED (chunks: ${chunks.length}, json: ${json.length}B → base64: ${base64.length}B)`);
