/**
 * A3 Booklet → A4 — main application logic.
 *
 * One or more PDFs are uploaded (one per instrument). Each PDF contains A3
 * landscape sheets scanned duplex (front + back of each physical sheet).
 * Each A3 sheet holds two A4 pages side by side. We split every A3 page into
 * a left and right half, auto-detect blank halves, and apply a saddle-stitch
 * reading order by default. With a single file, the user can manually
 * reorder, rotate, or toggle-blank halves before exporting a single A4 PDF
 * named [piece]-[instrument].pdf. With several files, batch mode processes
 * each file automatically (shared saddle-stitch toggle) and downloads all
 * resulting A4 PDFs as one ZIP.
 *
 * "Piece" and "Instrument" fields persist across reloads via localStorage.
 */

import {
  loadPDF,
  renderPageThumbnail,
  getHalfInkCoverage,
  BLANK_THRESHOLD,
  generateBookletPDF,
} from './pdf-processor.js';
import { t } from '../../../i18n.js';

// ---- persisted fields ---------------------------------------------------
const LS_PIECE = 'partutti-booklet-piece';
const LS_INSTRUMENT = 'partutti-booklet-instrument';

// ---- state ---------------------------------------------------------------
let pdfjsDoc = null;       // PDF.js document (single-file mode)
let sourceFile = null;      // original File (single-file mode)
let batchFiles = [];        // original Files (batch mode)
let halves = [];            // reading-order array of half specs:
                             // { id, pageIndex, half, rotation, isBlank, ink }
let thumbByKey = {};        // canvas per "pageIndex-half" (stable across reorders)

// ---- DOM -----------------------------------------------------------------
const pieceInput = document.getElementById('pieceName');
const instrumentInput = document.getElementById('instrumentName');
const reuseFilenameCheckbox = document.getElementById('reuseFilename');
const metaFields = document.getElementById('metaFields');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const processingLabel = document.getElementById('processingLabel');
const editorSection = document.getElementById('editorSection');
const halvesList = document.getElementById('halvesList');
const saddleStitchCheckbox = document.getElementById('saddleStitchCheckbox');
const downloadBtn = document.getElementById('downloadBtn');
const errorMessage = document.getElementById('errorMessage');
const fileInfo = document.getElementById('fileInfo');
const batchSection = document.getElementById('batchSection');
const batchFileList = document.getElementById('batchFileList');
const batchSaddleStitchCheckbox = document.getElementById('batchSaddleStitchCheckbox');
const batchDownloadBtn = document.getElementById('batchDownloadBtn');

// Restore persisted fields
pieceInput.value = localStorage.getItem(LS_PIECE) || '';
instrumentInput.value = localStorage.getItem(LS_INSTRUMENT) || '';
pieceInput.addEventListener('input', () => localStorage.setItem(LS_PIECE, pieceInput.value));
instrumentInput.addEventListener('input', () => localStorage.setItem(LS_INSTRUMENT, instrumentInput.value));

// "Reuse original filename" — when ticked, the piece/instrument inputs are
// irrelevant (the output name comes from the source file), so visually dim
// and disable them.
function syncReuseFilenameState() {
  metaFields.classList.toggle('disabled-text-inputs', reuseFilenameCheckbox.checked);
}
reuseFilenameCheckbox.addEventListener('change', syncReuseFilenameState);
syncReuseFilenameState();

// Events
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
saddleStitchCheckbox.addEventListener('change', () => {
  if (saddleStitchCheckbox.checked) applySaddleStitchOrder();
  else applyScanOrder();
});
downloadBtn.addEventListener('click', downloadPDF);
batchDownloadBtn.addEventListener('click', downloadBatchZip);

let nextId = 1;

