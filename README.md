# Choicease — Smart Choices, Made Easy

Structured decision analysis in the browser: weigh options against criteria and get a
defensible recommendation with confidence, drivers, flip points, and live what-if
analysis. Free, private, no sign-up — everything runs client-side.

**Live:** https://choicease.com

## Features
- Six-step flow: Frame → Options → Criteria → Weights → Ratings → Verdict
- Verdict-first results: recommendation sentence, confidence grade, key trade-off
- Analytics: driver (tornado) chart, score matrix, exact flip points, what-if sliders
- Advanced analytics: drivers, flip points, what-if, regret minimization, satisficing, dominance, robustness
- Exports: board-ready PDF, native-editable PPTX deck, CSV, JSON, QR image
- Sharing: one-tap link (#d= URLs), self-contained results image with QR, native sheet, X (#ChoiceaseDecision), WhatsApp
- 100% private: no backend, no analytics, no tracking; drafts autosave locally

## Development
Static site, no build step.
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
Tests (dev only): `npm install && npm test`

## Structure
`index.html` shell · `css/styles.css` design system · `js/` ES modules
(`engine.js` is the pure, unit-tested scoring core) · `tests/` node test suites.

## License
GNU GPL v3. The Choicease name, logo, and domain are trademarks of the maintainers
and are not licensed under GPL. Contact: contact@choicease.com
