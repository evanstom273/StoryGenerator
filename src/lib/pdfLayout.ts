import { jsPDF } from "jspdf";

export const PDF_MARGIN = 48;
export const PDF_FONT = "helvetica";
const LINE_H = 13;
const RULE_COLOR = 180;

export function createPdfDoc(): jsPDF {
  return new jsPDF({ unit: "pt", format: "a4" });
}

export function pdfDimensions(doc: jsPDF) {
  return {
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    contentW: doc.internal.pageSize.getWidth() - PDF_MARGIN * 2,
  };
}

export function checkPage(doc: jsPDF, y: number, pageH: number, needed = LINE_H): number {
  if (y + needed > pageH - PDF_MARGIN) {
    doc.addPage();
    return PDF_MARGIN;
  }
  return y;
}

export function rule(doc: jsPDF, y: number, pageW: number): number {
  doc.setDrawColor(RULE_COLOR, RULE_COLOR, RULE_COLOR);
  doc.line(PDF_MARGIN, y, pageW - PDF_MARGIN, y);
  return y + 8;
}

export function heading(doc: jsPDF, y: number, text: string, size = 14, pageH = 842): number {
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(size);
  const { contentW } = pdfDimensions(doc);
  const lh = Math.ceil(size * 1.25);
  const lines = doc.splitTextToSize(text, contentW) as string[];
  y = checkPage(doc, y, pageH, lines.length * lh + 12);
  for (const line of lines) {
    doc.text(line, PDF_MARGIN, y);
    y += lh;
  }
  return y + 8;
}

export function subheading(doc: jsPDF, y: number, text: string, pageH = 842): number {
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  const { contentW } = pdfDimensions(doc);
  const lh = Math.ceil(11 * 1.3);
  const lines = doc.splitTextToSize(text, contentW) as string[];
  y = checkPage(doc, y, pageH, lines.length * lh + 6);
  for (const line of lines) {
    doc.text(line, PDF_MARGIN, y);
    y += lh;
  }
  return y + 4;
}

export function body(
  doc: jsPDF,
  y: number,
  text: string,
  indent = 0,
  overrideContentW?: number,
  pageH = 842,
): number {
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(10);
  const { contentW } = pdfDimensions(doc);
  const w = (overrideContentW ?? contentW) - indent;
  const lines = doc.splitTextToSize(text, w) as string[];
  for (const line of lines) {
    y = checkPage(doc, y, pageH, LINE_H);
    doc.text(line, PDF_MARGIN + indent, y);
    y += LINE_H;
  }
  return y + 3;
}

export function metaLine(
  doc: jsPDF,
  y: number,
  label: string,
  value: string,
  pageH = 842,
): number {
  if (!value.trim()) return y;
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10);
  const { contentW } = pdfDimensions(doc);
  const prefix = `${label}: `;
  const prefixW = doc.getTextWidth(prefix);
  const wrapW = Math.max(60, contentW - prefixW);
  const lines = doc.splitTextToSize(value, wrapW) as string[];
  y = checkPage(doc, y, pageH, LINE_H * lines.length + 3);
  doc.text(prefix, PDF_MARGIN, y);
  doc.setFont(PDF_FONT, "normal");
  if (lines[0]) doc.text(lines[0], PDF_MARGIN + prefixW, y);
  y += LINE_H;
  for (let i = 1; i < lines.length; i++) {
    y = checkPage(doc, y, pageH, LINE_H);
    doc.text(lines[i] ?? "", PDF_MARGIN + prefixW, y);
    y += LINE_H;
  }
  return y + 2;
}

export function speakerLine(
  doc: jsPDF,
  y: number,
  speaker: string,
  content: string,
  pageH = 842,
): number {
  const { contentW } = pdfDimensions(doc);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10);
  const prefix = speaker ? `${speaker}: ` : "";
  const prefixW = prefix ? doc.getTextWidth(prefix) : 0;
  const indent = Math.min(prefixW, contentW * 0.35);
  const wrapW = contentW - indent;

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(content.trim() || " ", wrapW) as string[];

  const totalH = LINE_H * lines.length + 4;
  y = checkPage(doc, y, pageH, totalH);

  if (prefix) {
    doc.setFont(PDF_FONT, "bold");
    doc.text(prefix, PDF_MARGIN, y);
    doc.setFont(PDF_FONT, "normal");
  }
  if (lines[0]) doc.text(lines[0], PDF_MARGIN + indent, y);
  y += LINE_H;

  for (let i = 1; i < lines.length; i++) {
    y = checkPage(doc, y, pageH, LINE_H);
    doc.text(lines[i] ?? "", PDF_MARGIN + indent, y);
    y += LINE_H;
  }

  return y + 4;
}
