# AGENTS.md

Guidance for AI agents working in this repo. See `CLAUDE.md` for the PDF Splitter's detailed design history (note: partly outdated — OCR fallback now exists).

## Commands

```bash
npm install      # use npm, NOT pnpm, despite pnpm-lock.yaml being present
npm run dev      # Vite dev server on http://localhost:3000, auto-opens browser
npm run build    # Multi-page build into dist/ (with sourcemaps)
npm run preview  # Preview the production build
```

There is no test suite, linter, formatter, or typecheck configured. Verify changes by running `npm run build` and exercising the relevant tool in the browser.

## Architecture

Single Vite app with **6 HTML entrypoints** declared in `vite.config.js` (`rollupOptions.input`): the root landing page plus five tools under `tools/`:

- `tools/pdf-splitter/` — split brass band PDFs by instrument (OCR + text detection)
- `tools/pdf-combiner/` — combine 2 pages into 1 for A5 printing
- `tools/pdf-merger/` — prepend a common PDF (lyrics) to each part
- `tools/pdf-assembler/` — assemble parts into one master PDF with replicas
- `tools/pdf-booklet/` — split scanned A3 duplex booklets into A4 pages in reading order

Each tool is a standalone `index.html` + `src/*.js` pair; there is one entrypoint per tool, not nested routing. The per-tool `package.json` files in `pdf-merger/` and `pdf-assembler/` are **not used** — only the root `package.json` drives dev/build. Do not run install or scripts inside `tools/*/`.

### Shared and duplicated code

- `i18n.js` at repo root is imported by every tool via the relative path `../../../i18n.js`. It is the single source of translation strings; see `I18N.md` for the key taxonomy. To add a language, edit `i18n.js` (translations object + `getAvailableLanguages()`).
- `pdf-processor.js` exists **separately** in both `tools/pdf-splitter/src/` and `tools/pdf-combiner/src/` — they are independent copies, not a shared module. Do not assume changes to one propagate to the other.

### Runtime-loaded CDN dependencies

`pdfjs-dist`, `pdf-lib`, and `fuse.js` are npm dependencies. **Tesseract.js and JSZip are not** — they are loaded at runtime via dynamic ESM imports from `cdn.jsdelivr.net`:

- Tesseract.js v5 — `tools/pdf-splitter/src/pdf-processor.js` (OCR fallback for scanned PDFs)
- JSZip 3.10.1 — all four tools' `main.js` (ZIP read/write)

`npm install` will **not** fetch these; they require network access at runtime. Keep version pins consistent if updating.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds with Node 20 and deploys `dist/` to GitHub Pages on every push to `main`. No server-side component — all PDF processing is client-side (privacy feature called out in README).

## Conventions

- Vanilla JS with ES modules throughout; no framework, no TypeScript, no bundler config beyond `vite.config.js`.
- Output filenames follow `[base]-[instrument].pdf`, capitalization preserved, spaces → hyphens. Preserve this when touching filename logic in `pdf-splitter.js`.
- PDF.js Y-coordinates are measured from the bottom of the page, and margin-trimmed PDFs can have text coordinates outside the viewport — use actual text coordinate ranges, not viewport dimensions (see `pdf-processor.js`).