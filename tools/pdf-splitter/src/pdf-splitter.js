/**
 * PDF splitting logic
 */

import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { extractInstrumentNameFromPage, extractTextWithOCR } from './pdf-processor.js';
import { detectInstrument, sanitizeInstrumentName } from './instrument-detector.js';

/**
 * Analyze a PDF and detect instrument splits
 * @param {PDFDocumentProxy} pdfDoc - PDF.js document
 * @param {Function} progressCallback - Optional callback for OCR progress
 * @param {string} instrumentSetKey - Key for instrument set (e.g., 'brass-band', 'wind-band')
 * @returns {Promise<Array>} Array of splits: [{instrument, startPage, endPage, pages: []}]
 */
export async function analyzePDF(pdfDoc, progressCallback = null, instrumentSetKey = 'brass-band') {
  const splits = [];
  let currentInstrument = null;
  let currentSplit = null;
  let useOCR = false;

  // Check first page to see if we need OCR
  const firstPage = await pdfDoc.getPage(1);
  const firstPageText = await extractInstrumentNameFromPage(firstPage);
  const firstDetection = detectInstrument(firstPageText, instrumentSetKey);

  if (!firstDetection || firstPageText.length < 3) {
    // No text found or very little text - enable OCR
    useOCR = true;
    if (progressCallback) {
      progressCallback({ useOCR: true, total: pdfDoc.numPages });
    }
  }

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    if (progressCallback) {
      progressCallback({ currentPage: pageNum, total: pdfDoc.numPages, useOCR });
    }

    let text;
    if (useOCR) {
      text = await extractTextWithOCR(page);
    } else {
      text = await extractInstrumentNameFromPage(page);
    }

    const detectedInstrument = detectInstrument(text, instrumentSetKey);

    // Debug logging - show all pages
    if (useOCR) {
      if (detectedInstrument) {
        console.log(`📄 Page ${pageNum} (OCR): ✓ "${detectedInstrument}" from: "${text}"`);
      } else {
        console.log(`📄 Page ${pageNum} (OCR): ✗ No instrument (OCR text: "${text}")`);
      }
    }

    // Decision logic:
    // 1. If we detect an instrument name, ALWAYS start a new split (even if same as current)
    // 2. If no instrument detected, continue current split
    // 3. If no instrument detected and no current split, create "Unknown" split

    if (detectedInstrument) {
      // Detected an instrument name on this page

      // Check if this is actually a NEW split (different instrument or first occurrence)
      const isNewSplit = !currentInstrument || detectedInstrument !== currentInstrument;

      if (isNewSplit) {
        // Save previous split if exists
        if (currentSplit) {
          currentSplit.endPage = pageNum - 1;
          splits.push(currentSplit);
        }

        // Start new split
        currentInstrument = detectedInstrument;
        currentSplit = {
          instrument: detectedInstrument,
          startPage: pageNum,
          endPage: pageNum,
          pages: [pageNum]
        };
      } else {
        // Same instrument detected - this means the instrument name repeats
        // (e.g., "1st Euphonium" appears on multiple consecutive pages)
        // Continue the current split
        currentSplit.pages.push(pageNum);
        currentSplit.endPage = pageNum;
      }
    } else {
      // No instrument detected on this page
      if (currentSplit) {
        // Continue current split
        currentSplit.pages.push(pageNum);
        currentSplit.endPage = pageNum;
      } else {
        // No instrument detected and no current split - create "Unknown" split
        currentInstrument = 'Unknown';
        currentSplit = {
          instrument: 'Unknown',
          startPage: pageNum,
          endPage: pageNum,
          pages: [pageNum]
        };
      }
    }
  }

  // Don't forget the last split
  if (currentSplit) {
    splits.push(currentSplit);
  }

  // Summary
  console.log('\n📊 Split Summary:');
  splits.forEach((split, idx) => {
    const pageCount = split.pages.length;
    const pageRange = split.startPage === split.endPage
      ? `page ${split.startPage}`
      : `pages ${split.startPage}-${split.endPage}`;
    console.log(`  ${idx + 1}. ${split.instrument} (${pageRange}, ${pageCount} page${pageCount > 1 ? 's' : ''})`);
  });

  return splits;
}

/**
 * Generate split PDFs from the original PDF
 * @param {File} originalFile - Original PDF file
 * @param {Array} splits - Array of splits from analyzePDF
 * @returns {Promise<Array>} Array of {filename, blob} objects
 */
