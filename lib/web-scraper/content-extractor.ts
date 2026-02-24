/**
 * Service d'extraction intelligente du contenu web
 * Détecte automatiquement le contenu principal et supprime le bruit
 */

import * as cheerio from 'cheerio'
import type { CheerioAPI, Cheerio } from 'cheerio'
import type { Element } from 'domhandler'
import type { CssSelectors, LinkedFile, ScrapedContent, LegalContext, SiteStructure, ExtractionConfig, StructuredLegalContent } from './types'
import { TUNISIAN_CODES } from './types'
import { normalizeArabicText } from './arabic-text-utils'

/**
 * Configuration d'extraction par défaut pour 9anoun.tn
 */
const EXTRACTION_CONFIGS: Record<string, ExtractionConfig> = {
  '9anoun.tn': {
    noisePatterns: [
      'متوفر باللغة\\s*(FR|AR|EN)(\\s*(FR|AR|EN))*',
      'تقرير\\s*انشر',
      'هل كانت هذه المعلومات مفيدة لك\\s*[؟?]?',
      'النص الموالي',
      'أو إكتشف أكثر نصوص قانونية على منصة قانون',
      'جميع النصوص\\s*(المجلات القانونية)?\\s*(الاتفاقيات الدولية)?',
      'اطلع على الدليل والبودكاست',
      'عرض الدليل\\s*←?',
      'صعبوا عليك القوانين\\s*[؟?]?',
      'القوانين المتعلقة بالمواضيع إلي يهموك أكثر',
      'ملخصة في أقل من \\d+ نقطة',
      'تحميل المزيد من العناصر',
      'التحميل\\.\\.\\.',
      "'?9anoun'?\\s*لقراءة مبسطة\\s*،?",
      'نبدأ\\s+',
      'كل تفاصيل العدد',
    ],
    removeSelectors: [
      '.feedback',
      '.rating',
      '.share-buttons',
      '.language-switcher',
      '[class*="cookie"]',
      '.podcast-promo',
    ],
    preserveHierarchy: true,
    hierarchySelectors: {
      book: '.book-title, .كتاب',
      part: '.part-title, .باب',
      chapter: '.chapter-title, .قسم',
      section: '.section-title, .فرع',
      article: '.article-number, .فصل',
    },
    contentLanguage: 'ar',
  },
  'cassation.tn': {
    noisePatterns: [
      'Responsive image',
      'جميع الحقوق محفوظة',
      'Copyright.*cassation\\.tn',
      'Powered by TYPO3',
      'عنوان الاتصال',
      'الهاتف\\s*:?\\s*\\d+',
      'الفاكس\\s*:?\\s*\\d+',
    ],
    removeSelectors: [
      '#cssmenu',
      '#root-line',
      '.nivo-slider-wrapper',
      '.nivo-html-caption',
      '#home-act',
      '#footer',
      '#footer-bottom',
      '.breadcrumb',
      '.language-bar',
      'form[name="search"]',
    ],
    legalContentSelector: '#wd-content .tx-upload-example',
    contentLanguage: 'ar',
  },
  'legislation.tn': {
    noisePatterns: [
      'جميع الحقوق محفوظة',
      'Copyright.*legislation\\.tn',
      'وزارة العدل',
      'Ministère de la Justice',
      'عنوان الاتصال',
      'تسجيل الدخول',
      'إنشاء حساب',
    ],
    removeSelectors: [
      '.header',
      '.footer',
      '.sidebar',
      '.breadcrumb',
      '.login-form',
      '.search-form',
      '.pagination',
      '#menu',
      '.menu',
      '.navbar',
      '.social-links',
    ],
    preserveHierarchy: true,
    hierarchySelectors: {
      book: '.livre, .كتاب',
      part: '.titre, .باب',
      chapter: '.chapitre, .قسم',
      section: '.section, .فرع',
      article: '.article, .فصل',
    },
    contentLanguage: 'ar',
  },
  'iort.gov.tn': {
    noisePatterns: [
      'جميع الحقوق محفوظة',
      'Copyright.*IORT',
      'المطبعة الرسمية',
      'Imprimerie Officielle',
      'عنوان الاتصال',
      'الهاتف\\s*:?\\s*\\d+',
      'الفاكس\\s*:?\\s*\\d+',
      'WD_ACTION_',
      'WD_FORM_',
    ],
    removeSelectors: [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.menu',
      '.navigation',
      '[class*="menu"]',
      '[class*="Menu"]',
      '[class*="entete"]',
      '[class*="pied"]',
      'form[name*="WD"]',
    ],
    legalContentSelector: '.contenu, .texte, td.texte, td.contenu',
    contentLanguage: 'ar',
  },
  'e-services.judicaire.gov.tn': {
    noisePatterns: [
      'جميع الحقوق محفوظة',
      'Copyright',
      'Tous droits réservés',
      'وزارة العدل',
    ],
    removeSelectors: [
      '.header',
      '.footer',
      '.sidebar',
      '.breadcrumb',
      '.login-form',
      '#menu',
      '.navbar',
    ],
    contentLanguage: 'ar',
  },
  'da5ira.com': {
    noisePatterns: [
      'Aucun commentaire',
      'Publié par',
      '\\d+ commentaires?',
      'Libellés\\s*:',
      'Partager',
      'Envoyer par e-mail',
      'جميع الحقوق محفوظة',
    ],
    removeSelectors: [
      '#comments',
      '.comment-form',
      '.post-footer',
      '.blog-pager',
      '.sidebar',
      '#sidebar',
      '.widget',
      'nav',
      'header',
      'footer',
    ],
    legalContentSelector: '.post-body, .entry-content, article',
    contentLanguage: 'mixed',
  },
  'justice.gov.tn': {
    noisePatterns: [
      'جميع الحقوق محفوظة',
      'وزارة العدل',
      'Copyright.*justice\\.gov\\.tn',
      'Ministère de la Justice',
      'تسجيل الدخول',
      'إنشاء حساب',
    ],
    removeSelectors: [
      'header',
      'footer',
      'nav',
      '.sidebar',
      '.breadcrumb',
      '.login-form',
      '#menu',
      '.navbar',
      '.social-links',
    ],
    legalContentSelector: '.content-area, .main-content, #content, article',
    contentLanguage: 'ar',
  },
  'jurisitetunisie.com': {
    noisePatterns: [
      // Éléments forum/navigation
      'Répondre\\s+à\\s+ce\\s+sujet',
      'Pages?\\s*:\\s*\\[\\d+\\]',
      'Dernier message',
      'Auteur\\s*:\\s*',
      'Hors ligne',
      'Messages?\\s*:\\s*\\d+',
      'Inscrit depuis\\s*:',
      'Citer',
      'Modifier',
      'Signaler',

      // Footer/copyright
      'جميع الحقوق محفوظة',
      'Copyright.*jurisitetunisie',
      'Powered by.*SMF',
      'Simple Machines',

      // Publicité/widgets
      'Publicité',
      'Sponsorisé',
      'Partenaires',

      // Navigation forum
      'Sujet suivant',
      'Sujet précédent',
      'Retour au forum',
      'Index du forum',
    ],
    removeSelectors: [
      // Navigation forum
      '#upshrink',
      '.navigate_section',
      '.pagesection',
      '.moderatorbar',
      '.postarea',
      '.poster',
      '.keyinfo',

      // Sidebar/widgets
      '#upshrinkHeaderIC',
      '.boardindex_table',
      '.info_frame',

      // Footer/header
      '#header',
      '#footer',
      '#footerarea',
      '.copyright',

      // Forum metadata
      '.signature',
      '.quote',
      '.quoteheader',
      '.codeheader',

      // Boutons actions
      '.post_options',
      '.moderatorbar_options',
      '.quickReplyButtons',
    ],
    legalContentSelector: '.cms_article_content, .post, #bodyarea',
    contentLanguage: 'mixed', // FR et AR
  },
}

