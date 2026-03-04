/**
 * Scraper IORT — Section codes juridiques (الإبحار في المجلات)
 *
 * Accède à https://www.iort.tn/siteiort/ via Playwright pour extraire
 * les articles des codes juridiques tunisiens (المجلة التجارية, مجلة الشغل, etc.)
 *
 * Structure du site (vérifiée Mars 2026) :
 *   Homepage
 *   → _JCL(url + '?M24') → active le menu JORT élargi
 *   → _JEM('M180')       → PAGE_Production / PAGE_PageDernierParu
 *                           looper A1 = liste des codes + bouton "اطلاع"
 *   → clic "اطلاع" sur le code voulu → PAGE_NavigationCode (table des matières)
 *   → clic sur chaque section → texte de la section
 *
 * Exemple PAGE_NavigationCode (المجلة التجارية) :
 *   الكتاب الأول في التجارة بوجه عام
 *     العنوان الأول في التجار
 *     العنوان الثاني في الدفاتر التجارية
 *     ...
 */

import type { Page } from 'playwright'
import { db } from '@/lib/db/postgres'
import {
  IortSessionManager,
  IORT_RATE_CONFIG,
  getOrCreateIortSource,
} from './iort-scraper-utils'
import { hashUrl, hashContent, countWords, detectTextLanguage } from './content-extractor'

// =============================================================================
// CONSTANTES
// =============================================================================

export const IORT_SITEIORT_URL = 'https://www.iort.tn/siteiort'

/**
 * URL directe de la page de listing des codes (الإبحار في المجلات).
 * Fournie explicitement — plus fiable que la navigation via le menu.
 */
export const CODES_LISTING_URL =
  'https://www.iort.tn/siteiort/PAGE_Production/kAoAANCKFUICAAAADQA?WD_ACTION_=MENU&ID=M180#M49'

/**
 * Fallback navigation via menu :
 * Homepage → _JCL(M24) → _JEM(M180)
 */
const NAV_STEP1_JCL = 'M24'
const NAV_STEP2_JEM = 'M180'

/** Mapping codes connus arabe → français */
export const IORT_KNOWN_CODES: Record<string, string> = {
  'المجلة التجارية':                                           'Code de Commerce',
  'مجلة الشغل':                                               'Code du Travail',
  'مجلة الالتزامات والعقود':                                  'Code des Obligations et Contrats',
  'المجلة الجزائية':                                          'Code Pénal',
  'مجلة الإجراءات الجزائية':                                  'Code de Procédure Pénale',
  'مجلة المرافعات المدنية والتجارية':                          'Code de Procédure Civile',
  'مجلة الأحوال الشخصية':                                     'Code du Statut Personnel',
  'مجلة الديوانة':                                            'Code des Douanes',
  'مجلة الجماعات المحلية':                                    'Code des Collectivités Locales',
  'مجلة التجارة البحرية':                                     'Code du Commerce Maritime',
  'مجلة الشركات التجارية':                                    'Code des Sociétés Commerciales',
  'مجلة الحقوق العينية':                                      'Code des Droits Réels',
  'مجلة الطرقات':                                             'Code de la Route',
  'مجلة الغابات':                                             'Code Forestier',
  'مجلة القانون الدولي الخاص':                                'Code de Droit International Privé',
  'مجلة المحاسبة العمومية':                                   'Code de la Comptabilité Publique',
  'مجلة المرافعات والعقوبات العسكرية':                        'Code Militaire',
  'مجلة حماية الطفل':                                         'Code de Protection de l\'Enfant',
  'مجلة الضريبة على دخل الأشخاص الطبيعيين والضريبة على الشركات': 'Code IRPP et IS',
  'مجلة الاتصالات':                                           'Code des Télécommunications',
  'مجلة واجبات الطبيب':                                       'Code de Déontologie Médicale',
  'مجلة واجبات الطبيب البيطرى':                               'Code Vétérinaire',
  'مجلة الأداء على القيمة المضافة':                           'Code TVA',
  'مجلة حماية التراث الأثرى و التاريخى و الفنون التقليدية':  'Code du Patrimoine',
  'النظام الأساسي العام لأعوان الوظيفة العمومية':             'Statut Général de la Fonction Publique',
  'مجموعة النصوص المتعلقة بمهنة المحاماة':                    'Textes sur la Profession d\'Avocat',
}

// =============================================================================
// TYPES
// =============================================================================

