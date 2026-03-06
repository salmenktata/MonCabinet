/**
 * Utilitaires scraper IORT (Journal Officiel - iort.gov.tn)
 *
 * Le site IORT utilise un framework WebDev/WinDev CGI avec sessions dynamiques
 * (CTX tokens), navigation POST-only via _JSL(), et aucune API REST.
 *
 * Structure du site (vérifiée Feb 2026):
 * - Homepage → _JSL(M7) = JORT Lois/Décrets → _JSL(A9) = Recherche par texte
 * - Formulaire: select A8 (année), A9 (type), A27/A14 (ministère), A3 (mot-clé)
 * - Submit: _JSL(A40), Reset: _JSL(A39)
 * - Résultats: looper A4 (DIV#A4_1..A4_N), compteur A5, pagination A10
 * - Détail texte: _PAGE_.A4.value=N; _JSL(A17,'_blank') (nouvel onglet)
 */

import type { Page, Browser, BrowserContext } from 'playwright'
import { db } from '@/lib/db/postgres'
import { hashUrl, hashContent, countWords, detectTextLanguage } from './content-extractor'
import { createLogger } from '@/lib/logger'
import {
  IORT_BASE_URL,
  IORT_SITEIORT_URL,
  sleep,
  waitForSelector,
  waitForStableContent,
  parseArabicDate,
  generateIortUrl,
  isPdfUrl,
  type IortLanguage,
} from './iort-text-utils'
// Re-export pour compatibilité ascendante
export {
  IORT_BASE_URL,
  IORT_SITEIORT_URL,
  generateIortUrl,
} from './iort-text-utils'
export type { IortLanguage } from './iort-text-utils'

const log = createLogger('IORT')

/** Types de textes disponibles sur IORT (labels exactement comme sur le site) */
export const IORT_TEXT_TYPES = {
  law: { ar: 'قانون', fr: 'Loi', value: 'قانون' },
  decree: { ar: 'مرسوم', fr: 'Décret', value: 'مرسوم' },
  order: { ar: 'أمر', fr: 'Ordre/Arrêté', value: 'أمر' },
  decision: { ar: 'قرار', fr: 'Décision', value: 'قرار' },
  notice: { ar: 'رإي', fr: 'Avis', value: 'رإي' },  // NB: le site utilise رإي (pas رأي)
} as const

export type IortTextType = keyof typeof IORT_TEXT_TYPES

// IortLanguage est re-exporté depuis iort-text-utils.ts

/**
 * Switcher de langue homepage IORT.
 *
 * AR : null (mode arabe par défaut, pas de switch nécessaire)
 * FR : M32 ("Français") — bascule le site en mode français.
 *      Après M32, M7 = "Journal officiel (lois, décrets, arrêtés et avis)"
 *      avec select[A9] en français.
 *
 * Vérifié via scripts/_explore-iort-lang.ts le 2026-03-05.
 */
export const IORT_LANGUAGE_SWITCH: Record<IortLanguage, string | null> = {
  ar: null,   // Pas de switch (mode AR par défaut)
  fr: 'M32', // M32 = "Français"
}

/**
 * Labels des types de textes dans select[name="A9"] selon la langue.
 *
 * AR : قانون | مرسوم | أمر | قرار | رإي
 * FR : Loi | Décret-loi | Décret | Arrêté | Avis
 *
 * Correspondances (vérifiées sur le site IORT le 2026-03-05) :
 *   law      (قانون) → Loi
 *   decree   (مرسوم) → Décret-loi  (marsoums, textes antérieurs à 2014)
 *   order    (أمر)   → Décret      (décrets présidentiels / gouvernementaux)
 *   decision (قرار)  → Arrêté      (arrêtés ministériels)
 *   notice   (رإي)   → Avis
 */
export const IORT_TEXT_TYPE_LABELS: Record<IortLanguage, Record<IortTextType, string>> = {
  ar: {
    law: 'قانون',
    decree: 'مرسوم',
    order: 'أمر',
    decision: 'قرار',
    notice: 'رإي',
  },
  fr: {
    law: 'Loi',
    decree: 'Décret-loi',
    order: 'Décret',
    decision: 'Arrêté',
    notice: 'Avis',
  },
}

/** Configuration rate limiting */
export const IORT_RATE_CONFIG = {
  minDelay: 6000,
  longPauseEvery: 20,
  longPauseMs: 20000,
  comboPauseMs: 12000,
  refreshEvery: 100,
  navigationTimeout: 60000,
  selectorTimeout: 30000,
  errorBackoffMs: 15000,
  maxErrorBackoffMs: 60000,
} as const

/** Textes JORT sans valeur juridique pour un avocat — skip au crawl */
const IORT_ADMIN_NOISE_PATTERNS = [
  /\b(تعيين|تسمية|تنصيب)\b/,                          // nominations / désignations
  /\b(تنقيل|إنهاء مهام|إعفاء من مهام)\b/,              // mutations / révocations
  /\b(إحالة على التقاعد)\b/,                            // retraites
  /\b(مناظرة|توظيف|انتداب|استقطاب)\b/,                 // concours / recrutement
  /\b(ترقية بالاختيار|ترقية في الرتبة|ترقية في الدرجة)\b/, // promotions administratives
  /\b(استيداع|إسناد رتبة)\b/,                           // disponibilité / attribution grade
  /\b(يُسمَّى|تُسمَّى|يسمّى|تسمّى)\b/,                 // passif nomination dans titre
  /\b(يُكلَّف|تُكلَّف|كُلِّفَ|تكلف بمهام)\b/,          // passif délégation dans titre
  /\b(تُسند|يُسند|أُسندت)\b/,                           // passif délégation dans titre
  /\b(يُعيَّن|تُعيَّن|يُنقَّل|تُنقَّل)\b/,             // passif nomination/mutation dans titre
  /\b(يُرقَّى|تُرقَّى|يُنتدَب|تُنتدَب)\b/,             // passif promotion/détachement dans titre
  /\b(يُحال|تُحال)\s+على\s+التقاعد\b/,                 // passif retraite dans titre
  /\b(العقيد|العميد|اللواء|الرائد|النقيب|المقدم)\b/,    // grades militaires dans titre
  /\b(وسام|نيشان)\b/,                                   // décorations / médailles dans titre
  /\b(والي|معتمد أول)\b/,                               // grades civils dans titre
]

/** Args Chromium optimisés pour limiter CPU/RAM en headless */
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-software-rasterizer',
  '--disable-images',
  '--js-flags=--max-old-space-size=256',
]

/** Pool de User-Agents Chrome récents pour rotation par contexte */
const IORT_USER_AGENT_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
]

/** Viewports courants pour varier l'empreinte du contexte */
const IORT_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
]

/** Résultat parsé d'une entrée de recherche */
export interface IortSearchResult {
  title: string
  textType: string
  date: string | null
  issueNumber: string | null
  /** Index 1-based dans le looper A4 (utilisé pour _PAGE_.A4.value=N) */
  resultIndex: number
  /** true si le texte complet est disponible (A17), false si "ليس هنالك نص كامل" (A16) */
  hasFullText: boolean
}

/** Résultat d'extraction d'une page de détail */
export interface IortExtractedText {
  title: string
  content: string
  date: string | null
  issueNumber: string | null
  year: number
  textType: string
  pdfUrl: string | null
  /** Buffer du PDF téléchargé via action A7 */
  pdfBuffer: Buffer | null
  /** Nom du fichier PDF suggéré par le serveur */
  pdfFilename: string | null
}

/** Stats de crawl pour un combo année/type */
export interface IortCrawlStats {
  year: number
  textType: string
  totalResults: number
  crawled: number
  updated: number
  skipped: number
  errors: number
}

// =============================================================================
// SESSION MANAGER
// =============================================================================

export class IortSessionManager {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private pageCount = 0
  private isInitialized = false
  /** Langue courante de crawl (défaut: arabe) */
  public language: IortLanguage = 'ar'

  async init(): Promise<void> {
    const { chromium } = await import('playwright')
    this.browser = await chromium.launch({
      headless: true,
      args: CHROMIUM_ARGS,
    })
    await this.createContext()
    this.isInitialized = true
    log.info('Session Playwright initialisée')
  }

