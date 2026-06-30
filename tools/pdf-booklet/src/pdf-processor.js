/**
 * PDF processing utilities for the A3-booklet → A4 tool.
 *
 * Source PDFs are scanned A3 landscape sheets (duplex, JBIG2-encoded 1-bit
 * images). Each A3 sheet holds two A4 pages side by side. We split every A3
 * page into a left and right half by cropping the page's MediaBox, and share
 * the underlying image XObject + content stream between both halves so the
 * output stays as small as the source (no re-encoding of the raster data).
 *
 * Blank-half detection is done with PDF.js (render at low DPI, sample pixels).
 * Thumbnails are rendered with PDF.js.
 * The final A4 PDF is assembled with pdf-lib, copying the source image
 * streams directly (preserving JBIG2 compression) rather than re-rendering.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFName } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/** Load a PDF file into PDF.js for rendering / blank detection. */
export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytesCopy = arrayBuffer.slice(0);
  return await pdfjsLib.getDocument({ data: bytesCopy }).promise;
}

/** Render a full page to a canvas at the given max width (thumbnails). */
export async function renderPageThumbnail(page, maxWidth = 1000) {
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

/** Estimate ink coverage (0..1) of one half of a page. */
export async function getHalfInkCoverage(pdfjsPage, half) {
  const viewport = pdfjsPage.getViewport({ scale: 1.0 });
  const targetWidth = 200;
  const scale = targetWidth / viewport.width;
  const scaledViewport = pdfjsPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.ceil(scaledViewport.width);
  canvas.height = Math.ceil(scaledViewport.height);
  await pdfjsPage.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const w = canvas.width;
  const h = canvas.height;
  const x0 = half === 'left' ? 0 : Math.floor(w / 2);
  const x1 = half === 'left' ? Math.floor(w / 2) : w;

  let dark = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      if (lum < 0.9) dark++;
      total++;
    }
  }
  return total ? dark / total : 0;
}

/** Half-page is considered blank below this ink fraction. */
export const BLANK_THRESHOLD = 0.005;

/**
 * Assemble the final A4 PDF by copying source image streams directly.
 *
 * orderedHalves: array of specs in reading order:
 *   { pageIndex: number (0-based), half: 'left'|'right',
 *     rotation: 0|90|180|270, isBlank: bool }
 *
 * For each unique source page we copy its image XObject (and any JBIG2Globals
 * stream) + content stream ONCE into the output, then create one output page
 * per half that references those shared streams with a cropped MediaBox. This
 * preserves the original JBIG2 compression, so the output is ~the same size as
 * the source instead of being re-encoded into a much larger format.
 *
 * The source A3 landscape half (~595×842 pt) is rotated 90° to A4 portrait
 * (595×842 pt). The user's manual rotation is added on top via the page /Rotate
 * entry.
 */
export async function generateBookletPDF(sourceFile, orderedHalves, onProgress) {
  const arrayBuffer = await sourceFile.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const out = await PDFDocument.create();

  const srcPages = sourcePdf.getPages();
  // Cache: pageIndex -> { imgRefOut, csRefOut, resDict } so each source page's
  // image/content is copied only once even if both halves appear in the output.
  const pageCache = {};

  for (let i = 0; i < orderedHalves.length; i++) {
    const spec = orderedHalves[i];
    if (onProgress) onProgress(i, orderedHalves.length);

    if (spec.isBlank) {
      // Blank A4 page — no image needed
      out.addPage([595.28, 841.89]);
      continue;
    }

    const p = spec.pageIndex;
    if (!pageCache[p]) {
      pageCache[p] = await copySourcePageResources(sourcePdf, out, p);
    }
    const { imgRefOut, csRefOut, resDict, srcW, srcH } = pageCache[p];

    const halfW = srcW / 2;
    const clipX = spec.half === 'left' ? 0 : halfW;

    // The source A3 page is landscape (1191×842). Each half is ~595.5×842 —
    // already A4 portrait — so NO base rotation is needed. Only the user's
    // manual rotation (if any) is applied via /Rotate.
    const userRot = Number(spec.rotation) || 0;

    // A4 portrait page. The MediaBox crops the source page to the requested
    // half; the image stream is drawn by the shared content stream.
    const page = out.addPage([halfW, srcH]);
    page.node.set(PDFName.of('MediaBox'), out.context.obj([clipX, 0, clipX + halfW, srcH]));
    page.node.set(PDFName.of('CropBox'), out.context.obj([clipX, 0, clipX + halfW, srcH]));
    page.node.set(PDFName.of('Contents'), csRefOut);
    page.node.set(PDFName.of('Resources'), resDict);
    if (userRot) page.node.set(PDFName.of('Rotate'), out.context.obj(userRot));
  }

  if (onProgress) onProgress(orderedHalves.length, orderedHalves.length);
  const pdfBytes = await out.save({ useObjectStreams: true });
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Copy a source page's image XObject (including JBIG2Globals if present) and
 * content stream into the output document, once. Returns refs that both
 * halves of this source page can share.
 */
async function copySourcePageResources(sourcePdf, out, pageIndex) {
  const srcPage = sourcePdf.getPage(pageIndex);
  const srcNode = srcPage.node;
  const srcSize = srcPage.getSize();
  const srcW = srcSize.width;
  const srcH = srcSize.height;

  // Image XObject
  const srcRes = srcNode.Resources();
  const srcXObj = srcRes.get(PDFName.of('XObject'));
  const entries = [...srcXObj.entries()];
  // Expect one image; if multiple, copy all (they'll all be shared).
  const xobjOut = out.context.obj({});
  for (const [imgName, imgRef] of entries) {
    const imgObj = sourcePdf.context.lookup(imgRef);
    const imgCopy = out.context.stream(imgObj.getContents(), imgObj.dict);
    const imgRefOut = out.context.register(imgCopy);

    // Copy JBIG2Globals (or other DecodeParms-referenced) streams
    const decodeParms = imgObj.dict.get(PDFName.of('DecodeParms'));
    if (decodeParms) {
      const globalsRef = decodeParms.get(PDFName.of('JBIG2Globals'));
      if (globalsRef) {
        const globalsObj = sourcePdf.context.lookup(globalsRef);
        const globalsCopy = out.context.stream(globalsObj.getContents(), globalsObj.dict);
        const globalsRefOut = out.context.register(globalsCopy);
        const newDecodeParms = out.context.obj({ JBIG2Globals: globalsRefOut });
        imgCopy.dict.set(PDFName.of('DecodeParms'), newDecodeParms);
      }
    }
    xobjOut.set(imgName, imgRefOut);
  }

  // Content stream
  const csRef = srcNode.get(PDFName.of('Contents'));
  const csObj = sourcePdf.context.lookup(csRef);
  const csCopy = out.context.stream(csObj.getContents(), csObj.dict);
  const csRefOut = out.context.register(csCopy);

  // Resources dict (shared by both halves)
  const resDict = out.context.obj({
    ProcSet: out.context.obj('[ /PDF /Text /ImageB /ImageC /ImageI ]'),
    XObject: xobjOut,
  });

  return { imgRefOut: null, csRefOut, resDict, srcW, srcH };
}