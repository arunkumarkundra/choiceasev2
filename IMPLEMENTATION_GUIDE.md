# Choicease v2.1 — Implementation Guide

The complete rebuild, now covering every functionality in the agreed spec plus your
ten decisions. Static site, zero build step, deploys straight to GitHub Pages.

## 1. Your ten decisions — where each landed

1. **Tab navigation** — back always clickable; forward tabs greyed with
   `aria-disabled` + tooltip until prerequisites are met (title → ≥2 options → ≥2
   criteria). Weights/ratings never hard-gate; defaults are disclosed instead.
2. **Default rating 2.5** — one constant (`engine.js: DEFAULT_RATING`), used by
   scoring, sliders' prefill, confidence-coverage disclosure, CSV/PDF/PPTX
   methodology text. The three-way legacy inconsistency is gone.
3. **Weights pie demoted** — now a clean horizontal weight strip inside the
   Executive Summary; the full breakdown remains in PDF/PPTX tables.
4. **Share links** — `choicease.com/#d=<deflate+base64url>`. The sample decision
   compresses to an 884-char URL; even 10 options × 5 criteria is ~1.1k chars.
   Opening the link imports the decision instantly (fragment never reaches a
   server → privacy intact). QR is retained in the **Save** menu (legacy format,
   old exports import forever) and the share image now embeds a small **QR of the
   link** — one tiny code instead of giant data-QRs.
5. **Decision Gallery** — yes, fully backend-free: `gallery.html` renders
   `gallery.json` from the repo. You curate by committing an entry (title, story,
   winner, share link). Submissions arrive via the X tag or email. It ships with
   the sample decision as the first live entry.
6. **Sample decision** — "Choosing our family car" (4 options × 5 criteria),
   one tap on step 1, lands straight on results.
7. **Beta badge** — retired.
8. **Advanced analytics — all in.** Order: Executive summary → Key drivers
   (tornado) → Full ranking → Performance heatmap → Sensitivity & flip points
   (with critical/moderate/stable badges) → What-if studio → **Alternative
   lenses** (minimax regret with per-option worst-case table; interactive
   satisficing bar; dominance/Pareto elimination; robustness via 500 seeded
   weight-perturbation scenarios) → Risks & mitigations → Method. Charts build
   lazily on first open. "Export & Share" accordion removed (merged into actions).
9. **PPTX** — 11 slides covering every advanced section, all **native editable
   shapes and charts** (verified by building a real 435 KB deck in the test
   suite): Title · Executive summary · Methodology · Ranking (bar chart) ·
   Score matrix · Key drivers (± bar chart) · Sensitivity table · Alternative
   lenses · Risks & mitigations · Conditions that change the answer / next steps
   · Appendix data. Action-title style throughout.
10. **Voice** — casual layer is playful ("🏆 Honda City takes it!", medal
    leaderboard, friendly callouts like "the top two are within a whisker");
    advanced analytics, PDF, and PPTX are impeccable consulting prose.

## 2. Everything else from the functional spec

- **Bias alerts** restored: too-few-options (<3), cognitive overload (>7
  criteria), equal-weight nudge (all criteria rated the same).
- **No upper limits** on options/criteria; duplicate checks (case-insensitive);
  **edit-in-place** for options and criteria; min 2 criteria enforced.
- **AI help, free forever**: Helper GPT links per step + **context-aware copy
  prompts** that embed the user's actual decision (work in ChatGPT/Claude/
  Gemini) + an offline **starter-criteria library** — the app recognizes the
  decision type from the title (job offer, vendor, purchase, hiring, relocation,
  build-vs-buy) and offers one-tap criteria chips.
- **QR fixed** by reverting to the proven stack (qrcodejs 1.0.0 + jsQR 1.4.0 +
  pako 2.1.0) and porting your hard-won pipeline: sequential generation with a
  breather between codes, **each QR scanned back with jsQR before acceptance**,
  legacy chunk format byte-identical (round-trip regression-tested), composite
  image with title header, Part i/t labels, timestamp, import instructions, and
  logo (graceful fallback if missing).
- **Share image** rebuilt to the live app's full vision: branded results card
  (medal leaderboard, bars, 🏆) + separator strip + link-QR + instructions —
  one self-contained PNG. Native share sheet attaches it; fallback downloads it
  and copies the text.
