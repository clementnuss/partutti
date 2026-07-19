/**
 * A3 Booklet → A4 — main application logic.
 *
 * One PDF is uploaded per instrument. The PDF contains A3 landscape sheets
 * scanned duplex (front + back of each physical sheet). Each A3 sheet holds
 * two A4 pages side by side. We split every A3 page into a left and right half,
 * auto-detect blank halves, and apply a saddle-stitch reading order by
 * default. The user can manually reorder, rotate, or toggle-blank halves
 * before exporting a single A4 PDF named [piece]-[instrument].pdf.
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
let pdfjsDoc = null;       // PDF.js document
let sourceFile = null;      // original File
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

let nextId = 1;

// ---- file handling -------------------------------------------------------
async function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') await loadFile(file);
}
async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file && file.type === 'application/pdf') await loadFile(file);
}

async function loadFile(file) {
  try {
    hideError();
    editorSection.classList.remove('active');
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

// ---- saddle-stitch ordering ---------------------------------------------
/**
 * Reorder `halves` into saddle-stitch reading order.
 *
 * Duplex A3 booklet. The PDF contains A3 pages in front/back pairs:
 *   PDF page 0 = sheet0 front, page 1 = sheet0 back, page 2 = sheet1 front, ...
 * So the number of physical sheets = ceil(pdfPages / 2), and each physical
 * sheet contributes 4 A4 reading pages (front: 2 halves, back: 2 halves).
 *
 * Saddle-stitch imposition for physical sheet s:
 *   front (PDF page 2s):   left half = last page,  right half = page 1
 *   back  (PDF page 2s+1): left half = page 2,     right half = 2nd-last
 * converging toward the middle.
 *
 * We reorder the existing half specs (preserving pageIndex/half/ink/isBlank)
 * into reading order 1..(numSheets*4).
 */
function applySaddleStitchOrder() {
  const pdfPages = pdfjsDoc.numPages;
  const numSheets = Math.ceil(pdfPages / 2);
  const total = numSheets * 4;

  // Index scan-order halves by [pageIndex][half]
  const byKey = {};
  for (const spec of halves) byKey[`${spec.pageIndex}-${spec.half}`] = spec;

  const ordered = new Array(total);
  let lo = 1;
  let hi = total;
  for (let s = 0; s < numSheets; s++) {
    const frontPage = 2 * s;
    const backPage = 2 * s + 1;

    // Front: left = hi, right = lo
    if (byKey[`${frontPage}-left`]) ordered[hi - 1] = byKey[`${frontPage}-left`];
    if (byKey[`${frontPage}-right`]) ordered[lo - 1] = byKey[`${frontPage}-right`];
    lo++; hi--;

    // Back: left = lo, right = hi (only if that PDF page exists)
    if (backPage < pdfPages) {
      if (byKey[`${backPage}-left`]) ordered[lo - 1] = byKey[`${backPage}-left`];
      if (byKey[`${backPage}-right`]) ordered[hi - 1] = byKey[`${backPage}-right`];
      lo++; hi--;
    }
  }

  // Reassign ids for fresh DOM state, keep everything else.
  halves = ordered.filter(Boolean).map((spec) => ({ ...spec, id: nextId++ }));
  renderEditor();
}

/**
 * Revert to plain scan order: page0-left, page0-right, page1-left, page1-right,
 * ... This is the "just split the A3 pages, don't impose" mode — the halves
 * come out in the same order they appear in the source PDF. Blank/rotation
 * state is preserved by rebuilding from the current specs.
 */
function applyScanOrder() {
  // Collect current specs and index by [pageIndex][half] so we keep any user
  // edits (rotation, blank toggles) while reordering into scan order.
  const byKey = {};
  for (const spec of halves) byKey[`${spec.pageIndex}-${spec.half}`] = spec;

  const ordered = [];
  for (let p = 0; p < pdfjsDoc.numPages; p++) {
    for (const half of ['left', 'right']) {
      const spec = byKey[`${p}-${half}`];
      if (spec) ordered.push({ ...spec, id: nextId++ });
    }
  }
  halves = ordered;
  renderEditor();
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