# Choicease v2 — Implementation Guide

A ground-up rebuild of Choicease: same proven decision engine, zero tech debt, a
boardroom-grade interface, and outputs written the way a consulting deliverable reads.

---

## 1. What changed and why

### Product (mapped to the Magical App principles)
| Principle | How v2 applies it |
|---|---|
| Answers, not numbers | Results now open with a **Verdict Card**: one recommendation sentence, confidence band, lead margin, and the key trade-off. Tables sit *beneath* the answer. |
| Progressive disclosure | Answer → drivers → evidence. Six collapsible panels: Why this wins, Full ranking, Score matrix, Sensitivity, What-if, Method. |
| Honest about uncertainty | Confidence (High/Medium/Low) is computed from winning margin, distance to the nearest flip point, and rating coverage — with a one-line reason, always shown. |
| Sensitivity built-in | Exact flip points per criterion ("flips at 34% to Vendor B"), plus a tornado chart of drivers and live what-if sliders (<1 s recalculation). |
| Transparency builds trust | Method & assumptions panel states the exact math; the PDF/CSV include the full calculation trail. |
| Counter-argument display | The trade-off line always states the strongest case *against* the recommendation. |
| It already knew | Draft autosave (local-only): reopen the app and resume where you left off. |
| Beautiful restraint | One card, one answer; color reserved for meaning (green/amber/red); numerals in mono. |

*Deliberately not adopted* (out of scope for a private, client-side tool): external
data feeds, ERP/CRM inference, Monte Carlo simulation, and cross-session learning.
The document's UI and output principles are applied in full.

### Pending tasks — all completed
- **Sharing rebuilt.** Reddit removed everywhere (share flow, step copy, How-it-works modal, import hints). New flow: one-tap native share sheet (Web Share API) with **X and WhatsApp** as first-class buttons, plus LinkedIn and copy. Share text is engaging and result-specific, generated from the live analysis.
- **Professional, world-class interface.** New design system: ink navy / slate / petrol palette, Schibsted Grotesk display + Inter body + IBM Plex Mono numerals, calm paper background, full keyboard focus states, reduced-motion support, mobile-first responsive.
- **MBB-level outputs.** Verdict-first executive summary in consulting prose (copyable with one click), a redesigned PDF report (header band, recommendation, exec summary, ranked table with score bars, weights, score matrix, flip-point table, methodology, page numbers), structured CSV, and the sensitivity/driver analytics above.
- **Tech debt eliminated.** One 8,000-line `script.js` + a parallel `ext-results.js` implementation (two scoring code paths, inconsistent default ratings, string-built inline-styled HTML, global state) replaced by nine small ES modules with a single pure engine, one source of truth, escaped rendering, and an automated test suite.

### Compatibility guarantees (no new errors)
- **Scoring is bit-identical**: same geometric importance→weight mapping (1, 1.78, 3.16, 5.62, 10), same normalization, same Σ(rating × weight) formula — verified by unit test against manual calculation.
- **JSON schema unchanged** (`version: "1.1"`): every old export imports; every new export would open in the old app.
- **QR format unchanged**: `{"i","t","v":"1.1"}|<base64(deflate(json))>` chunks of ≤1500 chars, stacked vertically — old QR images import into v2 and vice-versa (round-trip verified in tests, including shuffled and missing-chunk cases).
- One legacy inconsistency was standardized: the old code used default rating 2 in one code path and 3 in another for unrated cells. v2 uses **3 (Good)** everywhere, matching the results view users actually saw, and discloses defaulted cells in the confidence note.

---

## 2. File structure