/**
 * Obtient la configuration d'extraction pour un domaine
 */
function getExtractionConfig(url: string, customConfig?: ExtractionConfig): ExtractionConfig {
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    const baseConfig = EXTRACTION_CONFIGS[domain] || {}
    return { ...baseConfig, ...customConfig }
  } catch {
    return customConfig || {}
  }
}
import crypto from 'crypto'
import { extractSiteStructure } from './site-structure-extractor'

// Sélecteurs par défaut pour le contenu principal
const DEFAULT_CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.content-body',
  '.article-body',
  '#content',
  '#main-content',
  '#article',
  '.article',
  '.post',
  '.entry',
]

// Sélecteurs spécifiques pour le contenu juridique
const LEGAL_CONTENT_SELECTORS = [
  // Contenu législatif
  '.law-content',
  '.legal-text',
  '.legislation',
  '.code-text',
  '.article-law',
  '.texte-loi',
  '.contenu-juridique',
  // Jurisprudence
  '.decision',
  '.jugement',
  '.arret',
  '.jurisprudence',
  '.verdict',
  // JORT (Journal Officiel)
  '.jort-content',
  '.official-journal',
  '.journal-officiel',
  // Sites juridiques tunisiens connus
  '.code-article',
  '.law-article',
  '#law-content',
  '#legal-content',
  '.texte-integral',
  '.contenu-texte',
  // 9anoun.tn patterns
  '.prose',
  '.kb-content',
  '.code-content',
  '[class*="content"]',
  // Patterns arabes
  '[dir="rtl"] article',
  '[dir="rtl"] main',
  '[lang="ar"] article',
  '[lang="ar"] main',
]