export async function generateSplitPDFs(originalFile, splits) {
  const arrayBuffer = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  const results = [];
  const baseFilename = originalFile.name.replace(/\.pdf$/i, '');

  for (const split of splits) {
    const newPdf = await PDFDocument.create();

    // Copy pages for this split
    const copiedPages = await newPdf.copyPages(
      pdfDoc,
      split.pages.map(p => p - 1) // pdf-lib uses 0-based indexing
    );

    copiedPages.forEach(page => newPdf.addPage(page));

    // Prune unreferenced XObjects and orphaned objects to avoid duplicating
    // shared resources (fonts, form XObjects, images) into every split.
    await pruneUnusedResources(newPdf);

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    // Generate filename preserving capitalization
    const sanitizedInstrument = split.instrument
      .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-');     // Collapse multiple hyphens

    const filename = `${baseFilename}-${sanitizedInstrument}.pdf`;

    results.push({
      filename,
      blob,
      split
    });
  }

  return results;
}

/**
 * Prune unused resources from a split PDF to minimize file size.
 *
 * When pdf-lib's copyPages copies pages from a source where all pages share a
 * large resource dictionary (common in notation-software exports), it copies
 * ALL resources — even XObjects not referenced by the split's pages. This
 * function:
 *
 * 1. Parses each page's content stream to find which XObjects (via the Do
 *    operator) are actually used, recursively following nested Form XObjects.
 * 2. Removes unused XObject entries from the page's Resources XObject dict.
 * 3. Deletes the orphaned XObject objects and everything they reference
 *    (nested images, sub-forms, content streams) from the PDF context.
 *
 * Together this prevents a 1.3 MB source from producing 1.3 MB splits.
 * Embedded fonts are kept intact so text and notation render correctly.
 */
export async function pruneUnusedResources(pdfDoc) {
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();

  // Resolve a value that may be an indirect PDFRef into the PDFDict it points
  // to. XObject (and nested Resources) dictionaries are commonly stored as
  // indirect references in notation-software exports, so res.get(...) returns
  // a PDFRef whose .entries is undefined — we must dereference before iterating.
  const asDict = (obj) => {
    if (obj instanceof PDFDict) return obj;
    if (!obj) return null;
    const looked = context.lookup(obj);
    return looked instanceof PDFDict ? looked : null;
  };

  // ---- 1. Find XObjects actually referenced in content streams ------------
  const usedXObjects = new Set();
  const streamsToScan = [];

  for (const page of pages) {
    const csRef = page.node.get(PDFName.of('Contents'));
    const csObj = context.lookup(csRef);
    if (csObj) streamsToScan.push(csObj);
  }

  // Build name -> ref map from page Resources XObject dict
  const xobjByName = {};
  for (const page of pages) {
    const res = page.node.Resources();
    if (!res) continue;
    const xobjDict = asDict(res.get(PDFName.of('XObject')));
    if (!xobjDict) continue;
    for (const [name, ref] of [...xobjDict.entries()]) {
      xobjByName[name.toString()] = ref;
    }
  }

  // Recursively scan content streams and Form XObjects for /Name Do references
  const scanned = new Set();
  while (streamsToScan.length > 0) {
    const streamObj = streamsToScan.pop();
    if (scanned.has(streamObj)) continue;
    scanned.add(streamObj);

    const text = await decodeStream(streamObj);
    const matches = [...text.matchAll(/\/(\w+)\s+Do/g)];
    for (const m of matches) {
      const name = '/' + m[1];
      usedXObjects.add(name);
      // Queue the referenced XObject for nested scanning
      const ref = xobjByName[name];
      if (ref) {
        const xobj = context.lookup(ref);
        if (xobj) {
          streamsToScan.push(xobj);
          // Check XObject's own Resources for nested XObjects
          const nestedRes = xobj.dict?.get?.(PDFName.of('Resources'));
          const nestedResDict = asDict(nestedRes);
          if (nestedResDict) {
            const nestedXObj = asDict(nestedResDict.get(PDFName.of('XObject')));
            if (nestedXObj) {
              for (const [, nref] of [...nestedXObj.entries()]) {
                const nobj = context.lookup(nref);
                if (nobj) streamsToScan.push(nobj);
              }
            }
          }
        }
      }
    }
  }

  // ---- 2. Build a "keep set" of all refs reachable from KEPT XObjects ------
  // This prevents deleting images/resources that are shared between TPLs.
  const keepRefs = new Set();
  for (const name of usedXObjects) {
    const ref = xobjByName[name];
    if (ref) {
      keepRefs.add(ref);
      const obj = context.lookup(ref);
      collectRefs(obj, keepRefs, context, new Set());
    }
  }

  // ---- 3. Remove unused XObjects from page Resources + collect orphans ----
  const refsToDelete = new Set();

  for (const page of pages) {
    const res = page.node.Resources();
    if (!res) continue;
    const xobjDict = asDict(res.get(PDFName.of('XObject')));
    if (!xobjDict) continue;

    for (const [name, ref] of [...xobjDict.entries()]) {
      if (!usedXObjects.has(name.toString())) {
        xobjDict.delete(name);
        // Collect refs from this deleted XObject, but skip any that are in keepRefs
        collectRefsExcept(context.lookup(ref), refsToDelete, context, new Set(), keepRefs);
        refsToDelete.add(ref);
      }
    }
  }

  // Don't delete refs that are needed by kept XObjects
  for (const ref of keepRefs) refsToDelete.delete(ref);

  // ---- 4. Delete all collected orphaned objects ---------------------------
  for (const ref of refsToDelete) {
    context.delete(ref);
  }
}