```
choicease/
├── index.html                 # App shell: stepper, 6 step sections, modals
├── privacy.html               # Restyled, same substance
├── terms.html                 # Restyled, same substance
├── css/
│   └── styles.css             # Design tokens + all components (one file, sectioned)
├── js/
│   ├── app.js                 # Entry: wiring only — no business logic
│   ├── state.js               # Single store, sanitization, autosave, import validation
│   ├── engine.js              # PURE math: weights, scores, ranks, confidence,
│   │                          #   flip points, drivers, risks (no DOM — unit-tested)
│   ├── narrative.js           # PURE text: verdict sentence, trade-off, exec summary
│   ├── wizard.js              # Steps 1–5 rendering + interaction
│   ├── results.js             # Step 6: Verdict Card + drill-down panels + what-if
│   ├── share.js               # Native share, X, WhatsApp, LinkedIn, copy
│   ├── exporters.js           # JSON / CSV / PDF (jsPDF+autotable) / QR (legacy format)
│   └── importers.js           # JSON + QR import (backward compatible)
├── tests/
│   ├── engine.test.mjs        # 10 assertions incl. legacy-data compatibility
│   ├── qr.test.mjs            # Lossless QR round trip vs pako 2.1.0 (the CDN pin)
│   └── dom.test.mjs           # jsdom smoke test of the full 6-step flow
├── package.json               # Dev-only (tests); the site itself has NO build step
├── README.md
└── images/                    # ← copy your existing folder (favicons, og-image, logo)
```

**Dependency policy.** No framework, no bundler, no build step — ES modules served
as-is, which is the most robust possible deployment on GitHub Pages. Four pinned CDN
libraries load deferred and are used only for export/import: `pako 2.1.0` (QR
compression, same as before), `qrcode 1.5.4` (generation), `jsQR 1.4.0` (scanning,
same as before), `jspdf 2.5.1` + `autotable 3.8.2` (reports). Every library call is
guarded — if a CDN fails, the app degrades gracefully with a clear toast instead of
breaking.

---

## 3. Deploying to GitHub Pages

1. In your repo, keep (or create) an `images/` folder with your existing favicons,
   `og-image.png`, and logo — the new code references the same paths.
2. Replace the old files with this package. Delete: old `script.js`,
   `ext-results.js`, old `styles.css` at root, and any `script (1).js` / `styles (1).css` duplicates.
3. Commit and push to the branch GitHub Pages serves (`main`, or `gh-pages`).
   No Actions workflow, no build — Pages serves the files directly.
4. Keep `CNAME` (choicease.com), `robots.txt`, `sitemap.xml`, `LICENSE`,
   `CONTRIBUTING.md` as they are.
5. Hard-refresh after deploy (Ctrl/Cmd-Shift-R) to bypass cached CSS/JS.

**Local preview:** `python3 -m http.server 8000` in the repo root, then open
`http://localhost:8000`. (A server is needed because the app uses ES modules;
double-clicking `index.html` won't load them under `file://`.)

**Run the tests** (optional, dev machine only):
```bash
npm install        # installs pako@2.1.0 + jsdom for tests only
node tests/engine.test.mjs
node tests/qr.test.mjs
node tests/dom.test.mjs
```

---

## 4. Verification performed before hand-off

- `esbuild --bundle` over all modules: no syntax or import errors.
- Engine suite (10/10): legacy weight mapping, manual-calc score match, tie ranks,
  default-rating behavior, flip-point correctness (winner verified to actually change
  at the reported weight), what-if renormalization, confidence/driver/risk shapes,
  single-option edge case, legacy string-keyed data.
- QR suite: multi-chunk (4-chunk) and single-chunk lossless round trips against
  pako 2.1.0 — the exact CDN version — with shuffled chunk order and a
  missing-chunk error case.
- jsdom end-to-end: boots the real `index.html`, drives all six steps, asserts the
  verdict, all six panels, live what-if updates, export menu, share text, draft
  autosave, and modal behavior — and asserts **zero Reddit references** remain.

## 5. Manual QA checklist for you (5 minutes, in a real browser)

1. Complete a 3-option × 3-criteria decision end-to-end; confirm the verdict reads well.
2. Drag a what-if slider until the "recommendation flips" alert appears; press Reset.
3. Export PDF, CSV, JSON, QR; re-import the QR image and the JSON.
4. **Import one of your old QR exports and an old JSON file** — both should load.
5. Tap Share on a phone (native sheet), then X and WhatsApp buttons on desktop.
6. Reload mid-flow — the "Resume" banner should offer your draft.

## 6. Notes and options

- The **Helper GPT** links were removed with the rest of the promotional clutter. If
  you want it back, the right home is one line in the How-it-works modal — say the
  word and where, and it's a two-line change.
- The old app loaded `html2canvas` and `pptxgenjs` but shipped no working feature on
  them; they are dropped. A PPTX export can be added later as its own module.
- White-label reporting (per your Terms) has a natural seam: brand strings live in
  `share.js` (APP_URL) and `exporters.js` (PDF footer/header) only.
