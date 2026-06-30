/**
 * i18n - Internationalization
 */

const translations = {
  en: {
    // Main page
    'main.title': 'Partutti',
    'main.subtitle': 'PDF tools for brass band musicians',

    // Tools
    'tool.splitter.name': 'PDF Splitter',
    'tool.splitter.desc': 'Automatically split brass band PDFs by instrument using OCR and text detection.',
    'tool.combiner.name': 'PDF Combiner',
    'tool.combiner.desc': 'Combine 2 pages into 1 for A5 printing.',
    'tool.merger.name': 'PDF Merger',
    'tool.merger.desc': 'Merge one common PDF (e.g., lyrics) with all instrument parts.',
    'tool.assembler.name': 'PDF Assembler',
    'tool.assembler.desc': 'Combine all parts into one master PDF with configurable replicas.',

    'tool.booklet.name': 'PDF Booklet → A4',
    'tool.booklet.desc': 'Split scanned A3 booklets into A4 pages and reorder them into reading order.',

    // Common
    'common.back': 'Back to Home',
    'common.download': 'Download',
    'common.processing': 'Processing...',
    'common.error': 'Error',
    'common.cancel': 'Cancel',

    // Splitter
    'splitter.upload.title': 'Drop your PDF here',
    'splitter.upload.subtitle': 'Upload a PDF containing multiple instrument parts',
    'splitter.upload.browse': 'or click to browse',
    'splitter.detected.title': 'Detected Splits',
    'splitter.filename.label': 'Base filename for splits:',
    'splitter.filename.placeholder': 'e.g., Better',
    'splitter.download.all': 'Download All',
    'splitter.download.zip': 'Download as ZIP',
    'splitter.merge.up': 'Merge Up',
    'splitter.merge.down': 'Merge Down',
    'splitter.split.pages': 'Split Pages',
    'splitter.delete': 'Delete',
    'splitter.processing': 'Processing PDF and detecting instruments...',
    'splitter.processing.ocr': 'Using OCR to detect instruments...',
    'splitter.page': 'Page',
    'splitter.pages': 'Pages',

    // Combiner
    'combiner.upload.title': 'Drop PDF files or ZIP here',
    'combiner.upload.subtitle': 'Upload multiple PDF files or a ZIP containing PDFs',
    'combiner.upload.browse': 'or click to browse',
    'combiner.first.alone': 'First page alone',
    'combiner.crop.enable': 'Enable margin cropping',
    'combiner.crop.percent': 'Crop percentage:',
    'combiner.zip.filename': 'ZIP filename:',
    'combiner.download.all': 'Download All',
    'combiner.download.zip': 'Download as ZIP',

    // Merger
    'merger.step1.title': 'Step 1: Upload the common PDF (lyrics, etc.)',
    'merger.step1.subtitle': 'Drop your common PDF here or click to browse',
    'merger.step2.title': 'Step 2: Upload the parts PDFs',
    'merger.step2.subtitle': 'Drop PDF files or ZIP containing parts',
    'merger.preview.title': 'Preview',
    'merger.download.all': 'Download All Parts',
    'merger.download.zip': 'Download as ZIP',

    // Assembler
    'assembler.upload.title': 'Drop PDF files or ZIP here',
    'assembler.upload.subtitle': 'Upload multiple PDF files or a ZIP containing PDFs',
    'assembler.upload.browse': 'or click to browse',
    'assembler.configure.title': 'Configure Parts',
    'assembler.configure.subtitle': 'Set the number of copies for each part. The final PDF will contain all parts in the order shown below.',
    'assembler.filename.label': 'Output filename:',
    'assembler.filename.placeholder': 'assembled-parts',
    'assembler.assemble': 'Assemble & Download PDF',
    'assembler.copies': 'Copies:',
    'assembler.total': 'Total:',
    'assembler.page': 'page',
    'assembler.pages': 'pages',

    // Booklet
    'booklet.upload.title': 'Drop one A3 booklet PDF here',
    'booklet.upload.subtitle': 'One instrument per file. A3 landscape, duplex scan.',
    'booklet.upload.browse': 'or click to browse',
    'booklet.piece.label': 'Piece name',
    'booklet.piece.placeholder': 'e.g., Apocalyptica',
    'booklet.instrument.label': 'Instrument',
    'booklet.instrument.placeholder': 'e.g., Cornet 1',
    'booklet.processing': 'Processing PDF...',
    'booklet.exporting': 'Exporting A4 PDF...',
    'booklet.editor.title': 'Pages (reading order)',
    'booklet.autoOrder': 'Auto-reorder (saddle-stitch)',
    'booklet.download': 'Download A4 PDF',
    'booklet.blank': 'blank',
    'booklet.markBlank': 'Mark blank',
    'booklet.unmarkBlank': 'Mark filled',
    'booklet.move.up': 'Move up',
    'booklet.move.down': 'Move down',
    'booklet.rotate': 'Rotate 90°',
    'booklet.sheet': 'Sheet',
    'booklet.error.load': 'Failed to load PDF',
    'booklet.error.export': 'Failed to export PDF',

    // Footer
    'footer.star': 'Star on GitHub',
    'footer.bug': 'Report Bug / Request Feature',
  },

  de: {
    // Main page
    'main.title': 'Partutti',
    'main.subtitle': 'PDF-Werkzeuge für Brass-Band-Musiker',

    // Tools
    'tool.splitter.name': 'PDF-Teiler',
    'tool.splitter.desc': 'Teilt Brass-Band-PDFs automatisch nach Instrumenten mit OCR und Texterkennung.',
    'tool.combiner.name': 'PDF-Kombinierer',
    'tool.combiner.desc': 'Kombiniert 2 Seiten zu 1 für A5-Druck.',
    'tool.merger.name': 'PDF-Zusammenführer',
    'tool.merger.desc': 'Fügt eine gemeinsame PDF (z.B. Liedtexte) mit allen Instrumentenstimmen zusammen.',
    'tool.assembler.name': 'PDF-Assembler',
    'tool.assembler.desc': 'Kombiniert alle Stimmen in eine Master-PDF mit konfigurierbaren Kopien.',

    'tool.booklet.name': 'PDF-Heft → A4',
    'tool.booklet.desc': 'Zerlegt gescannte A3-Hefte in A4-Seiten und sortiert sie in die Lesereihenfolge.',

    // Common
    'common.back': 'Zurück zur Startseite',
    'common.download': 'Herunterladen',
    'common.processing': 'Verarbeitung...',
    'common.error': 'Fehler',
    'common.cancel': 'Abbrechen',

    // Splitter
    'splitter.upload.title': 'PDF hier ablegen',
    'splitter.upload.subtitle': 'Laden Sie eine PDF mit mehreren Instrumentenstimmen hoch',
    'splitter.upload.browse': 'oder klicken Sie zum Durchsuchen',
    'splitter.detected.title': 'Erkannte Teile',
    'splitter.filename.label': 'Basis-Dateiname für Teile:',
    'splitter.filename.placeholder': 'z.B., Better',
    'splitter.download.all': 'Alle herunterladen',
    'splitter.download.zip': 'Als ZIP herunterladen',
    'splitter.merge.up': 'Nach oben zusammenführen',
    'splitter.merge.down': 'Nach unten zusammenführen',
    'splitter.split.pages': 'Seiten trennen',
    'splitter.delete': 'Löschen',
    'splitter.processing': 'PDF wird verarbeitet und Instrumente erkannt...',
    'splitter.processing.ocr': 'OCR wird verwendet zur Instrumentenerkennung...',
    'splitter.page': 'Seite',
    'splitter.pages': 'Seiten',

    // Combiner
    'combiner.upload.title': 'PDF-Dateien oder ZIP hier ablegen',
    'combiner.upload.subtitle': 'Laden Sie mehrere PDF-Dateien oder eine ZIP mit PDFs hoch',
    'combiner.upload.browse': 'oder klicken Sie zum Durchsuchen',
    'combiner.first.alone': 'Erste Seite allein',
    'combiner.crop.enable': 'Randschnitt aktivieren',
    'combiner.crop.percent': 'Schnitt-Prozentsatz:',
    'combiner.zip.filename': 'ZIP-Dateiname:',
    'combiner.download.all': 'Alle herunterladen',
    'combiner.download.zip': 'Als ZIP herunterladen',

    // Merger
    'merger.step1.title': 'Schritt 1: Gemeinsame PDF hochladen (Liedtexte, etc.)',
    'merger.step1.subtitle': 'Gemeinsame PDF hier ablegen oder klicken zum Durchsuchen',
    'merger.step2.title': 'Schritt 2: Stimmen-PDFs hochladen',
    'merger.step2.subtitle': 'PDF-Dateien oder ZIP mit Stimmen ablegen',
    'merger.preview.title': 'Vorschau',
    'merger.download.all': 'Alle Stimmen herunterladen',
    'merger.download.zip': 'Als ZIP herunterladen',

    // Assembler
    'assembler.upload.title': 'PDF-Dateien oder ZIP hier ablegen',
    'assembler.upload.subtitle': 'Laden Sie mehrere PDF-Dateien oder eine ZIP mit PDFs hoch',
    'assembler.upload.browse': 'oder klicken Sie zum Durchsuchen',
    'assembler.configure.title': 'Stimmen konfigurieren',
    'assembler.configure.subtitle': 'Legen Sie die Anzahl der Kopien für jede Stimme fest. Die endgültige PDF enthält alle Stimmen in der unten gezeigten Reihenfolge.',
    'assembler.filename.label': 'Ausgabedateiname:',
    'assembler.filename.placeholder': 'zusammengefügte-stimmen',
    'assembler.assemble': 'Zusammenfügen & PDF herunterladen',
    'assembler.copies': 'Kopien:',
    'assembler.total': 'Gesamt:',
    'assembler.page': 'Seite',
    'assembler.pages': 'Seiten',

    // Booklet
    'booklet.upload.title': 'Ein A3-Heft-PDF hier ablegen',
    'booklet.upload.subtitle': 'Ein Instrument pro Datei. A3 Querformat, Duplex-Scan.',
    'booklet.upload.browse': 'oder klicken zum Durchsuchen',
    'booklet.piece.label': 'Stückname',
    'booklet.piece.placeholder': 'z.B., Apocalyptica',
    'booklet.instrument.label': 'Instrument',
    'booklet.instrument.placeholder': 'z.B., Cornet 1',
    'booklet.processing': 'PDF wird verarbeitet...',
    'booklet.exporting': 'A4-PDF wird exportiert...',
    'booklet.editor.title': 'Seiten (Lesereihenfolge)',
    'booklet.autoOrder': 'Auto-Sortierung (Heftbindung)',
    'booklet.download': 'A4-PDF herunterladen',
    'booklet.blank': 'leer',
    'booklet.markBlank': 'Als leer markieren',
    'booklet.unmarkBlank': 'Als gefüllt markieren',
    'booklet.move.up': 'Nach oben',
    'booklet.move.down': 'Nach unten',
    'booklet.rotate': '90° drehen',
    'booklet.sheet': 'Blatt',
    'booklet.error.load': 'PDF konnte nicht geladen werden',
    'booklet.error.export': 'PDF konnte nicht exportiert werden',

    // Footer
    'footer.star': 'Mit Stern auf GitHub markieren',
    'footer.bug': 'Fehler melden / Funktion anfordern',
  },

  fr: {
    // Main page
    'main.title': 'Partutti',
    'main.subtitle': 'Outils PDF pour musiciens de brass band',

    // Tools
    'tool.splitter.name': 'Diviseur PDF',
    'tool.splitter.desc': 'Divise automatiquement les PDFs de brass band par instrument avec OCR et détection de texte.',
    'tool.combiner.name': 'Combineur PDF',
    'tool.combiner.desc': 'Combine 2 pages en 1 pour impression A5.',
    'tool.merger.name': 'Fusionneur PDF',
    'tool.merger.desc': 'Fusionne un PDF commun (par ex. paroles) avec toutes les parties instrumentales.',
    'tool.assembler.name': 'Assembleur PDF',
    'tool.assembler.desc': 'Combine toutes les parties en un seul PDF avec un nombre de copies par instrument configurable.',

    'tool.booklet.name': 'PDF Livret → A4',
    'tool.booklet.desc': 'Découpe les livrets A3 scannés en pages A4 et les remet dans l\'ordre de lecture.',

    // Common
    'common.back': 'Retour à l\'accueil',
    'common.download': 'Télécharger',
    'common.processing': 'Traitement en cours...',
    'common.error': 'Erreur',
    'common.cancel': 'Annuler',

    // Splitter
    'splitter.upload.title': 'Déposez votre PDF ici',
    'splitter.upload.subtitle': 'Téléversez un PDF contenant plusieurs parties instrumentales',
    'splitter.upload.browse': 'ou cliquez pour parcourir',
    'splitter.detected.title': 'Parties détectées',
    'splitter.filename.label': 'Nom de fichier de base pour les parties :',
    'splitter.filename.placeholder': 'par ex., Better',
    'splitter.download.all': 'Tout télécharger',
    'splitter.download.zip': 'Télécharger en ZIP',
    'splitter.merge.up': 'Fusionner vers le haut',
    'splitter.merge.down': 'Fusionner vers le bas',
    'splitter.split.pages': 'Séparer les pages',
    'splitter.delete': 'Supprimer',
    'splitter.processing': 'Traitement du PDF et détection des instruments...',
    'splitter.processing.ocr': 'Utilisation de l\'OCR pour détecter les instruments...',
    'splitter.page': 'Page',
    'splitter.pages': 'Pages',

    // Combiner
    'combiner.upload.title': 'Déposez les fichiers PDF ou ZIP ici',
    'combiner.upload.subtitle': 'Téléversez plusieurs fichiers PDF ou un ZIP contenant des PDFs',
    'combiner.upload.browse': 'ou cliquez pour parcourir',
    'combiner.first.alone': 'Première page seule',
    'combiner.crop.enable': 'Activer le rognage des marges',
    'combiner.crop.percent': 'Pourcentage de rognage :',
    'combiner.zip.filename': 'Nom du fichier ZIP :',
    'combiner.download.all': 'Tout télécharger',
    'combiner.download.zip': 'Télécharger en ZIP',

    // Merger
    'merger.step1.title': 'Étape 1 : Téléverser le PDF commun (paroles, etc.)',
    'merger.step1.subtitle': 'Déposez votre PDF commun ici ou cliquez pour parcourir',
    'merger.step2.title': 'Étape 2 : Téléverser les PDFs des parties',
    'merger.step2.subtitle': 'Déposez les fichiers PDF ou ZIP contenant les parties',
    'merger.preview.title': 'Aperçu',
    'merger.download.all': 'Télécharger toutes les parties',
    'merger.download.zip': 'Télécharger en ZIP',

    // Assembler
    'assembler.upload.title': 'Déposez les fichiers PDF ou ZIP ici',
    'assembler.upload.subtitle': 'Téléversez plusieurs fichiers PDF ou un ZIP contenant des PDFs',
    'assembler.upload.browse': 'ou cliquez pour parcourir',
    'assembler.configure.title': 'Configurer les parties',
    'assembler.configure.subtitle': 'Définissez le nombre de copies pour chaque partie. Le PDF final contiendra toutes les parties dans l\'ordre indiqué ci-dessous.',
    'assembler.filename.label': 'Nom du fichier de sortie :',
    'assembler.filename.placeholder': 'parties-assemblées',
    'assembler.assemble': 'Assembler et télécharger le PDF',
    'assembler.copies': 'Copies :',
    'assembler.total': 'Total :',
    'assembler.page': 'page',
    'assembler.pages': 'pages',

    // Booklet
    'booklet.upload.title': 'Déposez un PDF livret A3 ici',
    'booklet.upload.subtitle': 'Un instrument par fichier. A3 paysage, scan recto-verso.',
    'booklet.upload.browse': 'ou cliquez pour parcourir',
    'booklet.piece.label': 'Nom du morceau',
    'booklet.piece.placeholder': 'par ex., Apocalyptica',
    'booklet.instrument.label': 'Instrument',
    'booklet.instrument.placeholder': 'par ex., Cornet 1',
    'booklet.processing': 'Traitement du PDF...',
    'booklet.exporting': 'Export du PDF A4...',
    'booklet.editor.title': 'Pages (ordre de lecture)',
    'booklet.autoOrder': 'Réordonnancer (livret agrafé)',
    'booklet.download': 'Télécharger le PDF A4',
    'booklet.blank': 'vide',
    'booklet.markBlank': 'Marquer vide',
    'booklet.unmarkBlank': 'Marquer rempli',
    'booklet.move.up': 'Monter',
    'booklet.move.down': 'Descendre',
    'booklet.rotate': 'Pivoter 90°',
    'booklet.sheet': 'Feuille',
    'booklet.error.load': 'Échec du chargement du PDF',
    'booklet.error.export': 'Échec de l\'export du PDF',

    // Footer
    'footer.star': 'Ajouter une étoile sur GitHub',
    'footer.bug': 'Signaler un bug / Demander une fonctionnalité',
  }
};