  private async createContext(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {})
    }
    const userAgent = IORT_USER_AGENT_POOL[Math.floor(Math.random() * IORT_USER_AGENT_POOL.length)]
    const viewport = IORT_VIEWPORTS[Math.floor(Math.random() * IORT_VIEWPORTS.length)]
    this.context = await this.browser!.newContext({
      userAgent,
      viewport,
      locale: 'ar-TN',
      extraHTTPHeaders: {
        'Accept-Language': 'ar-TN,ar;q=0.9,fr-TN;q=0.8,fr;q=0.7',
      },
    })
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(IORT_RATE_CONFIG.navigationTimeout)
    // Masquer les fingerprints headless (navigator.webdriver, plugins, chrome runtime)
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => ['ar-TN', 'ar', 'fr'] })
      if (!(window as any).chrome) {
        (window as any).chrome = { runtime: {} }
      }
    })
    this.pageCount = 0
  }

  getPage(): Page {
    if (!this.page) throw new Error('[IORT] Session non initialisée. Appeler init() d\'abord.')
    return this.page
  }

  async tick(): Promise<void> {
    this.pageCount++
    if (this.pageCount >= IORT_RATE_CONFIG.refreshEvery) {
      log.info(`[${this.language.toUpperCase()}] Refresh contexte Playwright après ${this.pageCount} pages`)
      await this.createContext()
      await this.navigateToSearch(this.language)
    }
  }

  /**
   * Incrémente le compteur de pages sans déclencher de refresh contexte ni navigation.
   * Utilisé par le codes scraper qui gère sa propre navigation WebDev.
   */
  tickWithoutNavigation(): void {
    this.pageCount++
  }

  async isSessionValid(): Promise<boolean> {
    try {
      const page = this.getPage()
      const url = page.url()
      // Redirect vers la homepage = session expirée côté serveur WebDev
      if (url === IORT_BASE_URL || url === IORT_BASE_URL + '/') return false
      // Le formulaire de recherche (select A8) doit être présent
      const hasForm = await page.$('select[name="A8"]')
      return hasForm !== null
    } catch {
      return false
    }
  }

  /**
   * Navigue vers la page de recherche IORT.
   *
   * AR : Homepage → M7 → A9 (si nécessaire)
   * FR : Homepage → M32 (switcher langue) → M7 → A9 (si nécessaire)
   *
   * En mode FR, M32 bascule le site en français, puis M7 donne accès au
   * "Journal officiel (lois, décrets, arrêtés et avis)" avec select[A9] en FR.
   * Vérifié via scripts/_explore-iort-lang.ts le 2026-03-05.
   */
  async navigateToSearch(language: IortLanguage = 'ar'): Promise<void> {
    const page = this.getPage()
    const langTag = language.toUpperCase()
    const langSwitch = IORT_LANGUAGE_SWITCH[language]

    // 1. Homepage
    log.info(`[${langTag}] Navigation vers la page d'accueil...`)
    await page.goto(IORT_BASE_URL, {
      waitUntil: 'load',
      timeout: IORT_RATE_CONFIG.navigationTimeout,
    })
    await sleep(3000)

    // 2. Switcher de langue si nécessaire (FR: M32)
    if (langSwitch) {
      log.info(`[${langTag}] Activation mode français (${langSwitch})...`)
      await page.evaluate((id) => {
        // @ts-expect-error WebDev global function
        _JSL(_PAGE_, id, '_self', '', '')
      }, langSwitch)
      await page.waitForLoadState('load')
      await sleep(3000)
    }

    // 3. M7 = "الرائد الرسمي القوانين و الأوامر" / "Journal officiel (lois, décrets, arrêtés et avis)"
    //    Même ID en AR et FR — le site adapte le contenu selon la langue active
    log.info(`[${langTag}] Navigation M7 (JORT lois et décrets)...`)
    await page.evaluate(() => {
      // @ts-expect-error WebDev global function
      _JSL(_PAGE_, 'M7', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await sleep(3000)

    // 4. Vérifier si on a déjà le formulaire de recherche (select A8)
    const hasSearchForm = await page.$('select[name="A8"]')
    if (!hasSearchForm) {
      // A9 = "البحث عن النص" / "Recherche dans le JORT"
      log.info(`[${langTag}] Navigation A9 (formulaire de recherche)...`)
      await page.evaluate(() => {
        // @ts-expect-error WebDev global function
        _JSL(_PAGE_, 'A9', '_self', '', '')
      })
      await page.waitForLoadState('load')
      await sleep(3000)
    }

    // Vérifier que le formulaire est présent
    const yearSelect = await page.$('select[name="A8"]')
    if (!yearSelect) {
      throw new Error(`[IORT ${langTag}] Formulaire de recherche non trouvé (select A8 absent)`)
    }

    log.info(`[${langTag}] Page de recherche atteinte`)
  }

  /**
   * Récupère après un crash du browser/context.
   * Re-crée le browser, context et page, puis re-navigue.
   */
  async recover(): Promise<void> {
    log.info(`[${this.language.toUpperCase()}] Récupération session après crash...`)
    // Fermer tout proprement
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})

    // Re-initialiser
    const { chromium } = await import('playwright')
    this.browser = await chromium.launch({
      headless: true,
      args: CHROMIUM_ARGS,
    })
    await this.createContext()
    await this.navigateToSearch(this.language)
    log.info(`[${this.language.toUpperCase()}] Session récupérée`)
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})
    this.isInitialized = false
    log.info(' Session Playwright fermée')
  }

  get initialized(): boolean {
    return this.isInitialized
  }
}

// =============================================================================
// RECHERCHE
// =============================================================================

/**
 * Effectue une recherche par année et type de texte.
 * Sélectionne dans A8 (année) et A9 (type), puis soumet via _JSL(A40).
 * Retourne le nombre total de résultats (champ A5).
 *
 * @param language - 'ar' (défaut) ou 'fr'. Détermine le label du type dans select[A9].
 */