export interface IortCode {
  name: string
  nameFr?: string
  /** Index 1-based dans le select/looper */
  selectIndex: number
  selectValue?: string
}

/** Un item de la table des matières (PAGE_NavigationCode) */
export interface IortTocItem {
  /** Titre de la section (ex: العنوان الأول في التجار) */
  title: string
  /** Index dans le looper (1-based) */
  resultIndex: number
  /** Profondeur dans la hiérarchie (0=livre, 1=titre, 2=section, etc.) */
  depth: number
  /** ID du looper (ex: A4, B4) — pour construire le sélecteur */
  looperId: string
}

export interface IortCodeCrawlStats {
  codeName: string
  totalSections: number
  crawled: number
  updated: number
  skipped: number
  errors: number
  elapsedMs: number
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

/** Détecte si une URL pointe vers un PDF (à ignorer) */
function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?|#)/i.test(url) || url.startsWith('blob:')
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/WD_ACTION_[^\s]*/g, '')
    .replace(/جميع الحقوق محفوظة.{0,80}/g, '')
    .replace(/Copyright.{0,40}IORT/gi, '')
    .replace(/المطبعة الرسمية.{0,80}/g, '')
    .trim()
}

// =============================================================================
// NAVIGATION
// =============================================================================

/**
 * Navigue vers la page de listing des codes.
 * Stratégie 1 (directe) : URL explicite CODES_LISTING_URL
 * Stratégie 2 (fallback) : Homepage → _JCL(M24) → _JEM(M180)
 */
export async function navigateToCodesSelectionPage(session: IortSessionManager): Promise<void> {
  const page = session.getPage()

  // Stratégie 1 : URL directe (plus fiable)
  console.log('[IORT Codes] Navigation directe vers page listing codes...')
  await page.goto(CODES_LISTING_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(2500)

  let a1Count = await page.evaluate(() =>
    document.querySelectorAll('div[id^="A1_"]').length,
  )

  if (a1Count > 0) {
    console.log(`[IORT Codes] OK (URL directe) — ${a1Count} codes dans le looper A1`)
    return
  }

  // Stratégie 2 : fallback navigation via menu M24 + M180
  console.log('[IORT Codes] URL directe vide, fallback navigation menu...')
  await page.goto(IORT_SITEIORT_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(2500)

  console.log(`[IORT Codes] _JCL(${NAV_STEP1_JCL})...`)
  await page.evaluate((menuId: string) => {
    // @ts-expect-error WebDev
    _JCL(clWDUtil.sGetPageActionIE10() + '?' + menuId, '_self', '', '')
  }, NAV_STEP1_JCL)
  await page.waitForLoadState('load')
  await sleep(2500)

  console.log(`[IORT Codes] _JEM(${NAV_STEP2_JEM})...`)
  await page.evaluate((menuId: string) => {
    // @ts-expect-error WebDev
    _JEM(menuId, '_self', '', '')
  }, NAV_STEP2_JEM)
  await page.waitForLoadState('load')
  await sleep(3000)

  console.log(`[IORT Codes] URL après navigation: ${page.url()}`)

  a1Count = await page.evaluate(() =>
    document.querySelectorAll('div[id^="A1_"]').length,
  )
  if (a1Count === 0) {
    const info = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      loopers: Array.from(new Set(
        Array.from(document.querySelectorAll('[id]'))
          .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
          .filter(Boolean),
      )),
    }))
    throw new Error(
      `[IORT Codes] Looper A1 vide après navigation. Page: ${JSON.stringify(info)}`,
    )
  }
  console.log(`[IORT Codes] OK (menu fallback) — ${a1Count} codes dans le looper A1`)
}

/**
 * Parse la liste des codes depuis le looper A1 (PAGE_Production / PAGE_PageDernierParu).
 * Chaque div#A1_N contient le nom du code + un bouton "اطلاع".
 * Le nom du code = texte du div sans le suffixe " اطلاع".
 */
