/* ==========================================================================
   Choicease — exporters.js
   JSON · CSV · QR (the proven legacy pipeline: deflate → base64 → 1500-char
   chunks → {"i","t","v":"1.1"}| prefix → verified QRs → composite image)
   · PDF report · PPTX deck. Report language: impeccable professional.
   ========================================================================== */

import { decision } from './state.js';
import { verdictSentence } from './narrative.js';
import { toast, safeFilename } from './ui.js';

/* -------------------------------- PDF ------------------------------------ */

const C = {
  ink: [17, 26, 40], slate: [92, 107, 126], line: [227, 231, 237],
  petrol: [14, 107, 99], good: [30, 122, 70], warn: [169, 119, 11], risk: [178, 58, 47],
};

export function exportPDF(analysis, summaryText) {
  if (!window.jspdf?.jsPDF) {
    toast('PDF library did not load. Check your connection and retry.', 'error');
    return;
  }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;
    const contentW = pageW - margin * 2;
    const { ranked, confidence, flipPoints, regret, robustness, risks } = analysis;
    let y;

    /* Header band */
    doc.setFillColor(...C.ink);
    doc.rect(0, 0, pageW, 96, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(fitLine(doc, decision.title || 'Decision analysis', contentW), margin, 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(200, 208, 218);
    doc.text(`Decision analysis · ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Prepared with Choicease`, margin, 64);
    if (decision.description) {
      doc.text(doc.splitTextToSize(decision.description, contentW).slice(0, 2), margin, 80);
    }
    y = 124;

    /* Verdict + confidence */
    doc.setTextColor(...C.petrol);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('RECOMMENDATION', margin, y);
    y += 16;
    doc.setTextColor(...C.ink);
    doc.setFontSize(14);
    const verdictLines = doc.splitTextToSize(verdictSentence(ranked), contentW);
    doc.text(verdictLines, margin, y);
    y += verdictLines.length * 17 + 6;
    const confColor = confidence.level === 'High' ? C.good : confidence.level === 'Medium' ? C.warn : C.risk;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...confColor);
    doc.text(`Confidence: ${confidence.level}`, margin, y);
    y += 18;

    /* Executive summary */
    doc.setTextColor(...C.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Executive summary', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.slate);
    for (const paragraph of (summaryText || '').split('\n\n')) {
      const lines = doc.splitTextToSize(paragraph, contentW);
      if (y + lines.length * 12 > 780) { doc.addPage(); y = 60; }
      doc.text(lines, margin, y);
      y += lines.length * 12 + 6;
    }
    y += 6;

    /* Ranking table with inline score bars */
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Option', 'Score /5', 'Fit', '']],
      body: ranked.map((r) => [
        `${r.rank}${r.isTied ? '=' : ''}`, r.option.name, r.totalScore.toFixed(2),
        `${Math.round((r.totalScore / 5) * 100)}%`, '',
      ]),
      styles: { font: 'helvetica', fontSize: 9, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
      headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 56, halign: 'right' }, 3: { cellWidth: 44, halign: 'right' }, 4: { cellWidth: 130 } },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const r = ranked[data.row.index];
          const w = (r.totalScore / 5) * (data.cell.width - 8);
          doc.setFillColor(...(data.row.index === 0 ? C.petrol : C.slate));
          doc.rect(data.cell.x + 4, data.cell.y + data.cell.height / 2 - 3, Math.max(1, w), 6, 'F');
        }
      },
    });
    y = doc.lastAutoTable.finalY + 22;

    /* Criteria & weights */
    y = pageBreak(doc, y, 120);
    sectionTitle(doc, 'Criteria and weights', margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Criterion', 'Weight', 'Description']],
      body: decision.criteria.map((c) => [c.name, `${Math.round(decision.normalizedWeights[c.id] || 0)}%`, c.description || '—']),
      styles: { font: 'helvetica', fontSize: 9, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
      headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 52, halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 22;

    /* Score matrix */
    y = pageBreak(doc, y, 140);
    sectionTitle(doc, 'Score matrix (ratings 0–5)', margin, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Option', ...decision.criteria.map((c) => c.name), 'Score']],
      body: ranked.map((r) => [
        r.option.name,
        ...decision.criteria.map((c) => (r.criteriaScores[c.id]?.rating ?? 0).toFixed(1)),
        r.totalScore.toFixed(2),
      ]),
      styles: { font: 'helvetica', fontSize: 8, textColor: C.ink, lineColor: C.line, lineWidth: 0.5, halign: 'center' },
      headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    });
    y = doc.lastAutoTable.finalY + 22;

    /* Sensitivity */
    if (flipPoints.length && ranked.length > 1) {
      y = pageBreak(doc, y, 120);
      sectionTitle(doc, 'Sensitivity — flip points', margin, y); y += 8;
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Criterion', 'Current weight', 'Flips at', 'New leader', 'Assessment']],
        body: flipPoints.map((f) => [
          f.criterionName, `${Math.round(f.currentPct)}%`,
          f.flipAt === null ? '—' : `${f.flipAt}%`, f.challenger || '—',
          f.criticality === 'critical' ? 'Critical' : f.criticality === 'moderate' ? 'Moderate' : 'Stable',
        ]),
        styles: { font: 'helvetica', fontSize: 9, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
        headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const f = flipPoints[data.row.index];
            data.cell.styles.textColor = f.criticality === 'critical' ? C.risk : f.criticality === 'moderate' ? C.warn : C.good;
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = doc.lastAutoTable.finalY + 22;
    }

    /* Alternative lenses */
    if (ranked.length > 1) {
      y = pageBreak(doc, y, 140);
      sectionTitle(doc, 'Alternative decision lenses', margin, y); y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.slate);
      const robustLine = robustness.trials > 0
        ? `Robustness: ${robustness.baseWinnerName} remains the leading option in ${Math.round(robustness.winnerHoldRate * 100)}% of ${robustness.trials} weight-perturbation scenarios (±${Math.round(robustness.jitter * 100)}%).`
        : '';
      const regretLeader = regret[0];
      const regretLine = `Minimax regret: ${regretLeader.option.name} carries the smallest worst-case regret (${regretLeader.maxRegret.toFixed(2)}${regretLeader.maxRegretCriterion ? `, driven by ${regretLeader.maxRegretCriterion}` : ''}).`;
      for (const line of [robustLine, regretLine].filter(Boolean)) {
        const wrapped = doc.splitTextToSize(line, contentW);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 12 + 4;
      }
      y += 4;
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Option', 'Worst-case regret', 'Driven by', 'Total regret']],
        body: regret.map((row) => [
          row.option.name, row.maxRegret.toFixed(2), row.maxRegretCriterion || '—', row.totalRegret.toFixed(2),
        ]),
        styles: { font: 'helvetica', fontSize: 9, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
        headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold' },
      });
      y = doc.lastAutoTable.finalY + 22;
    }

    /* Risks */
    if (risks.length) {
      y = pageBreak(doc, y, 110);
      sectionTitle(doc, 'Risks and mitigations', margin, y); y += 8;
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Criterion', 'Rating', 'Weight', 'Severity']],
        body: risks.map((r) => [
          r.criterionName, `${r.rating.toFixed(1)} (${r.ratingLabel})`, `${Math.round(r.weightPct)}%`,
          r.severity === 'high' ? 'High' : 'Medium',
        ]),
        styles: { font: 'helvetica', fontSize: 9, textColor: C.ink, lineColor: C.line, lineWidth: 0.5 },
        headStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold' },
      });
      y = doc.lastAutoTable.finalY + 22;
    }

    /* Methodology */
    y = pageBreak(doc, y, 110);
    sectionTitle(doc, 'Methodology', margin, y); y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.slate);
    const method = [
      'Weighted multi-criteria decision analysis. Importance ratings (1–5) map to geometric weights (1.0, 1.78, 3.16, 5.62, 10.0), normalized to 100%.',
      'Options rated 0–5 per criterion. Final score = Σ(rating × weight). Unrated cells default to 2.5 (the scale midpoint) and are disclosed in the confidence assessment.',
      'Sensitivity sweeps each criterion weight 0–100% (others rescaled proportionally) to locate exact flip points. Robustness perturbs all weights simultaneously across randomized scenarios.',
      'Analysis performed entirely client-side; no data was transmitted. choicease.com',
    ];
    for (const line of method) {
      const wrapped = doc.splitTextToSize(`•  ${line}`, contentW);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 11 + 3;
    }

    /* Footer */
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...C.slate);
      doc.text('Choicease — smart choices, made easy · choicease.com', margin, 818);
      doc.text(`Page ${i} of ${pages}`, pageW - margin, 818, { align: 'right' });
    }

    doc.save(safeFilename(decision.title, 'pdf'));
    toast('Board-ready PDF downloaded.');
  } catch (err) {
    console.error('PDF export failed:', err);
    toast('PDF export failed. Try the CSV or JSON export instead.', 'error');
  }
}