export async function searchByYearAndType(
  page: Page,
  year: number,
  textType: IortTextType,
  language: IortLanguage = 'ar',
): Promise<number> {
  const typeConfig = IORT_TEXT_TYPES[textType]
  const typeLabel = IORT_TEXT_TYPE_LABELS[language][textType]
  const langTag = language.toUpperCase()

  log.info(`[${langTag}] Recherche: année=${year}, type=${typeConfig.fr} (label="${typeLabel}")`)

  // Réinitialiser le formulaire d'abord via _JSL(A39)
  await page.evaluate(() => {
    // @ts-expect-error WebDev global function
    _JSL(_PAGE_, 'A39', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await sleep(2000)

  // Sélectionner l'année via select[name="A8"] (par label texte)
  await page.selectOption('select[name="A8"]', { label: String(year) })
  await sleep(500)

  // Sélectionner le type via select[name="A9"] (par label selon la langue)
  // En AR : "قانون", "مرسوم", etc. | En FR : "Loi", "Décret", etc.
  try {
    await page.selectOption('select[name="A9"]', { label: typeLabel })
  } catch {
    // Fallback : utiliser le label arabe si le label FR n'est pas trouvé dans le select
    // (certaines interfaces IORT FR gardent les labels arabes)
    log.warn(`[${langTag}] Label "${typeLabel}" non trouvé dans A9, essai avec label AR "${typeConfig.ar}"`)
    await page.selectOption('select[name="A9"]', { label: typeConfig.ar })
  }
  await sleep(500)

  // Soumettre via _JSL(A40) (bouton recherche image)
  await page.evaluate(() => {
    // @ts-expect-error WebDev global function
    _JSL(_PAGE_, 'A40', '_self', '', '')
  })
  await page.waitForLoadState('load')
  // Attendre que le looper résultats ou le compteur A5 apparaisse
  await waitForSelector(page, 'input[name="A5"], div[id^="A4_"]', 8000)
  await sleep(1000) // court délai pour stabilisation WebDev

  // Lire le nombre total dans input[name="A5"]
  const totalResults = await parseTotalResults(page)
  log.info(`[${langTag}] ${totalResults} résultats trouvés pour ${year}/${typeConfig.fr}`)

  return totalResults
}

/**
 * Parse le nombre total de résultats depuis le champ A5
 */
async function parseTotalResults(page: Page): Promise<number> {
  // Le champ A5 (input text readonly) contient le nombre total de résultats
  const a5Value = await page.$eval(
    'input[name="A5"]',
    (el) => (el as HTMLInputElement).value,
  ).catch(() => '')

  if (a5Value) {
    const num = parseInt(a5Value.trim(), 10)
    if (!isNaN(num)) return num
  }

  // Fallback: compter les éléments du looper A4
  const looperItems = await page.$$('div[id^="A4_"]')
  return looperItems.length
}

// =============================================================================
// PARSING RÉSULTATS
// =============================================================================

/**
 * Parse les résultats du looper A4 sur la page courante.
 * Les résultats sont dans des DIV#A4_1, A4_2, ... A4_N.
 * Chaque DIV contient un lien titre avec href:
 *   javascript:_PAGE_.A4.value=N;javascript:{_JSL(_PAGE_,'A17','_blank','','')}
 * ou A16 pour les textes sans contenu complet.
 */
export async function parseSearchResults(page: Page): Promise<IortSearchResult[]> {
  const results: IortSearchResult[] = []

  // Le looper WebDev A4: items dans div[id^="A4_"]
  const items = await page.$$('div[id^="A4_"]')

  for (const item of items) {
    try {
      const itemId = await item.getAttribute('id')
      if (!itemId) continue

      // Extraire l'index du looper (A4_1 → 1, A4_2 → 2, ...)
      const indexMatch = itemId.match(/A4_(\d+)/)
      if (!indexMatch) continue
      const index = parseInt(indexMatch[1], 10)

      // Extraire le texte complet du div
      const fullText = (await item.textContent() || '').trim()
      if (!fullText || fullText.length < 10) continue

      // Trouver le lien principal (titre du texte) — le plus long lien
      const links = await item.$$('a')
      let titleLink = null
      let titleText = ''
      let hasFullText = true

      for (const link of links) {
        const text = (await link.textContent() || '').trim()
        const href = (await link.getAttribute('href') || '')

        // "ليس هنالك نص كامل" = pas de texte complet disponible
        if (text.includes('ليس هنالك نص كامل')) {
          hasFullText = false
          continue
        }

        // Le titre est le lien le plus long (pas "قانون", "التنقيحات", "PDF-نص", etc.)
        if (text.length > titleText.length && text.length > 15 && !text.match(/^(التنقيحات|PDF|قانون|مرسوم|أمر|قرار|رإي)$/)) {
          titleLink = link
          titleText = text
        }
      }

      if (!titleText) {
        // Fallback: utiliser le texte complet du div sans les labels
        titleText = fullText
          .replace(/^(قانون|مرسوم|أمر|قرار|رإي)\s*/g, '')
          .replace(/التنقيحات/g, '')
          .replace(/PDF-نص/g, '')
          .replace(/ليس هنالك نص كامل/g, '')
          .replace(/لغتان/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      }

      if (titleText.length < 5) continue

      // Extraire la date depuis le titre (format: "مؤرخ في DD MMMM YYYY")
      const dateMatch = titleText.match(/مؤرخ في\s+(\d{1,2}\s+\S+\s+\d{4})/)
      const date = dateMatch ? dateMatch[1] : null

      // Extraire le numéro depuis le titre ("عدد NN")
      const numMatch = titleText.match(/عدد\s+(\d+)/)
      const issueNumber = numMatch ? numMatch[1] : null

      results.push({
        title: titleText.replace(/\s+/g, ' ').trim(),
        textType: fullText.match(/^(قانون|مرسوم|أمر|قرار|رإي)/)?.[1] || '',
        date,
        issueNumber,
        resultIndex: index,
        hasFullText,
      })
    } catch (err) {
      log.warn(` Erreur parsing item:`, err instanceof Error ? err.message : err)
    }
  }

  return results
}

/**
 * Navigue vers la page suivante de résultats.
 * La pagination IORT est dans #A10: "1 2 > >>"
 * Le lien ">" avance d'une page.
 */
export async function goToNextPage(page: Page): Promise<boolean> {
  // Chercher dans la zone de pagination (#A10 ou son conteneur)
  // Le lien ">" est le bouton page suivante
  const nextLink = await page.$('#A10 a:has-text(">"):not(:has-text(">>"))')
  if (!nextLink) {
    // Essayer le >> (dernière page) comme fallback si > n'existe pas
    return false
  }

  try {
    await nextLink.click()
    await page.waitForLoadState('load')
    await sleep(3000)
    return true
  } catch {
    return false
  }
}

// =============================================================================
// EXTRACTION DÉTAIL
// =============================================================================

/**
 * Ouvre le détail d'un résultat dans un nouvel onglet via _PAGE_.A4.value=N; _JSL(A17)
 * et extrait le texte complet.
 */
export async function extractTextDetail(
  page: Page,
  result: IortSearchResult,
  year: number,
  textType: IortTextType,
): Promise<IortExtractedText | null> {
  try {
    if (!result.hasFullText) {
      log.info(` Pas de texte complet pour "${result.title.substring(0, 50)}..."`)
      return null
    }

    // Ouvrir le détail: set A4.value = resultIndex, puis _JSL(A17, '_blank')
    // Comme A17 ouvre dans _blank, on doit capturer le popup
    const [detailPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 30000 }),
      page.evaluate((idx) => {
        // @ts-expect-error WebDev form
        _PAGE_.A4.value = idx
        // @ts-expect-error WebDev global function
        _JSL(_PAGE_, 'A17', '_blank', '', '')
      }, result.resultIndex),
    ])

    await detailPage.waitForLoadState('load')
    await sleep(3000)

    // Extraire le contenu de la page de détail
    const html = await detailPage.content()

    // Utiliser cheerio si disponible, sinon extraction manuelle
    let textContent = ''
    let title = result.title
    let pdfUrl: string | null = null

    try {
      const cheerio = await import('cheerio')
      const $ = cheerio.load(html)

      // Supprimer les éléments de navigation/noise
      $('script, style, nav, header, footer, form[name*="WD"], [class*="menu"], [class*="Menu"], [class*="entete"], [class*="pied"]').remove()

      // Le contenu est souvent dans des tables ou divs spécifiques
      const contentSelectors = [
        '.contenu', '.texte', 'td.texte', 'td.contenu',
        'div.texte', '#contenu', '.Texte',
      ]

      for (const selector of contentSelectors) {
        const el = $(selector)
        if (el.length && el.text().trim().length > 100) {
          textContent = el.text().trim()
          break
        }
      }

      // Fallback: body entier nettoyé
      if (!textContent || textContent.length < 100) {
        // Prendre le texte visible en excluant les éléments de navigation
        textContent = $('body').text().trim()
      }

      // Chercher un lien PDF
      const pdfLink = $('a[href*=".pdf"], a[href*="PDF"]')
      if (pdfLink.length) {
        const href = pdfLink.first().attr('href')
        if (href) {
          pdfUrl = href.startsWith('http') ? href : `${IORT_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
        }
      }
    } catch {
      // Fallback sans cheerio: extraction via Playwright
      textContent = await detailPage.evaluate(() => document.body.innerText)
    }

    // Nettoyer le texte
    textContent = textContent
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      // Retirer les noise WebDev
      .replace(/WD_ACTION_[^\s]*/g, '')
      .replace(/جميع الحقوق محفوظة.*$/g, '')
      .replace(/Copyright.*IORT/gi, '')
      .trim()

    // Fermer l'onglet de détail
    await detailPage.close()

    if (textContent.length < 50) {
      log.warn(` Contenu trop court pour "${title}" (${textContent.length} chars)`)
      return null
    }

    // Extraire le numéro JORT depuis le contenu
    let issueNumber = result.issueNumber
    if (!issueNumber) {
      const jortMatch = textContent.match(/(?:الرائد الرسمي|JORT)\s*(?:عدد|n°?)\s*(\d+)/i)
      if (jortMatch) issueNumber = jortMatch[1]
    }

    // Extraire la date
    let date = result.date
    if (!date) {
      const dateMatch = textContent.match(/(?:المؤرخ في|بتاريخ|en date du)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i)
      if (dateMatch) date = dateMatch[1]
    }

    return {
      title,
      content: textContent,
      date,
      issueNumber,
      year,
      textType: IORT_TEXT_TYPES[textType].ar,
      pdfUrl,
      pdfBuffer: null,
      pdfFilename: null,
    }
  } catch (err) {
    log.error(` Erreur extraction détail "${result.title}":`, err instanceof Error ? err.message : err)

    // Fermer tout onglet supplémentaire qui aurait pu s'ouvrir
    const pages = page.context().pages()
    for (const p of pages) {
      if (p !== page) await p.close().catch(() => {})
    }

    return null
  }
}

/**
 * Retourne à la page de résultats (no-op car on utilise des popups _blank)
 */
export async function goBackToResults(_page: Page): Promise<void> {
  // Les détails s'ouvrent dans un nouvel onglet via _blank
  // Pas besoin de naviguer en arrière — l'onglet principal reste sur les résultats
}

// =============================================================================
// TÉLÉCHARGEMENT PDF
// =============================================================================

/**
 * Télécharge le PDF d'un texte juridique via l'action A7 du framework WebDev.
 * _PAGE_.A4.value=idx; _JSL(A7,'_self') déclenche un download direct.
 */
async function downloadPdfViaA7(
  page: Page,
  resultIndex: number,
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.evaluate((idx) => {
        // @ts-expect-error WebDev form
        _PAGE_.A4.value = idx
        // @ts-expect-error WebDev global function
        _JSL(_PAGE_, 'A7', '_self', '', '')
      }, resultIndex),
    ])

    const filename = download.suggestedFilename() || `iort-${resultIndex}.pdf`

    // Lire le contenu du fichier téléchargé
    const path = await download.path()
    if (!path) {
      log.warn(` PDF download path null pour index ${resultIndex}`)
      return null
    }

    const fs = await import('fs')
    const buffer = fs.readFileSync(path)

    // Attendre que la page soit de retour à la liste (A7 est _self)
    await page.waitForLoadState('load').catch(() => {})
    await sleep(2000)

    log.info(` PDF téléchargé: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
    return { buffer, filename }
  } catch (err) {
    log.warn(` Échec download PDF A7 (index ${resultIndex}):`, err instanceof Error ? err.message : err)
    // S'assurer qu'on est toujours sur la bonne page
    await page.waitForLoadState('load').catch(() => {})
    return null
  }
}

/**
 * Upload un PDF IORT vers MinIO.
 * Accepte soit un buffer direct (de downloadPdfViaA7), soit une URL.
 */
export async function uploadIortPdf(
  sourceId: string,
  pageTitle: string,
  pdfBuffer: Buffer,
  pdfFilename: string,
): Promise<{ minioPath: string; size: number } | null> {
  try {
    const crypto = await import('crypto')
    const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')

    // Vérifier si un PDF identique existe déjà (toutes sources confondues)
    const existingPdf = await db.query(
      `SELECT linked_files FROM web_pages
       WHERE linked_files != '[]'::jsonb
       AND linked_files @> $1::jsonb
       LIMIT 1`,
      [JSON.stringify([{ contentHash: pdfHash }])],
    )

    // Fallback: chercher par taille + même source (heuristique rapide si pas de contentHash stocké)
    if (existingPdf.rows.length === 0) {
      const sizeMatch = await db.query(
        `SELECT id, linked_files FROM web_pages
         WHERE web_source_id = $1
         AND linked_files != '[]'::jsonb
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(linked_files) elem
           WHERE (elem->>'size')::int = $2
           AND elem->>'type' = 'pdf'
           AND elem->>'minioPath' IS NOT NULL
         )
         LIMIT 1`,
        [sourceId, pdfBuffer.length],
      )

      if (sizeMatch.rows.length > 0) {
        const files = sizeMatch.rows[0].linked_files as Array<{ minioPath?: string; size?: number }>
        const matchingFile = files.find(f => f.size === pdfBuffer.length && f.minioPath)
        if (matchingFile?.minioPath) {
          log.info(` PDF dédupliqué (taille identique): ${matchingFile.minioPath}`)
          return { minioPath: matchingFile.minioPath, size: pdfBuffer.length }
        }
      }
    } else {
      const files = existingPdf.rows[0].linked_files as Array<{ minioPath?: string; size?: number }>
      const matchingFile = files.find(f => f.minioPath)
      if (matchingFile?.minioPath) {
        log.info(` PDF dédupliqué (hash identique): ${matchingFile.minioPath}`)
        return { minioPath: matchingFile.minioPath, size: pdfBuffer.length }
      }
    }

    const { uploadFile } = await import('@/lib/storage/minio')

    const slug = pageTitle
      .replace(/[^\w\u0600-\u06FF\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100)
    const hash = hashContent(pageTitle).substring(0, 8)
    const filename = `iort/${sourceId}/${slug}-${hash}.pdf`

    await uploadFile(pdfBuffer, filename, { contentType: 'application/pdf' }, 'web-files')

    log.info(` PDF uploadé MinIO: ${filename} (${Math.round(pdfBuffer.length / 1024)} KB)`)

    return {
      minioPath: filename,
      size: pdfBuffer.length,
    }
  } catch (err) {
    log.error(` Erreur upload PDF MinIO:`, err instanceof Error ? err.message : err)
    return null
  }
}

// =============================================================================
// SAUVEGARDE EN DB
// =============================================================================

// generateIortUrl — importé et re-exporté depuis iort-text-utils.ts

export async function saveIortPage(
  sourceId: string,
  extracted: IortExtractedText,
  pdfInfo: { minioPath: string; size: number } | null,
  language: IortLanguage = 'ar',
): Promise<{ id: string; skipped: boolean; updated: boolean }> {
  const url = generateIortUrl(
    extracted.year,
    extracted.issueNumber,
    extracted.textType,
    extracted.title,
    language,
  )
  const urlHash = hashUrl(url)
  const contentHash = hashContent(extracted.content)

  // 1. Lookup primaire par url_hash
  const existing = await db.query(
    'SELECT id, content_hash, url FROM web_pages WHERE url_hash = $1',
    [urlHash],
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    const existingContentHash = row.content_hash as string | null

    if (existingContentHash === contentHash) {
      // Contenu identique → juste mettre à jour last_crawled_at
      await db.query(
        'UPDATE web_pages SET last_crawled_at = NOW(), updated_at = NOW() WHERE id = $1',
        [row.id],
      )
      return { id: row.id as string, skipped: true, updated: false }
    }

    // Contenu changé → créer version + mettre à jour
    await updateIortPage(row.id as string, extracted, contentHash, pdfInfo, language)
    return { id: row.id as string, skipped: false, updated: true }
  }

  // 2. Lookup secondaire par structured_data (évite doublons quand le titre change)
  // Filtre par langue pour ne pas confondre la version AR et FR du même texte
  if (extracted.issueNumber) {
    const structLookup = await db.query(
      `SELECT id, content_hash, url FROM web_pages
       WHERE web_source_id = $1
       AND structured_data->>'year' = $2
       AND structured_data->>'issueNumber' = $3
       AND structured_data->>'textType' = $4
       AND structured_data->>'source' = 'iort'
       AND (
         structured_data->>'language' = $5
         OR ($5 = 'ar' AND structured_data->>'language' IS NULL)
       )
       LIMIT 1`,
      [sourceId, String(extracted.year), extracted.issueNumber, extracted.textType, language],
    )

    if (structLookup.rows.length > 0) {
      const row = structLookup.rows[0]
      // Même texte juridique, URL a changé → mettre à jour URL + contenu si nécessaire
      const needsContentUpdate = row.content_hash !== contentHash

      await db.query(
        `UPDATE web_pages SET url = $2, url_hash = $3, canonical_url = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, url, urlHash],
      )

      if (needsContentUpdate) {
        await updateIortPage(row.id as string, extracted, contentHash, pdfInfo, language)
        return { id: row.id as string, skipped: false, updated: true }
      }

      await db.query(
        'UPDATE web_pages SET last_crawled_at = NOW(), updated_at = NOW() WHERE id = $1',
        [row.id],
      )
      return { id: row.id as string, skipped: true, updated: false }
    }
  }

  // 3. Nouveau texte → INSERT
  const wordCount = countWords(extracted.content)
  // Utiliser la langue de crawl explicite (plus fiable que la détection automatique)
  const detectedLang = language || detectTextLanguage(extracted.content) || 'ar'

  const linkedFiles = pdfInfo
    ? JSON.stringify([{
        url: url,
        type: 'pdf',
        filename: pdfInfo.minioPath.split('/').pop(),
        minioPath: pdfInfo.minioPath,
        size: pdfInfo.size,
        contentType: 'application/pdf',
      }])
    : '[]'

  const structuredData = JSON.stringify({
    year: extracted.year,
    textType: extracted.textType,
    issueNumber: extracted.issueNumber,
    date: extracted.date,
    source: 'iort',
    language,
  })

  const isoDate = parseArabicDate(extracted.date)

  const result = await db.query(
    `INSERT INTO web_pages (
      web_source_id, url, url_hash, canonical_url,
      title, content_hash, extracted_text, word_count, language_detected,
      meta_description, meta_date, structured_data,
      linked_files,
      status, crawl_depth, last_crawled_at, first_seen_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13,
      'crawled', 0, NOW(), NOW()
    ) RETURNING id`,
    [
      sourceId,
      url,
      urlHash,
      url,
      extracted.title,
      contentHash,
      extracted.content,
      wordCount,
      detectedLang,
      `${extracted.textType} - ${extracted.title}`.substring(0, 500),
      isoDate,
      structuredData,
      linkedFiles,
    ],
  )

  const pageId = result.rows[0]?.id as string

  if (pageId) {
    try {
      const { createWebPageVersion } = await import('./source-service')
      await createWebPageVersion(pageId, 'initial_crawl')
    } catch (err) {
      log.error(' Erreur création version initiale:', err)
    }
  }

  return { id: pageId, skipped: false, updated: false }
}

/**
 * Met à jour une page IORT existante dont le contenu a changé.
 * Crée un snapshot de version, met à jour le contenu, et marque is_indexed=false.
 */
async function updateIortPage(
  pageId: string,
  extracted: IortExtractedText,
  contentHash: string,
  pdfInfo: { minioPath: string; size: number } | null,
  language: IortLanguage = 'ar',
): Promise<void> {
  // Créer un snapshot avant la mise à jour
  try {
    const { createWebPageVersion } = await import('./source-service')
    await createWebPageVersion(pageId, 'content_change')
  } catch (err) {
    log.error(' Erreur création version:', err)
  }

  const wordCount = countWords(extracted.content)
  const detectedLang = language || detectTextLanguage(extracted.content) || 'ar'
  const isoDate = parseArabicDate(extracted.date)

  const structuredData = JSON.stringify({
    year: extracted.year,
    textType: extracted.textType,
    issueNumber: extracted.issueNumber,
    date: extracted.date,
    source: 'iort',
    language,
  })

  const params: unknown[] = [
    pageId,
    extracted.title,
    contentHash,
    extracted.content,
    wordCount,
    detectedLang,
    `${extracted.textType} - ${extracted.title}`.substring(0, 500),
    isoDate,
    structuredData,
  ]

  let linkedFilesClause = ''
  if (pdfInfo) {
    const linkedFiles = JSON.stringify([{
      url: generateIortUrl(extracted.year, extracted.issueNumber, extracted.textType, extracted.title),
      type: 'pdf',
      filename: pdfInfo.minioPath.split('/').pop(),
      minioPath: pdfInfo.minioPath,
      size: pdfInfo.size,
      contentType: 'application/pdf',
    }])
    params.push(linkedFiles)
    linkedFilesClause = `linked_files = $${params.length},`
  }

  await db.query(
    `UPDATE web_pages SET
      title = $2,
      content_hash = $3,
      extracted_text = $4,
      word_count = $5,
      language_detected = $6,
      meta_description = $7,
      meta_date = $8,
      structured_data = $9,
      ${linkedFilesClause}
      status = 'crawled',
      last_crawled_at = NOW(),
      last_changed_at = NOW(),
      is_indexed = false,
      updated_at = NOW()
    WHERE id = $1`,
    params,
  )

  log.info(` Page ${pageId} mise à jour (contenu changé, is_indexed=false)`)
}

export async function updateIortSourceStats(sourceId: string): Promise<void> {
  await db.query(
    `UPDATE web_sources SET
      total_pages_discovered = (SELECT COUNT(*) FROM web_pages WHERE web_source_id = $1),
      total_pages_indexed = (SELECT COUNT(*) FROM web_pages WHERE web_source_id = $1 AND is_indexed = true),
      last_crawl_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [sourceId],
  )
}

// =============================================================================
// CRAWL PRINCIPAL
// =============================================================================

/**
 * Fast-forward pagination après recovery : avance rapidement jusqu'à targetPage
 * en cliquant ">" sans traiter les résultats.
 * Retourne le numéro de page atteint (peut être < targetPage si pagination épuisée).
 */
async function fastForwardToPage(page: Page, targetPage: number, langTag: string): Promise<number> {
  if (targetPage <= 1) return 1
  log.info(`[${langTag}] Fast-forward vers page ${targetPage}...`)
  let current = 1
  while (current < targetPage) {
    const advanced = await goToNextPage(page)
    if (!advanced) {
      log.info(`[${langTag}] Fast-forward arrêté à page ${current} (pagination épuisée)`)
      return current
    }
    current++
  }
  log.info(`[${langTag}] Fast-forward OK — page ${current} atteinte`)
  return current
}

export async function crawlYearType(
  session: IortSessionManager,
  sourceId: string,
  year: number,
  textType: IortTextType,
  signal?: AbortSignal,
  language: IortLanguage = 'ar',
  skipPdfDownload = false,
): Promise<IortCrawlStats> {
  const langTag = language.toUpperCase()
  const stats: IortCrawlStats = {
    year,
    textType: IORT_TEXT_TYPES[textType].fr,
    totalResults: 0,
    crawled: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  }

  // Mémoriser la langue dans la session (utilisé par recover())
  session.language = language

  // Toujours utiliser session.getPage() pour avoir la page courante (peut changer après recover)
  let page = session.getPage()

  // Vérifier session et re-naviguer si nécessaire
  const valid = await session.isSessionValid()
  if (!valid) {
    log.info(`[${langTag}] Session expirée, re-navigation...`)
    await session.navigateToSearch(language)
    page = session.getPage()
  }

  // Effectuer la recherche
  const totalResults = await searchByYearAndType(page, year, textType, language)
  stats.totalResults = totalResults

  if (totalResults === 0) {
    log.info(`[${langTag}] Aucun résultat pour ${year}/${IORT_TEXT_TYPES[textType].fr}`)
    return stats
  }

  // Itérer les pages de résultats
  let hasNextPage = true
  let pageNum = 1
  let consecutiveErrors = 0
  /** Page atteinte avant le dernier crash — permet de fast-forward après recovery */
  let lastSuccessfulPage = 0
  /** Délai adaptatif : augmente après erreurs, revient à minDelay après succès */
  let currentDelay: number = IORT_RATE_CONFIG.minDelay

  while (hasNextPage) {
    if (signal?.aborted) {
      log.info(`[${langTag}] Signal d'arrêt reçu`)
      break
    }

    try {
      page = session.getPage()
      const results = await parseSearchResults(page)
      log.info(`[${langTag}] Page ${pageNum}: ${results.length} résultats à traiter`)
      consecutiveErrors = 0

      // Phase 1: Extraire texte + sauvegarder (via popup A17)
      const extractedResults: Array<{
        result: typeof results[0]
        extracted: IortExtractedText
        pageId: string
      }> = []

      for (const result of results) {
        if (signal?.aborted) break

        // Filtrer les textes administratifs sans valeur juridique (nominations, mutations, concours…)
        if (IORT_ADMIN_NOISE_PATTERNS.some(p => p.test(result.title))) {
          log.info(` skip bruit admin: "${result.title.substring(0, 70)}"`)
          stats.skipped++
          await sleep(currentDelay)
          continue
        }

        try {
          page = session.getPage()
          const extracted = await extractTextDetail(page, result, year, textType)
          if (!extracted) {
            if (!result.hasFullText) {
              stats.skipped++
            } else {
              stats.errors++
              currentDelay = Math.min(currentDelay * 1.5, IORT_RATE_CONFIG.maxErrorBackoffMs)
            }
            await sleep(currentDelay)
            continue
          }

          const { id: pageId, skipped, updated } = await saveIortPage(sourceId, extracted, null, language)

          if (skipped) {
            stats.skipped++
          } else if (updated) {
            stats.updated++
            extractedResults.push({ result, extracted, pageId })
            log.info(` ↻ MAJ ${result.title.substring(0, 60)}...`)
          } else {
            stats.crawled++
            extractedResults.push({ result, extracted, pageId })
            log.info(` ✓ ${result.title.substring(0, 60)}...`)
          }

          // Succès : réinitialiser le délai
          currentDelay = IORT_RATE_CONFIG.minDelay
          await sleep(currentDelay)
          await session.tick()

          if ((stats.crawled + stats.skipped) % IORT_RATE_CONFIG.longPauseEvery === 0 && stats.crawled > 0) {
            log.info(` Pause longue après ${stats.crawled + stats.skipped} pages...`)
            await sleep(IORT_RATE_CONFIG.longPauseMs)
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          stats.errors++
          log.error(` Erreur traitement "${result.title.substring(0, 40)}":`, errMsg)
          currentDelay = Math.min(currentDelay * 1.5, IORT_RATE_CONFIG.maxErrorBackoffMs)

          // Si le browser a crashé, récupérer et sortir de la boucle des résultats
          if (errMsg.includes('Target page') || errMsg.includes('browser has been closed') || errMsg.includes('context has been closed')) {
            log.info(' Browser crash détecté, recovery...')
            await session.recover()
            page = session.getPage()
            await searchByYearAndType(page, year, textType, language)
            // Fast-forward vers la dernière page traitée (doublons déjà en DB seront skippés)
            pageNum = await fastForwardToPage(page, lastSuccessfulPage, langTag)
            break // Sortir de la boucle des résultats, recommencer cette page
          }

          // Fermer tout onglet popup restant
          try {
            const ctxPages = page.context().pages()
            for (const p of ctxPages) {
              if (p !== page) await p.close().catch(() => {})
            }
          } catch { /* context may be dead */ }

          await sleep(currentDelay)
        }
      }

      // Phase 2: Télécharger les PDFs via A7 (uniquement si HTML insuffisant)
      const JORT_MIN_HTML_LENGTH = 300
      const resultsMissingContent = skipPdfDownload
        ? []
        : extractedResults.filter(
            ({ extracted }) => !extracted.content || extracted.content.length < JORT_MIN_HTML_LENGTH,
          )

      if (resultsMissingContent.length > 0) {
        log.info(
          `Phase 2 PDF — ${resultsMissingContent.length}/${extractedResults.length} résultats sans HTML suffisant`,
        )

        for (const { result, extracted, pageId } of resultsMissingContent) {
          if (signal?.aborted) break

          try {
            page = session.getPage()
            const downloadResult = await downloadPdfViaA7(page, result.resultIndex)
            if (downloadResult) {
              const pdfInfo = await uploadIortPdf(sourceId, extracted.title, downloadResult.buffer, downloadResult.filename)
              if (pdfInfo && pageId) {
                await db.query(
                  `UPDATE web_pages SET linked_files = $1::jsonb WHERE id = $2`,
                  [JSON.stringify([{
                    url: generateIortUrl(extracted.year, extracted.issueNumber, extracted.textType, extracted.title),
                    type: 'pdf',
                    filename: downloadResult.filename,
                    minioPath: pdfInfo.minioPath,
                    size: pdfInfo.size,
                    contentType: 'application/pdf',
                  }]), pageId],
                )

                // L'indexation PDF est déléguée à scripts/index-iort-pdfs.ts (non-bloquant)
                // Cela évite de bloquer le crawl texte avec les embeddings Ollama (~1.5s/chunk)
                log.info(` PDF stocké dans MinIO (${pdfInfo.minioPath}) — indexation différée`)
              }
            }
            await sleep(2000)
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            log.warn(` Erreur PDF "${result.title.substring(0, 40)}":`, errMsg)

            // Browser crash pendant le PDF → recover et abandonner le reste des PDFs
            if (errMsg.includes('Target page') || errMsg.includes('browser has been closed')) {
              log.info(' Browser crash pendant PDF, recovery...')
              await session.recover()
              page = session.getPage()
              break // Abandonner les PDFs restants, continuer le crawl
            }
          }
        }

        // Vérifier si la page de résultats est toujours intacte
        try {
          page = session.getPage()
          const stillOnResults = await page.$('div[id^="A4_"]')
          if (!stillOnResults) {
            log.info(' Page résultats perdue après PDFs, recovery + fast-forward...')
            await session.recover()
            page = session.getPage()
            await searchByYearAndType(page, year, textType, language)
            pageNum = await fastForwardToPage(page, lastSuccessfulPage, langTag)
            continue
          }
        } catch {
          log.info(' Erreur vérification page, recovery + fast-forward...')
          await session.recover()
          page = session.getPage()
          await searchByYearAndType(page, year, textType, language)
          pageNum = await fastForwardToPage(page, lastSuccessfulPage, langTag)
          continue
        }
      }

      // Marquer la page comme traitée avec succès (pour fast-forward après recovery)
      lastSuccessfulPage = pageNum

      // Page suivante
      hasNextPage = await goToNextPage(page)
      pageNum++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error(` Erreur page ${pageNum}:`, errMsg)
      consecutiveErrors++

      if (consecutiveErrors >= 8) {
        log.error(` ${consecutiveErrors} erreurs consécutives, abandon du combo`)
        break
      }

      // Recovery : fast-forward vers la dernière page traitée, les doublons seront skippés par saveIortPage
      try {
        await session.recover()
        page = session.getPage()
        await searchByYearAndType(page, year, textType, language)
        pageNum = await fastForwardToPage(page, lastSuccessfulPage, langTag)
        log.info(` Recovery OK — reprise depuis page ${pageNum} (doublons skippés)`)
      } catch (recoverErr) {
        log.error(' Échec recovery:', recoverErr instanceof Error ? recoverErr.message : recoverErr)
        break
      }
    }
  }

  log.info(
    `[${langTag}] Terminé ${year}/${IORT_TEXT_TYPES[textType].fr}: ` +
    `${stats.crawled} nouveaux, ${stats.updated} mis à jour, ${stats.skipped} inchangés, ${stats.errors} erreurs ` +
    `(sur ${stats.totalResults} total)`
  )

  return stats
}

// =============================================================================
// SCRAPING CONSTITUTION (M4)
// =============================================================================

/**
 * Navigue vers la page Constitution du site IORT via le menu M4 sur iort.gov.tn.
 * La page M16 sur iort.tn n'expose pas les articles en HTML statique (rendu JS côté client).
 * M4 sur iort.gov.tn permet le téléchargement PDF + OCR (~434s, 139 chunks fiables).
 *
 * Doit être appelé depuis la homepage (après init() ou recover()).
 */
export async function navigateToConstitutionPage(session: IortSessionManager): Promise<void> {
  const page = session.getPage()

  log.info('[Constitution] Navigation vers iort.gov.tn (M4 — OCR PDF)...')
  await page.goto(IORT_BASE_URL, { waitUntil: 'load', timeout: IORT_RATE_CONFIG.navigationTimeout })
  await sleep(1500)

  log.info('[Constitution] Clic sur M4 (دستور الجمهورية التونسية) sur iort.gov.tn...')
  await page.evaluate(() => {
    // @ts-expect-error WebDev global function
    _JSL(_PAGE_, 'M4', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await waitForStableContent(page, { intervalMs: 1500, timeoutMs: 8000 })

  log.info('[Constitution] Page constitution atteinte (iort.gov.tn M4)')
}

/**
 * Télécharge le PDF de la constitution depuis la page IORT.
 * Stratégies:
 * 1. Clic direct sur le bouton "تحميل PDF" (bouton WebDev visible dans la page M4)
 * 2. Fallback: _JSL A7 classique
 */
async function downloadConstitutionPdfViaA7(page: import('playwright').Page): Promise<{ buffer: Buffer; filename: string } | null> {
  let capturedBuffer: Buffer | null = null
  let capturedFilename = 'constitution-tunisienne.pdf'

  // Intercepteur réseau PDF (download inline ou download event)
  const onResponse = async (response: import('playwright').Response) => {
    if (capturedBuffer) return
    try {
      const ct = response.headers()['content-type'] || ''
      if (ct.includes('application/pdf') || ct.includes('octet-stream')) {
        const buf = await response.body()
        if (buf && buf.length > 10000) {
          capturedBuffer = buf
          const url = response.url()
          const m = url.match(/([^/?#]+\.pdf)/i)
          if (m) capturedFilename = decodeURIComponent(m[1])
          log.info(`[Constitution] PDF capturé via réponse réseau: ${Math.round(buf.length / 1024)} KB`)
        }
      }
    } catch { /* body déjà consommé */ }
  }
  page.on('response', onResponse)

  try {
    // Stratégie 1: cliquer directement sur l'élément "تحميل PDF" (texte visible dans la page)
    const downloadProm1 = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
    const btnClicked = await page.evaluate(() => {
      // Chercher le nœud texte "تحميل PDF" dans le DOM WebDev
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
      let node: Text | null
      while ((node = walker.nextNode() as Text | null)) {
        if (node && node.nodeValue && node.nodeValue.trim().includes('تحميل')) {
          const el = node.parentElement
          if (el) { ;(el as HTMLElement).click(); return true }
        }
      }
      // Fallback: chercher par classe ou attribut onclick contenant A7
      const els = document.querySelectorAll('[onclick*="A7"], [id*="A7"], [name*="A7"]')
      if (els.length > 0) { ;(els[0] as HTMLElement).click(); return true }
      return false
    })

    if (btnClicked) {
      const dl = await downloadProm1
      if (dl) {
        const path = await dl.path()
        if (path) {
          const fs = await import('fs')
          capturedBuffer = fs.readFileSync(path)
          capturedFilename = dl.suggestedFilename() || capturedFilename
          log.info(`[Constitution] PDF via clic bouton: ${Math.round(capturedBuffer.length / 1024)} KB`)
        }
      }
    }

    // Stratégie 2: _JSL A7 classique si rien capturé
    if (!capturedBuffer) {
      const downloadProm2 = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
      await page.evaluate(() => {
        // @ts-expect-error WebDev global function
        _JSL(_PAGE_, 'A7', '_self', '', '')
      }).catch(() => {})
      const dl = await downloadProm2
      if (dl) {
        const path = await dl.path()
        if (path) {
          const fs = await import('fs')
          capturedBuffer = fs.readFileSync(path)
          capturedFilename = dl.suggestedFilename() || capturedFilename
          log.info(`[Constitution] PDF via A7: ${Math.round(capturedBuffer.length / 1024)} KB`)
        }
      }
    }

    // Attendre la réponse réseau interceptée si aucun download event
    if (!capturedBuffer) {
      const deadline = Date.now() + 10000
      while (!capturedBuffer && Date.now() < deadline) {
        await sleep(500)
      }
    }

    if (!capturedBuffer) {
      log.warn('[Constitution] Aucun PDF capturé (bouton + A7 + réponse réseau)')
      return null
    }

    log.info(`[Constitution] PDF téléchargé: ${capturedFilename} (${Math.round(capturedBuffer.length / 1024)} KB)`)
    return { buffer: capturedBuffer, filename: capturedFilename }
  } catch (err) {
    log.warn('[Constitution] Échec download PDF:', err instanceof Error ? err.message : err)
    return null
  } finally {
    page.off('response', onResponse)
  }
}

/**
 * Extrait le contenu textuel de la page constitution IORT.
 * Fix Mar 2 2026 : pdfBuffer optionnel — si le HTML IORT ne contient pas
 * d'articles (page = viewer WebDev sans texte), on extrait depuis le PDF
 * via pdf-parse pour garantir les marqueurs "الفصل X" nécessaires au chunking article-level.
 */
async function extractConstitutionText(
  page: import('playwright').Page,
  pdfBuffer?: Buffer,
): Promise<{ title: string; content: string; issueNumber: string | null; date: string | null }> {
  const html = await page.content()
  const { load } = await import('cheerio')
  const $ = load(html)

  // Supprimer le bruit WebDev
  $('script, style, form[name="_WD_FORM_"]').remove()

  // Titre de la page
  let title = $('title').text().trim() || 'دستور الجمهورية التونسية'
  title = title.replace(/IORT.*$/i, '').trim() || 'دستور الجمهورية التونسية'

  // Contenu principal (HTML)
  let content = ''
  for (const sel of ['.contenu', '.texte', 'td.texte', 'td.contenu', '#contenu', 'div.content']) {
    const el = $(sel)
    if (el.length > 0 && el.text().trim().length > 100) {
      content = el.text().trim()
      break
    }
  }
  if (!content) {
    // Utiliser textContent (inclut éléments cachés) plutôt que innerText (visible seulement)
    // La page M4 IORT affiche la constitution dans des éléments hors viewport/cachés
    content = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script, style, noscript')
      scripts.forEach((s) => s.remove())
      return (document.body.textContent || '').substring(0, 100000)
    })
    content = content
      .replace(/WD_ACTION_\w+/g, '')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
  }

  // Fallback PDF : si le HTML ne contient pas d'articles (viewer WebDev vide/paginé)
  // Utilise parsePdf() de file-parser-service qui gère le fallback OCR pour les PDFs
  // à encodage de police personnalisé (fréquent pour les PDFs gouvernementaux arabes IORT).
  const hasArticles = /(?:الفصل|فصل)\s+(?:[\d\u0660-\u0669]+|ال[\u0600-\u06FF]+)/.test(content)
  if ((!hasArticles || content.length < 5000) && pdfBuffer) {
    log.info('[Constitution] HTML sans articles constitutionnels — fallback PDF (parsePdf + OCR si garbled)')
    try {
      const { parsePdf } = await import('./file-parser-service')
      const parsed = await parsePdf(pdfBuffer, { forceOcr: true })
      if (parsed.success && parsed.text && parsed.text.length > content.length) {
        content = parsed.text
        log.info(`[Constitution] PDF parsé: ${content.length} chars`)
      } else if (!parsed.success) {
        log.warn('[Constitution] Échec extraction PDF:', parsed.error)
      }
    } catch (pdfErr) {
      log.warn('[Constitution] Échec extraction PDF:', pdfErr instanceof Error ? pdfErr.message : pdfErr)
    }
  }

  // Numéro JORT et date
  const issueMatch = content.match(/عدد\s+(\d+)/) || html.match(/عدد\s+(\d+)/)
  const dateMatch = content.match(/مؤرخ في\s+(\d{1,2}\s+\S+\s+\d{4})/) || html.match(/(\d{1,2}\s+جويلية\s+2022)/)

  return {
    title,
    content: content.substring(0, 100000),
    issueNumber: issueMatch ? issueMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
  }
}

/**
 * Point d'entrée principal : crawle la page Constitution IORT (M4),
 * extrait le texte, télécharge le PDF et sauvegarde en DB avec
 * norm_level=constitution et sourceOrigin=iort_gov_tn.
 */
export async function downloadConstitutionFromIort(
  session: IortSessionManager,
  sourceId: string,
): Promise<{ saved: boolean; title: string; pdfSize?: number; pageId?: string }> {
  const page = session.getPage()

  await navigateToConstitutionPage(session)

  // EXTRAIRE LE TEXTE EN PREMIER (avant tout appel A7 qui pourrait naviguer la page)
  // Fix Mar 2 2026: l'appel A7 réinitialise la page, ne laissant que 6092 chars vides.
  // La page M4 IORT a le texte constitutionnel (37K chars HTML) si on l'extrait avant A7.
  const extracted = await extractConstitutionText(page, undefined)
  log.info(`[Constitution] Extraction initiale: ${extracted.content.length} chars, hasArticles: ${/(?:الفصل|فصل)\s+(?:[\d\u0660-\u0669]+|ال[\u0600-\u06FF]+)/.test(extracted.content)}`)

  // Télécharger le PDF APRÈS extraction (A7 peut naviguer/réinitialiser la page — peu importe)
  const pdfResult = await downloadConstitutionPdfViaA7(page)

  // 🔑 Fermer le browser Playwright AVANT l'OCR pour libérer la mémoire Chromium (~300 MB).
  // L'OCR de 42 pages (pdftoppm 150 DPI + tesseract CLI séquentiel) consomme ~200-400 MB.
  // Garder Chromium actif en parallèle de l'OCR cause une contention mémoire qui crash le
  // process Node.js (V8 OOM ou kernel OOM non loggé). On n'a plus besoin du browser après
  // le téléchargement du PDF.
  await session.close().catch(() => {})
  log.info('[Constitution] Session Playwright fermée (libération mémoire avant OCR)')

  // Si PDF disponible et HTML sans articles → extraire via parsePdf() (avec OCR fallback)
  // Le PDF IORT utilise un encodage de police personnalisé (Arabic custom font mapping) →
  // pdf-parse seul produit du texte garbled (\x02\x03...). parsePdf() détecte ce cas
  // et applique automatiquement l'OCR (Tesseract) pour produire du texte Unicode arabe.
  const htmlHasArticles = /(?:الفصل|فصل)\s+(?:[\d\u0660-\u0669]+|ال[\u0600-\u06FF]+)/.test(extracted.content)
  if (pdfResult?.buffer && (!htmlHasArticles || extracted.content.length < 5000)) {
    try {
      const { parsePdf } = await import('./file-parser-service')
      // forceOcr: le PDF IORT utilise un encodage de police custom (ASCII printable comme glyphes)
      // → pdf-parse extrait du bruit non détectable par isTextGarbled(). OCR forcé ici.
      const parsed = await parsePdf(pdfResult.buffer, { forceOcr: true })
      if (parsed.success && parsed.text && parsed.text.length > extracted.content.length) {
        extracted.content = parsed.text
        log.info(`[Constitution] PDF enrichit le contenu: ${extracted.content.length} chars (OCR: ${parsed.metadata.ocrApplied ? 'oui' : 'non'})`)
      } else if (!parsed.success) {
        log.warn('[Constitution] Échec extraction PDF:', parsed.error)
      }
    } catch (pdfErr) {
      log.warn('[Constitution] Échec extraction PDF:', pdfErr instanceof Error ? pdfErr.message : pdfErr)
    }
  }

  const finalHasArticles = /(?:الفصل|فصل)\s+(?:[\d\u0660-\u0669]+|ال[\u0600-\u06FF]+)/.test(extracted.content)
  log.info(`[Constitution] Titre: ${extracted.title}, contenu final: ${extracted.content.length} chars, hasArticles: ${finalHasArticles}`)

  // Sauvegarder PDF dans MinIO
  let pdfInfo: { minioPath: string; size: number } | null = null
  if (pdfResult) {
    pdfInfo = await uploadIortPdf(sourceId, extracted.title, pdfResult.buffer, pdfResult.filename)
  }

  // URL canonique fixe (pas session-based)
  const constitutionUrl = `${IORT_BASE_URL}/jort/constitution/2022`
  const urlHash = hashUrl(constitutionUrl)

  // Upsert en DB
  const existing = await db.query('SELECT id FROM web_pages WHERE url_hash = $1', [urlHash])

  const contentHash = hashContent(extracted.content)

  let pageId: string
  if (existing.rows.length > 0) {
    pageId = existing.rows[0].id as string
    await db.query(
      `UPDATE web_pages SET
        title = $2, extracted_text = $3, content_hash = $4, word_count = $5,
        is_indexed = false,
        last_crawled_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [pageId, extracted.title, extracted.content, contentHash,
       extracted.content.split(/\s+/).length],
    )
    if (pdfInfo) {
      await db.query(
        `UPDATE web_pages SET linked_files = $2::jsonb WHERE id = $1`,
        [pageId, JSON.stringify([{ url: constitutionUrl, type: 'pdf', minioPath: pdfInfo.minioPath, size: pdfInfo.size, contentType: 'application/pdf' }])],
      )
    }
    log.info(`[Constitution] Page mise à jour (id=${pageId})`)
  } else {
    const insertResult = await db.query(
      `INSERT INTO web_pages (
        web_source_id, url, url_hash, canonical_url, title,
        extracted_text, content_hash, word_count, language_detected,
        meta_date, status, structured_data, linked_files,
        last_crawled_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$2,$4,$5,$6,$7,'ar',$8,'crawled',$9,$10,NOW(),NOW(),NOW())
      RETURNING id`,
      [
        sourceId, constitutionUrl, urlHash, extracted.title,
        extracted.content, contentHash,
        extracted.content.split(/\s+/).length,
        parseArabicDate(extracted.date),
        JSON.stringify({ source: 'iort', textType: 'دستور', year: 2022, issueNumber: extracted.issueNumber, norm_level: 'constitution' }),
        pdfInfo
          ? JSON.stringify([{ url: constitutionUrl, type: 'pdf', minioPath: pdfInfo.minioPath, size: pdfInfo.size, contentType: 'application/pdf' }])
          : '[]',
      ],
    )
    pageId = insertResult.rows[0].id as string
    log.info(`[Constitution] Page créée (id=${pageId})`)
  }

  return { saved: true, title: extracted.title, pdfSize: pdfInfo?.size, pageId }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

// sleep, parseArabicDate — importés depuis iort-text-utils.ts

export async function getOrCreateIortSource(): Promise<string> {
  const result = await db.query(
    "SELECT id FROM web_sources WHERE base_url ILIKE '%iort%'",
  )

  if (result.rows.length > 0) {
    return result.rows[0].id as string
  }

  const { createWebSource } = await import('./source-service')
  const adminResult = await db.query(
    "SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1",
  )
  const adminId = adminResult.rows[0]?.id

  const source = await createWebSource(
    {
      name: 'IORT - Journal Officiel de la République Tunisienne',
      baseUrl: IORT_BASE_URL,
      description: 'Site officiel de l\'Imprimerie Officielle (IORT) - Journal Officiel (JORT). 204,775 textes depuis 1956.',
      categories: ['jort'],
      language: 'ar',
      priority: 9,
      requiresJavascript: true,
      respectRobotsTxt: false,
      downloadFiles: true,
      autoIndexFiles: true,
      rateLimitMs: 5000,
      crawlFrequency: '7 days',
      maxDepth: 3,
      maxPages: 50000,
    },
    adminId,
  )

  log.info(` Source créée: ${source.id}`)
  return source.id
}

/**
 * Retourne (ou crée) la source web pour le portail moderne iort.tn/siteiort.
 * Utilisé pour les crawls codes juridiques et recueils thématiques.
 * Distinct de getOrCreateIortSource() qui cible l'ancien iort.gov.tn (JORT par année/type).
 * sourceOrigin = 'iort_gov_tn' (boost RAG 1.20×) via deriveSourceOrigin() qui matche 'iort.tn'.
 */
export async function getOrCreateIortSiteiortSource(): Promise<string> {
  const result = await db.query(
    'SELECT id FROM web_sources WHERE base_url = $1',
    [IORT_SITEIORT_URL],
  )

  if (result.rows.length > 0) {
    return result.rows[0].id as string
  }

  const { createWebSource } = await import('./source-service')
  const adminResult = await db.query(
    "SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1",
  )
  const adminId = adminResult.rows[0]?.id

  const source = await createWebSource(
    {
      name: 'IORT - Portail Codes & Recueils (iort.tn)',
      baseUrl: IORT_SITEIORT_URL,
      description:
        'Portail moderne IORT — codes juridiques consolidés et recueils thématiques (مجلات قانونية ومجموعات النصوص). Source officielle État, même fiabilité que JORT.',
      categories: ['codes', 'legislation', 'jort'],
      language: 'ar',
      priority: 9,
      requiresJavascript: true,
      respectRobotsTxt: false,
      downloadFiles: false,
      rateLimitMs: 3000,
      crawlFrequency: '30 days',
      maxDepth: 5,
      maxPages: 10000,
    },
    adminId,
  )

  log.info(`[Siteiort] Source créée: ${source.id}`)
  return source.id
}