// ---- file handling -------------------------------------------------------
async function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const files = [...e.dataTransfer.files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  await handleFiles(files);
}
async function handleFileSelect(e) {
  const files = [...e.target.files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  e.target.value = ''; // allow re-selecting the same file(s)
  await handleFiles(files);
}

/** Dispatch on count: one file opens the editor, several open batch mode. */
async function handleFiles(files) {
  if (!files.length) return;
  if (files.length === 1) await loadFile(files[0]);
  else await loadBatch(files);
}

/**
 * Batch mode: remember the files and list them. Splitting, blank detection
 * and PDF generation happen per file at ZIP-export time, using the shared
 * saddle-stitch toggle (which can be flipped before clicking download).
 */
function loadBatch(files) {
  hideError();
  batchFiles = files;
  processing.classList.remove('active');
  editorSection.classList.remove('active');

  fileInfo.style.display = 'block';
  fileInfo.innerHTML = `<strong>✓ ${files.length} ${files.length > 1 ? t('booklet.batch.files') : t('booklet.batch.file')}</strong> — ${escapeHtml(files.map((f) => f.name).join(', '))}`;

  batchFileList.innerHTML = '';
  files.forEach((file, i) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.dataset.index = i;
    row.innerHTML = `<span>📄</span><span>${escapeHtml(file.name)}</span><span class="file-status"></span>`;
    batchFileList.appendChild(row);
  });
  batchSection.classList.add('active');
  batchSection.scrollIntoView({ behavior: 'smooth' });
}

async function loadFile(file) {
  try {
    hideError();
    editorSection.classList.remove('active');
    batchSection.classList.remove('active');
    processing.classList.add('active');
    processingLabel.textContent = t('booklet.processing');

    sourceFile = file;
    pdfjsDoc = await loadPDF(file);

    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `<strong>✓ ${escapeHtml(file.name)}</strong> — ${pdfjsDoc.numPages} A3 sheet${pdfjsDoc.numPages > 1 ? 's' : ''}`;

    await renderAllThumbnails();
    await buildHalves();
    // Respect the current toggle: saddle-stitch if checked, plain scan order
    // (page-left, page-right, ...) otherwise.
    if (saddleStitchCheckbox.checked) applySaddleStitchOrder();
    else applyScanOrder();

    processing.classList.remove('active');
    editorSection.classList.add('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('booklet.error.load') + ': ' + err.message);
  }
}

/** Render one thumbnail per source A3 page, cached by pageIndex+half. */
async function renderAllThumbnails() {
  thumbByKey = {};
  for (let p = 0; p < pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p + 1);
    const canvas = await renderPageThumbnail(page, 1000);
    thumbByKey[`${p}-left`] = canvas;
    thumbByKey[`${p}-right`] = canvas; // same full-page canvas; CSS crops the half
  }
}

/**
 * Build one half spec per (page, half) pair, in scan order, detecting blanks.
 * halves[] is initially scan order: page0-left, page0-right, page1-left, ...
 */
async function buildHalves() {
  halves = [];
  nextId = 1;
  for (let p = 0; p < pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p + 1);
    for (const half of ['left', 'right']) {
      const ink = await getHalfInkCoverage(page, half);
      halves.push({
        id: nextId++,
        pageIndex: p,
        half,
        rotation: 0,
        isBlank: ink < BLANK_THRESHOLD,
        ink,
      });
    }
  }
}

// ---- ordering ------------------------------------------------------------
/**
 * Saddle-stitch reading order for a duplex A3 booklet PDF.
 *
 * The PDF contains A3 pages in front/back pairs:
 *   PDF page 0 = sheet0 front, page 1 = sheet0 back, page 2 = sheet1 front, ...
 * So the number of physical sheets = ceil(pdfPages / 2), and each physical
 * sheet contributes 4 A4 reading pages (front: 2 halves, back: 2 halves).
 *
 * Saddle-stitch imposition for physical sheet s:
 *   front (PDF page 2s):   left half = last page,  right half = page 1
 *   back  (PDF page 2s+1): left half = page 2,     right half = 2nd-last
 * converging toward the middle.
 *
 * Returns [{pageIndex, half}] in reading order 1..(numSheets*4).
 */
function computeSaddleStitchOrder(numPages) {
  const numSheets = Math.ceil(numPages / 2);
  const total = numSheets * 4;

  const order = new Array(total);
  let lo = 1;
  let hi = total;
  for (let s = 0; s < numSheets; s++) {
    const frontPage = 2 * s;
    const backPage = 2 * s + 1;

    // Front: left = hi, right = lo
    order[hi - 1] = { pageIndex: frontPage, half: 'left' };
    order[lo - 1] = { pageIndex: frontPage, half: 'right' };
    lo++; hi--;

    // Back: left = lo, right = hi (only if that PDF page exists)
    if (backPage < numPages) {
      order[lo - 1] = { pageIndex: backPage, half: 'left' };
      order[hi - 1] = { pageIndex: backPage, half: 'right' };
      lo++; hi--;
    }
  }
  return order;
}

