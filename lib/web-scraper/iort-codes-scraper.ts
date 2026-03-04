/**
 * Scraper IORT — Section RechercheCodes (Codes Juridiques)
 *
 * Accède à https://www.iort.tn/siteiort/ via Playwright pour extraire
 * les articles des codes juridiques tunisiens (المجلة التجارية, مجلة الشغل, etc.)
 *
 * Structure du site (vérifiée Mars 2026) :
 *   Homepage
 *   → _JSL(M49) → PAGE_RechercheCodes : sélection du code (select/looper)
 *   → sélectionner code → PAGE_NavigationCode : table des matières (arbre de sections)
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

/** Menu ID WebDev pour accéder à la section RechercheCodes (déduit depuis #M49 dans l'URL) */
const CODES_MENU_ID = 'M49'

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
 * Navigue vers la page de sélection des codes (PAGE_RechercheCodes) via M49.
 * Retourne la page Playwright courante après navigation réussie.
 */
export async function navigateToCodesSelectionPage(session: IortSessionManager): Promise<void> {
  const page = session.getPage()

  console.log('[IORT Codes] Navigation homepage → section codes...')
  await page.goto(IORT_SITEIORT_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(3000)

  // Tenter M49 (déduit de l'URL observée #M49)
  let navigated = false
  try {
    await page.evaluate((menuId) => {
      // @ts-expect-error WebDev
      _JSL(_PAGE_, menuId, '_self', '', '')
    }, CODES_MENU_ID)
    await page.waitForLoadState('load')
    await sleep(3000)

    const url = page.url()
    console.log(`[IORT Codes] URL après ${CODES_MENU_ID}: ${url}`)
    navigated = url.includes('RechercheCodes') || url.includes('Navigation')
  } catch (err) {
    console.warn(`[IORT Codes] _JSL(${CODES_MENU_ID}) a échoué:`, err instanceof Error ? err.message : err)
  }

  if (!navigated) {
    // Découverte automatique : chercher le lien "البحث في المجلات" ou similaire
    console.log('[IORT Codes] Découverte automatique du lien codes...')
    const found = await page.evaluate(() => {
      const keywords = ['مجلة', 'مجلات', 'RechercheCodes', 'codes juridiques', 'البحث في القانون']
      const links = Array.from(document.querySelectorAll('a, [onclick]'))
      for (const el of links) {
        const text = (el.textContent || '').trim()
        const onclick = el.getAttribute('onclick') || ''
        if (keywords.some(kw => text.includes(kw) || onclick.includes(kw))) {
          const m = onclick.match(/_JSL\s*\(_PAGE_\s*,\s*'(\w+)'/)
          if (m) {
            // @ts-expect-error WebDev
            _JSL(_PAGE_, m[1], '_self', '', '')
            return m[1]
          }
        }
      }
      return null
    })

    if (found) {
      await page.waitForLoadState('load')
      await sleep(3000)
      console.log(`[IORT Codes] Navigué via découverte: ${found}`)
    } else {
      const currentUrl = page.url()
      throw new Error(
        `[IORT Codes] Impossible de naviguer vers la section codes. URL actuelle: ${currentUrl}. ` +
        `Vérifier que M49 est le bon ID de menu IORT.`,
      )
    }
  }
}

/**
 * Parse la liste des codes disponibles depuis PAGE_RechercheCodes.
 * Cherche d'abord un <select> avec options arabes, puis un looper.
 */
export async function parseAvailableCodes(page: Page): Promise<IortCode[]> {
  console.log('[IORT Codes] Parsing des codes disponibles...')

  // Stratégie 1 : <select> avec options arabes
  const selectData = await page.evaluate(() => {
    for (const sel of Array.from(document.querySelectorAll('select'))) {
      const opts = Array.from(sel.options).filter(o =>
        /[\u0600-\u06FF]/.test(o.text) && o.text.trim().length > 4,
      )
      if (opts.length >= 3) {
        return { found: true, name: sel.name, options: opts.map((o, i) => ({ value: o.value, text: o.text.trim(), index: i + 1 })) }
      }
    }
    return { found: false, name: '', options: [] }
  })

  if (selectData.found && selectData.options.length > 0) {
    console.log(`[IORT Codes] Select "${selectData.name}" → ${selectData.options.length} codes`)
    return selectData.options.map(o => ({
      name: o.text,
      nameFr: IORT_KNOWN_CODES[o.text],
      selectIndex: o.index,
      selectValue: o.value,
    }))
  }

  // Stratégie 2 : looper div[id^="A4_"]
  const looperData = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[id^="A4_"]')).map((el, i) => ({
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120),
      index: i + 1,
    })).filter(x => x.text && /[\u0600-\u06FF]/.test(x.text))
  })

  if (looperData.length > 0) {
    console.log(`[IORT Codes] Looper A4 → ${looperData.length} codes`)
    return looperData.map(x => ({
      name: x.text,
      nameFr: IORT_KNOWN_CODES[x.text],
      selectIndex: x.index,
    }))
  }

  // Log de découverte si rien trouvé
  const discovery = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    selectCount: document.querySelectorAll('select').length,
    loopers: Array.from(new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
        .filter(Boolean),
    )),
    bodyPreview: (document.body.textContent || '').substring(0, 500),
  }))
  console.warn('[IORT Codes] ⚠️  Aucun code trouvé. Page info:', JSON.stringify(discovery, null, 2))
  return []
}

