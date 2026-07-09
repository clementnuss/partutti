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
 * Orientation handling: source pages may be A3 landscape (wide MediaBox) or
 * A3 portrait MediaBox with a /Rotate of 90/270 (displays as landscape). PDF.js
 * applies /Rotate for thumbnails & blank detection, but pdf-lib's getSize()
 * returns the *unrotated* dimensions. We therefore read the source /Rotate and
 * split along the visual long edge: for rotated pages the crop is along the
 * unrotated height (with the left/right mapping depending on the rotation
 * direction); for plain landscape pages it's along the width. The source
 * rotation is preserved on each output page so the cropped image displays
 * upright, and the user's manual rotation is added on top.
 */
export async function generateBookletPDF(sourceFile, orderedHalves, onProgress) {
  const arrayBuffer = await sourceFile.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const out = await PDFDocument.create();

  const srcPages = sourcePdf.getPages();
  // Cache: pageIndex -> { csRefOut, resDict, srcW, srcH, srcRotate } so each
  // source page's image/content is copied only once even if both halves
  // appear in the output.
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
    const { csRefOut, resDict, srcW, srcH, srcRotate } = pageCache[p];

    const userRot = Number(spec.rotation) || 0;
    // Total output rotation = source rotation (to display the crop correctly)
    // plus the user's manual rotation on top.
    const totalRot = (srcRotate + userRot) % 360;

    // The page's two A4 halves are arranged along the VISUAL long edge. When
    // /Rotate is 90 or 270, pdf-lib's getSize() returns the *unrotated*
    // dimensions (portrait MediaBox that displays as landscape), so the split
    // must be along the unrotated HEIGHT, not width — and the left/right
    // mapping depends on the rotation direction.
    const rotated = srcRotate === 90 || srcRotate === 270;

    let mediaBox;
    if (rotated) {
      // Unrotated page is portrait (srcW < srcH). The visual landscape page
      // has width=srcH, height=srcW. Split the unrotated height into two
      // halves; each crop is srcW × halfH and, with the preserved /Rotate,
      // displays as A4 portrait (halfH × srcW).
      const halfH = srcH / 2;
      let clipY0, clipY1;
      if (srcRotate === 270) {
        // 270° CW: displayed-left = unrotated-top (high y),
        //          displayed-right = unrotated-bottom (low y).
        clipY0 = spec.half === 'left' ? halfH : 0;
        clipY1 = spec.half === 'left' ? srcH : halfH;
      } else {
        // 90° CW: displayed-left = unrotated-bottom (low y),
        //         displayed-right = unrotated-top (high y).
        clipY0 = spec.half === 'left' ? 0 : halfH;
        clipY1 = spec.half === 'left' ? halfH : srcH;
      }
      mediaBox = [0, clipY0, srcW, clipY1];
      // Unrotated output page is srcW × halfH; /Rotate makes it A4 portrait.
      const page = out.addPage([srcW, halfH]);
      page.node.set(PDFName.of('MediaBox'), out.context.obj(mediaBox));
      page.node.set(PDFName.of('CropBox'), out.context.obj(mediaBox));
      page.node.set(PDFName.of('Contents'), csRefOut);
      page.node.set(PDFName.of('Resources'), resDict);
      if (totalRot) page.node.set(PDFName.of('Rotate'), out.context.obj(totalRot));
    } else {
      // Standard A3 landscape MediaBox (no rotation, or 180). Split along
      // width; each half is already ~A4 portrait.
      const halfW = srcW / 2;
      const clipX = spec.half === 'left' ? 0 : halfW;
      mediaBox = [clipX, 0, clipX + halfW, srcH];
      const page = out.addPage([halfW, srcH]);
      page.node.set(PDFName.of('MediaBox'), out.context.obj(mediaBox));
      page.node.set(PDFName.of('CropBox'), out.context.obj(mediaBox));
      page.node.set(PDFName.of('Contents'), csRefOut);
      page.node.set(PDFName.of('Resources'), resDict);
      if (totalRot) page.node.set(PDFName.of('Rotate'), out.context.obj(totalRot));
    }
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

  // Source /Rotate (0/90/180/270). PDF.js applies this for thumbnails & blank
  // detection, but pdf-lib's getSize() returns the *unrotated* dimensions, so
  // we need the rotation here to split along the visual long edge and to
  // preserve it on the output pages.
  const rotObj = srcNode.get(PDFName.of('Rotate'));
  const srcRotate = rotObj ? (rotObj.asNumber ? rotObj.asNumber() : Number(rotObj.toString())) : 0;

  // Image XObject
  const srcRes = srcNode.Resources();
  // Use lookup() instead of get(): the XObject dict is usually stored as an
  // indirect reference, and PDFRef has no .entries() — only the dereferenced
  // PDFDict does. Same applies to DecodeParms below.
  const srcXObj = srcRes.lookup(PDFName.of('XObject'));
  if (!srcXObj || typeof srcXObj.entries !== 'function') {
    throw new Error(
      `Source page ${pageIndex} has no renderable XObject resources ` +
      `(expected a scanned image). The A3 splitter only supports image-based PDFs.`
    );
  }
  const entries = [...srcXObj.entries()];
  // Expect one image; if multiple, copy all (they'll all be shared).
  const xobjOut = out.context.obj({});
  for (const [imgName, imgRef] of entries) {
    const imgObj = sourcePdf.context.lookup(imgRef);
    const imgCopy = out.context.stream(imgObj.getContents(), cloneStreamDict(imgObj, out));
    const imgRefOut = out.context.register(imgCopy);

    // Copy JBIG2Globals (or other DecodeParms-referenced) streams
    const decodeParms = imgObj.dict.lookup(PDFName.of('DecodeParms'));
    if (decodeParms) {
      const globalsRef = decodeParms.lookup(PDFName.of('JBIG2Globals'));
      if (globalsRef) {
        const globalsObj = sourcePdf.context.lookup(globalsRef);
        const globalsCopy = out.context.stream(globalsObj.getContents(), cloneStreamDict(globalsObj, out));
        const globalsRefOut = out.context.register(globalsCopy);
        const newDecodeParms = out.context.obj({ JBIG2Globals: globalsRefOut });
        imgCopy.dict.set(PDFName.of('DecodeParms'), newDecodeParms);
      }
    }
    xobjOut.set(imgName, imgRefOut);
  }

  // Content stream. Per the PDF spec, /Contents may be a single stream or an
  // array of streams; either way it can be (and usually is) an indirect ref.
  // Dereference first, then handle both shapes.
  const csRef = srcNode.get(PDFName.of('Contents'));
  const csObj = sourcePdf.context.lookup(csRef);
  if (!csObj) {
    throw new Error(
      `Source page ${pageIndex} has no content stream; cannot copy page contents.`
    );
  }
  const csBytes = csObj.getContents
    ? csObj.getContents()
    : concatStreamArray(csObj, sourcePdf.context);
  // When /Contents is an array, all segments share the same filter (typically
  // /FlateDecode); clone the first stream's dict so the output declares the
  // right /Filter for the concatenated bytes.
  const csDictSrc = csObj.getContents ? csObj : sourcePdf.context.lookup(csObj.get(0));
  const csCopy = out.context.stream(csBytes, cloneStreamDict(csDictSrc, out));
  const csRefOut = out.context.register(csCopy);

  // Resources dict (shared by both halves). ProcSet must be a real PDFArray,
  // not a string — passing a string literal to out.context.obj() produces a
  // PDFName containing the bracket characters, which viewers reject.
  const resDict = out.context.obj({
    ProcSet: out.context.obj([PDFName.of('PDF'), PDFName.of('Text'),
                              PDFName.of('ImageB'), PDFName.of('ImageC'),
                              PDFName.of('ImageI')]),
    XObject: xobjOut,
  });

  return { imgRefOut: null, csRefOut, resDict, srcW, srcH, srcRotate };
}