export async function parseAvailableCodes(page: Page): Promise<IortCode[]> {
  console.log('[IORT Codes] Parsing des codes (looper A1)...')

  const looperData = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[id^="A1_"]')).map(el => {
      const idMatch = el.id.match(/A1_(\d+)$/)
      const index = idMatch ? parseInt(idMatch[1], 10) : 0
      // Texte brut du div — contient le nom + " اطلاع"
      const rawText = (el.textContent || '').trim().replace(/\s+/g, ' ')
      // Supprimer le suffixe "اطلاع" (bouton view) et espaces résiduels
      const name = rawText.replace(/\s*اطلاع\s*$/, '').trim()
      // Récupérer le onclick du bouton "اطلاع" pour savoir quel ID déclencher
      const btn = el.querySelector('a, [onclick]')
      const onclick = btn?.getAttribute('onclick') || ''
      return { index, name, onclick }
    }).filter(x => x.index > 0 && x.name.length > 3 && /[\u0600-\u06FF]/.test(x.name))
  })

  if (looperData.length > 0) {
    console.log(`[IORT Codes] ${looperData.length} codes dans le looper A1`)
    return looperData.map(x => ({
      name: x.name,
      nameFr: IORT_KNOWN_CODES[x.name],
      selectIndex: x.index,
      selectValue: x.onclick, // on stocke l'onclick pour selectCodeAndNavigate()
    }))
  }

  // Log de découverte si A1 vide
  const discovery = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    loopers: Array.from(new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
        .filter(Boolean),
    )),
    bodyPreview: (document.body.textContent || '').trim().substring(0, 500),
  }))
  console.warn('[IORT Codes] ⚠️  Looper A1 vide. Page info:', JSON.stringify(discovery, null, 2))
  return []
}

/**
 * Clique sur le bouton "اطلاع" du code dans le looper A1
 * pour naviguer vers PAGE_NavigationCode (table des matières).
 */
export async function selectCodeAndNavigate(page: Page, code: IortCode): Promise<void> {
  console.log(`[IORT Codes] Clic "اطلاع" sur: "${code.name}" (A1_${code.selectIndex})`)

  // Chercher le bouton "اطلاع" dans le div A1_N du code
  const divSelector = `div#A1_${code.selectIndex}`

  // Stratégie 1 : clic HTML direct sur le lien dans le div
  const clicked = await page.evaluate((sel: string) => {
    const div = document.querySelector(sel)
    if (!div) return false
    // Chercher le premier lien/bouton cliquable (le bouton "اطلاع")
    const btn = div.querySelector('a, input[type="button"], [onclick]') as HTMLElement | null
    if (btn) { btn.click(); return true }
    return false
  }, divSelector)

  if (clicked) {
    await page.waitForLoadState('load')
    await sleep(3000)
    const url = page.url()
    console.log(`[IORT Codes] URL après clic: ${url}`)
    return
  }

  // Stratégie 2 : si onclick est disponible (stocké dans selectValue), l'exécuter
  if (code.selectValue && code.selectValue.includes('_JSL')) {
    const jslMatch = code.selectValue.match(/_JSL\s*\([^,]+,\s*'(\w+)'/)
    if (jslMatch) {
      await page.evaluate((id: string) => {
        // @ts-expect-error WebDev
        _JSL(_PAGE_, id, '_self', '', '')
      }, jslMatch[1])
      await page.waitForLoadState('load')
      await sleep(3000)
      return
    }
  }

  // Stratégie 3 : fallback WebDev — définir A1.value et déclencher A17
  console.warn(`[IORT Codes] Fallback WebDev A1=${code.selectIndex}...`)
  await page.evaluate((idx: number) => {
    // @ts-expect-error WebDev
    if (_PAGE_.A1) _PAGE_.A1.value = idx
    // @ts-expect-error WebDev
    _JSL(_PAGE_, 'A17', '_self', '', '')
  }, code.selectIndex)
  await page.waitForLoadState('load')
  await sleep(3000)

  const url = page.url()
  console.log(`[IORT Codes] URL après navigation: ${url}`)
}

// =============================================================================
// TABLE DES MATIÈRES (PAGE_NavigationCode)
// =============================================================================

/**
 * Parse la table des matières du code courant.
 * Chaque item est une section cliquable (كتاب / عنوان / باب / قسم / فرع).
 */
export async function parseTocItems(page: Page): Promise<IortTocItem[]> {
  console.log('[IORT Codes] Parsing table des matières...')

  // Chercher le looper qui contient les sections de la TOC
  // Essayer plusieurs préfixes (A4, B4, C4, etc.)
  for (const prefix of ['A4', 'B4', 'C4', 'D4', 'E4']) {
    const items = await page.evaluate((pfx) => {
      const els = Array.from(document.querySelectorAll(`div[id^="${pfx}_"]`))
      if (els.length === 0) return null

      return els.map(el => {
        const idMatch = el.id.match(/(\d+)$/)
        const index = idMatch ? parseInt(idMatch[1], 10) : 0
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ')

        // Détecter la profondeur via les espaces/padding CSS ou l'indentation du texte
        // On se base sur le style ou les classes s'il y en a
        const style = el.getAttribute('style') || ''
        const paddingMatch = style.match(/padding-(?:right|left)\s*:\s*(\d+)/)
        const depth = paddingMatch ? Math.floor(parseInt(paddingMatch[1]) / 20) : 0

        // Chercher le lien onclick ou href dans le div
        const link = el.querySelector('a, [onclick]')
        const onclick = link?.getAttribute('onclick') || ''

        return { index, text: text.substring(0, 200), depth, onclick, looperId: pfx }
      }).filter(x => x && x.text && x.index > 0 && /[\u0600-\u06FF]/.test(x.text))
    }, prefix)

    if (items && items.length > 0) {
      console.log(`[IORT Codes] Looper ${prefix} → ${items.length} sections TOC`)
      return items.map(item => ({
        title: item!.text,
        resultIndex: item!.index,
        depth: item!.depth,
        looperId: prefix,
      }))
    }
  }

  // Fallback : chercher des liens structurés (arbre HTML)
  const linkItems = await page.evaluate(() => {
    const arabicSectionKeywords = /^(الكتاب|العنوان|الباب|القسم|الفرع|المادة|الفصل|أحكام|في |تنظيم|إجراءات)/
    const links = Array.from(document.querySelectorAll('a, li'))
      .filter(el => {
        const text = (el.textContent || '').trim()
        const href = el.getAttribute('href') || ''
        return text.length > 5 && arabicSectionKeywords.test(text) && /[\u0600-\u06FF]/.test(text)
          && !/\.pdf($|\?)/i.test(href)
      })
      .map((el, i) => ({
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 200),
        onclick: el.getAttribute('onclick') || '',
        href: el.getAttribute('href') || '',
        index: i + 1,
        looperId: 'LINK',
      }))
    return links
  })

  if (linkItems.length > 0) {
    console.log(`[IORT Codes] ${linkItems.length} liens de sections trouvés`)
    return linkItems.map(l => ({
      title: l.text,
      resultIndex: l.index,
      depth: 0,
      looperId: l.looperId,
    }))
  }

  // Discovery log
  const pageState = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    loopers: Array.from(new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
        .filter(Boolean),
    )),
    bodyPreview: (document.body.textContent || '').trim().substring(0, 800),
  }))
  console.warn('[IORT Codes] ⚠️  TOC vide. Page state:', JSON.stringify(pageState, null, 2))
  return []
}

