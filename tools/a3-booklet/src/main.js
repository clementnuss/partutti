/**
 * A4 → A3 Booklet — main logic. Multiple A4 PDFs (or a ZIP of them), each
 * imposed independently in saddle-stitch or sequential mode (per-file
 * toggle), previewed per sheet, and exported as [name]-A3.pdf files.
 */

import {
  loadPDF,
  renderPageThumbnail,
  computeLayout,
  generateA3BookletPDF,
} from './pdf-processor.js';
import { t } from '../../../i18n.js';

let items = []; // { file, name, pdfDoc, numPages, sequential, thumbs, layout }

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const processingLabel = document.getElementById('processingLabel');
const previewSection = document.getElementById('previewSection');
const filesList = document.getElementById('filesList');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const errorMessage = document.getElementById('errorMessage');
const fileInfo = document.getElementById('fileInfo');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
downloadAllBtn.addEventListener('click', downloadAll);
downloadZipBtn.addEventListener('click', downloadAllAsZip);

async function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  await processFiles(Array.from(e.dataTransfer.files));
}

async function handleFileSelect(e) {
  await processFiles(Array.from(e.target.files));
}

async function processFiles(files) {
  try {
    hideError();
    previewSection.classList.remove('active');
    processing.classList.add('active');
    processingLabel.textContent = t('a3booklet.processing');

    items = [];

    const pdfFiles = [];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        for (const pdfFile of await extractPDFsFromZip(file)) pdfFiles.push(pdfFile);
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push(file);
      }
    }

    if (pdfFiles.length === 0) throw new Error(t('a3booklet.error.nofiles'));

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      processingLabel.textContent = `${t('a3booklet.processing')} (${i + 1}/${pdfFiles.length})`;

      const pdfDoc = await loadPDF(file);
      const thumbs = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const canvas = await renderPageThumbnail(page, 400); // wide enough for the 2.4x hover zoom
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        thumbs.push(canvas);
      }

      const item = {
        file,
        name: file.name,
        pdfDoc,
        numPages: pdfDoc.numPages,
        sequential: false,
        thumbs,
        layout: null,
      };
      item.layout = computeLayout(item.numPages, item.sequential);
      items.push(item);
    }

    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `<strong>✓ ${items.length} ${t('a3booklet.files')}</strong>`;

    renderPreview();

    processing.classList.remove('active');
    previewSection.classList.add('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('a3booklet.error.load') + ': ' + err.message);
  }
}

async function extractPDFsFromZip(zipFile) {
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  const zip = await JSZip.loadAsync(zipFile);
  const pdfFiles = [];
  for (const [filename, entry] of Object.entries(zip.files)) {
    if (!entry.dir && filename.toLowerCase().endsWith('.pdf')) {
      const blob = await entry.async('blob');
      pdfFiles.push(new File([blob], filename, { type: 'application/pdf' }));
    }
  }
  return pdfFiles;
}

