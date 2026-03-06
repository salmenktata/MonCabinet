/**
 * Utilitaires texte IORT — nettoyage, détection boilerplate, parsing dates
 *
 * Extraits de iort-scraper-utils.ts et iort-codes-scraper.ts pour réduire
 * la taille des fichiers monolithiques et permettre le test unitaire.
 */

import { hashContent } from './content-extractor'

// =============================================================================
// CONSTANTES
// =============================================================================

/** URL de base du site IORT (legacy iort.gov.tn) */
export const IORT_BASE_URL = 'http://www.iort.gov.tn'

/** URL du portail moderne iort.tn */
export const IORT_SITEIORT_URL = 'https://www.iort.tn/siteiort'

/** Mois arabes tunisiens → numéro */
const ARABIC_MONTHS: Record<string, number> = {
  'جانفي': 1, 'فيفري': 2, 'مارس': 3, 'أفريل': 4,
  'ماي': 5, 'جوان': 6, 'جويلية': 7, 'أوت': 8,
  'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
}

// =============================================================================
// IDs WEBDEV CENTRALISÉS
// =============================================================================

/**
 * IDs des éléments WebDev du site IORT.
 * Centralisés ici pour faciliter la mise à jour si le site régénère ses IDs.
 */
export const IORT_WEBDEV_IDS = {
  // Homepage navigation
  JORT_MENU: 'M7',          // Menu JORT lois et décrets
  SEARCH_FORM: 'A9',        // Page recherche texte
  LANG_SWITCH_FR: 'M32',    // Basculer en français
  CONSTITUTION: 'M4',       // Page constitution

  // Formulaire de recherche (iort.gov.tn)
  YEAR_SELECT: 'A8',        // Select année
  TYPE_SELECT: 'A9',        // Select type de texte
  SEARCH_SUBMIT: 'A40',     // Bouton recherche
  SEARCH_RESET: 'A39',      // Bouton reset
  RESULT_COUNT: 'A5',       // Champ nombre total résultats
  RESULT_LOOPER: 'A4',      // Looper résultats
  DETAIL_VIEW: 'A17',       // Bouton voir détail (popup _blank)
  PDF_DOWNLOAD: 'A7',       // Bouton téléchargement PDF
  PAGINATION: 'A10',        // Zone pagination

  // Codes listing (iort.tn/siteiort)
  CODES_JCL: 'M24',         // _JCL pour menu codes élargi
  CODES_JEM: 'M180',        // _JEM pour page listing codes
  CODES_RECUEIL_JEM: 'M62', // _JEM pour codes+recueils
  CODES_LOOPER: 'A1',       // Looper des codes disponibles

  // TOC loopers (PAGE_NavigationCode / PAGE_CodesJuridiques)
  TOC_STANDARD_PREFIXES: ['A4', 'B4', 'C4', 'D4', 'E4'] as readonly string[],
  TOC_CODES_PREFIXES: ['M18', 'M78', 'M110', 'M81', 'M59', 'M3'] as readonly string[],
  TOC_ALL_PREFIXES: ['A1', 'A2', 'A4', 'B2', 'B4', 'C2', 'C4', 'D2', 'D4', 'E4', 'M18', 'M78', 'M110', 'M81', 'M59'] as readonly string[],
  IGNORED_LOOPER_PREFIXES: ['A1', 'M1', 'M2'] as readonly string[],
} as const

// =============================================================================
// UTILITAIRES TEXTE
// =============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Attend qu'un sélecteur apparaisse dans la page avec un timeout max.
 * Remplace les `sleep()` fixes après navigation WebDev.
 * Retourne true si l'élément est trouvé, false si timeout atteint.
 */
export async function waitForSelector(
  page: { waitForSelector: (sel: string, opts: { timeout: number }) => Promise<unknown> },
  selector: string,
  timeoutMs = 15000,
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

/**
 * Attend que le contenu dynamique WebDev se stabilise.
 * Poll le body.innerText toutes les `intervalMs` ms et retourne quand
 * le contenu ne change plus entre deux polls, ou quand le timeout est atteint.
 */
export async function waitForStableContent(
  page: { evaluate: (fn: () => string) => Promise<string> },
  { intervalMs = 1500, timeoutMs = 15000 } = {},
): Promise<void> {
  const start = Date.now()
  let previousText = ''
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs)
    const currentText = await page.evaluate(() => document.body.innerText.length.toString())
    if (currentText === previousText && previousText !== '') return
    previousText = currentText
  }
}