/** Decode a PDF raw stream (FlateDecode) to a text string (async). */
async function decodeStream(obj) {
  if (!obj || !obj.getContents) return '';
  try {
    const raw = obj.getContents();
    // Copy to a fresh buffer — pdf-lib may return a view of a detached buffer
    const data = new Uint8Array(raw.length);
    data.set(raw);

    const filter = obj.dict?.get?.(PDFName.of('Filter'));
    const filterStr = filter?.toString?.() ?? '';

    if (filterStr.includes('FlateDecode')) {
      // Use the browser's native DecompressionStream to inflate zlib (RFC 1950)
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(data);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) chunks.push(result.value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return new TextDecoder().decode(merged);
    }
    // No filter — raw bytes are the content
    return new TextDecoder().decode(data);
  } catch {
    return '';
  }
}

/** Recursively collect all PDFRefs referenced by an object. */
function collectRefs(obj, refs, context, visited) {
  if (!obj || visited.has(obj)) return;
  visited.add(obj);

  if (obj instanceof PDFDict) {
    for (const [, v] of obj.entries()) {
      if (isPDFRef(v)) {
        refs.add(v);
        collectRefs(context.lookup(v), refs, context, visited);
      } else if (v instanceof PDFDict || v instanceof PDFArray) {
        collectRefs(v, refs, context, visited);
      }
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < (obj.size?.() ?? 0); i++) {
      const v = obj.get(i);
      if (isPDFRef(v)) {
        refs.add(v);
        collectRefs(context.lookup(v), refs, context, visited);
      } else if (v instanceof PDFDict || v instanceof PDFArray) {
        collectRefs(v, refs, context, visited);
      }
    }
  }

  if (obj.dict instanceof PDFDict) {
    collectRefs(obj.dict, refs, context, visited);
  }
}

/** Like collectRefs, but skip any refs that are in the keepRefs set. */
function collectRefsExcept(obj, refs, context, visited, keepRefs) {
  if (!obj || visited.has(obj)) return;
  visited.add(obj);

  if (obj instanceof PDFDict) {
    for (const [, v] of obj.entries()) {
      if (isPDFRef(v)) {
        if (!keepRefs.has(v)) {
          refs.add(v);
          collectRefsExcept(context.lookup(v), refs, context, visited, keepRefs);
        }
      } else if (v instanceof PDFDict || v instanceof PDFArray) {
        collectRefsExcept(v, refs, context, visited, keepRefs);
      }
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < (obj.size?.() ?? 0); i++) {
      const v = obj.get(i);
      if (isPDFRef(v)) {
        if (!keepRefs.has(v)) {
          refs.add(v);
          collectRefsExcept(context.lookup(v), refs, context, visited, keepRefs);
        }
      } else if (v instanceof PDFDict || v instanceof PDFArray) {
        collectRefsExcept(v, refs, context, visited, keepRefs);
      }
    }
  }

  if (obj.dict instanceof PDFDict) {
    collectRefsExcept(obj.dict, refs, context, visited, keepRefs);
  }
}

function isPDFRef(v) {
  return v && typeof v.toString === 'function' && /^\d+ \d+ R$/.test(v.toString());
}
