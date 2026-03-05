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
  IortLanguage,
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
  /** ID du looper WebDev contenant cet item (ex: 'A1', 'M18') */
  looperId?: string
}

/** Un item de la table des matières (PAGE_NavigationCode ou PAGE_CodesJuridiques) */
export interface IortTocItem {
  /** Titre de la section (ex: العنوان الأول في التجار) */
  title: string
  /** Index dans le looper (1-based) */
  resultIndex: number
  /** Profondeur dans la hiérarchie (0=livre, 1=titre, 2=section, etc.) */
  depth: number
  /** ID du looper (ex: A4, B4, M18) — pour construire le sélecteur */
  looperId: string
  /** Handler onclick du lien (capturé pour les pages non-standard) */
  onclick?: string
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
    // Boilerplate navigation IORT siteiort.tn
    .replace(/الجمهورية التونسية\s*رئاسة الحكومة/g, '')
    .replace(/إصدارات لقرارات الرائد الرسمي[\s\S]{0,600}/g, '')
    .replace(/الرائد الرسمي للإعلانات القانونية والشرعية.{0,200}/g, '')
    .replace(/الجريدة الرسمية للجماعات المحلية.{0,200}/g, '')
    .replace(/المجلة القضائية.{0,100}/g, '')
    .replace(/\baطلاع\b/g, '')
    .trim()
}