/**
 * Build a fresh dict in the output context for a copied stream, preserving
 * the entries viewers need to decode the stream: /Filter, /DecodeParms,
 * /Length (recomputed by pdf-lib), and image-XObject metadata
 * (/Type, /Subtype, /Width, /Height, /BitsPerComponent, /ColorSpace,
 * /ImageMask, /Name).
 *
 * Reusing the source stream's dict directly loses filter entries because
 * that dict belongs to the source document's context — pdf-lib does not
 * re-emit /Filter when serializing a stream whose dict lives in a foreign
 * context, so raw zlib/CCITT/DCT bytes get written with no filter declared
 * and every viewer then chokes interpreting compressed data as operators
 * or pixel data → blank pages.
 */
function cloneStreamDict(srcStream, out) {
  const d = out.context.obj({});
  const src = srcStream.dict;
  const keysToCopy = [
    'Filter', 'DecodeParms',
    'Type', 'Subtype', 'Name',
    'Width', 'Height', 'BitsPerComponent', 'ColorSpace', 'ImageMask',
  ];
  for (const k of keysToCopy) {
    const v = src.lookup(PDFName.of(k));
    if (v) d.set(PDFName.of(k), v.clone());
  }
  return d;
}

/**
 * Concatenate a PDFArray of content-stream refs into a single byte buffer.
 * Each stream is appended directly; per the PDF spec each segment is a
 * valid operand/operator sequence, so simply concatenating preserves
 * semantics. (Many PDFs use a single content stream, but the spec allows
 * an array of streams to be treated as if concatenated.)
 */
function concatStreamArray(csArray, context) {
  let total = 0;
  const parts = [];
  for (let i = 0; i < csArray.size(); i++) {
    const ref = csArray.get(i);
    const obj = context.lookup(ref);
    if (!obj || typeof obj.getContents !== 'function') {
      throw new Error('Encountered a non-stream entry in /Contents array.');
    }
    const bytes = obj.getContents();
    parts.push(bytes);
    total += bytes.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}