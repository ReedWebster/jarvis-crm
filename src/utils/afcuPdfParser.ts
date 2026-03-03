import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker (Vite-compatible)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface RawAFCUTransaction {
  rawDate: string;
  rawDescription: string;
  /** Positive = credit/income, negative = debit/expense */
  amount: number;
}

// ─── PDF TEXT EXTRACTION ─────────────────────────────────────────────────────

/**
 * Extract all text from a PDF file, concatenating pages with newlines.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items, preserving approximate whitespace between columns
    const lineMap = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      // Round y to group items on the same visual line (±2pt)
      const y = Math.round((item as { transform: number[] }).transform[5] / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({
        x: (item as { transform: number[] }).transform[4],
        text: (item as { str: string }).str,
      });
    }
    // Sort lines top-to-bottom (higher y = higher on page in PDF coords)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const lines = sortedYs.map((y) => {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      return items.map((i) => i.text).join('  ');
    });
    pageTexts.push(lines.join('\n'));
  }

  return pageTexts.join('\n');
}

// ─── AFCU TRANSACTION PARSER ──────────────────────────────────────────────────

// Matches lines like:
//   01/15  POS PURCHASE WALMART 123456  45.67  1,234.56
//   1/5    DIRECT DEPOSIT EMPLOYER      2,500.00
// Groups: [1] date MM/DD or MM/DD/YY(YY)  [2] description  [3] amount  [4] optional balance
const TX_LINE_RE =
  /^(\d{1,2}\/\d{2}(?:\/\d{2,4})?)\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})?$/;

// Some PDFs use a single space separator; fallback pattern
const TX_LINE_LOOSE_RE =
  /^(\d{1,2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s{1,}(-?[\d,]+\.\d{2})$/;

/**
 * Parse raw PDF text (from extractTextFromPDF) into RawAFCUTransaction records.
 * Handles the AFCU statement layout where each transaction is one line.
 */
export function parseAFCUFromText(text: string): RawAFCUTransaction[] {
  const results: RawAFCUTransaction[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = TX_LINE_RE.exec(trimmed) ?? TX_LINE_LOOSE_RE.exec(trimmed);
    if (!m) continue;

    const [, rawDate, rawDescription, rawAmount] = m;

    // Skip header rows or lines that accidentally match
    const descLower = rawDescription.toLowerCase();
    if (
      descLower.includes('date') ||
      descLower.includes('balance') ||
      descLower.includes('description') ||
      descLower.includes('transaction') && descLower.length < 20
    ) continue;

    const amount = parseFloat(rawAmount.replace(/,/g, ''));
    if (isNaN(amount)) continue;

    results.push({ rawDate, rawDescription: rawDescription.trim(), amount });
  }

  return results;
}
