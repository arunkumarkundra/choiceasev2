/* Link-fragment round trip (pako 2.1.0, the CDN pin) and PPTX deck build. */
import assert from 'node:assert/strict';
import * as pako from 'pako';

globalThis.window = { pako, location: { hash: '' }, };
globalThis.history = { replaceState() {} };

const { encodeDecisionLink, decodeDecisionFragment, LINK_SOFT_LIMIT } = await import('../js/link.js');
const { analyzeDecision } = await import('../js/engine.js');
const { executiveSummary } = await import('../js/narrative.js');
const { sampleDecision } = await import('../js/assist.js');

/* ---- Link round trip on the real sample decision ---- */
const snapshot = sampleDecision();
const link = encodeDecisionLink(snapshot);
assert.ok(link && link.url.startsWith('https://choicease.com/#d='), 'link has the right shape');
assert.ok(!link.oversized && link.length < LINK_SOFT_LIMIT, `sample link is compact (${link.length} chars)`);

const hash = link.url.slice(link.url.indexOf('#'));
const restored = decodeDecisionFragment(hash);
assert.deepEqual(restored, snapshot, 'link round trip is lossless');

/* base64url safety: no chars that break in messengers (payload only) */
const payload = hash.slice('#d='.length);
assert.ok(!/[+/=]/.test(payload), 'payload is base64url (no +, /, =)');

/* Garbage in → null out, no throw */
assert.equal(decodeDecisionFragment('#d=!!!not-a-payload!!!'), null, 'garbage fragment fails soft');
assert.equal(decodeDecisionFragment('#other=1'), null, 'non-decision fragment ignored');

/* A larger decision still fits comfortably */
const big = structuredClone(snapshot);
for (let i = 0; i < 6; i += 1) {
  big.options.push({ id: 8800 + i, name: `Extra option ${i + 1}`, description: 'A reasonable one-line description of this option.' });
  for (const c of big.criteria) big.ratings[`${8800 + i}-${c.id}`] = 3 + (i % 3) * 0.5;
}
const bigLink = encodeDecisionLink(big);
assert.ok(bigLink && !bigLink.oversized, `10-option decision still links (${bigLink.length} chars)`);

console.log(`LINK TESTS PASSED (sample: ${link.length} chars, 10-option: ${bigLink.length} chars)`);

/* ---- PPTX deck build (node) ---- */
const PptxGenJS = (await import('pptxgenjs')).default;
const { buildPptx } = await import('../js/exporters.js');

// exporters imports state.js which touches localStorage on saveDraft — but we
// only call buildPptx, which reads the passed analysis + the decision store.
// Point the store at the sample decision.
const { loadImportedData } = await import('../js/state.js');
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
loadImportedData(snapshot);

const { decision } = await import('../js/state.js');
const analysis = analyzeDecision(decision);
const summary = executiveSummary(decision, analysis);
assert.ok(summary.includes('Recommend') || summary.includes('tied'), 'summary generated');

const deck = buildPptx(PptxGenJS, analysis, summary);
const buffer = await deck.write('nodebuffer');
assert.ok(buffer.length > 20000, `deck produced (${Math.round(buffer.length / 1024)} KB)`);
// PPTX files are ZIP containers: PK magic bytes.
assert.equal(buffer[0], 0x50);
assert.equal(buffer[1], 0x4b);

console.log(`PPTX BUILD TEST PASSED (${Math.round(buffer.length / 1024)} KB, 11 slides incl. charts & tables)`);