/**
 * Sélectionne un code et navigue vers sa table des matières (PAGE_NavigationCode).
 */
export async function selectCodeAndNavigate(page: Page, code: IortCode): Promise<void> {
  console.log(`[IORT Codes] Sélection: "${code.name}"`)

  // 1. Sélectionner dans le <select> si on a la valeur
  if (code.selectValue) {
    const selected = await page.evaluate((val) => {
      for (const sel of Array.from(document.querySelectorAll('select'))) {
        const opt = Array.from(sel.options).find(o => o.value === val || o.text.trim() === val)
        if (opt) {
          sel.value = opt.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        }
      }
      return false
    }, code.selectValue)

    if (selected) await sleep(500)
  } else {
    // Fallback : cliquer directement sur le lien dans le looper
    await page.evaluate((idx) => {
      // @ts-expect-error WebDev
      if (_PAGE_.A4) _PAGE_.A4.value = idx
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'A17', '_self', '', '')
    }, code.selectIndex)
    await page.waitForLoadState('load')
    await sleep(3000)
    return
  }

  // 2. Déclencher la validation (bouton recherche WebDev)
  // Tenter plusieurs IDs de bouton submit courants
  const submitResult = await page.evaluate(() => {
    for (const id of ['A40', 'B40', 'A12', 'B12', 'A11', 'A9', 'A10']) {
      try {
        // @ts-expect-error WebDev
        _JSL(_PAGE_, id, '_self', '', '')
        return id
      } catch { /* essayer suivant */ }
    }
    // Fallback : chercher un <input type="submit"> ou <button>
    const btn = document.querySelector('input[type="submit"], button[type="submit"], button')
    if (btn) { (btn as HTMLElement).click(); return 'button-click' }
    return null
  })

  console.log(`[IORT Codes] Submit via: ${submitResult}`)
  await page.waitForLoadState('load')
  await sleep(3000)

  const url = page.url()
  console.log(`[IORT Codes] URL après sélection: ${url}`)
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
        return text.length > 5 && arabicSectionKeywords.test(text) && /[\u0600-\u06FF]/.test(text)
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
      const [detailPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 15000 }),
        link.click(),
      ]).catch(() => [null])

      if (detailPage && (detailPage as Page).url) {
        await (detailPage as Page).waitForLoadState('load')
        await sleep(2000)
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
    throw new Error('[IORT Codes] Aucun code disponible — vérifier la navigation M49')
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