function renderPreview() {
  filesList.innerHTML = '';

  items.forEach((item, idx) => {
    const block = document.createElement('div');
    block.className = 'file-block';

    const header = document.createElement('div');
    header.className = 'file-header';

    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = `${idx + 1}. ${item.name} — ${item.numPages} ${t('a3booklet.pages')}, ${item.layout.sheets.length} × A3`;
    header.appendChild(name);

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'mode-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = item.sequential;
    toggle.addEventListener('change', () => {
      item.sequential = toggle.checked;
      item.layout = computeLayout(item.numPages, item.sequential);
      renderPreview();
    });
    toggleLabel.appendChild(toggle);
    const toggleText = document.createElement('span');
    toggleText.textContent = t('a3booklet.sequential');
    toggleLabel.appendChild(toggleText);
    header.appendChild(toggleLabel);

    block.appendChild(header);

    const blankCount = item.layout.sheets.reduce(
      (acc, s) => acc + [...s.front, ...s.back].filter((p) => p === 0).length, 0);
    if (blankCount > 0) {
      const notice = document.createElement('div');
      notice.className = 'padding-notice active';
      const key = item.sequential ? 'a3booklet.notice.sequential' : 'a3booklet.notice.saddle';
      notice.textContent = t(key)
        .replace('{pages}', item.numPages)
        .replace('{blanks}', blankCount);
      block.appendChild(notice);
    }

    const grid = document.createElement('div');
    grid.className = 'sheets-grid';

    item.layout.sheets.forEach((sheet, s) => {
      const card = document.createElement('div');
      card.className = 'sheet-card';

      const num = document.createElement('div');
      num.className = 'sheet-num';
      num.textContent = `${t('a3booklet.sheet')} ${s + 1}`;
      card.appendChild(num);

      for (const [sideKey, slots] of [['front', sheet.front], ['back', sheet.back]]) {
        const row = document.createElement('div');
        row.className = 'side-row';

        const label = document.createElement('div');
        label.className = 'side-label';
        label.textContent = sideKey === 'front' ? t('a3booklet.front') : t('a3booklet.back');
        row.appendChild(label);

        const sideThumbs = document.createElement('div');
        sideThumbs.className = 'side-thumbnails';

        slots.forEach((logical) => {
          const slot = document.createElement('div');
          slot.className = 'slot' + (logical === 0 ? ' blank-slot' : '');

          if (logical !== 0 && item.thumbs[logical - 1]) {
            const clone = document.createElement('canvas');
            const src = item.thumbs[logical - 1];
            clone.width = src.width;
            clone.height = src.height;
            clone.getContext('2d').drawImage(src, 0, 0);
            slot.appendChild(clone);
          }

          const badge = document.createElement('div');
          badge.className = 'page-badge';
          badge.textContent = logical === 0 ? t('a3booklet.blank') : String(logical);
          slot.appendChild(badge);

          // Zoom inward when magnifying slots at the viewport edges.
          slot.addEventListener('mouseenter', () => {
            const rect = slot.getBoundingClientRect();
            const grownW = rect.width * 2.4;
            const leftEdge = rect.left - (grownW - rect.width) / 2;
            const rightEdge = rect.right + (grownW - rect.width) / 2;

            if (leftEdge < 0) slot.style.transformOrigin = 'left center';
            else if (rightEdge > window.innerWidth) slot.style.transformOrigin = 'right center';
            else slot.style.transformOrigin = 'center center';
          });

          sideThumbs.appendChild(slot);
        });

        row.appendChild(sideThumbs);
        card.appendChild(row);
      }

      grid.appendChild(card);
    });

    block.appendChild(grid);
    filesList.appendChild(block);
  });
}

function outputName(item) {
  const base = item.name.replace(/\.[^./]+$/, '');
  return `${base}-A3.pdf`;
}

async function downloadAll() {
  try {
    hideError();
    for (let i = 0; i < items.length; i++) {
      processing.classList.add('active');
      processingLabel.textContent = `${t('a3booklet.exporting')} (${i + 1}/${items.length})`;
      const blob = await generateA3BookletPDF(items[i].file, items[i].layout.sheets);
      downloadFile(blob, outputName(items[i]));
      await new Promise((r) => setTimeout(r, 100));
    }
    processing.classList.remove('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('a3booklet.error.export') + ': ' + err.message);
  }
}

async function downloadAllAsZip() {
  try {
    hideError();
    processing.classList.add('active');
    processingLabel.textContent = t('a3booklet.exporting');

    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();

    for (let i = 0; i < items.length; i++) {
      processingLabel.textContent = `${t('a3booklet.exporting')} (${i + 1}/${items.length})`;
      const blob = await generateA3BookletPDF(items[i].file, items[i].layout.sheets);
      zip.file(outputName(items[i]), blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadFile(zipBlob, 'a3-booklets.zip');
    processing.classList.remove('active');
  } catch (err) {
    console.error(err);
    processing.classList.remove('active');
    showError(t('a3booklet.error.export') + ': ' + err.message);
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

function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.add('active');
}
function hideError() {
  errorMessage.classList.remove('active');
}