// Patterns pour détecter les références juridiques dans le texte
const LEGAL_REFERENCE_PATTERNS = {
  // ========== LÉGISLATION TUNISIENNE ==========
  // Lois
  lois: [
    /(?:قانون\s*(?:أساسي\s*)?عدد|loi\s*(?:organique\s*)?n[°o]?\.?)\s*(\d+[-/]\d+)/gi,
    /(?:قانون|loi)\s+(\d{4}[-/]\d+)/gi,
    /(?:القانون\s*عدد|la loi n[°o]?)\s*(\d+)\s*(?:لسنة|de l'année|pour l'année)?\s*(\d{4})/gi,
  ],
  // Décrets
  decrets: [
    /(?:أمر\s*(?:حكومي\s*)?عدد|décret\s*(?:gouvernemental\s*)?n[°o]?\.?)\s*(\d+[-/]\d+)/gi,
    /(?:أمر\s*رئاسي|décret\s*présidentiel)\s*(?:عدد|n[°o]?\.?)?\s*(\d+[-/]\d+)/gi,
    /(?:مرسوم|décret[-\s]loi)\s*(?:عدد|n[°o]?\.?)?\s*(\d+[-/]\d+)/gi,
  ],
  // Arrêtés
  arretes: [
    /(?:قرار|arrêté)\s*(?:من\s*)?(?:وزير|ministre)\s*(\w+)/gi,
    /(?:قرار\s*مشترك|arrêté\s*conjoint)/gi,
    /(?:قرار\s*عدد|arrêté\s*n[°o]?\.?)\s*(\d+[-/]\d+)/gi,
  ],
  // Circulaires
  circulaires: [
    /(?:منشور|circulaire)\s*(?:عدد|n[°o]?\.?)?\s*(\d+[-/]?\d*)/gi,
    /(?:مذكرة\s*عامة|note\s*générale)\s*(?:عدد|n[°o]?\.?)?\s*(\d+)/gi,
  ],
  // Ordonnances
  ordonnances: [
    /(?:أمر\s*قانوني|ordonnance)\s*(?:عدد|n[°o]?\.?)?\s*(\d+[-/]\d+)/gi,
  ],

  // ========== CODES ET MAJELLAT ==========
  codes: [
    /(?:مجلة|code)\s+(?:ال)?(\w+)/gi,
    // Codes spécifiques tunisiens
    /(?:م\.?إ\.?ع|C\.?O\.?C)/gi,  // Code des Obligations et des Contrats
    /(?:م\.?ت|C\.?C\.?om)/gi,      // Code de Commerce
    /(?:م\.?ش|C\.?T)/gi,           // Code du Travail
    /(?:م\.?م\.?م\.?ت|C\.?P\.?C\.?C)/gi,  // Code de Procédure Civile
    /(?:م\.?ج|C\.?P)/gi,           // Code Pénal
    /(?:م\.?إ\.?ج|C\.?P\.?P)/gi,  // Code de Procédure Pénale
    /(?:م\.?أ\.?ش|C\.?S\.?P)/gi,  // Code du Statut Personnel
    /(?:م\.?ح\.?ع|C\.?D\.?R)/gi,  // Code des Droits Réels
    /(?:م\.?ض|C\.?F)/gi,          // Code Fiscal
    /(?:م\.?د|C\.?D)/gi,          // Code des Douanes
    /(?:م\.?ت\.?ه|C\.?U)/gi,      // Code de l'Urbanisme
  ],

  // ========== ARTICLES ET CHAPITRES ==========
  articles: [
    /(?:الفصل|article|art\.?)\s*(\d+)\s*(?:[-–]\s*(\d+))?/gi,
    /(?:الفصول|articles)\s*(?:من\s*)?(\d+)\s*(?:إلى|à|au)\s*(\d+)/gi,
    /(?:الفقرة|alinéa|al\.?)\s*(\d+)/gi,
    /(?:النقطة|point)\s*(\d+)/gi,
    /(?:البند|paragraphe|§)\s*(\d+)/gi,
  ],
  chapitres: [
    /(?:الباب|titre|chapitre)\s*(?:ال)?(\w+|\d+)/gi,
    /(?:القسم|section)\s*(\d+)/gi,
    /(?:الكتاب|livre)\s*(\d+)/gi,
  ],

  // ========== JURISPRUDENCE ==========
  jurisprudence: [
    // Cour de Cassation
    /(?:قرار\s*(?:محكمة\s*)?التعقيب|arrêt\s*(?:de\s*)?cassation)\s*(?:عدد|n[°o]?\.?)?\s*(\d+)/gi,
    /(?:تعقيب\s*(?:مدني|جزائي)|pourvoi\s*(?:civil|pénal))\s*(?:عدد|n[°o]?\.?)?\s*(\d+)/gi,
    // Cour d'Appel
    /(?:قرار\s*(?:محكمة\s*)?الاستئناف|arrêt\s*(?:de\s*)?(?:la\s*)?cour\s*d'appel)/gi,
    // Tribunal de première instance
    /(?:حكم\s*(?:محكمة\s*)?(?:ابتدائي|ابتدائية)|jugement\s*(?:du\s*)?tribunal)/gi,
    // Tribunal administratif
    /(?:المحكمة\s*الإدارية|tribunal\s*administratif)/gi,
  ],

  // ========== JORT - Journal Officiel ==========
  jort: [
    /(?:الرائد\s*الرسمي|J\.?O\.?R\.?T\.?|journal\s*officiel)/gi,
    /(?:ر\.?ر\.?ت\.?ج|JORT)\s*(?:عدد|n[°o]?\.?)?\s*(\d+)/gi,
    /(?:صفحة|page)\s*(\d+)/gi,
  ],

  // ========== DATES ==========
  dates: [
    /(?:المؤرخ\s*في|en\s*date\s*du|du)\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/gi,
    /(?:بتاريخ|le)\s*(\d{1,2})\s*(\w+)\s*(\d{4})/gi,
    // Mois arabes
    /(\d{1,2})\s*(?:جانفي|فيفري|مارس|أفريل|ماي|جوان|جويلية|أوت|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s*(\d{4})/gi,
    // Mois français
    /(\d{1,2})\s*(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*(\d{4})/gi,
  ],

  // ========== INSTITUTIONS ==========
  institutions: [
    /(?:رئاسة\s*الجمهورية|présidence\s*de\s*la\s*république)/gi,
    /(?:رئاسة\s*الحكومة|présidence\s*du\s*gouvernement)/gi,
    /(?:مجلس\s*نواب\s*الشعب|assemblée\s*des\s*représentants\s*du\s*peuple)/gi,
    /(?:المجلس\s*الأعلى\s*للقضاء|conseil\s*supérieur\s*de\s*la\s*magistrature)/gi,
    /(?:المحكمة\s*الدستورية|cour\s*constitutionnelle)/gi,
    /(?:البنك\s*المركزي|banque\s*centrale)/gi,
    /(?:هيئة\s*مكافحة\s*الفساد|instance\s*nationale\s*de\s*lutte\s*contre\s*la\s*corruption)/gi,
  ],

  // ========== TERMES JURIDIQUES CLÉS ==========
  termesJuridiques: [
    /(?:الإلغاء|abrogation)/gi,
    /(?:التعديل|modification|amendement)/gi,
    /(?:النفاذ|entrée\s*en\s*vigueur)/gi,
    /(?:الأثر\s*الرجعي|effet\s*rétroactif)/gi,
    /(?:القوة\s*القاهرة|force\s*majeure)/gi,
    /(?:حسن\s*النية|bonne\s*foi)/gi,
    /(?:النظام\s*العام|ordre\s*public)/gi,
    /(?:الضرر|préjudice|dommage)/gi,
    /(?:التعويض|indemnisation|réparation)/gi,
    /(?:المسؤولية|responsabilité)/gi,
    /(?:العقد|contrat)/gi,
    /(?:الالتزام|obligation)/gi,
    /(?:الملكية|propriété)/gi,
    /(?:الإرث|succession|héritage)/gi,
    /(?:الزواج|mariage)/gi,
    /(?:الطلاق|divorce)/gi,
    /(?:الحضانة|garde|hadana)/gi,
    /(?:النفقة|pension\s*alimentaire|nafaqa)/gi,
  ],
}

// Éléments à exclure systématiquement
// Note: iframe est traité séparément pour extraire les fichiers avant suppression
const DEFAULT_EXCLUDE_SELECTORS = [
  'script',
  'style',
  'noscript',
  // 'iframe', // Traité séparément dans extractLinkedFiles
  'nav',
  'header',
  'footer',
  'aside',
  '.nav',
  '.navigation',
  '.menu',
  '.sidebar',
  '.ads',
  '.advertisement',
  '.ad',
  '.comments',
  '.comment',
  '.cookie-banner',
  '.cookie-consent',
  '.popup',
  '.modal',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '.social-share',
  '.share-buttons',
  '.related-posts',
  '.recommended',
  '.newsletter',
  '.subscribe',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.tags',
  '.meta',
  '.author-bio',
  '#disqus',
  '.fb-comments',
  // Éléments de feedback/interaction
  '.feedback',
  '.rating',
  '.vote',
  '.like',
  '.share',
  '[class*="feedback"]',
  '[class*="rating"]',
  // Boutons et actions
  'button',
  '[role="button"]',
  '.btn',
  '.button',
  // Éléments de navigation interne
  '.next-prev',
  '.prev-next',
  '.article-nav',
  '.post-nav',
]

// Patterns de texte "bruit" à filtrer du contenu extrait
// Ces textes seront supprimés du contenu final
const NOISE_TEXT_PATTERNS = [
  // Éléments d'interface 9anoun.tn
  /متوفر باللغة\s*(FR|AR|EN)(\s*(FR|AR|EN))*/g,
  /تقرير\s*انشر/g,
  /هل كانت هذه المعلومات مفيدة لك\s*[؟?]?/g,
  /النص الموالي/g,
  /أو إكتشف أكثر نصوص قانونية على منصة قانون/g,
  /جميع النصوص\s*(المجلات القانونية)?\s*(الاتفاقيات الدولية)?/g,
  /اطلع على الدليل والبودكاست/g,
  /عرض الدليل\s*←?/g,
  /صعبوا عليك القوانين\s*[؟?]?/g,
  /القوانين المتعلقة بالمواضيع إلي يهموك أكثر/g,
  /ملخصة في أقل من \d+ نقطة/g,
  /تحميل المزيد من العناصر/g,
  /التحميل\.\.\./g,
  /'?9anoun'?\s*لقراءة مبسطة\s*،?/g,
  /نبدأ\s+/g,
  // Boutons de langue
  /\b(FR|AR|EN)\s+(FR|AR|EN)\b/g,
  // Boutons génériques
  /^(partager|share|signaler|report|imprimer|print)$/gim,
  // Navigation
  /نبدأ\s*(الفصل|المادة)\s*\d+/g,
]

// Extensions de fichiers téléchargeables
const FILE_EXTENSIONS: Record<string, LinkedFile['type']> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.pptx': 'pptx',
  '.ppt': 'ppt',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
}

// Patterns pour détecter les fichiers hébergés sur des services cloud
const CLOUD_FILE_PATTERNS = [
  // Google Drive - lien de téléchargement direct
  {
    pattern: /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Drive - lien ouvert
  {
    pattern: /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Drive - lien de visualisation
  {
    pattern: /drive\.google\.com\/viewer\?.*srcid=([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Docs Viewer avec URL externe
  {
    pattern: /docs\.google\.com\/viewer\?url=([^&]+)/,
    getUrl: (encodedUrl: string) => decodeURIComponent(encodedUrl),
    type: 'pdf' as LinkedFile['type'],
    filename: (encodedUrl: string) => {
      try {
        const url = new URL(decodeURIComponent(encodedUrl))
        return url.pathname.split('/').pop() || 'document.pdf'
      } catch {
        return 'document.pdf'
      }
    },
  },
  // Dropbox
  {
    pattern: /dropbox\.com\/s\/([a-zA-Z0-9]+)\/([^?]+)/,
    getUrl: (id: string, filename: string) => `https://dl.dropbox.com/s/${id}/${filename}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (_id: string, filename: string) => filename || 'dropbox_file.pdf',
  },
  // OneDrive / SharePoint
  {
    pattern: /1drv\.ms\/[a-z]\/s!([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://1drv.ms/b/s!${id}?download=1`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `onedrive_${id}.pdf`,
  },
]

// Patterns pour détecter les iframes contenant des documents
const IFRAME_DOC_PATTERNS = [
  // Google Drive embed
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/preview/,
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/,
  // Google Docs embed
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  // Google Docs Viewer
  /docs\.google\.com\/viewer\?/,
  // Scribd
  /scribd\.com\/embeds\/([0-9]+)/,
  // SlideShare
  /slideshare\.net\/slideshow\/embed_code\/([0-9]+)/,
]

/**
 * Détecte et convertit l'encodage non-UTF-8
 * Certains vieux sites juridiques utilisent windows-1256 ou iso-8859-6
 */
function decodeHtmlEncoding(html: string): string {
  // Détecter l'encodage via <meta charset> ou <meta http-equiv="Content-Type">
  const charsetMatch = html.match(/<meta[^>]*charset=["']?([^"';\s>]+)/i)
    || html.match(/<meta[^>]*content=["'][^"']*charset=([^"';\s]+)/i)

  if (charsetMatch) {
    const charset = charsetMatch[1].toLowerCase().trim()
    // Si déjà UTF-8, pas besoin de conversion
    if (charset === 'utf-8' || charset === 'utf8') return html

    // Tenter la conversion pour les encodages arabes courants
    const supportedEncodings = ['windows-1256', 'iso-8859-6', 'cp1256']
    if (supportedEncodings.includes(charset)) {
      try {
        const decoder = new TextDecoder(charset)
        // Convertir le HTML (string) en bytes puis décoder
        const bytes = Buffer.from(html, 'binary')
        return decoder.decode(bytes)
      } catch {
        // Échec de conversion, retourner tel quel
      }
    }
  }

  return html
}

/**
 * Extrait le contenu principal d'une page HTML
 */
export function extractContent(
  html: string,
  baseUrl: string,
  customSelectors?: CssSelectors
): ScrapedContent {
  // C2. Détection et conversion d'encodage non-UTF-8
  const decodedHtml = decodeHtmlEncoding(html)
  const $ = cheerio.load(decodedHtml)
  const url = new URL(baseUrl)

  // Supprimer les éléments indésirables
  const excludeSelectors = [
    ...DEFAULT_EXCLUDE_SELECTORS,
    ...(customSelectors?.exclude || []),
  ]
  $(excludeSelectors.join(', ')).remove()

  // Extraire le titre
  const title = extractTitle($, customSelectors?.title)

  // Extraire les métadonnées
  const description = extractMeta($, 'description', customSelectors?.description)
  const author = extractMeta($, 'author', customSelectors?.author)
  const date = extractDate($, customSelectors?.date)
  const keywords = extractKeywords($)
  const language = detectLanguage($)
  const structuredData = extractStructuredData($)

  // Trouver le contenu principal
  // Priorité: sélecteurs custom > sélecteurs juridiques > sélecteurs par défaut
  const contentSelectors = customSelectors?.content?.length
    ? customSelectors.content
    : [...LEGAL_CONTENT_SELECTORS, ...DEFAULT_CONTENT_SELECTORS]

  let contentElement = findContentElement($, contentSelectors)
  const currentLength = contentElement?.text().trim().length || 0

  // Si contenu trop court, essayer d'autres stratégies
  if (currentLength < 500) {
    // Stratégie 1: Chercher les composants Livewire (échappement pour cheerio)
    const livewireContent = $('[wire\\:id]')
    if (livewireContent.length > 0) {
      let maxLength = currentLength
      livewireContent.each((_, el) => {
        const text = $(el).text().trim()
        if (text.length > maxLength) {
          maxLength = text.length
          contentElement = $(el) as Cheerio<Element>
        }
      })
    }

    // Stratégie 2: Chercher les divs avec beaucoup de contenu
    if ((contentElement?.text().trim().length || 0) < 500) {
      $('div, section').each((_, el) => {
        const $el = $(el) as Cheerio<Element>
        const text = $el.text().trim()
        // Ignorer les éléments de navigation, cookie banners, etc.
        const classes = ($el.attr('class') || '').toLowerCase()
        const isExcluded = ['nav', 'menu', 'cookie', 'modal', 'popup', 'footer', 'header'].some(
          (exc) => classes.includes(exc)
        )
        if (!isExcluded && text.length > (contentElement?.text().trim().length || 0)) {
          contentElement = $el
        }
      })
    }
  }

  // Stratégie 3: Si toujours pas assez de contenu, utiliser le body entier
  if (!contentElement || contentElement.length === 0 || contentElement.text().trim().length < 300) {
    contentElement = $('body')
  }

  // Extraire les liens internes
  const links = extractInternalLinks($, contentElement, url)

  // Extraire les fichiers liés (doit être fait AVANT suppression des iframes)
  const files = extractLinkedFiles($, contentElement, url)

  // Supprimer les iframes après extraction des fichiers
  $('iframe').remove()

  // Obtenir la configuration d'extraction pour ce domaine
  const extractionConfig = getExtractionConfig(baseUrl, customSelectors as unknown as ExtractionConfig)

  // Supprimer les éléments configurés comme bruit
  if (extractionConfig.removeSelectors) {
    $(extractionConfig.removeSelectors.join(', ')).remove()
  }

  // Extraire le texte propre avec la configuration
  const content = extractCleanText(contentElement, extractionConfig)

  // Garder le HTML du contenu pour référence
  const contentHtml = contentElement.html() || ''

  // Extraire le contexte juridique (type de document, code parent, etc.)
  const legalContext = extractLegalContext(baseUrl, title, content)

  // Extraire le contenu juridique structuré (à partir du contenu nettoyé)
  let structuredLegalContent: StructuredLegalContent | undefined
  if (legalContext.documentType === 'code_article' || legalContext.documentType === 'code') {
    structuredLegalContent = extractStructuredLegalContent(content, baseUrl, extractionConfig)
  }

  // Extraire la structure du site (breadcrumbs, URL, navigation)
  let siteStructure: SiteStructure | undefined
  try {
    siteStructure = extractSiteStructure(html, baseUrl)
  } catch (err) {
    console.warn('[ContentExtractor] Erreur extraction structure site:', err)
  }

  return {
    url: baseUrl,
    title,
    content,
    html: contentHtml,
    description,
    author,
    date,
    keywords,
    language,
    links,
    files,
    structuredData,
    legalContext,
    siteStructure,
    structuredLegalContent,
  }
}

/**
 * Trouve l'élément contenant le contenu principal
 */
function findContentElement(
  $: CheerioAPI,
  selectors: string[]
): Cheerio<Element> | null {
  for (const selector of selectors) {
    const element = $(selector)
    if (element.length > 0 && element.text().trim().length > 100) {
      return element.first() as Cheerio<Element>
    }
  }

  // Heuristique: trouver le div avec le plus de texte
  let bestElement: Cheerio<Element> | null = null
  let maxTextLength = 0

  $('div, section, article').each((_, el) => {
    const element = $(el) as Cheerio<Element>
    const text = element.text().trim()

    // Ignorer les éléments avec très peu de texte
    if (text.length > maxTextLength && text.length > 200) {
      // Vérifier que l'élément n'est pas principalement composé de liens
      const links = element.find('a')
      const linkText = links.text().length
      const ratio = linkText / text.length

      if (ratio < 0.7) {
        maxTextLength = text.length
        bestElement = element
      }
    }
  })

  return bestElement
}

/**
 * Extrait le titre de la page
 */
function extractTitle($: CheerioAPI, customSelector?: string): string {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) return custom
  }

  // Essayer différentes sources
  const sources = [
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('h1').first().text(),
    $('title').text(),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      return source.trim()
    }
  }

  return 'Sans titre'
}

/**
 * Extrait une métadonnée
 */
function extractMeta(
  $: CheerioAPI,
  metaName: string,
  customSelector?: string
): string | null {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) return custom
  }

  const sources = [
    $(`meta[name="${metaName}"]`).attr('content'),
    $(`meta[property="og:${metaName}"]`).attr('content'),
    $(`meta[property="article:${metaName}"]`).attr('content'),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      return source.trim()
    }
  }

  return null
}

/**
 * Extrait la date de publication
 */
function extractDate($: CheerioAPI, customSelector?: string): Date | null {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) {
      const date = parseDate(custom)
      if (date) return date
    }
  }

  // Sources courantes de date
  const sources = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="og:article:published_time"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[name="DC.date"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
    $('time').first().text(),
    $('.date, .post-date, .published, .pub-date').first().text(),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      const date = parseDate(source.trim())
      if (date) return date
    }
  }

  return null
}

