/**
 * PDF processing utilities for the A4 → A3 booklet (imposition) tool.
 *
 * The input is a normal A4 PDF. We impose it onto A3 landscape sheets in
 * saddle-stitch order: each A3 sheet holds two A4 pages side by side, and
 * the page order converges toward the middle so that after duplex printing
 * (flip on short edge), folding, and stapling, the pages read in order.
 *
 * Pages are embedded with pdf-lib (vector content is preserved — no
 * re-rasterization), scaled to fit an A4 half, and centered.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// A4 portrait in points
export const A4_W = 595.28;
export const A4_H = 841.89;
// A3 landscape in points (two A4 portraits side by side)
export const A3_W = A4_W * 2;
export const A3_H = A4_H;

/** Load a PDF file into PDF.js for rendering thumbnails. */
export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytesCopy = arrayBuffer.slice(0);
  return await pdfjsLib.getDocument({ data: bytesCopy }).promise;
}

/** Render a page to a canvas at the given max width (thumbnail). */
export async function renderPageThumbnail(page, maxWidth = 300) {
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = Math.ceil(scaledViewport.width);
  canvas.height = Math.ceil(scaledViewport.height);
  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
  return canvas;
}

/**
 * Compute the A3 imposition layout.
 *
 * contentPages: number of real pages in the source PDF.
 * sequential: if true, pages are placed in plain order — sheet 1 front =
 *   [1, 2], back = [3, 4], etc. Each sheet is folded separately and the
 *   folded sheets are stacked (classic way to handle a long part without a
 *   binder). If false, saddle-stitch order is used — sheet 1 front =
 *   [last, 1], back = [2, second-to-last], converging toward the middle;
 *   after nesting all sheets, folding, and stapling through the spine the
 *   pages read in order.
 *
 * Returns an array of sheets, each: { front: [L, R], back: [L, R] } where
 * each slot is a 1-based logical page number, or 0 for a blank slot.
 */
export function computeLayout(contentPages, sequential) {
  if (sequential) {
    // Plain 2-up order: pad to an even count so every side has 2 slots.
    const total = Math.max(2, Math.ceil(contentPages / 2) * 2);
    const sheets = [];
    for (let i = 0; i < total; i += 4) {
      sheets.push({
        front: [i + 1 <= contentPages ? i + 1 : 0, i + 2 <= contentPages ? i + 2 : 0],
        back: [i + 3 <= contentPages ? i + 3 : 0, i + 4 <= contentPages ? i + 4 : 0],
      });
    }
    return { sheets, total };
  }

  // Saddle-stitch: total must be a multiple of 4, then converge lo/hi.
  const total = Math.max(4, Math.ceil(contentPages / 4) * 4);
  const seq = [];
  for (let i = 1; i <= contentPages; i++) seq.push(i);
  while (seq.length < total) seq.push(0); // pad the end with blanks

  const sheets = [];
  let lo = 0;         // index into seq from the start
  let hi = total - 1; // index into seq from the end
  while (lo < hi) {
    // Front of sheet: left = last, right = first
    // Back of sheet:  left = next, right = second-to-last
    sheets.push({
      front: [seq[hi], seq[lo]],
      back: [seq[lo + 1], seq[hi - 1]],
    });
    lo += 2;
    hi -= 2;
  }
  return { sheets, total };
}

/**
 * Generate the imposed A3 landscape PDF.
 *
 * layout: as returned by computeLayout().sheets
 * The output has 2 pages per sheet (front, back), each A3 landscape with
 * two A4 halves drawn side by side.
 */
export async function generateA3BookletPDF(sourceFile, sheets, onProgress) {
  const sourceBytes = await sourceFile.arrayBuffer();
  const srcDoc = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();

  // Embed every source page once (vector-preserving).
  const embedded = await out.embedPages(srcDoc.getPages());

  // Cache scale/offset per embedded page so the same computation isn't
  // repeated when a page appears on two sheets (it can't, but keeps it cheap).
  const geoCache = embedded.map((ep) => {
    const { width, height } = ep;
    // Fit into an A4 portrait half, centered.
    const scale = Math.min(A4_W / width, A4_H / height);
    const w = width * scale;
    const h = height * scale;
    return { scale, x: (A4_W - w) / 2, y: (A4_H - h) / 2 };
  });

  const totalSides = sheets.length * 2;
  let side = 0;

  for (const sheet of sheets) {
    for (const slots of [sheet.front, sheet.back]) {
      if (onProgress) onProgress(side, totalSides);
      const page = out.addPage([A3_W, A3_H]);
      for (let k = 0; k < 2; k++) {
        const logical = slots[k];
        if (logical === 0) continue; // blank half
        const ep = embedded[logical - 1];
        const g = geoCache[logical - 1];
        const x = k === 0 ? g.x : A4_W + g.x;
        page.drawPage(ep, {
          x,
          y: g.y,
          xScale: g.scale,
          yScale: g.scale,
          rotate: degrees(0),
        });
      }
      side++;
    }
  }

  if (onProgress) onProgress(totalSides, totalSides);
  const pdfBytes = await out.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}