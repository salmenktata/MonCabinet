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

// =============================================================================
// CONSTANTES
// =============================================================================

/** URL de base du site IORT */
export const IORT_BASE_URL = 'http://www.iort.gov.tn'

/** Types de textes disponibles sur IORT (labels exactement comme sur le site) */
export const IORT_TEXT_TYPES = {
  law: { ar: 'قانون', fr: 'Loi', value: 'قانون' },
  decree: { ar: 'مرسوم', fr: 'Décret', value: 'مرسوم' },
  order: { ar: 'أمر', fr: 'Ordre/Arrêté', value: 'أمر' },
  decision: { ar: 'قرار', fr: 'Décision', value: 'قرار' },
  notice: { ar: 'رإي', fr: 'Avis', value: 'رإي' },  // NB: le site utilise رإي (pas رأي)
} as const

export type IortTextType = keyof typeof IORT_TEXT_TYPES

/** Configuration rate limiting */
export const IORT_RATE_CONFIG = {
  minDelay: 5000,
  longPauseEvery: 50,
  longPauseMs: 30000,
  comboPauseMs: 30000,
  refreshEvery: 200,
  navigationTimeout: 60000,
  selectorTimeout: 30000,
} as const

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

  async init(): Promise<void> {
    const { chromium } = await import('playwright')
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    await this.createContext()
    this.isInitialized = true
    console.log('[IORT] Session Playwright initialisée')
  }

  private async createContext(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {})
    }
    this.context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'ar-TN',
      extraHTTPHeaders: {
        'Accept-Language': 'ar-TN,ar;q=0.9,fr-TN;q=0.8,fr;q=0.7',
      },
    })
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(IORT_RATE_CONFIG.navigationTimeout)
    this.pageCount = 0
  }

  getPage(): Page {
    if (!this.page) throw new Error('[IORT] Session non initialisée. Appeler init() d\'abord.')
    return this.page
  }

  async tick(): Promise<void> {
    this.pageCount++
    if (this.pageCount >= IORT_RATE_CONFIG.refreshEvery) {
      console.log(`[IORT] Refresh contexte Playwright après ${this.pageCount} pages`)
      await this.createContext()
      await this.navigateToSearch()
    }
  }

  async isSessionValid(): Promise<boolean> {
    try {
      const page = this.getPage()
      const content = await page.content()
      return content.includes('WD_ACTION_')
    } catch {
      return false
    }
  }

  /**
   * Navigue vers la page de recherche IORT:
   * Homepage → _JSL(M7) → _JSL(A9)
   */
  async navigateToSearch(): Promise<void> {
    const page = this.getPage()

    // 1. Homepage
    console.log('[IORT] Navigation vers la page d\'accueil...')
    await page.goto(IORT_BASE_URL, {
      waitUntil: 'load',
      timeout: IORT_RATE_CONFIG.navigationTimeout,
    })
    await sleep(3000)

    // 2. _JSL(M7) = "الرائد الرسمي القوانين و الأوامر و القرارات و الأراء"
    console.log('[IORT] Navigation M7 (JORT lois et décrets)...')
    await page.evaluate(() => {
      // @ts-expect-error WebDev global function
      _JSL(_PAGE_, 'M7', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await sleep(3000)

    // 3. Vérifier si on a déjà le formulaire de recherche (select A8)
    const hasSearchForm = await page.$('select[name="A8"]')
    if (!hasSearchForm) {
      // _JSL(A9) = "البحث عن النص"
      console.log('[IORT] Navigation A9 (recherche par texte)...')
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
      throw new Error('[IORT] Formulaire de recherche non trouvé (select A8 absent)')
    }

    console.log('[IORT] Page de recherche atteinte')
  }

  /**
   * Récupère après un crash du browser/context.
   * Re-crée le browser, context et page, puis re-navigue.
   */
  async recover(): Promise<void> {
    console.log('[IORT] Récupération session après crash...')
    // Fermer tout proprement
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})

    // Re-initialiser
    const { chromium } = await import('playwright')
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    await this.createContext()
    await this.navigateToSearch()
    console.log('[IORT] Session récupérée')
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})
    this.isInitialized = false
    console.log('[IORT] Session Playwright fermée')
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
 */