/**
 * Parse une date en différents formats
 */
function parseDate(dateStr: string): Date | null {
  // Essayer le format ISO directement
  let date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date
  }

  // Formats courants
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/, // 2024-01-15
    /(\d{2})\/(\d{2})\/(\d{4})/, // 15/01/2024
    /(\d{2})-(\d{2})-(\d{4})/, // 15-01-2024
  ]

  for (const pattern of patterns) {
    const match = dateStr.match(pattern)
    if (match) {
      // Essayer différents ordres jour/mois selon le format
      if (dateStr.includes('/') || dateStr.includes('-')) {
        date = new Date(match[0])
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
  }

  return null
}

/**
 * Extrait les mots-clés
 */
function extractKeywords($: CheerioAPI): string[] {
  const keywords: Set<string> = new Set()

  // Meta keywords
  const metaKeywords = $('meta[name="keywords"]').attr('content')
  if (metaKeywords) {
    metaKeywords.split(',').forEach(k => {
      const trimmed = k.trim()
      if (trimmed) keywords.add(trimmed)
    })
  }

  // Tags
  $('[rel="tag"], .tag, .tags a').each((_, el) => {
    const text = $(el).text().trim()
    if (text && text.length < 50) {
      keywords.add(text)
    }
  })

  return Array.from(keywords).slice(0, 20)
}

/**
 * Détecte la langue de la page
 */
function detectLanguage($: CheerioAPI): string | null {
  // Attribut lang
  const htmlLang = $('html').attr('lang')
  if (htmlLang) {
    return htmlLang.split('-')[0].toLowerCase()
  }

  // Meta language
  const metaLang = $('meta[http-equiv="content-language"]').attr('content')
  if (metaLang) {
    return metaLang.split('-')[0].toLowerCase()
  }

  // Open Graph locale
  const ogLocale = $('meta[property="og:locale"]').attr('content')
  if (ogLocale) {
    return ogLocale.split('_')[0].toLowerCase()
  }

  return null
}

/**
 * Extrait les données structurées (JSON-LD)
 */
function extractStructuredData($: CheerioAPI): Record<string, unknown> | null {
  const scripts = $('script[type="application/ld+json"]')

  if (scripts.length === 0) return null

  const data: Record<string, unknown>[] = []

  scripts.each((_, el) => {
    try {
      const content = $(el).html()
      if (content) {
        const parsed = JSON.parse(content)
        data.push(parsed)
      }
    } catch {
      // Ignorer les JSON invalides
    }
  })

  if (data.length === 0) return null
  if (data.length === 1) return data[0]

  return { '@graph': data }
}

/**
 * Extrait les liens internes
 */
function extractInternalLinks(
  $: CheerioAPI,
  contentElement: Cheerio<Element>,
  baseUrl: URL
): string[] {
  const links: Set<string> = new Set()

  contentElement.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      const linkUrl = new URL(href, baseUrl.origin)

      // Vérifier que c'est le même domaine
      if (linkUrl.hostname !== baseUrl.hostname) return

      // Ignorer les ancres, mailto, tel, javascript
      if (href.startsWith('#') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('javascript:')) {
        return
      }

      // Ignorer les fichiers
      const ext = getFileExtension(linkUrl.pathname)
      if (ext && FILE_EXTENSIONS[ext.toLowerCase()]) return

      // Normaliser l'URL (sans fragment, paramètres de tracking)
      linkUrl.hash = ''
      linkUrl.searchParams.delete('utm_source')
      linkUrl.searchParams.delete('utm_medium')
      linkUrl.searchParams.delete('utm_campaign')
      linkUrl.searchParams.delete('ref')
      linkUrl.searchParams.delete('fbclid')
      linkUrl.searchParams.delete('gclid')

      links.add(linkUrl.href)
    } catch {
      // URL invalide, ignorer
    }
  })

  return Array.from(links)
}