/** Détecte si le texte est du boilerplate navigation IORT (pas du contenu juridique) */
function isNavigationBoilerplate(text: string): boolean {
  const cleaned = text.trim()
  if (cleaned.length < 50) return true
  // Le contenu est du boilerplate si :
  // 1. Commence par le header gouvernemental
  if (/^الجمهورية التونسية/.test(cleaned)) return true
  // 2. Contient les patterns de navigation IORT sans mots-clés juridiques
  const hasLegalContent = /الفصل\s+\d|المادة\s+\d|أحكام\s+(عامة|خاصة)|الباب\s+(الأول|الثاني|الثالث)|العنوان\s+(الأول|الثاني|الثالث)|يُعدّ|يُعتبر|يُعاقب|يجوز|لا يجوز|يُلزم|يُخضع/.test(cleaned)
  const hasNavText = /الرائد الرسمي|إصدارات لقرارات|اطلاع|رئاسة الحكومة/.test(cleaned)
  return hasNavText && !hasLegalContent
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
  const looperId = code.looperId ?? 'A1'
  console.log(`[IORT Codes] Clic "اطلاع" sur: "${code.name}" (${looperId}_${code.selectIndex})`)

  // Chercher le bouton "اطلاع" dans le div du code (looperId dynamique)
  const divSelector = `div#${looperId}_${code.selectIndex}`

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

/** Extrait les items d'un looper donné avec filtrage arabe */
async function extractLooperItems(
  page: Page,
  prefix: string,
): Promise<{ index: number; text: string; depth: number; onclick: string }[] | null> {
  return page.evaluate((pfx) => {
    const els = Array.from(document.querySelectorAll(`div[id^="${pfx}_"]`))
    if (els.length === 0) return null

    const mapped = els.map(el => {
      const idMatch = el.id.match(/(\d+)$/)
      const index = idMatch ? parseInt(idMatch[1], 10) : 0
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
      const style = el.getAttribute('style') || ''
      const paddingMatch = style.match(/padding-(?:right|left)\s*:\s*(\d+)/)
      const depth = paddingMatch ? Math.floor(parseInt(paddingMatch[1]) / 20) : 0
      const link = el.querySelector('a, [onclick]')
      const onclick = link?.getAttribute('onclick') || ''
      return { index, text: text.substring(0, 200), depth, onclick }
    }).filter(x => x && x.text && x.index > 0 && /[\u0600-\u06FF]/.test(x.text))

    return mapped.length > 0 ? mapped : null
  }, prefix)
}

/**
 * Parse la table des matières du code courant.
 * Essaie d'abord les loopers standards A4-E4, puis effectue une découverte
 * dynamique de tous les loopers disponibles (pour PAGE_CodesJuridiques).
 *
 * @param capturedUrl URL capturée AVANT une éventuelle navigation JS (ex: _JEM)
 *                    Permet de détecter PAGE_CodesJuridiques même si l'URL a changé.
 */
export async function parseTocItems(page: Page, capturedUrl?: string): Promise<IortTocItem[]> {
  console.log('[IORT Codes] Parsing table des matières...')

  // Stratégie 1 : loopers standards PAGE_NavigationCode (A4, B4, C4, D4, E4)
  for (const prefix of ['A4', 'B4', 'C4', 'D4', 'E4']) {
    const items = await extractLooperItems(page, prefix)
    if (items && items.length > 0) {
      console.log(`[IORT Codes] Looper ${prefix} → ${items.length} sections TOC`)
      return items.map(item => ({
        title: item.text,
        resultIndex: item.index,
        depth: item.depth,
        looperId: prefix,
        onclick: item.onclick || undefined,
      }))
    }
  }

  // Stratégie 2a : PAGE_CodesJuridiques — essayer les loopers connus avec seuil = 1
  // Utilise capturedUrl (URL avant navigation JS) pour détecter le type de page
  const currentUrl = capturedUrl ?? page.url()
  if (currentUrl.includes('PAGE_CodesJuridiques')) {
    for (const prefix of ['M18', 'M78', 'M110', 'M81', 'M59', 'M3', 'M81']) {
      const rawItems = await page.evaluate((pfx) => {
        const els = Array.from(document.querySelectorAll(`div[id^="${pfx}_"]`))
        return els.map(el => {
          const idMatch = el.id.match(/(\d+)$/)
          const index = idMatch ? parseInt(idMatch[1], 10) : 0
          const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
          const link = el.querySelector('a, [onclick]')
          const onclick = link?.getAttribute('onclick') || ''
          const style = el.getAttribute('style') || ''
          const paddingMatch = style.match(/padding-(?:right|left)\s*:\s*(\d+)/)
          const depth = paddingMatch ? Math.floor(parseInt(paddingMatch[1]) / 20) : 0
          return { index, text: text.substring(0, 200), depth, onclick }
        }).filter(x => x && x.index > 0)
      }, prefix)

      if (rawItems.length > 0) {
        const arabicItems = rawItems.filter(i => /[\u0600-\u06FF]/.test(i.text) && i.text.length > 5)
        console.log(`[IORT Codes] ${prefix}: ${rawItems.length} items, ${arabicItems.length} arabes — ${rawItems.map(i => i.text.substring(0, 25)).join(' | ')}`)
        if (arabicItems.length >= 1) {
          return arabicItems.map(item => ({
            title: item.text,
            resultIndex: item.index,
            depth: item.depth,
            looperId: prefix,
            onclick: item.onclick || undefined,
          }))
        }
      }
    }
  }

  // Stratégie 2b : découverte dynamique générale — tous les loopers (count >= 3)
  // (pour d'autres types de pages non-standards)
  const discoveredLoopers = await page.evaluate(() => {
    const prefixCounts: Record<string, number> = {}
    for (const el of document.querySelectorAll('[id]')) {
      const m = el.id.match(/^([A-Z]\d+)_(\d+)$/)
      if (m) prefixCounts[m[1]] = (prefixCounts[m[1]] || 0) + 1
    }
    return Object.entries(prefixCounts)
      .filter(([pfx, count]) => count >= 3 && pfx !== 'A1')
      .sort((a, b) => b[1] - a[1])
      .map(([pfx]) => pfx)
  })

  console.log(`[IORT Codes] Découverte loopers: ${discoveredLoopers.join(', ')}`)

  for (const prefix of discoveredLoopers) {
    const items = await extractLooperItems(page, prefix)
    if (items && items.length >= 2) {
      console.log(`[IORT Codes] Looper découvert ${prefix} → ${items.length} items arabes`)
      return items.map(item => ({
        title: item.text,
        resultIndex: item.index,
        depth: item.depth,
        looperId: prefix,
        onclick: item.onclick || undefined,
      }))
    }
  }

  // Stratégie 3 : liens structurés (arbre HTML)
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
        index: i + 1,
      }))
    return links
  })

  if (linkItems.length > 0) {
    console.log(`[IORT Codes] ${linkItems.length} liens de sections trouvés`)
    return linkItems.map(l => ({
      title: l.text,
      resultIndex: l.index,
      depth: 0,
      looperId: 'LINK',
      onclick: l.onclick || undefined,
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
 * (a) ouvrir une popup (A17 sur _blank, ou autre bouton pour PAGE_CodesJuridiques)
 * (b) naviguer dans la même page (_self) et afficher le contenu
 * (c) afficher le contenu inline dans un div de la page
 */
export async function extractSectionText(
  page: Page,
  item: IortTocItem,
): Promise<string | null> {
  // A17 = bouton view standard (PAGE_NavigationCode)
  // Pour PAGE_CodesJuridiques, essayer aussi M17, A7, M7, B17
  const isStandardLooper = /^[A-E]4$/.test(item.looperId)
  const viewButtons = isStandardLooper ? ['A17'] : ['A17', 'M17', 'A7', 'M7', 'B17']

  // Helper : nettoyer les popups orphelines
  const closeOrphans = async () => {
    try {
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => {})
    } catch { /**/ }
  }

  // Stratégie 0 : si onclick stocké, extraire le bouton et l'exécuter directement
  if (item.onclick && item.onclick.includes('_JSL')) {
    const jslMatch = item.onclick.match(/_JSL\s*\([^,]+,\s*'(\w+)'\s*,\s*'([^']*)'/)
    if (jslMatch) {
      const [, btnId, _target] = jslMatch
      try {
        const [detailPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 15000 }),
          page.evaluate(([idx, looperId, btn]: [number, string, string]) => {
            // @ts-expect-error WebDev
            const formField = _PAGE_[looperId]
            if (formField) formField.value = idx
            // @ts-expect-error WebDev
            _JSL(_PAGE_, btn, '_blank', '', '')
          }, [item.resultIndex, item.looperId, btnId] as [number, string, string]),
        ])
        await detailPage.waitForLoadState('load')
        await sleep(2000)
        if (isPdfUrl(detailPage.url())) { await detailPage.close(); return null }
        const text = await extractTextFromPage(detailPage)
        await detailPage.close()
        if (text && text.length > 30) return text
      } catch { /* fallback */ }
    }
  }

  await closeOrphans()

  // Stratégie 1 : _PAGE_[looperId].value = idx; _JSL(btnId, '_blank') → popup
  for (const btn of viewButtons) {
    try {
      const [detailPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 15000 }),
        page.evaluate(([idx, looperId, btnId]: [number, string, string]) => {
          // @ts-expect-error WebDev
          const formField = _PAGE_[looperId]
          if (formField) formField.value = idx
          // @ts-expect-error WebDev
          _JSL(_PAGE_, btnId, '_blank', '', '')
        }, [item.resultIndex, item.looperId, btn] as [number, string, string]),
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
    } catch { /* pas de popup pour ce bouton */ }
  }

  await closeOrphans()

  // Stratégie 2 : clic direct sur le lien dans le div du looper
  try {
    const link = await page.$(`div#${item.looperId}_${item.resultIndex} a`)
    if (link) {
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
          await (detailPage as Page).close()
          return null
        }
        const text = await extractTextFromPage(detailPage as Page)
        await (detailPage as Page).close()
        if (text && text.length > 30) return text
      }
    }
  } catch { /**/ }

  await closeOrphans()

  // Stratégie 3 : _JSL(btnId, '_self') — navigation dans la même page
  for (const btn of viewButtons) {
    try {
      // Snapshot URL avant navigation
      const urlBefore = page.url()
      await page.evaluate(([idx, looperId, btnId]: [number, string, string]) => {
        // @ts-expect-error WebDev
        if (_PAGE_[looperId]) _PAGE_[looperId].value = idx
        // @ts-expect-error WebDev
        _JSL(_PAGE_, btnId, '_self', '', '')
      }, [item.resultIndex, item.looperId, btn] as [number, string, string])

      // Attendre soit un chargement complet, soit un changement d'URL
      await Promise.race([
        page.waitForLoadState('load'),
        sleep(5000),
      ])
      await sleep(2000)

      if (isPdfUrl(page.url())) {
        await page.goBack()
        await page.waitForLoadState('load')
        return null
      }

      const text = await extractTextFromPage(page)
      if (text && text.length > 50 && !isNavigationBoilerplate(text)) {
        if (page.url() !== urlBefore) {
          await page.goBack()
          await page.waitForLoadState('load')
          await sleep(2000)
        }
        return text
      }
      if (page.url() !== urlBefore) {
        await page.goBack()
        await page.waitForLoadState('load')
        await sleep(1000)
      }
    } catch { /**/ }
  }

  // Stratégie 4 : onclick TOC item en mode _self (si présent et différent des essais précédents)
  if (item.onclick && item.onclick.includes('_JSL')) {
    const selfMatch = item.onclick.match(/_JSL\s*\([^,]+,\s*'(\w+)'\s*,\s*'_self'/)
    if (selfMatch && !viewButtons.includes(selfMatch[1])) {
      const btnId = selfMatch[1]
      try {
        const urlBefore = page.url()
        await page.evaluate(([idx, looperId, btn]: [number, string, string]) => {
          // @ts-expect-error WebDev
          if (_PAGE_[looperId]) _PAGE_[looperId].value = idx
          // @ts-expect-error WebDev
          _JSL(_PAGE_, btn, '_self', '', '')
        }, [item.resultIndex, item.looperId, btnId] as [number, string, string])
        await Promise.race([
          page.waitForLoadState('load'),
          sleep(5000),
        ])
        await sleep(2000)

        const text = await extractTextFromPage(page)
        if (text && text.length > 50 && !isNavigationBoilerplate(text)) {
          if (page.url() !== urlBefore) {
            await page.goBack()
            await page.waitForLoadState('load')
            await sleep(1000)
          }
          return text
        }
        if (page.url() !== urlBefore) {
          await page.goBack()
          await page.waitForLoadState('load')
          await sleep(500)
        }
      } catch { /**/ }
    }
  }

  return null
}