function sectionTitle(doc, text, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.ink);
  doc.text(text, x, y);
}

function pageBreak(doc, y, needed) {
  if (y + needed > 790) {
    doc.addPage();
    return 60;
  }
  return y;
}

function fitLine(doc, text, maxWidth) {
  const lines = doc.splitTextToSize(text, maxWidth);
  return lines.length > 1 ? `${lines[0].slice(0, -1)}…` : lines[0];
}

/* -------------------------------- PPTX ----------------------------------- */
/* Native, fully editable shapes and charts — a consultant can restyle the
   deck in a corporate theme with zero rework. Action-title style. */

const P = {
  ink: '111A28', slate: '5C6B7E', line: 'E3E7ED', paper: 'F5F6F8',
  petrol: '0E6B63', good: '1E7A46', warn: 'A9770B', risk: 'B23A2F', white: 'FFFFFF',
};

export function exportPPTX(analysis, summaryText) {
  if (!window.PptxGenJS) {
    toast('PowerPoint library did not load. Check your connection and retry.', 'error');
    return;
  }
  try {
    const pptx = buildPptx(window.PptxGenJS, analysis, summaryText);
    pptx.writeFile({ fileName: safeFilename(decision.title, 'pptx') })
      .then(() => toast('PowerPoint deck downloaded — every element is editable.'))
      .catch((err) => {
        console.error('PPTX write failed:', err);
        toast('PowerPoint export failed. The PDF report is available as an alternative.', 'error');
      });
  } catch (err) {
    console.error('PPTX export failed:', err);
    toast('PowerPoint export failed. The PDF report is available as an alternative.', 'error');
  }
}