/**
 * Extrait les fichiers liés (PDF, DOCX, etc.)
 * Supporte: liens directs, Google Drive, Dropbox, OneDrive, iframes
 */
function extractLinkedFiles(
  $: CheerioAPI,
  contentElement: Cheerio<Element>,
  baseUrl: URL
): LinkedFile[] {
  const files: LinkedFile[] = []
  const seenUrls = new Set<string>()

  // Helper pour ajouter un fichier sans doublon
  const addFile = (file: LinkedFile) => {
    if (!seenUrls.has(file.url)) {
      seenUrls.add(file.url)
      files.push(file)
    }
  }

  // 1. Liens directs avec extension connue
  contentElement.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    // Ignorer les références locales (file://, mailto:, javascript:, etc.)
    if (/^(file|mailto|javascript|data):/i.test(href)) return

    try {
      const fileUrl = new URL(href, baseUrl.origin)
      const ext = getFileExtension(fileUrl.pathname)

      // Extension directe (.pdf, .docx, etc.)
      if (ext) {
        const fileType = FILE_EXTENSIONS[ext.toLowerCase()]
        if (fileType) {
          const filename = fileUrl.pathname.split('/').pop() || 'file' + ext
          addFile({
            url: fileUrl.href,
            type: fileType,
            filename,
            downloaded: false,
          })
          return
        }
      }

      // 2. Vérifier les patterns cloud (Google Drive, Dropbox, etc.)
      for (const cloudPattern of CLOUD_FILE_PATTERNS) {
        const match = href.match(cloudPattern.pattern)
        if (match) {
          const id = match[1]
          const extra = match[2] || ''
          addFile({
            url: cloudPattern.getUrl(id, extra),
            type: cloudPattern.type,
            filename: cloudPattern.filename(id, extra),
            downloaded: false,
            originalUrl: href, // Garder l'URL originale pour référence
          })
          break
        }
      }
    } catch {
      // URL invalide, ignorer
    }
  })

  // 3. Extraire les documents des iframes
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (!src) return

    try {
      // Google Drive preview/view
      const driveMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/(preview|view)/)
      if (driveMatch) {
        const id = driveMatch[1]
        addFile({
          url: `https://drive.google.com/uc?export=download&id=${id}`,
          type: 'pdf',
          filename: `gdrive_${id}.pdf`,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
        return
      }

      // Google Docs Viewer
      const viewerMatch = src.match(/docs\.google\.com\/viewer\?url=([^&]+)/)
      if (viewerMatch) {
        const docUrl = decodeURIComponent(viewerMatch[1])
        const filename = new URL(docUrl).pathname.split('/').pop() || 'document.pdf'
        addFile({
          url: docUrl,
          type: 'pdf',
          filename,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
        return
      }

      // Google Docs/Sheets/Slides embed
      const docsMatch = src.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
      if (docsMatch) {
        const docType = docsMatch[1]
        const id = docsMatch[2]
        const exportFormats: Record<string, { format: string; ext: string; type: LinkedFile['type'] }> = {
          document: { format: 'pdf', ext: 'pdf', type: 'pdf' },
          spreadsheets: { format: 'xlsx', ext: 'xlsx', type: 'xlsx' },
          presentation: { format: 'pptx', ext: 'pptx', type: 'pptx' },
        }
        const exp = exportFormats[docType]
        if (exp) {
          addFile({
            url: `https://docs.google.com/${docType}/d/${id}/export?format=${exp.format}`,
            type: exp.type,
            filename: `gdoc_${id}.${exp.ext}`,
            downloaded: false,
            originalUrl: src,
            source: 'iframe',
          })
        }
        return
      }

      // Scribd embed
      const scribdMatch = src.match(/scribd\.com\/embeds\/([0-9]+)/)
      if (scribdMatch) {
        addFile({
          url: `https://www.scribd.com/document/${scribdMatch[1]}/download`,
          type: 'pdf',
          filename: `scribd_${scribdMatch[1]}.pdf`,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
      }
    } catch {
      // Ignorer les erreurs
    }
  })

  // 4. Chercher les liens PDF dans tout le document (pas seulement le contenu principal)
  // Utile pour les blogs où les PDF sont dans la sidebar ou ailleurs
  $('a[href*=".pdf"], a[href*="drive.google.com/file"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      // PDF direct
      if (href.toLowerCase().includes('.pdf')) {
        const fileUrl = new URL(href, baseUrl.origin)
        const filename = fileUrl.pathname.split('/').pop() || 'document.pdf'
        addFile({
          url: fileUrl.href,
          type: 'pdf',
          filename,
          downloaded: false,
          source: 'global',
        })
        return
      }

      // Google Drive
      const driveMatch = href.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (driveMatch) {
        const id = driveMatch[1]
        addFile({
          url: `https://drive.google.com/uc?export=download&id=${id}`,
          type: 'pdf',
          filename: `gdrive_${id}.pdf`,
          downloaded: false,
          originalUrl: href,
          source: 'global',
        })
      }
    } catch {
      // Ignorer
    }
  })

  return files
}