async function extractTextFromPage(page: Page): Promise<string> {
  const selectors = [
    '.contenu', '.texte', 'td.texte', 'td.contenu',
    'div.texte', '#contenu', '.Texte', '.nass',
    '.article-body', '#article-content', '.legal-text',
    '#printable', '.printable', 'div.nass', 'div.fas',
  ]

  for (const sel of selectors) {
    try {
      const el = await page.$(sel)
      if (el) {
        const text = await el.textContent()
        if (text && text.trim().length > 50) {
          const c = cleanText(text)
          if (!isNavigationBoilerplate(c)) return c
        }
      }
    } catch { /**/ }
  }

  // Stratégie : chercher les zones de contenu WebDev (*3_1 — content display areas)
  // excluant les loopers TOC/navigation connus (A4/B4/C4/D4/E4/A1/M18/M78/M110)
  const TOC_LOOPERS = new Set(['A1', 'A4', 'B4', 'C4', 'D4', 'E4', 'M18', 'M78', 'M110', 'M81', 'M59'])
  const webdevContent = await page.evaluate((excluded: string[]) => {
    const excludedSet = new Set(excluded)
    const results: { id: string; text: string }[] = []
    for (const el of document.querySelectorAll('div[id]')) {
      const m = el.id.match(/^([A-Z]\d+)_1$/)
      if (!m || excludedSet.has(m[1])) continue
      const text = (el.textContent || '').trim()
      if (text.length > 150 && /[\u0600-\u06FF]{20,}/.test(text)) {
        results.push({ id: el.id, text: text.substring(0, 2000) })
      }
    }
    return results.sort((a, b) => b.text.length - a.text.length)
  }, Array.from(TOC_LOOPERS))

  for (const { text } of webdevContent) {
    const c = cleanText(text)
    if (!isNavigationBoilerplate(c) && c.length > 100) return c
  }

  // Stratégie : iframes (le contenu peut être dans un iframe WebDev)
  try {
    const frames = page.frames()
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue
      try {
        const frameText = await frame.evaluate(() => document.body?.innerText || '')
        if (frameText && frameText.trim().length > 200) {
          const c = cleanText(frameText)
          if (!isNavigationBoilerplate(c)) return c
        }
      } catch { /**/ }
    }
  } catch { /**/ }

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
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'crawled',0,NOW(),NOW())
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

  // Si on arrive sur PAGE_CodesJuridiques, attendre le chargement dynamique du contenu
  // IMPORTANT : ne pas appeler _JEM() ici — ça navigate vers une autre page et
  // brise la détection PAGE_CodesJuridiques dans parseTocItems()
  const urlAfterNav = page.url()
  if (urlAfterNav.includes('PAGE_CodesJuridiques')) {
    console.log('[IORT Codes] PAGE_CodesJuridiques détectée, attente chargement dynamique (12s)...')
    await sleep(12000)
    console.log(`[IORT Codes] URL après attente: ${page.url()}`)
  }

  // 4. Parser la table des matières (passe l'URL capturée avant navigation éventuelle)
  const tocItems = await parseTocItems(page, urlAfterNav)
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

      if (!textContent || textContent.length < 20 || isNavigationBoilerplate(textContent)) {
        stats.skipped++
        console.log(`[IORT Codes] Texte vide/boilerplate: "${item.title.substring(0, 60)}"`)
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

// ─── مجموعات نصوص (PAGE_CodesJuridiques) ──────────────────────────────────────

/**
 * Navigue vers le listing complet codes+recueils via M62.
 * M62 (المجلات ومجموعات النصوص القانونية) depuis iort.tn/siteiort → looper A1 avec ~52 items.
 * C'est la navigation stable confirmée sur prod (vs URLs de session qui expirent).
 *
 * @param language 'ar' (défaut) | 'fr' — switche via M32 avant M62 si FR
 */
export async function navigateToRecueilPage(
  session: IortSessionManager,
  language: IortLanguage = 'ar',
): Promise<void> {
  const page = session.getPage()
  console.log(`[IORT Recueil] Navigation M62 → codes+recueils (${language.toUpperCase()})...`)

  await page.goto(IORT_SITEIORT_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(3000)

  if (language === 'fr') {
    console.log('[IORT Recueil] Activation langue FR (M32)...')
    await page.evaluate(() => {
      // @ts-expect-error WebDev
      _JEM('M32', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await sleep(3000)
  }

  // M62 = المجلات ومجموعات النصوص القانونية — expose A1 avec codes ET recueils (~52 items)
  await page.evaluate(() => {
    // @ts-expect-error WebDev
    _JEM('M62', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await sleep(6000)

  const count = await page.evaluate(() => document.querySelectorAll('[id^="A1_"]').length)
  console.log(`[IORT Recueil] ${count} items A1 après M62 (${language.toUpperCase()})`)
}

/**
 * Détecte et retourne les recueils depuis la page M62 (looper A1, ~52 items).
 * Filtre les codes juridiques connus (IORT_KNOWN_CODES) pour ne retenir que les recueils
 * et autres textes non encore crawlés par le scraper codes.
 */
export async function parseAvailableRecueils(page: Page): Promise<IortCode[]> {
  const allItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id^="A1_"]'))
      .map(el => ({
        index: parseInt((el.id.split('_')[1] ?? '0'), 10),
        // Nettoyer le texte : retirer "اطلاع" (bouton) et espaces
        name: (el.textContent ?? '').trim().replace(/\s*اطلاع\s*$/, '').trim(),
      }))
      .filter(x => x.index > 0 && x.name.length > 3)
  })

  if (allItems.length === 0) {
    console.warn('[IORT Recueil] Aucun item A1 — M62 n\'a pas chargé la liste')
    return []
  }

  console.log(`[IORT Recueil] ${allItems.length} items A1 totaux (codes + recueils)`)

  // Filtrer les codes déjà connus (crawlés séparément via crawlCode)
  const knownCodeNames = new Set(Object.keys(IORT_KNOWN_CODES))
  const recueils = allItems.filter(item => {
    // Garder si le nom ne correspond à aucun code connu (correspondance partielle)
    return !Array.from(knownCodeNames).some(code => item.name.includes(code) || code.includes(item.name))
  })

  console.log(`[IORT Recueil] ${recueils.length} recueils après filtrage des codes connus`)
  return recueils.map(x => ({ name: x.name, selectIndex: x.index, looperId: 'A1' }))
}

/**
 * Crawle un ou tous les recueils thématiques (مجموعات نصوص).
 * Réutilise parseTocItems() + extractSectionText() + saveCodeSection() des codes.
 *
 * @param session     Session Playwright IORT active
 * @param sourceId    ID de la source web (web_sources.id)
 * @param recueilName Si fourni, filtre sur les recueils dont le nom contient cette chaîne
 * @param language    'ar' | 'fr' | 'both' (défaut: 'ar')
 */
export async function crawlRecueil(
  session: IortSessionManager,
  sourceId: string,
  recueilName?: string,
  language: IortLanguage | 'both' = 'ar',
): Promise<IortCodeCrawlStats> {
  const startTime = Date.now()
  const stats: IortCodeCrawlStats = {
    codeName: recueilName ?? 'tous les recueils',
    totalSections: 0,
    crawled: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    elapsedMs: 0,
  }

  const languages: IortLanguage[] = language === 'both' ? ['ar', 'fr'] : [language]

  for (const lang of languages) {
    await navigateToRecueilPage(session, lang)
    let page = session.getPage()
    const available = await parseAvailableRecueils(page)

    if (available.length === 0) {
      console.warn(`[IORT Recueil] Aucun recueil disponible (${lang.toUpperCase()}) — skip`)
      continue
    }

    const targets = recueilName
      ? available.filter(r => r.name.includes(recueilName))
      : available

    console.log(`[IORT Recueil] ${targets.length}/${available.length} recueils à crawler (${lang.toUpperCase()})`)

    for (const recueil of targets) {
      console.log(`[IORT Recueil] → "${recueil.name}" (index ${recueil.selectIndex}, ${lang.toUpperCase()})`)

      try {
        await selectCodeAndNavigate(page, recueil)
        await sleep(12000)

        const capturedUrl = page.url()
        const tocItems = await parseTocItems(page, capturedUrl)
        console.log(`[IORT Recueil] ${tocItems.length} sections dans "${recueil.name}"`)

        for (const item of tocItems) {
          try {
            const text = await extractSectionText(page, item)

            if (!text || text.length < 20) {
              stats.skipped++
              continue
            }

            const saveResult = await saveCodeSection(sourceId, recueil.name, item.title, text, item.depth)

            if (saveResult.skipped) {
              stats.skipped++
            } else if (saveResult.updated) {
              stats.updated++
            } else {
              stats.crawled++
            }

            await sleep(IORT_RATE_CONFIG.minDelay)
          } catch (err) {
            console.error(`[IORT Recueil] Erreur section "${item.title}":`, err)
            stats.errors++
          }
        }
      } catch (err) {
        console.error(`[IORT Recueil] Erreur recueil "${recueil.name}":`, err)
        stats.errors++
      }

      await navigateToRecueilPage(session, lang)
      page = session.getPage()
      await sleep(3000)
    }

    if (language === 'both' && lang === 'ar') {
      console.log('[IORT Recueil] Pause entre AR et FR...')
      await sleep(5000)
    }
  }

  stats.elapsedMs = Date.now() - startTime
  console.log(
    `[IORT Recueil] ✅ Terminé: ` +
    `${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} sautés, ${stats.errors} erreurs ` +
    `en ${Math.round(stats.elapsedMs / 1000)}s`,
  )

  return stats
}

export { getOrCreateIortSource }
