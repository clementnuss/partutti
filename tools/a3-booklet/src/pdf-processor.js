/**
 * PDF utilities for the A4 → A3 booklet tool. Source A4 pages are imposed
 * onto A3 landscape sheets with pdf-lib (vector content preserved).
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export const A4_W = 595.28;
export const A4_H = 841.89;
export const A3_W = A4_W * 2;
export const A3_H = A4_H;

/** Load a PDF file into PDF.js for rendering thumbnails. */
export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  return await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
}

/** Render a page to a canvas at the given max width. */
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
 * Compute the imposition layout. Returns { sheets, total } where each sheet
 * is { front: [L, R], back: [L, R] } with 1-based page numbers, 0 = blank.
 * sequential: [1,2]/[3,4] per sheet; otherwise saddle-stitch order.
 */
export function computeLayout(contentPages, sequential) {
  if (sequential) {
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

  const total = Math.max(4, Math.ceil(contentPages / 4) * 4);
  const seq = [];
  for (let i = 1; i <= contentPages; i++) seq.push(i);
  while (seq.length < total) seq.push(0);

  const sheets = [];
  let lo = 0;
  let hi = total - 1;
  while (lo < hi) {
    sheets.push({
      front: [seq[hi], seq[lo]],
      back: [seq[lo + 1], seq[hi - 1]],
    });
    lo += 2;
    hi -= 2;
  }
  return { sheets, total };
}

/** Generate the imposed A3 landscape PDF (one output page per side). */
export async function generateA3BookletPDF(sourceFile, sheets, onProgress) {
  const sourceBytes = await sourceFile.arrayBuffer();
  const srcDoc = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();

  const embedded = await out.embedPages(srcDoc.getPages());

  // Per-page geometry: fit into an A4 half, centered.
  const geo = embedded.map((ep) => {
    const scale = Math.min(A4_W / ep.width, A4_H / ep.height);
    return {
      scale,
      x: (A4_W - ep.width * scale) / 2,
      y: (A4_H - ep.height * scale) / 2,
    };
  });

  const totalSides = sheets.length * 2;
  let side = 0;

  for (const sheet of sheets) {
    for (const slots of [sheet.front, sheet.back]) {
      if (onProgress) onProgress(side, totalSides);
      const page = out.addPage([A3_W, A3_H]);
      for (let k = 0; k < 2; k++) {
        const logical = slots[k];
        if (logical === 0) continue;
        const g = geo[logical - 1];
        page.drawPage(embedded[logical - 1], {
          x: k === 0 ? g.x : A4_W + g.x,
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