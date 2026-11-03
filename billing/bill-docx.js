/* ============================================================
   HARMONY FLOORING — Weekly Bill → Word (.docx)
   Needs the "docx" library:
     Browser: <script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"></script>
     Node:    require('docx')
   Format: green day banners, light-gray job headers with bold left
   border, notes in soft yellow, charge lines before pay lines.
   ============================================================ */
(function (root) {
  'use strict';
  const GREEN = '2C5F2E', GRAY = 'ECEFE9', BORDER = '2C5F2E', YELLOW = 'FFF6D6', FLAG = 'FDE2E1', ANSWERED = 'E8F5E9';
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rateStr = (l) => (l.rate === null || l.rate === undefined) ? (l.qty === null || l.qty === undefined ? 'Flat rate' : '') : `$${Number(l.rate).toFixed(2)}${l.unit ? '/' + l.unit.replace(/s$/, '') : ''}`;
  const qtyStr = (l) => (l.qty === null || l.qty === undefined) ? '—' : `${l.qty}${l.unit ? ' ' + (l.qty === 1 ? l.unit.replace(/s$/, '') : l.unit) : ''}`;

  function buildBillDocument(week, D) {
    const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType } = D;
    const W = 9360; // content width (twips) on US Letter, 1" margins
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const noBorders = { top: none, bottom: none, left: none, right: none };
    const thin = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
    const thinBorders = { top: thin, bottom: thin, left: thin, right: thin };

    const band = (text, fill, color, opts = {}) => new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W],
      rows: [new TableRow({ children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
        borders: opts.leftBar ? { ...noBorders, left: { style: BorderStyle.SINGLE, size: 36, color: BORDER } } : noBorders,
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        children: (Array.isArray(text) ? text : [text]).map((t, i) => new Paragraph({ children: [
          new TextRun({ text: t, bold: opts.bold !== false && i === 0, color, size: opts.size || (i === 0 ? 22 : 18), font: 'Arial', italics: !!opts.italics }),
        ] })),
      })] })],
    });

    const cols = [3000, 1500, 1500, 1360, 2000];
    const cell = (text, w, o = {}) => new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: thinBorders,
      shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: String(text ?? ''), bold: !!o.bold, size: 18, font: 'Arial' })] })],
    });
    const lineRow = (prefix, l) => new TableRow({ children: [
      cell(`${prefix} — ${l.label}`, cols[0], { bold: true }), cell(qtyStr(l), cols[1]), cell(rateStr(l), cols[2]),
      cell(money(l.amount), cols[3], { right: true }), cell(l.note || '', cols[4]),
    ] });

    function jobTable(job) {
      const rows = [new TableRow({ tableHeader: true, children: ['Item', 'Qty', 'Rate', 'Amount', 'Notes'].map((h, i) => cell(h, cols[i], { bold: true, fill: 'DDE5DC' })) })];
      job.chargeLines.forEach((l) => rows.push(lineRow('Charge', l)));
      if (job.chargeLines.length) rows.push(new TableRow({ children: [cell('Total charge', cols[0], { bold: true }), cell('', cols[1]), cell('', cols[2]), cell(money(job.chargeTotal), cols[3], { bold: true, right: true }), cell('', cols[4])] }));
      job.payLines.forEach((l) => rows.push(lineRow('Pay installer', l)));
      if (job.payLines.length) rows.push(new TableRow({ children: [cell('Total pay installer', cols[0], { bold: true }), cell('', cols[1]), cell('', cols[2]), cell(money(job.payTotal), cols[3], { bold: true, right: true }), cell('', cols[4])] }));
      return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cols, rows });
    }

    const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [] });
    const children = [
      new Paragraph({ children: [new TextRun({ text: 'HARMONY FLOORING LLC', bold: true, size: 32, font: 'Arial', color: GREEN })] }),
      new Paragraph({ children: [new TextRun({ text: `Weekly Installer Bill — ${week.label || ''}`, size: 24, font: 'Arial' })] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `Prepared: ${week.preparedDate || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — using the pricing manual on file`, italics: true, size: 18, font: 'Arial', color: '666666' })] }),
    ];

    const byDay = {};
    week.jobs.forEach((j) => { (byDay[j.day || 'Other'] = byDay[j.day || 'Other'] || []).push(j); });
    const dayOrder = Object.keys(byDay).sort((a, b) => { const i = (d) => (DAYS.indexOf(d) === -1 ? 99 : DAYS.indexOf(d)); return i(a) - i(b); });

    dayOrder.forEach((day) => {
      children.push(band(day.toUpperCase(), GREEN, 'FFFFFF', { size: 24 }), spacer(160));
      byDay[day].forEach((job) => {
        const sub = [job.head, job.customer, job.customerEmail ? `(${job.customerEmail})` : ''].filter(Boolean).join(' ');
        children.push(band([job.address, sub].filter(Boolean), GRAY, '000000', { leftBar: true }));
        if (job.notes.length) children.push(band(job.notes.map((n) => '📝 ' + n), YELLOW, '5C4A00', { bold: false, italics: true, size: 18 }));
        const answers = job.answers || {};
        const open = job.flags.filter((f) => !answers[f]);
        const answered = Object.keys(answers).filter((f) => answers[f]);
        if (open.length) children.push(band(open.map((f) => '⚠ ' + f), FLAG, '8A1C1C', { bold: false, size: 18 }));
        if (answered.length) children.push(band(answered.map((f) => '✓ ' + f + ' — Answer: ' + answers[f]), ANSWERED, '1B5E20', { bold: false, size: 18 }));
        if (job.chargeLines.length || job.payLines.length) children.push(jobTable(job));
        children.push(spacer(280));
      });
    });

    const t = week.totals || {};
    children.push(band([`WEEK TOTALS — Customer charges written: ${money(t.charge || 0)}   |   Installer pay: ${money(t.pay || 0)}   |   Open flags: ${t.flags || 0}`], GREEN, 'FFFFFF', { size: 20 }));

    return new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
      sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } }, children }],
    });
  }

  // Browser helper: compute + download in one call
  async function downloadBill(week, filename) {
    const D = root.docx, HB = root.HarmonyBilling;
    const computed = week.jobs && week.jobs[0] && week.jobs[0].payLines ? week : HB.computeWeek(week);
    const blob = await D.Packer.toBlob(buildBillDocument(computed, D));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || `Harmony_Flooring_Weekly_Bill_${(week.label || 'week').replace(/[^\w-]+/g, '_')}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const api = { buildBillDocument, downloadBill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HarmonyBillDocx = api;
})(typeof window !== 'undefined' ? window : this);