// Detect browser language
function detectBrowserLanguage() {
  // Get browser language (e.g., 'en-US', 'de-CH', 'fr-FR')
  const browserLang = navigator.language || navigator.userLanguage;

  // Extract base language code (e.g., 'en' from 'en-US')
  const langCode = browserLang.split('-')[0];

  // Check if we support this language
  if (translations[langCode]) {
    return langCode;
  }

  // Fallback to English
  return 'en';
}

// Current language (priority: saved > browser > default)
let currentLang = localStorage.getItem('partkit-lang') || detectBrowserLanguage();

// Get translation
export function t(key) {
  return translations[currentLang]?.[key] || translations['en'][key] || key;
}

// Set language
export function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    localStorage.setItem('partkit-lang', lang);
    updatePageTranslations();
  }
}

// Get current language
export function getCurrentLanguage() {
  return currentLang;
}

// Get available languages
export function getAvailableLanguages() {
  return [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
  ];
}

// Update all elements with data-i18n attribute
function updatePageTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);

    // Update based on element type
    if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
      el.placeholder = translation;
    } else if (el.tagName === 'INPUT' && el.type === 'button') {
      el.value = translation;
    } else if (el.tagName === 'BUTTON') {
      el.textContent = translation;
    } else {
      el.textContent = translation;
    }
  });

  // Update document title if present
  const titleKey = document.documentElement.getAttribute('data-i18n-title');
  if (titleKey) {
    document.title = t(titleKey);
  }
}

// Initialize translations on page load
export function initI18n() {
  updatePageTranslations();
  createLanguageSwitcher();
}

// Create language switcher UI
function createLanguageSwitcher() {
  const switcher = document.createElement('div');
  switcher.className = 'language-switcher';
  switcher.innerHTML = `
    <select id="lang-select" onchange="window.changeLanguage(this.value)">
      ${getAvailableLanguages().map(lang => `
        <option value="${lang.code}" ${currentLang === lang.code ? 'selected' : ''}>
          ${lang.flag} ${lang.name}
        </option>
      `).join('')}
    </select>
  `;

  // Add CSS
  const style = document.createElement('style');
  style.textContent = `
    .language-switcher {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
    }

    #lang-select {
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 0.9rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    #lang-select:hover {
      border-color: #4CAF50;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(switcher);
}

// Expose to window for inline event handlers
window.changeLanguage = function(lang) {
  setLanguage(lang);
  // Reload page to apply translations
  window.location.reload();
};