- **#ChoiceaseDecision** everywhere it belongs: step-1 search link, results-page
  nudge, share text, QR footer, How-it-works, Gallery submission path.
- **Draft autosave** with resume banner; **hash import** runs before draft offer
  on boot (with a retry loop while pako loads).
- **Results header** shows title, description, and generated date/time; ties get
  a visible badge and shared ranks.

## 3. File structure

```
choicease/
├── index.html            # Shell: stepper, 6 steps, modals
├── gallery.html          # Curated community gallery (static)
├── gallery.json          # Gallery entries — edit + commit to curate
├── privacy.html · terms.html
├── css/styles.css        # Design system + all components
├── js/
│   ├── app.js            # Wiring only; boot = fragment import → draft → normal
│   ├── state.js          # Store, sanitization, autosave, edit, import validation
│   ├── engine.js         # PURE math incl. regret/satisficing/dominance/robustness
│   ├── narrative.js      # PURE text — casual voice + pro voice
│   ├── assist.js         # AI prompts, starter criteria, sample decision
│   ├── link.js           # #d= fragment encode/decode (base64url)
│   ├── qr.js             # qrcodejs generation + jsQR self-verification
│   ├── wizard.js         # Steps 1–5, gating, editing, bias alerts, chips
│   ├── results.js        # Casual layer + advanced accordions
│   ├── share.js          # Share image, link, native/X/WhatsApp, tag
│   ├── exporters.js      # JSON · CSV · QR · PDF · PPTX (buildPptx testable)
│   └── importers.js      # JSON + QR import (legacy compatible)
├── tests/                # 4 suites — see §5
├── package.json          # Dev-only (tests). Site needs no build.
└── images/               # ← keep your existing folder (favicons, og, logo)
```

Pinned CDN libraries (deferred, every call guarded): pako 2.1.0 · qrcodejs 1.0.0
· jsQR 1.4.0 · jspdf 2.5.1 + autotable 3.8.2 · pptxgenjs 3.12.0.

## 4. Deploy

Same as before: copy files over the repo (keep `images/`, `CNAME`, `robots.txt`,
`sitemap.xml`, `LICENSE`), delete the old `script.js` / `ext-results.js` / root
`styles.css`, push. Local preview: `python3 -m http.server 8000` (ES modules
need a server, not `file://`).

## 5. Verification performed

- **Engine (16/16):** legacy-identical weight math and scores, tie ranks,
  2.5 default, flip-point correctness, what-if renormalization, regret vs manual
  calculation, satisficing pass/fail boundaries, dominance detection on a
  strictly-worse clone, seeded-deterministic robustness with shares summing to 1.
- **QR round trip:** 4-chunk and single-chunk lossless against pako 2.1.0,
  shuffled order, missing-chunk error message.
- **Link + PPTX:** lossless #d= round trip on the real sample (884 chars),
  base64url-safe payload, soft-fail on garbage, 10-option size check; PPTX deck
  built in Node — valid ZIP, 435 KB, charts and tables included.
- **DOM end-to-end:** boots real index.html; asserts tab gating (blocked
  without title / with 1 criterion), duplicate rejection, edit-in-place, all
  three bias alerts appearing and clearing, 2.5 slider prefill, playful winner
  line, leaderboard, callouts, advanced hidden by default then all 9 panels
  building, satisficing slider, live what-if, 5-format Save menu, share text
  containing the live link and #ChoiceaseDecision, zero Reddit references,
  sample decision landing on results.

## 6. Manual QA (10 minutes, real browser — the parts Node can't prove)

1. Export a QR from a decision with long descriptions (force 2+ codes); re-import
   the PNG. Then import one of your **old** QR exports.
2. Copy link on desktop → open on your phone → the decision appears live.
3. Tap Share on a phone: the sheet should carry the image + text; post to
   WhatsApp and X and check the tag renders.
4. Download the share image — check the card, separator, QR, and instructions.
5. Open the PPTX in PowerPoint: click a chart bar and a table cell to confirm
   everything is natively editable; apply your corporate theme.
6. Gallery page: open the sample entry's "Open it live" link.
7. Mobile pass: rating sliders, accordion touch targets, what-if drag.