// =============================================================================
// EXTRACTION DU TEXTE D'UNE SECTION
// =============================================================================

/**
 * Clique sur un item de la TOC et extrait le texte de la section affichée.
 * Le site peut :
 * (a) ouvrir une popup (A17 sur _blank)
 * (b) naviguer dans la même page (A17 sur _self) et afficher le contenu
 * (c) afficher le contenu inline dans un div de la page
 */
export async function extractSectionText(
  page: Page,
  item: IortTocItem,
): Promise<string | null> {
  // Stratégie 1 : _PAGE_.A4.value = idx; _JSL(A17, '_blank') → popup
  try {
    const [detailPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }),
      page.evaluate(([idx, looperId]: [number, string]) => {
        // @ts-expect-error WebDev
        const formField = _PAGE_[looperId]
        if (formField) formField.value = idx
        // @ts-expect-error WebDev
        _JSL(_PAGE_, 'A17', '_blank', '', '')
      }, [item.resultIndex, item.looperId] as [number, string]),
    ])

    await detailPage.waitForLoadState('load')
    await sleep(2000)
    if (isPdfUrl(detailPage.url())) {
      console.log(`[IORT Codes] PDF ignoré: ${detailPage.url()}`)
      await detailPage.close()
      return null
    }
    const text = await extractTextFromPage(detailPage)
    await detailPage.close()
    if (text && text.length > 30) return text
  } catch { /* pas de popup */ }

  // Fermer popups orphelins
  try {
    const pages = page.context().pages()
    for (const p of pages) if (p !== page) await p.close().catch(() => {})
  } catch { /**/ }

  // Stratégie 2 : clic direct sur le lien dans le div du looper
  try {
    const link = await page.$(`div#${item.looperId}_${item.resultIndex} a`)
    if (link) {
      // Vérifier si le lien href pointe vers un PDF avant de cliquer
      const href = await link.getAttribute('href') || ''
      if (isPdfUrl(href)) {
        console.log(`[IORT Codes] PDF ignoré (href): ${href}`)
        return null
      }

      const [detailPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 15000 }),
        link.click(),
      ]).catch(() => [null])

      if (detailPage && (detailPage as Page).url) {
        await (detailPage as Page).waitForLoadState('load')
        await sleep(2000)
        if (isPdfUrl((detailPage as Page).url())) {
          console.log(`[IORT Codes] PDF ignoré: ${(detailPage as Page).url()}`)
          await (detailPage as Page).close()
          return null
        }
        const text = await extractTextFromPage(detailPage as Page)
        await (detailPage as Page).close()
        if (text && text.length > 30) return text
      }
    }
  } catch { /**/ }

  // Fermer popups orphelins à nouveau
  try {
    const pages = page.context().pages()
    for (const p of pages) if (p !== page) await p.close().catch(() => {})
  } catch { /**/ }

  // Stratégie 3 : _JSL(A17, '_self') — navigation dans la même page
  try {
    await page.evaluate(([idx, looperId]: [number, string]) => {
      // @ts-expect-error WebDev
      if (_PAGE_[looperId]) _PAGE_[looperId].value = idx
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'A17', '_self', '', '')
    }, [item.resultIndex, item.looperId] as [number, string])
    await page.waitForLoadState('load')
    await sleep(2000)
    if (isPdfUrl(page.url())) {
      console.log(`[IORT Codes] PDF ignoré (_self): ${page.url()}`)
      await page.goBack()
      await page.waitForLoadState('load')
      return null
    }
    const text = await extractTextFromPage(page)
    if (text && text.length > 30) return text

    // Revenir en arrière (on est sur la page de détail maintenant)
    await page.goBack()
    await page.waitForLoadState('load')
    await sleep(2000)
  } catch { /**/ }

  return null
}