/** Exported separately so tests can build the deck in Node. */
export function buildPptx(PptxGenJS, analysis, summaryText) {
  const { ranked, confidence, flipPoints, drivers, regret, robustness, risks, dominance } = analysis;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.defineSlideMaster({
    title: 'CHOICEASE',
    background: { color: P.white },
    objects: [
      { rect: { x: 0, y: 5.28, w: '100%', h: 0.02, fill: { color: P.line } } },
      { text: { text: 'Prepared with Choicease · choicease.com', options: { x: 0.4, y: 5.32, w: 5, h: 0.3, fontSize: 8, color: P.slate, fontFace: 'Arial' } } },
    ],
    slideNumber: { x: 9.2, y: 5.32, fontSize: 8, color: P.slate },
  });

  const t = (opts) => ({ fontFace: 'Arial', ...opts });
  const actionTitle = (slide, text) => slide.addText(text, t({
    x: 0.4, y: 0.25, w: 9.2, h: 0.75, fontSize: 17, bold: true, color: P.ink, valign: 'top',
  }));
  const tableStyle = {
    x: 0.4, w: 9.2, fontSize: 10, fontFace: 'Arial', color: P.ink,
    border: { type: 'solid', color: P.line, pt: 0.5 }, valign: 'middle', autoPage: true,
  };
  const headRow = (cells) => cells.map((text) => ({
    text, options: { bold: true, color: P.white, fill: { color: P.ink }, fontSize: 10 },
  }));
  const top = ranked[0];
  const fitPct = (s) => Math.round((s / 5) * 100);

  /* 1 — Title */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    s.addShape('rect', { x: 0, y: 0, w: 10, h: 2.2, fill: { color: P.ink } });
    s.addShape('rect', { x: 0, y: 2.2, w: 10, h: 0.06, fill: { color: P.petrol } });
    s.addText('DECISION ANALYSIS', t({ x: 0.4, y: 0.35, w: 9.2, h: 0.35, fontSize: 11, bold: true, color: '8FB8B3', charSpacing: 3 }));
    s.addText(decision.title || 'Decision analysis', t({ x: 0.4, y: 0.75, w: 9.2, h: 1.0, fontSize: 28, bold: true, color: P.white }));
    if (decision.description) {
      s.addText(decision.description, t({ x: 0.4, y: 2.5, w: 9.2, h: 0.8, fontSize: 12, color: P.slate }));
    }
    s.addText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      t({ x: 0.4, y: 3.4, w: 9.2, h: 0.4, fontSize: 11, color: P.slate }));
    s.addText(`${decision.options.length} options evaluated against ${decision.criteria.length} weighted criteria`,
      t({ x: 0.4, y: 3.8, w: 9.2, h: 0.4, fontSize: 11, color: P.slate }));
  }

  /* 2 — Executive summary */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, verdictSentence(ranked));
    const confColor = confidence.level === 'High' ? P.good : confidence.level === 'Medium' ? P.warn : P.risk;
    s.addText([
      { text: 'Confidence: ', options: { bold: true, color: P.ink } },
      { text: confidence.level, options: { bold: true, color: confColor } },
    ], t({ x: 0.4, y: 1.05, w: 9.2, h: 0.35, fontSize: 12 }));
    const bullets = (summaryText || '').split('\n\n').slice(1).map((text) => ({
      text, options: { bullet: { code: '2022' }, fontSize: 11.5, color: P.ink, paraSpaceAfter: 8 },
    }));
    s.addText(bullets, t({ x: 0.4, y: 1.5, w: 9.2, h: 3.6, valign: 'top' }));
  }

  /* 3 — Methodology: criteria & weights */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, `The decision rests on ${decision.criteria.length} weighted criteria; weights derive from stated importance, normalized to 100%`);
    const rows = [headRow(['Criterion', 'Importance (1–5)', 'Weight', 'Description'])];
    for (const c of decision.criteria) {
      rows.push([
        { text: c.name, options: { bold: true } },
        { text: String(decision.weights[c.id] || 3), options: { align: 'center' } },
        { text: `${Math.round(decision.normalizedWeights[c.id] || 0)}%`, options: { align: 'center', bold: true, color: P.petrol } },
        { text: c.description || '—', options: { color: P.slate } },
      ]);
    }
    s.addTable(rows, { ...tableStyle, y: 1.2, colW: [2.6, 1.4, 1.0, 4.2], rowH: 0.32 });
  }

  /* 4 — Ranking (native bar chart) */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, top.isTied
      ? 'The leading options are statistically tied under current weights'
      : `${top.option.name} leads at ${fitPct(top.totalScore)}% fit${ranked[1] ? `, ${(top.totalScore - ranked[1].totalScore).toFixed(2)} points ahead of ${ranked[1].option.name}` : ''}`);
    const ordered = [...ranked].reverse(); // bar charts plot bottom-up
    s.addChart('bar', [{
      name: 'Weighted score',
      labels: ordered.map((r) => r.option.name),
      values: ordered.map((r) => Number(r.totalScore.toFixed(2))),
    }], {
      x: 0.4, y: 1.15, w: 9.2, h: 3.9,
      barDir: 'bar', chartColors: [P.petrol],
      valAxisMinVal: 0, valAxisMaxVal: 5, valAxisMajorUnit: 1,
      showValue: true, dataLabelColor: P.ink, dataLabelFontSize: 10, dataLabelFontFace: 'Arial',
      catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
      catAxisLabelFontFace: 'Arial', valAxisLabelFontFace: 'Arial',
      showLegend: false, showTitle: false,
    });
  }

  /* 5 — Score matrix */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, 'Performance matrix: ratings on the 0–5 scale, shaded by strength');
    const rows = [headRow(['Option', ...decision.criteria.map((c) => c.name), 'Score'])];
    for (const r of ranked) {
      rows.push([
        { text: r.option.name, options: { bold: r.rank === 1 } },
        ...decision.criteria.map((c) => {
          const rating = r.criteriaScores[c.id]?.rating ?? 0;
          return { text: rating.toFixed(1), options: { align: 'center', fill: { color: heatHex(rating) } } };
        }),
        { text: r.totalScore.toFixed(2), options: { align: 'center', bold: true } },
      ]);
    }
    s.addTable(rows, { ...tableStyle, y: 1.2, rowH: 0.32, fontSize: 9 });
  }

  /* 6 — Key drivers */
  if (ranked.length > 1 && drivers.length) {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    const lead = drivers.find((d) => d.delta > 0);
    actionTitle(s, lead
      ? `${lead.criterionName} is the decisive factor; positive bars favor ${top.option.name} over ${ranked[1].option.name}`
      : `No single criterion decisively separates ${top.option.name} and ${ranked[1].option.name}`);
    const ordered = [...drivers].reverse();
    s.addChart('bar', [{
      name: 'Weighted advantage',
      labels: ordered.map((d) => d.criterionName),
      values: ordered.map((d) => Number(d.delta.toFixed(3))),
    }], {
      x: 0.4, y: 1.15, w: 9.2, h: 3.9,
      barDir: 'bar', chartColors: [P.petrol],
      showValue: true, dataLabelColor: P.ink, dataLabelFontSize: 9, dataLabelFontFace: 'Arial',
      catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
      catAxisLabelFontFace: 'Arial', valAxisLabelFontFace: 'Arial',
      showLegend: false, showTitle: false,
    });
  }

  /* 7 — Sensitivity */
  if (flipPoints.length && ranked.length > 1) {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    const nearest = flipPoints.find((f) => f.distance !== null);
    actionTitle(s, nearest
      ? `The recommendation flips if "${nearest.criterionName}" moves from ${Math.round(nearest.currentPct)}% to ${nearest.flipAt}% weight — all other criteria are ${flipPoints.every((f) => f.distance === null || f.distance > 10) ? 'stable' : 'listed below'}`
      : 'The recommendation is structurally robust: no single-criterion weight change overturns it');
    const rows = [headRow(['Criterion', 'Current weight', 'Flips at', 'New leader', 'Assessment'])];
    for (const f of flipPoints) {
      const color = f.criticality === 'critical' ? P.risk : f.criticality === 'moderate' ? P.warn : P.good;
      rows.push([
        { text: f.criterionName },
        { text: `${Math.round(f.currentPct)}%`, options: { align: 'center' } },
        { text: f.flipAt === null ? '—' : `${f.flipAt}%`, options: { align: 'center' } },
        { text: f.challenger || '—' },
        { text: f.criticality === 'critical' ? 'Critical' : f.criticality === 'moderate' ? 'Moderate' : 'Stable', options: { bold: true, color, align: 'center' } },
      ]);
    }
    s.addTable(rows, { ...tableStyle, y: 1.2, rowH: 0.32 });
  }

  /* 8 — Alternative lenses */
  if (ranked.length > 1) {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    const regretLeader = regret[0];
    const agrees = regretLeader.option.id === top.option.id;
    actionTitle(s, agrees
      ? `Alternative decision lenses corroborate the recommendation: ${top.option.name} also minimizes worst-case regret and holds in ${Math.round(robustness.winnerHoldRate * 100)}% of weight scenarios`
      : `Caveat: a minimax-regret lens favors ${regretLeader.option.name}; the recommendation trades downside protection for higher expected fit`);
    const rows = [headRow(['Option', 'Worst-case regret', 'Driven by', 'Total regret', 'Robustness win share'])];
    const shareByOption = Object.fromEntries(robustness.winShare.map((w) => [w.option.id, w.share]));
    for (const row of regret) {
      rows.push([
        { text: row.option.name },
        { text: row.maxRegret.toFixed(2), options: { align: 'center' } },
        { text: row.maxRegretCriterion || '—' },
        { text: row.totalRegret.toFixed(2), options: { align: 'center' } },
        { text: `${Math.round((shareByOption[row.option.id] || 0) * 100)}%`, options: { align: 'center', bold: true } },
      ]);
    }
    s.addTable(rows, { ...tableStyle, y: 1.2, rowH: 0.32 });
    const notes = [];
    if (dominance.length) {
      notes.push(`Dominated options (safe to eliminate under any weighting): ${dominance.map((d) => `${d.dominated} (by ${d.by})`).join('; ')}.`);
    }
    notes.push(`Robustness basis: ${robustness.trials} scenarios, each criterion weight independently perturbed by up to ±${Math.round(robustness.jitter * 100)}%.`);
    s.addText(notes.map((text) => ({ text, options: { bullet: { code: '2022' }, fontSize: 10, color: P.slate, paraSpaceAfter: 4 } })),
      t({ x: 0.4, y: 4.15, w: 9.2, h: 1.0, valign: 'top' }));
  }

  /* 9 — Risks & mitigations */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, risks.length
      ? `${top.option.name} carries ${risks.length} material weakness${risks.length > 1 ? 'es' : ''}; mitigation is advised before committing`
      : `${top.option.name} shows no material weaknesses across the weighted criteria`);
    if (risks.length) {
      const rows = [headRow(['Criterion', 'Rating', 'Weight', 'Severity', 'Suggested mitigation'])];
      for (const r of risks) {
        rows.push([
          { text: r.criterionName, options: { bold: true } },
          { text: `${r.rating.toFixed(1)} (${r.ratingLabel})`, options: { align: 'center' } },
          { text: `${Math.round(r.weightPct)}%`, options: { align: 'center' } },
          { text: r.severity === 'high' ? 'High' : 'Medium', options: { bold: true, align: 'center', color: r.severity === 'high' ? P.risk : P.warn } },
          { text: `Validate ${r.criterionName.toLowerCase()} before final commitment; negotiate safeguards or contingencies where possible.`, options: { color: P.slate, fontSize: 9 } },
        ]);
      }
      s.addTable(rows, { ...tableStyle, y: 1.2, rowH: 0.4 });
    } else {
      s.addText('The recommended option rates at least "Fair" on every criterion carrying material weight.',
        t({ x: 0.4, y: 1.4, w: 9.2, h: 0.5, fontSize: 12, color: P.slate }));
    }
  }

  /* 10 — Conditions that change the answer / next steps */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, 'Conditions under which the recommendation changes, and suggested next steps');
    const conditions = flipPoints
      .filter((f) => f.distance !== null)
      .slice(0, 4)
      .map((f) => `"${f.criterionName}" weight reaches ${f.flipAt}% (currently ${Math.round(f.currentPct)}%) → leader becomes ${f.challenger}.`);
    if (!conditions.length) conditions.push('No single-criterion weight change overturns the recommendation.');
    const steps = [
      'Validate the ratings that carry the most weight, particularly any left at the 2.5 default.',
      'Pressure-test the flip conditions above with stakeholders who own those criteria.',
      risks.length ? `Address the ${risks[0].criterionName} weakness before final commitment.` : 'Proceed to commitment; document the decision rationale.',
    ];
    s.addText([
      { text: 'The answer changes if:', options: { bold: true, fontSize: 12, color: P.ink, paraSpaceAfter: 6 } },
      ...conditions.map((text) => ({ text, options: { bullet: { code: '2022' }, fontSize: 11, color: P.ink, paraSpaceAfter: 4 } })),
      { text: ' ', options: { fontSize: 6 } },
      { text: 'Recommended next steps:', options: { bold: true, fontSize: 12, color: P.ink, paraSpaceAfter: 6 } },
      ...steps.map((text) => ({ text, options: { bullet: { code: '2022' }, fontSize: 11, color: P.ink, paraSpaceAfter: 4 } })),
    ], t({ x: 0.4, y: 1.2, w: 9.2, h: 3.9, valign: 'top' }));
  }

  /* 11 — Appendix: full data */
  {
    const s = pptx.addSlide({ masterName: 'CHOICEASE' });
    actionTitle(s, 'Appendix — full evaluation data');
    const rows = [headRow(['Option', ...decision.criteria.map((c) => `${c.name} (${Math.round(decision.normalizedWeights[c.id] || 0)}%)`), 'Weighted score'])];
    for (const r of ranked) {
      rows.push([
        { text: `${r.rank}. ${r.option.name}` },
        ...decision.criteria.map((c) => ({ text: (r.criteriaScores[c.id]?.rating ?? 0).toFixed(1), options: { align: 'center' } })),
        { text: r.totalScore.toFixed(2), options: { align: 'center', bold: true } },
      ]);
    }
    s.addTable(rows, { ...tableStyle, y: 1.2, rowH: 0.3, fontSize: 8.5 });
  }

  return pptx;
}

function heatHex(rating) {
  const t = Math.min(1, Math.max(0, rating / 5));
  if (t < 0.5) {
    const k = 1 - t / 0.5; // stronger red toward 0
    return blend('FFFFFF', 'F3DBD8', k);
  }
  const k = (t - 0.5) / 0.5;
  return blend('FFFFFF', 'D9EADF', k);
}

function blend(hexA, hexB, k) {
  const a = [0, 2, 4].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const b = [0, 2, 4].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  return a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}