/**
 * Nettoie le texte extrait du site IORT : supprime le boilerplate WebDev,
 * les copyrights, les tokens WD_ACTION_, et normalise les espaces.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/WD_ACTION_[^\s]*/g, '')
    .replace(/جميع الحقوق محفوظة.{0,80}/g, '')
    .replace(/Copyright.{0,40}IORT/gi, '')
    .replace(/المطبعة الرسمية.{0,80}/g, '')
    // Boilerplate navigation IORT siteiort.tn
    .replace(/الجمهورية التونسية\s*رئاسة الحكومة/g, '')
    .replace(/إصدارات لقرارات الرائد الرسمي[\s\S]{0,600}/g, '')
    .replace(/الرائد الرسمي للإعلانات القانونية والشرعية.{0,200}/g, '')
    .replace(/الجريدة الرسمية للجماعات المحلية.{0,200}/g, '')
    .replace(/المجلة القضائية.{0,100}/g, '')
    .replace(/\baطلاع\b/g, '')
    .trim()
}

/**
 * Détecte si le texte est du boilerplate navigation IORT (pas du contenu juridique).
 * Utilise 3 heuristiques : header gouvernemental, densité de mots structurels,
 * et présence de patterns navigation sans contenu légal.
 */
export function isNavigationBoilerplate(text: string): boolean {
  const cleaned = text.trim()
  if (cleaned.length < 50) return true
  if (/^الجمهورية التونسية/.test(cleaned)) return true
  const structuralWords = (cleaned.match(/\b(الباب|الكتاب|العنوان|القسم|الفرع|اطلاع|التّوطئة|الفهرس)\b/g) || []).length
  const totalWords = cleaned.split(/\s+/).length
  if (structuralWords >= 6 && structuralWords / totalWords > 0.04) {
    const hasRealContent = /يُعدّ|يُعتبر|يُعاقب|يجوز|لا يجوز|يُلزم|يُخضع|يترتّب|تسري|تطبّق|يُحظر|يُمنع|يُعفى|يُعاقب/.test(cleaned)
    if (!hasRealContent) return true
  }
  const hasLegalContent = /الفصل\s+\d|المادة\s+\d|أحكام\s+(عامة|خاصة)|يُعدّ|يُعتبر|يُعاقب|يجوز|لا يجوز|يُلزم|يُخضع|ينشر\s+هذا\s+(القانون|المرسوم|الأمر|القرار)/.test(cleaned)
  const hasNavText = /الرائد الرسمي|إصدارات لقرارات|اطلاع|رئاسة الحكومة/.test(cleaned)
  return hasNavText && !hasLegalContent
}

/** Détecte si une URL pointe vers un PDF (à ignorer) */
export function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?|#)/i.test(url) || url.startsWith('blob:')
}

/** Convertit une date arabe tunisienne ("31 ديسمبر 2025") en ISO ou null */
export function parseArabicDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const match = dateStr.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/)
  if (!match) return null
  const day = parseInt(match[1], 10)
  const monthName = match[2]
  const year = parseInt(match[3], 10)
  const month = ARABIC_MONTHS[monthName]
  if (!month || day < 1 || day > 31 || year < 1900) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// =============================================================================
// GÉNÉRATION D'URLs
// =============================================================================

export type IortLanguage = 'ar' | 'fr'

/**
 * Génère une URL canonique pour un texte JORT (lois, décrets, etc.)
 */
export function generateIortUrl(
  year: number,
  issueNumber: string | null,
  textType: string,
  title: string,
  language: IortLanguage = 'ar',
): string {
  const typeSlug = textType.replace(/\s+/g, '-')
  const langPrefix = language === 'fr' ? '/fr' : ''
  if (issueNumber) {
    return `${IORT_BASE_URL}/jort${langPrefix}/${year}/${typeSlug}/${issueNumber}`
  }
  const titleHash = hashContent(title).substring(0, 12)
  return `${IORT_BASE_URL}/jort${langPrefix}/${year}/${typeSlug}/${titleHash}`
}

/**
 * Génère une URL canonique pour une section de code juridique
 */
export function generateCodeSectionUrl(codeName: string, sectionTitle: string): string {
  const codeSlug = codeName
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]/g, '')
    .substring(0, 60)
  const sectionSlug = sectionTitle
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]/g, '')
    .substring(0, 60)
  const hash = hashContent(codeName + sectionTitle).substring(0, 8)
  return `${IORT_SITEIORT_URL}/codes/${codeSlug}/${sectionSlug}-${hash}`
}