/**
 * Plain scan order: page0-left, page0-right, page1-left, page1-right, ...
 * The "just split the A3 pages, don't impose" mode.
 */
function computeScanOrder(numPages) {
  const order = [];
  for (let p = 0; p < numPages; p++) {
    order.push({ pageIndex: p, half: 'left' });
    order.push({ pageIndex: p, half: 'right' });
  }
  return order;
}

/**
 * Reorder `halves` (the existing half specs, preserving any user edits like
 * rotation or blank toggles) into the given [{pageIndex, half}] order.
 */
function applyOrder(order) {
  // Index current specs by [pageIndex][half] so user edits survive reorders.
  const byKey = {};
  for (const spec of halves) byKey[`${spec.pageIndex}-${spec.half}`] = spec;

  halves = order
    .map(({ pageIndex, half }) => byKey[`${pageIndex}-${half}`])
    .filter(Boolean)
    .map((spec) => ({ ...spec, id: nextId++ }));
  renderEditor();
}

function applySaddleStitchOrder() {
  applyOrder(computeSaddleStitchOrder(pdfjsDoc.numPages));
}

function applyScanOrder() {
  applyOrder(computeScanOrder(pdfjsDoc.numPages));
}

// ---- editor UI -----------------------------------------------------------
function renderEditor() {
  halvesList.innerHTML = '';
  halves.forEach((spec, i) => {
    const card = document.createElement('div');
    card.className = 'half-card' + (spec.isBlank ? ' blank' : '');
    card.dataset.id = spec.id;

    const num = document.createElement('div');
    num.className = 'half-num';
    num.textContent = (i + 1).toString();
    card.appendChild(num);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'half-thumb-wrap';
    const thumb = document.createElement('div');
    thumb.className = 'half-thumb ' + spec.half;
    const canvas = thumbByKey[`${spec.pageIndex}-${spec.half}`];
    if (canvas) {
      // Clone the canvas node so the same cached canvas can appear once per slot
      const clone = document.createElement('canvas');
      clone.width = canvas.width;
      clone.height = canvas.height;
      clone.getContext('2d').drawImage(canvas, 0, 0);
      thumb.appendChild(clone);
    }
    if (spec.isBlank) {
      const badge = document.createElement('div');
      badge.className = 'blank-badge';
      badge.textContent = t('booklet.blank');
      thumb.appendChild(badge);
    }
    // rotation indicator
    if (spec.rotation) {
      thumb.style.setProperty('--rot', spec.rotation + 'deg');
    }
    thumbWrap.appendChild(thumb);
    card.appendChild(thumbWrap);

    const meta = document.createElement('div');
    meta.className = 'half-meta';
    meta.textContent = `${t('booklet.sheet')} ${spec.pageIndex + 1} · ${spec.half === 'left' ? 'L' : 'R'}${spec.rotation ? ' · ' + spec.rotation + '°' : ''}`;
    card.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'half-controls';

    const up = btn('▲', t('booklet.move.up'), () => move(i, -1));
    const down = btn('▼', t('booklet.move.down'), () => move(i, +1));
    const rot = btn('↻', t('booklet.rotate'), () => rotate(i));
    const toggleBlank = btn(
      spec.isBlank ? t('booklet.unmarkBlank') : t('booklet.markBlank'),
      spec.isBlank ? t('booklet.unmarkBlank') : t('booklet.markBlank'),
      () => toggleBlankHalf(i)
    );
    if (spec.isBlank) toggleBlank.classList.add('active');

    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(rot);
    controls.appendChild(toggleBlank);
    card.appendChild(controls);

    halvesList.appendChild(card);
  });
}

function btn(label, title, onClick) {
  const b = document.createElement('button');
  b.className = 'btn-small';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= halves.length) return;
  [halves[i], halves[j]] = [halves[j], halves[i]];
  renderEditor();
}

function rotate(i) {
  halves[i].rotation = (halves[i].rotation + 90) % 360;
  renderEditor();
}

function toggleBlankHalf(i) {
  halves[i].isBlank = !halves[i].isBlank;
  renderEditor();
}