async function extractTextFromPage(page: Page): Promise<string> {
  const selectors = [
    '.contenu', '.texte', 'td.texte', 'td.contenu',
    'div.texte', '#contenu', '.Texte', '.nass',
    '.article-body', '#article-content', '.legal-text',
  ]

  for (const sel of selectors) {
    try {
      const el = await page.$(sel)
      if (el) {
        const text = await el.textContent()
        if (text && text.trim().length > 50) return cleanText(text)
      }
    } catch { /**/ }
  }

  // Fallback : body nettoyé
  const fullText = await page.evaluate(() => {
    ;['script', 'style', 'nav', 'header', 'footer', 'form[name="_WD_FORM_"]'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove())
    })
    return document.body?.innerText || document.body?.textContent || ''
  })

  return cleanText(fullText)
}

// =============================================================================
// SAUVEGARDE EN DB
// =============================================================================

export async function saveCodeSection(
  sourceId: string,
  codeName: string,
  sectionTitle: string,
  textContent: string,
  depth: number,
): Promise<{ id: string; skipped: boolean; updated: boolean }> {
  const url = generateCodeSectionUrl(codeName, sectionTitle)
  const urlHash = hashUrl(url)
  const contentHash = hashContent(textContent)
  const wordCount = countWords(textContent)
  const language = detectTextLanguage(textContent)

  const existing = await db.query(
    'SELECT id, content_hash FROM web_pages WHERE url_hash = $1',
    [urlHash],
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    if (row.content_hash === contentHash) {
      await db.query('UPDATE web_pages SET last_crawled_at = NOW() WHERE id = $1', [row.id])
      return { id: row.id as string, skipped: true, updated: false }
    }
    await db.query(
      `UPDATE web_pages SET extracted_text = $1, content_hash = $2, word_count = $3,
       updated_at = NOW(), last_crawled_at = NOW() WHERE id = $4`,
      [textContent, contentHash, wordCount, row.id],
    )
    return { id: row.id as string, skipped: false, updated: true }
  }

  const result = await db.query(
    `INSERT INTO web_pages (
      web_source_id, url, url_hash, canonical_url,
      title, content_hash, extracted_text, word_count,
      language_detected, structured_data,
      status, crawl_depth, last_crawled_at, first_seen_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'indexed',0,NOW(),NOW())
    RETURNING id`,
    [
      sourceId,
      url, urlHash, url,
      `${codeName} - ${sectionTitle}`,
      contentHash, textContent, wordCount,
      language,
      JSON.stringify({
        source: 'iort_codes',
        codeName,
        sectionTitle,
        depth,
        codeNameFr: IORT_KNOWN_CODES[codeName] || null,
      }),
    ],
  )

  return { id: result.rows[0].id as string, skipped: false, updated: false }
}