export async function searchByYearAndType(
  page: Page,
  year: number,
  textType: IortTextType,
): Promise<number> {
  const typeConfig = IORT_TEXT_TYPES[textType]

  console.log(`[IORT] Recherche: année=${year}, type=${typeConfig.fr} (${typeConfig.ar})`)

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

  // Sélectionner le type via select[name="A9"] (par label arabe exact)
  await page.selectOption('select[name="A9"]', { label: typeConfig.ar })
  await sleep(500)

  // Soumettre via _JSL(A40) (bouton recherche image)
  await page.evaluate(() => {
    // @ts-expect-error WebDev global function
    _JSL(_PAGE_, 'A40', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await sleep(5000)

  // Lire le nombre total dans input[name="A5"]
  const totalResults = await parseTotalResults(page)
  console.log(`[IORT] ${totalResults} résultats trouvés pour ${year}/${typeConfig.fr}`)

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
      console.warn(`[IORT] Erreur parsing item:`, err instanceof Error ? err.message : err)
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
      console.log(`[IORT] Pas de texte complet pour "${result.title.substring(0, 50)}..."`)
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
      console.warn(`[IORT] Contenu trop court pour "${title}" (${textContent.length} chars)`)
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
    console.error(`[IORT] Erreur extraction détail "${result.title}":`, err instanceof Error ? err.message : err)

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
      console.warn(`[IORT] PDF download path null pour index ${resultIndex}`)
      return null
    }

    const fs = await import('fs')
    const buffer = fs.readFileSync(path)

    // Attendre que la page soit de retour à la liste (A7 est _self)
    await page.waitForLoadState('load').catch(() => {})
    await sleep(2000)

    console.log(`[IORT] PDF téléchargé: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
    return { buffer, filename }
  } catch (err) {
    console.warn(`[IORT] Échec download PDF A7 (index ${resultIndex}):`, err instanceof Error ? err.message : err)
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
          console.log(`[IORT] PDF dédupliqué (taille identique): ${matchingFile.minioPath}`)
          return { minioPath: matchingFile.minioPath, size: pdfBuffer.length }
        }
      }
    } else {
      const files = existingPdf.rows[0].linked_files as Array<{ minioPath?: string; size?: number }>
      const matchingFile = files.find(f => f.minioPath)
      if (matchingFile?.minioPath) {
        console.log(`[IORT] PDF dédupliqué (hash identique): ${matchingFile.minioPath}`)
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

    console.log(`[IORT] PDF uploadé MinIO: ${filename} (${Math.round(pdfBuffer.length / 1024)} KB)`)

    return {
      minioPath: filename,
      size: pdfBuffer.length,
    }
  } catch (err) {
    console.error(`[IORT] Erreur upload PDF MinIO:`, err instanceof Error ? err.message : err)
    return null
  }
}

// =============================================================================
// SAUVEGARDE EN DB
// =============================================================================

export function generateIortUrl(
  year: number,
  issueNumber: string | null,
  textType: string,
  title: string,
): string {
  const typeSlug = textType.replace(/\s+/g, '-')
  if (issueNumber) {
    // URL stable basée sur year/textType/issueNumber (pas le titre)
    return `${IORT_BASE_URL}/jort/${year}/${typeSlug}/${issueNumber}`
  }
  // Fallback: hash court du titre quand issueNumber est absent
  const titleHash = hashContent(title).substring(0, 12)
  return `${IORT_BASE_URL}/jort/${year}/${typeSlug}/${titleHash}`
}

export async function saveIortPage(
  sourceId: string,
  extracted: IortExtractedText,
  pdfInfo: { minioPath: string; size: number } | null,
): Promise<{ id: string; skipped: boolean; updated: boolean }> {
  const url = generateIortUrl(
    extracted.year,
    extracted.issueNumber,
    extracted.textType,
    extracted.title,
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
    await updateIortPage(row.id as string, extracted, contentHash, pdfInfo)
    return { id: row.id as string, skipped: false, updated: true }
  }

  // 2. Lookup secondaire par structured_data (évite doublons quand le titre change)
  if (extracted.issueNumber) {
    const structLookup = await db.query(
      `SELECT id, content_hash, url FROM web_pages
       WHERE web_source_id = $1
       AND structured_data->>'year' = $2
       AND structured_data->>'issueNumber' = $3
       AND structured_data->>'textType' = $4
       AND structured_data->>'source' = 'iort'
       LIMIT 1`,
      [sourceId, String(extracted.year), extracted.issueNumber, extracted.textType],
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
        await updateIortPage(row.id as string, extracted, contentHash, pdfInfo)
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
  const language = detectTextLanguage(extracted.content)

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
      language,
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
      console.error('[IORT] Erreur création version initiale:', err)
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
): Promise<void> {
  // Créer un snapshot avant la mise à jour
  try {
    const { createWebPageVersion } = await import('./source-service')
    await createWebPageVersion(pageId, 'content_change')
  } catch (err) {
    console.error('[IORT] Erreur création version:', err)
  }

  const wordCount = countWords(extracted.content)
  const language = detectTextLanguage(extracted.content)
  const isoDate = parseArabicDate(extracted.date)

  const structuredData = JSON.stringify({
    year: extracted.year,
    textType: extracted.textType,
    issueNumber: extracted.issueNumber,
    date: extracted.date,
    source: 'iort',
  })

  const params: unknown[] = [
    pageId,
    extracted.title,
    contentHash,
    extracted.content,
    wordCount,
    language,
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

  console.log(`[IORT] Page ${pageId} mise à jour (contenu changé, is_indexed=false)`)
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

export async function crawlYearType(
  session: IortSessionManager,
  sourceId: string,
  year: number,
  textType: IortTextType,
  signal?: AbortSignal,
): Promise<IortCrawlStats> {
  const stats: IortCrawlStats = {
    year,
    textType: IORT_TEXT_TYPES[textType].fr,
    totalResults: 0,
    crawled: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  }

  // Toujours utiliser session.getPage() pour avoir la page courante (peut changer après recover)
  let page = session.getPage()

  // Vérifier session et re-naviguer si nécessaire
  const valid = await session.isSessionValid()
  if (!valid) {
    console.log('[IORT] Session expirée, re-navigation...')
    await session.navigateToSearch()
    page = session.getPage()
  }

  // Effectuer la recherche
  const totalResults = await searchByYearAndType(page, year, textType)
  stats.totalResults = totalResults

  if (totalResults === 0) {
    console.log(`[IORT] Aucun résultat pour ${year}/${IORT_TEXT_TYPES[textType].fr}`)
    return stats
  }

  // Itérer les pages de résultats
  let hasNextPage = true
  let pageNum = 1
  let consecutiveErrors = 0

  while (hasNextPage) {
    if (signal?.aborted) {
      console.log('[IORT] Signal d\'arrêt reçu')
      break
    }

    try {
      page = session.getPage()
      const results = await parseSearchResults(page)
      console.log(`[IORT] Page ${pageNum}: ${results.length} résultats à traiter`)
      consecutiveErrors = 0

      // Phase 1: Extraire texte + sauvegarder (via popup A17)
      const extractedResults: Array<{
        result: typeof results[0]
        extracted: IortExtractedText
        pageId: string
      }> = []

      for (const result of results) {
        if (signal?.aborted) break

        try {
          page = session.getPage()
          const extracted = await extractTextDetail(page, result, year, textType)
          if (!extracted) {
            if (!result.hasFullText) {
              stats.skipped++
            } else {
              stats.errors++
            }
            await sleep(IORT_RATE_CONFIG.minDelay)
            continue
          }

          const { id: pageId, skipped, updated } = await saveIortPage(sourceId, extracted, null)

          if (skipped) {
            stats.skipped++
          } else if (updated) {
            stats.updated++
            extractedResults.push({ result, extracted, pageId })
            console.log(`[IORT] ↻ MAJ ${result.title.substring(0, 60)}...`)
          } else {
            stats.crawled++
            extractedResults.push({ result, extracted, pageId })
            console.log(`[IORT] ✓ ${result.title.substring(0, 60)}...`)
          }

          await sleep(IORT_RATE_CONFIG.minDelay)
          await session.tick()

          if ((stats.crawled + stats.skipped) % IORT_RATE_CONFIG.longPauseEvery === 0 && stats.crawled > 0) {
            console.log(`[IORT] Pause longue après ${stats.crawled + stats.skipped} pages...`)
            await sleep(IORT_RATE_CONFIG.longPauseMs)
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          stats.errors++
          console.error(`[IORT] Erreur traitement "${result.title.substring(0, 40)}":`, errMsg)

          // Si le browser a crashé, récupérer et sortir de la boucle des résultats
          if (errMsg.includes('Target page') || errMsg.includes('browser has been closed') || errMsg.includes('context has been closed')) {
            console.log('[IORT] Browser crash détecté, recovery...')
            await session.recover()
            page = session.getPage()
            await searchByYearAndType(page, year, textType)
            pageNum = 1 // Repart depuis page 1 (évite re-navigation O(n²))
            break // Sortir de la boucle des résultats, recommencer cette page
          }

          // Fermer tout onglet popup restant
          try {
            const ctxPages = page.context().pages()
            for (const p of ctxPages) {
              if (p !== page) await p.close().catch(() => {})
            }
          } catch { /* context may be dead */ }

          await sleep(IORT_RATE_CONFIG.minDelay)
        }
      }

      // Phase 2: Télécharger les PDFs via A7
      if (extractedResults.length > 0) {
        console.log(`[IORT] Téléchargement PDFs pour ${extractedResults.length} résultats...`)

        for (const { result, extracted, pageId } of extractedResults) {
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
                console.log(`[IORT] PDF stocké dans MinIO (${pdfInfo.minioPath}) — indexation différée`)
              }
            }
            await sleep(2000)
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            console.warn(`[IORT] Erreur PDF "${result.title.substring(0, 40)}":`, errMsg)

            // Browser crash pendant le PDF → recover et abandonner le reste des PDFs
            if (errMsg.includes('Target page') || errMsg.includes('browser has been closed')) {
              console.log('[IORT] Browser crash pendant PDF, recovery...')
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
            console.log('[IORT] Page résultats perdue après PDFs, re-navigation page 1...')
            await session.recover()
            page = session.getPage()
            await searchByYearAndType(page, year, textType)
            pageNum = 1 // Repart depuis page 1 (doublons skippés par saveIortPage)
            continue
          }
        } catch {
          console.log('[IORT] Erreur vérification page, recovery page 1...')
          await session.recover()
          page = session.getPage()
          await searchByYearAndType(page, year, textType)
          pageNum = 1 // Repart depuis page 1 (doublons skippés par saveIortPage)
          continue
        }
      }

      // Page suivante
      hasNextPage = await goToNextPage(page)
      pageNum++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[IORT] Erreur page ${pageNum}:`, errMsg)
      consecutiveErrors++

      if (consecutiveErrors >= 8) {
        console.error(`[IORT] ${consecutiveErrors} erreurs consécutives, abandon du combo`)
        break
      }

      // Recovery : retour page 1, les doublons seront skippés par saveIortPage
      try {
        await session.recover()
        page = session.getPage()
        await searchByYearAndType(page, year, textType)
        pageNum = 1 // Repart depuis page 1 (évite re-navigation O(n²))
        console.log('[IORT] Recovery OK — reprise depuis page 1 (doublons skippés)')
      } catch (recoverErr) {
        console.error('[IORT] Échec recovery:', recoverErr instanceof Error ? recoverErr.message : recoverErr)
        break
      }
    }
  }

  console.log(
    `[IORT] Terminé ${year}/${IORT_TEXT_TYPES[textType].fr}: ` +
    `${stats.crawled} nouveaux, ${stats.updated} mis à jour, ${stats.skipped} inchangés, ${stats.errors} erreurs ` +
    `(sur ${stats.totalResults} total)`
  )

  return stats
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Mois arabes tunisiens → numéro */
const ARABIC_MONTHS: Record<string, number> = {
  'جانفي': 1, 'فيفري': 2, 'مارس': 3, 'أفريل': 4,
  'ماي': 5, 'جوان': 6, 'جويلية': 7, 'أوت': 8,
  'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
}

/** Convertit une date arabe tunisienne ("31 ديسمبر 2025") en ISO ou null */
function parseArabicDate(dateStr: string | null): string | null {
  if (!dateStr) return null

  // Format: "DD MMMM YYYY" (arabe tunisien)
  const match = dateStr.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const monthName = match[2]
  const year = parseInt(match[3], 10)
  const month = ARABIC_MONTHS[monthName]

  if (!month || day < 1 || day > 31 || year < 1900) return null

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

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
      category: 'jort',
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

  console.log(`[IORT] Source créée: ${source.id}`)
  return source.id
}