// ---- export --------------------------------------------------------------
async function downloadPDF() {
  try {
    hideError();
    let filename;
    if (reuseFilenameCheckbox.checked && sourceFile) {
      // Preserve the original filename; only swap the extension to .pdf
      // (and strip any path separators, which shouldn't appear in a File
      // name but guards against malicious drag/drop values).
      const base = sourceFile.name.replace(/\.[^./]+$/, '');
      filename = `${base}.pdf`.replace(/[\\/:]/g, '-');
    } else {
      const piece = pieceInput.value.trim() || 'piece';
      const instrument = instrumentInput.value.trim() || 'instrument';
      filename = `${piece}-${instrument}.pdf`
        .replace(/\s+/g, '-')
        .replace(/[^\w\-.]/g, '');
    }

    processing.classList.add('active');
    processingLabel.textContent = t('booklet.exporting');

    const ordered = halves.filter((h) => !h.isBlank);
    const blob = await generateBookletPDF(sourceFile, ordered, (done, total) => {
      processingLabel.textContent = `${t('booklet.exporting')} (${done}/${total})`;
    });

    downloadFile(blob, filename);
    processing.classList.remove('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('booklet.error.export') + ': ' + err.message);
  }
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- batch export --------------------------------------------------------
/**
 * Split + reorder every batch file and bundle the resulting A4 PDFs into a
 * single ZIP (one output per input, original filename preserved). The
 * saddle-stitch toggle applies to all files; blank halves are auto-detected
 * and dropped, exactly like the single-file export.
 */
async function downloadBatchZip() {
  if (!batchFiles.length) return;
  try {
    hideError();
    processing.classList.add('active');

    const saddleStitch = batchSaddleStitchCheckbox.checked;
    const rows = [...batchFileList.querySelectorAll('.file-row')];

    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    const usedNames = new Set();
    let failures = 0;

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const row = rows[i];
      processingLabel.textContent = `${t('booklet.exporting')} (${i + 1}/${batchFiles.length}): ${file.name}`;
      if (row) {
        row.classList.remove('done', 'error');
        row.querySelector('.file-status').textContent = t('booklet.batch.working');
      }
      try {
        const blob = await processBatchFile(file, saddleStitch);
        // Guard against duplicate names (e.g. same name from two folders).
        let name = file.name.replace(/[\\/:]/g, '-');
        if (usedNames.has(name)) {
          const ext = name.replace(/\.pdf$/i, '');
          let n = 2;
          while (usedNames.has(`${ext}-${n}.pdf`)) n++;
          name = `${ext}-${n}.pdf`;
        }
        usedNames.add(name);
        zip.file(name, blob);
        if (row) {
          row.classList.add('done');
          row.querySelector('.file-status').textContent = '✓';
        }
      } catch (err) {
        console.error(err);
        failures++;
        if (row) {
          row.classList.add('error');
          row.querySelector('.file-status').textContent = '✗ ' + err.message;
        }
      }
    }

    if (usedNames.size === 0) throw new Error(t('booklet.error.export'));
    if (failures) showError(`${failures} file(s) failed — see the list`);

    processingLabel.textContent = t('booklet.batch.zipping');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadFile(zipBlob, 'booklets-A4.zip');
    processing.classList.remove('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('booklet.error.export') + ': ' + err.message);
  }
}

/**
 * Process one batch file end-to-end: split into halves, detect blanks,
 * order (saddle-stitch or scan), and generate the A4 PDF.
 * No thumbnails / manual editing in batch mode — it's fully automatic.
 */
async function processBatchFile(file, saddleStitch) {
  const doc = await loadPDF(file);

  const blankByKey = {};
  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    for (const half of ['left', 'right']) {
      const ink = await getHalfInkCoverage(page, half);
      blankByKey[`${p}-${half}`] = ink < BLANK_THRESHOLD;
    }
  }

  const order = saddleStitch ? computeSaddleStitchOrder(doc.numPages) : computeScanOrder(doc.numPages);
  const ordered = order.map(({ pageIndex, half }) => ({
    pageIndex,
    half,
    rotation: 0,
    isBlank: blankByKey[`${pageIndex}-${half}`],
  }));
  // Drop auto-detected blank halves, same as the single-file export.
  const kept = ordered.filter((spec) => !spec.isBlank);

  const blob = await generateBookletPDF(file, kept);
  await doc.destroy();
  return blob;
}

// ---- helpers -------------------------------------------------------------
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.add('active');
}
function hideError() {
  errorMessage.classList.remove('active');
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}