// =============================================================================
// CRAWL PRINCIPAL
// =============================================================================

/**
 * Crawle toutes les sections d'un code juridique IORT.
 * Flow : PAGE_RechercheCodes → sélectionner code → PAGE_NavigationCode → extraire chaque section
 *
 * @param dryRun - Si true, navigation + extraction seulement, pas de sauvegarde en DB
 */
export async function crawlCode(
  session: IortSessionManager,
  sourceId: string,
  codeName: string,
  dryRun = false,
): Promise<IortCodeCrawlStats> {
  const startTime = Date.now()
  const stats: IortCodeCrawlStats = {
    codeName,
    totalSections: 0,
    crawled: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    elapsedMs: 0,
  }

  // 1. Naviguer vers la page de sélection
  await navigateToCodesSelectionPage(session)
  let page = session.getPage()

  // 2. Trouver le code dans la liste
  const availableCodes = await parseAvailableCodes(page)
  if (availableCodes.length === 0) {
    throw new Error('[IORT Codes] Aucun code disponible — vérifier la navigation _JCL(M24) + _JEM(M180)')
  }

  const target = availableCodes.find(c =>
    c.name === codeName ||
    c.name.includes(codeName) ||
    codeName.includes(c.name.replace(/^(مجلة|المجلة)\s+/, '')),
  )

  if (!target) {
    console.error(`[IORT Codes] "${codeName}" non trouvé parmi:`, availableCodes.map(c => c.name))
    throw new Error(`Code "${codeName}" non trouvé. Disponibles: ${availableCodes.map(c => c.name).join(', ')}`)
  }

  // 3. Sélectionner le code → aller sur PAGE_NavigationCode
  await selectCodeAndNavigate(page, target)
  page = session.getPage()

  // 4. Parser la table des matières
  const tocItems = await parseTocItems(page)
  stats.totalSections = tocItems.length
  console.log(`[IORT Codes] "${codeName}": ${tocItems.length} sections dans la TOC`)

  if (tocItems.length === 0) {
    throw new Error('[IORT Codes] TOC vide — vérifier la structure de PAGE_NavigationCode')
  }

  // 5. Extraire le texte de chaque section
  for (const item of tocItems) {
    await session.tick()

    try {
      if (dryRun) {
        console.log(`  [DRY] ${' '.repeat(item.depth * 2)}${item.title.substring(0, 80)}`)
        stats.crawled++
        await sleep(200)
        continue
      }

      const textContent = await extractSectionText(page, item)

      if (!textContent || textContent.length < 20) {
        stats.skipped++
        console.log(`[IORT Codes] Texte vide: "${item.title.substring(0, 60)}"`)
        await sleep(1000)
        continue
      }

      const { skipped, updated } = await saveCodeSection(
        sourceId, codeName, item.title, textContent, item.depth,
      )

      if (skipped) {
        stats.skipped++
      } else if (updated) {
        stats.updated++
        console.log(`[IORT Codes] ↻ MAJ: ${item.title.substring(0, 70)}`)
      } else {
        stats.crawled++
        console.log(`[IORT Codes] ✓ ${item.title.substring(0, 70)} (${textContent.length} chars)`)
      }

      await sleep(IORT_RATE_CONFIG.minDelay)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stats.errors++
      console.error(`[IORT Codes] Erreur section "${item.title.substring(0, 40)}":`, msg)

      // Fermer popups orphelins
      try {
        page = session.getPage()
        for (const p of page.context().pages()) {
          if (p !== page) await p.close().catch(() => {})
        }
      } catch { /**/ }

      await sleep(IORT_RATE_CONFIG.minDelay)
    }
  }

  stats.elapsedMs = Date.now() - startTime
  console.log(
    `[IORT Codes] ✅ Terminé "${codeName}": ` +
    `${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} sautés, ${stats.errors} erreurs ` +
    `en ${Math.round(stats.elapsedMs / 1000)}s`,
  )

  return stats
}

export { getOrCreateIortSource }