/**
 * Extrait l'extension d'un chemin
 */
function getFileExtension(pathname: string): string | null {
  const lastDot = pathname.lastIndexOf('.')
  if (lastDot === -1) return null

  const ext = pathname.substring(lastDot).toLowerCase()
  // Vérifier que c'est une vraie extension (pas plus de 5 caractères)
  if (ext.length > 6) return null

  return ext
}

/**
 * Extrait le contenu juridique de manière structurée
 * @param cleanedContent - Le contenu déjà nettoyé (sans bruit)
 */
export function extractStructuredLegalContent(
  cleanedContent: string,
  url: string,
  config?: ExtractionConfig
): StructuredLegalContent {
  const extractionConfig = getExtractionConfig(url, config)

  // Extraire le numéro d'article (الفصل X)
  let articleNumber: string | undefined
  const articleMatch = cleanedContent.match(/الفصل\s*(\d+(?:\s*مكرر)?(?:\s*ثانيا)?(?:\s*ثالثا)?)/i)
  if (articleMatch) {
    articleNumber = articleMatch[1].trim()
  }

  // Extraire le nom du code
  let codeName: string | undefined
  for (const [, codeInfo] of Object.entries(TUNISIAN_CODES)) {
    if (cleanedContent.includes(codeInfo.ar)) {
      codeName = codeInfo.ar
      break
    }
  }

  // Extraire le texte de l'article (après le nom du code)
  let articleText = cleanedContent

  // Supprimer le préfixe "الفصل X مجلة..."
  if (articleNumber && codeName) {
    const prefixPattern = new RegExp(`الفصل\\s*${articleNumber}\\s*${codeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i')
    articleText = articleText.replace(prefixPattern, '').trim()
  } else if (articleNumber) {
    articleText = articleText.replace(/الفصل\s*\d+\s*/, '').trim()
  }

  // Supprimer le nom du code restant
  if (codeName) {
    articleText = articleText.replace(new RegExp(codeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim()
  }

  // Extraire les références à d'autres articles mentionnés dans le texte
  const references: string[] = []
  const refMatches = articleText.matchAll(/الفصل\s*(\d+)/g)
  for (const match of refMatches) {
    if (match[1] !== articleNumber) {
      references.push(`الفصل ${match[1]}`)
    }
  }

  // Hiérarchie (à implémenter selon la source)
  let hierarchy: StructuredLegalContent['hierarchy']
  if (extractionConfig.preserveHierarchy) {
    hierarchy = {
      book: undefined,
      part: undefined,
      chapter: undefined,
      section: undefined,
    }
  }

  return {
    articleNumber,
    articleText: articleText || cleanedContent,
    codeName,
    hierarchy,
    references: references.length > 0 ? [...new Set(references)] : undefined,
  }
}

/**
 * Convertit les tableaux HTML en Markdown table avec marqueurs spéciaux.
 *
 * Les marqueurs [TABLE]...[/TABLE] permettent au chunking service de :
 * - Créer des chunks distincts de type 'table' (non splittés)
 * - Conserver la structure tabulaire pour le LLM
 *
 * Format de sortie pour chaque tableau :
 *   [TABLE]
 *   | col1 | col2 | ... |
 *   |------|------|-----|
 *   | val1 | val2 | ... |
 *   [/TABLE]
 */
function convertTablesToText(element: Cheerio<Element>): void {
  const $ = cheerio.load(element.html() || '')
  $('table').each((_, table) => {
    const rows: string[][] = []
    let hasHeader = false

    // Extraire les lignes header (th)
    const headerRow: string[] = []
    $(table).find('thead tr, tr:first-child').first().find('th').each((_, th) => {
      headerRow.push($(th).text().trim())
    })
    if (headerRow.length > 0) {
      hasHeader = true
    }

    // Extraire toutes les lignes (tr)
    $(table).find('tr').each((_, tr) => {
      const cells: string[] = []
      $(tr).find('th, td').each((_, cell) => {
        // Nettoyer le contenu de la cellule (inline seulement)
        cells.push($(cell).text().trim().replace(/\|/g, '\\|').replace(/\n/g, ' '))
      })
      if (cells.length) rows.push(cells)
    })

    if (rows.length === 0) {
      $(table).replaceWith('')
      return
    }

    // Construire tableau Markdown
    const colCount = Math.max(...rows.map(r => r.length))
    const mdRows: string[] = []

    for (let i = 0; i < rows.length; i++) {
      // Padder les cellules manquantes
      while (rows[i].length < colCount) rows[i].push('')
      mdRows.push('| ' + rows[i].join(' | ') + ' |')
      // Ajouter séparateur header après la 1ère ligne (si th ou 1ère ligne)
      if (i === 0 && (hasHeader || rows[0].some(c => c.length > 0))) {
        mdRows.push('|' + Array(colCount).fill('------').join('|') + '|')
      }
    }

    const tableMarkdown = '\n[TABLE]\n' + mdRows.join('\n') + '\n[/TABLE]\n'
    $(table).replaceWith(tableMarkdown)
  })

  // Réécrire le HTML modifié dans l'élément
  const updatedHtml = $.html()
  const parent$ = cheerio.load('<div>' + updatedHtml + '</div>')
  element.html(parent$('div').html() || '')
}

/**
 * Extrait le texte propre d'un élément avec configuration personnalisée
 */
function extractCleanText(element: Cheerio<Element>, config?: ExtractionConfig): string {
  // C1. Convertir les tableaux en texte structuré avant le stripping HTML
  convertTablesToText(element)

  // Remplacer les balises de bloc par des sauts de ligne
  let text = element.html() || ''

  // Remplacer les balises de bloc par des sauts de ligne
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ') // Supprimer toutes les autres balises
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // C3. Entités HTML numériques résiduelles
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // Supprimer le bruit (textes d'interface, navigation, etc.)
  // 1. Patterns par défaut
  for (const pattern of NOISE_TEXT_PATTERNS) {
    text = text.replace(pattern, '')
  }

  // 2. Patterns personnalisés de la configuration
  if (config?.noisePatterns) {
    for (const patternStr of config.noisePatterns) {
      try {
        const pattern = new RegExp(patternStr, 'gi')
        text = text.replace(pattern, '')
      } catch {
        // Pattern regex invalide, ignorer
      }
    }
  }

  // Nettoyer les espaces
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()

  return text
}

/**
 * Extrait le contexte juridique à partir de l'URL et du contenu
 * Détecte automatiquement si c'est un code, un article de code, une loi, etc.
 */
export function extractLegalContext(url: string, title: string, content: string): LegalContext {
  const context: LegalContext = {
    documentType: 'unknown',
  }

  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname

    // Pattern pour les articles de codes sur 9anoun.tn
    // Ex: /kb/codes/code-obligations-contrats/code-obligations-contrats-article-3
    const codeArticleMatch = pathname.match(/\/kb\/codes\/([^/]+)\/[^/]+-article-(\d+(?:-bis|-ter|-quater)?)/i)
    if (codeArticleMatch) {
      const codeSlug = codeArticleMatch[1]
      const articleNum = codeArticleMatch[2]
      const codeInfo = TUNISIAN_CODES[codeSlug]

      context.documentType = 'code_article'
      context.articleNumber = articleNum
      if (codeInfo) {
        context.parentCode = {
          nameAr: codeInfo.ar,
          nameFr: codeInfo.fr,
          slug: codeSlug,
        }
      } else {
        context.parentCode = {
          nameAr: codeSlug.replace(/-/g, ' '),
          slug: codeSlug,
        }
      }
      return context
    }

    // Pattern pour les pages de codes (liste des articles)
    // Ex: /kb/codes/code-obligations-contrats
    const codeMatch = pathname.match(/\/kb\/codes\/([^/]+)\/?$/i)
    if (codeMatch) {
      const codeSlug = codeMatch[1]
      const codeInfo = TUNISIAN_CODES[codeSlug]

      context.documentType = 'code'
      if (codeInfo) {
        context.parentCode = {
          nameAr: codeInfo.ar,
          nameFr: codeInfo.fr,
          slug: codeSlug,
        }
      }
      return context
    }

    // Pattern pour les constitutions
    if (pathname.includes('/kb/constitutions')) {
      context.documentType = 'constitution'
      return context
    }

    // Pattern pour les conventions internationales
    if (pathname.includes('/kb/conventions')) {
      context.documentType = 'convention'
      return context
    }

    // Pattern pour le JORT
    if (pathname.includes('/kb/jorts')) {
      context.documentType = 'jort'
      return context
    }

    // Détection par le titre
    if (title) {
      // Article de code (الفصل X)
      const articleTitleMatch = title.match(/الفصل\s*(\d+(?:\s*مكرر)?)/i)
      if (articleTitleMatch) {
        context.documentType = 'code_article'
        context.articleNumber = articleTitleMatch[1]

        // Essayer de trouver le code parent dans le titre
        for (const [slug, codeInfo] of Object.entries(TUNISIAN_CODES)) {
          if (title.includes(codeInfo.ar)) {
            context.parentCode = {
              nameAr: codeInfo.ar,
              nameFr: codeInfo.fr,
              slug,
            }
            break
          }
        }
        return context
      }

      // Loi (قانون عدد)
      if (title.match(/قانون\s*(أساسي\s*)?عدد/i)) {
        context.documentType = 'law'
        return context
      }

      // Décret (أمر عدد / مرسوم)
      if (title.match(/(?:أمر|مرسوم)\s*(?:حكومي\s*)?عدد/i)) {
        context.documentType = 'decree'
        return context
      }
    }

    // Détection par le contenu
    if (content) {
      // Vérifier si c'est un texte juridique structuré
      if (content.match(/الفصل\s*\d+/)) {
        context.documentType = 'code_article'
      }
    }

  } catch (e) {
    // En cas d'erreur, retourner unknown
    console.warn('[ContentExtractor] Erreur extraction contexte juridique:', e)
  }

  return context
}

/**
 * Génère un hash SHA256 du contenu
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Génère un hash SHA256 d'une URL (pour déduplication)
 */
export function hashUrl(url: string): string {
  // Normaliser l'URL avant le hash
  try {
    const urlObj = new URL(url)
    urlObj.hash = ''
    urlObj.searchParams.delete('utm_source')
    urlObj.searchParams.delete('utm_medium')
    urlObj.searchParams.delete('utm_campaign')

    return crypto.createHash('sha256').update(urlObj.href).digest('hex')
  } catch {
    return crypto.createHash('sha256').update(url).digest('hex')
  }
}

/**
 * Compte les mots dans un texte
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Nettoie et normalise le texte unicode
 * Intègre la normalisation arabe pour les textes juridiques tunisiens
 */
export function normalizeText(text: string, options?: { stripDiacritics?: boolean }): string {
  let result = text
    // Normaliser les caractères unicode composés
    .normalize('NFC')
    // Supprimer les caractères de contrôle
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normaliser les espaces
    .replace(/\s+/g, ' ')
    // Normaliser les tirets
    .replace(/[\u2010-\u2015]/g, '-')
    // Normaliser les apostrophes
    .replace(/[\u2018\u2019\u201B]/g, "'")
    // Normaliser les guillemets
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')

  // Normalisation arabe (alef variants, chiffres, espaces, diacritiques optionnels)
  result = normalizeArabicText(result, options)

  return result.trim()
}

/**
 * Détecte la langue d'un texte (simple heuristique)
 */
export function detectTextLanguage(text: string): 'ar' | 'fr' | 'mixed' | null {
  // Compter les caractères arabes
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  // Compter les caractères latins
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length

  const total = arabicChars + latinChars
  if (total < 50) return null // Pas assez de caractères

  const arabicRatio = arabicChars / total
  const latinRatio = latinChars / total

  if (arabicRatio > 0.7) return 'ar'
  if (latinRatio > 0.7) return 'fr'
  if (arabicRatio > 0.3 && latinRatio > 0.3) return 'mixed'

  return latinRatio > arabicRatio ? 'fr' : 'ar'
}
