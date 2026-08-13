// Builds a clean, single-column, ATS-friendly .docx from parsed resume data.
// No tables, columns, or icons -- native Word headings/bullets/tab-stopped dates only.
// Depends on the `docx` global (loaded via CDN in index.html).

const CM_TO_TWIP = 566.929;
const cm = (n) => Math.round(n * CM_TO_TWIP);
const pt = (n) => Math.round(n * 20); // twips, for paragraph spacing
const halfPt = (n) => Math.round(n * 2); // font size unit

const PAGE_WIDTH_TWIP = 12240; // US Letter
const MARGIN_TOP_BOTTOM = cm(0.7);
const MARGIN_SIDES = cm(1.4);
const USABLE_WIDTH = PAGE_WIDTH_TWIP - MARGIN_SIDES * 2;

// Renders rich-run arrays (as produced by parser.js) using each run's own
// bold/italic flags -- no forced overrides, so nested formatting (e.g. a bold
// GPA inside an otherwise italic subheader) survives intact.
function runsToTextRuns(runs, opts = {}) {
  const { TextRun } = docx;
  if (!runs || runs.length === 0) return [];
  return runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: !!r.bold,
        italics: !!r.italic,
        ...(opts.size ? { size: opts.size } : {}),
      }),
  );
}

function buildResumeDocument(data) {
  const { Document, Paragraph, TextRun, HeadingLevel, BorderStyle, TabStopType, AlignmentType, LineRuleType } = docx;

  const lineSpacing = { line: Math.round(240 * 0.95), lineRule: LineRuleType.AUTO };

  const children = [];

  // ---- Name ----
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: pt(1), line: lineSpacing.line, lineRule: lineSpacing.lineRule },
      children: [new TextRun({ text: data.name || '', bold: true, size: halfPt(18) })],
    }),
  );

  // ---- Contact line ----
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: pt(2), line: lineSpacing.line, lineRule: lineSpacing.lineRule },
      children: [new TextRun({ text: data.contact || '', size: halfPt(9.5) })],
    }),
  );

  // ---- Sections ----
  for (const section of data.sections) {
    children.push(
      new Paragraph({
        spacing: { before: pt(5), after: pt(2), line: lineSpacing.line, lineRule: lineSpacing.lineRule },
        border: {
          bottom: { color: '000000', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
        children: [
          new TextRun({ text: (section.title || '').toUpperCase(), bold: true, size: halfPt(11.5) }),
        ],
      }),
    );

    for (const entry of section.entries) {
      if (entry.type === 'entry') {
        // Left (bold company/school) + right-tab-stopped (italic dates) header line.
        // left/right are plain strings by design -- forced bold/italic here regardless
        // of any nested formatting in the source, matching standard resume convention.
        const headerChildren = [
          new TextRun({ text: entry.left || '', bold: true, size: halfPt(10.5) }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: entry.right || '', italics: true }),
        ];
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: USABLE_WIDTH }],
            spacing: { before: pt(2), after: 0, line: lineSpacing.line, lineRule: lineSpacing.lineRule },
            children: headerChildren,
          }),
        );

        if (entry.subheader && entry.subheader.length) {
          children.push(
            new Paragraph({
              spacing: { after: pt(1), line: lineSpacing.line, lineRule: lineSpacing.lineRule },
              children: runsToTextRuns(entry.subheader),
            }),
          );
        }

        for (const bullet of entry.bullets || []) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              indent: { left: cm(0.45) },
              spacing: { after: 0, line: lineSpacing.line, lineRule: lineSpacing.lineRule },
              children: runsToTextRuns(bullet, { size: halfPt(10) }),
            }),
          );
        }
      } else if (entry.type === 'line') {
        children.push(
          new Paragraph({
            spacing: { after: pt(2), line: lineSpacing.line, lineRule: lineSpacing.lineRule },
            children: runsToTextRuns(entry.runs),
          }),
        );
      } else if (entry.type === 'bullets') {
        for (const bullet of entry.bullets || []) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              indent: { left: cm(0.45) },
              spacing: { after: 0, line: lineSpacing.line, lineRule: lineSpacing.lineRule },
              children: runsToTextRuns(bullet, { size: halfPt(10) }),
            }),
          );
        }
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: halfPt(10) },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIP, height: 15840 },
            margin: {
              top: MARGIN_TOP_BOTTOM,
              bottom: MARGIN_TOP_BOTTOM,
              left: MARGIN_SIDES,
              right: MARGIN_SIDES,
            },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

async function buildResumeDocxBlob(data) {
  const { Packer } = docx;
  const doc = buildResumeDocument(data);
  return Packer.toBlob(doc);
}
