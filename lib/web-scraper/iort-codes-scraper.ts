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
  getOrCreateIortSiteiortSource,
} from './iort-scraper-utils'
import type { IortLanguage } from './iort-text-utils'
import {
  IORT_SITEIORT_URL,
  sleep,
  waitForStableContent,
  cleanText,
  isNavigationBoilerplate,
  isPdfUrl,
  generateCodeSectionUrl,
} from './iort-text-utils'
import { hashUrl, hashContent, countWords, detectTextLanguage } from './content-extractor'
import { createLogger } from '@/lib/logger'

const log = createLogger('IORT:Codes')

// Re-exports pour compatibilité
export { IORT_SITEIORT_URL, generateCodeSectionUrl } from './iort-text-utils'

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
  // Codes ajoutés Mars 2026 (détectés dans looper A1 mais non mappés)
  'دستور الجمهورية التونسية':                                  'Constitution de la République Tunisienne',
  'مجلة إسداء الخدمات المالية لغير المقيمين':                  'Code des Services Financiers aux Non-Résidents',
  'مجلة الموانئ البحرية':                                      'Code des Ports Maritimes',
  'مجلة الصرف و التجارة الخارجية':                            'Code des Changes et du Commerce Extérieur',
  'مجلة معاليم التسجيل والطابع الجبائي':                      'Code des Droits d\'Enregistrement et de Timbre',
  'مجلة الحقوق والإجراءات الجبائية':                          'Code des Droits et Procédures Fiscaux',
  'مجلة المياه':                                               'Code des Eaux',
  'مجلة تشجيع الإستثمارات':                                   'Code d\'Incitation aux Investissements',
  'مجلة الواجبات المهنية للمهندسين المعماريين':               'Code de Déontologie des Architectes',
  'المجلة التأديبية والجزائية البحرية':                        'Code Disciplinaire et Pénal de la Marine',
  'مجلة المحروقات':                                            'Code des Hydrocarbures',
  'مجلة تنطيم الصناعة السينمائية':                            'Code de l\'Organisation de l\'Industrie Cinématographique',
  'مجلة المناجم':                                              'Code Minier',
  'مجلة مؤسسات التوظيف الجماعي':                             'Code des Organismes de Placement Collectif',
  'مجلة الصياد البحري':                                        'Code de la Pêche Maritime',
  'مجلة التنظيم الإداري للملاحة البحرية':                     'Code de l\'Organisation Administrative de la Navigation Maritime',
  'مجلة البريد':                                               'Code de la Poste',
  'مجلة الصحافة':                                              'Code de la Presse',
  'مدونة سلوك وأخلاقيات العون العمومي':                       'Code de Conduite et d\'Éthique de l\'Agent Public',
  // 9 codes supplémentaires découverts dans looper A1 (Mars 2026)
  'مجلة السلامة والوقاية من أخطار الحريق والانفجار والفزع بالبنايات': 'Code de Sécurité et Protection contre les Risques d\'Incendie',
  'مجلة التهيئة الترابية والتعمير':                           'Code de l\'Aménagement du Territoire et de l\'Urbanisme',
  'مجلة التحكيم':                                              'Code de l\'Arbitrage',
  'مجلة التأمين':                                              'Code des Assurances',
  'مجلة الجباية المحلية':                                      'Code de la Fiscalité Locale',
  'مجلة الجنسية':                                              'Code de la Nationalité',
  'مجلة الشغل البحري':                                         'Code du Travail Maritime',
  'مجلة الطيران المدني':                                       'Code de l\'Aviation Civile',
  'مجلة الأوسمة':                                              'Code des Décorations',
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

// sleep, generateCodeSectionUrl, isPdfUrl, cleanText, isNavigationBoilerplate
// — importés depuis iort-text-utils.ts

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

  // Stratégie 1 : URL directe (timeout court — URL de session expire souvent)
  log.info('Navigation directe vers page listing codes...')
  try {
    await page.goto(CODES_LISTING_URL, {
      waitUntil: 'load',
      timeout: 15000,
    })
    await sleep(2500)

    const a1Direct = await page.evaluate(() =>
      document.querySelectorAll('div[id^="A1_"]').length,
    )

    if (a1Direct > 0) {
      log.info(`OK (URL directe) — ${a1Direct} codes dans le looper A1`)
      return
    }
  } catch {
    log.info('URL directe timeout/erreur, fallback menu...')
  }

  // Stratégie 2 : navigation via menu M24 + M180 (toujours fiable)
  log.info('Navigation via menu homepage...')
  await page.goto(IORT_SITEIORT_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(2500)

  log.info(`_JCL(${NAV_STEP1_JCL})...`)
  await page.evaluate((menuId: string) => {
    // @ts-expect-error WebDev
    _JCL(clWDUtil.sGetPageActionIE10() + '?' + menuId, '_self', '', '')
  }, NAV_STEP1_JCL)
  await page.waitForLoadState('load')
  await sleep(2500)

  log.info(`_JEM(${NAV_STEP2_JEM})...`)
  await page.evaluate((menuId: string) => {
    // @ts-expect-error WebDev
    _JEM(menuId, '_self', '', '')
  }, NAV_STEP2_JEM)
  await page.waitForLoadState('load')
  await sleep(3000)

  log.info(`URL après navigation: ${page.url()}`)

  const a1Count = await page.evaluate(() =>
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
  log.info(`OK (menu fallback) — ${a1Count} codes dans le looper A1`)
}

/**
 * Parse la liste des codes depuis le looper A1 (PAGE_Production / PAGE_PageDernierParu).
 * Chaque div#A1_N contient le nom du code + un bouton "اطلاع".
 * Le nom du code = texte du div sans le suffixe " اطلاع".
 */
export async function parseAvailableCodes(page: Page): Promise<IortCode[]> {
  log.info('Parsing des codes (looper A1)...')

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
    log.info(`${looperData.length} codes dans le looper A1`)
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
  log.warn('⚠️  Looper A1 vide. Page info:', JSON.stringify(discovery, null, 2))
  return []
}

/**
 * Clique sur le bouton "اطلاع" du code dans le looper A1
 * pour naviguer vers PAGE_NavigationCode (table des matières).
 */
export async function selectCodeAndNavigate(page: Page, code: IortCode): Promise<void> {
  const looperId = code.looperId ?? 'A1'
  log.info(`Clic "اطلاع" sur: "${code.name}" (${looperId}_${code.selectIndex})`)

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
    log.info(`URL après clic: ${url}`)
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
  log.warn(`Fallback WebDev A1=${code.selectIndex}...`)
  await page.evaluate((idx: number) => {
    // @ts-expect-error WebDev
    if (_PAGE_.A1) _PAGE_.A1.value = idx
    // @ts-expect-error WebDev
    _JSL(_PAGE_, 'A17', '_self', '', '')
  }, code.selectIndex)
  await page.waitForLoadState('load')
  await sleep(3000)

  const url = page.url()
  log.info(`URL après navigation: ${url}`)
}

// =============================================================================
// TABLE DES MATIÈRES (PAGE_NavigationCode)
// =============================================================================

/** Loopers à ignorer dans la détection de changements (navigation/A1, etc.) */
const IGNORED_LOOPER_PREFIXES = new Set(['A1', 'M1', 'M2'])

/** Loopers à exclure lors de la recherche de contenu inline */
const TOC_LOOPER_PREFIXES = new Set(['A1', 'A2', 'A4', 'B2', 'B4', 'C2', 'C4', 'D2', 'D4', 'E4', 'M18', 'M78', 'M110', 'M81', 'M59'])

/**
 * Clique sur un item de looper via Playwright real click (mouse events réels).
 * Le clic JS via page.evaluate() ne déclenche pas les handlers WebDev correctement.
 */
async function clickLooperItem(page: Page, looperId: string, resultIndex: number): Promise<boolean> {
  const divSelector = `div#${looperId}_${resultIndex}`
  try {
    // Essaie d'abord le lien/bouton à l'intérieur (réel mouse click via Playwright)
    const linkHandle = await page.$(`${divSelector} a, ${divSelector} [onclick], ${divSelector} input[type="button"]`)
    if (linkHandle) {
      await linkHandle.click({ force: true }).catch(() => {})
      return true
    }
    const divHandle = await page.$(divSelector)
    if (divHandle) {
      await divHandle.click({ force: true }).catch(() => {})
      return true
    }
  } catch {
    // fallback JS click
    await page.evaluate((sel) => {
      const div = document.querySelector(sel) as HTMLElement | null
      if (div) div.click()
    }, divSelector)
  }
  return false
}

/** Retourne le nombre d'items de chaque looper présent dans la page */
async function snapshotLoopers(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counts: Record<string, number> = {}
    for (const el of document.querySelectorAll('[id]')) {
      const m = el.id.match(/^([A-Z]\d+)_(\d+)$/)
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1
    }
    return counts
  })
}

/**
 * Expansion générique du TOC lazy-loaded basée sur diff de loopers.
 *
 * Deux cas détectés :
 * 1. Drill-down : cliquer A2_N change A2 lui-même (même looper, items différents)
 * 2. Expansion classique : cliquer A4_N charge B4 (looper différent apparaît/grossit)
 *
 * Après chaque clic, compare snapshot avant/après pour trouver quel looper a changé.
 */
async function expandTocHierarchy(
  page: Page,
  startPrefix: string,
  topItems: IortTocItem[],
  currentDepth = 0,
): Promise<IortTocItem[]> {
  if (currentDepth >= 4) return topItems  // sécurité anti-boucle
  if (topItems.length === 0) return topItems

  // Snapshot de référence (état initial du looper de départ)
  const initialItems = await extractLooperItems(page, startPrefix)
  const initialKeys = new Set((initialItems ?? []).map(x => x.text.substring(0, 30)))

  const allItems: IortTocItem[] = []

  for (const item of topItems) {
    const before = await snapshotLoopers(page)

    await clickLooperItem(page, startPrefix, item.resultIndex)
    await sleep(1000)

    const after = await snapshotLoopers(page)

    // Trouver le looper avec la plus forte variation absolue
    // Inclure startPrefix pour détecter drill-down (A2 se modifie lui-même)
    let bestPrefix: string | null = null
    let bestChange = 0
    for (const [pfx, count] of Object.entries(after)) {
      if (IGNORED_LOOPER_PREFIXES.has(pfx)) continue
      const beforeCount = before[pfx] ?? 0
      const change = Math.abs(count - beforeCount)
      if (change > bestChange) {
        bestChange = change
        bestPrefix = pfx
      }
    }

    if (!bestPrefix || bestChange < 2) {
      // Aucun looper n'a changé → cet item est une feuille (article réel)
      allItems.push(item)
      continue
    }

    // Cas drill-down : startPrefix s'est modifié lui-même
    if (bestPrefix === startPrefix) {
      const newItems = await extractLooperItems(page, startPrefix)
      if (!newItems || newItems.length < 2) {
        allItems.push(item)
        continue
      }

      // Vérifier que le contenu a vraiment changé (pas seulement le count)
      const newKeys = new Set(newItems.map(x => x.text.substring(0, 30)))
      const hasNewContent = [...newKeys].some(k => !initialKeys.has(k))

      if (!hasNewContent) {
        // Même contenu → feuille
        allItems.push(item)
        continue
      }

      log.info(`Drill-down ${startPrefix}: clic sur "${item.title.substring(0, 35)}" → ${newItems.length} sous-items`,
      )

      const subItems: IortTocItem[] = newItems.map(x => ({
        title: x.text,
        resultIndex: x.index,
        depth: item.depth + 1,
        looperId: startPrefix,
        onclick: x.onclick || undefined,
      }))

      if (subItems.length < 15) {
        const deeper = await expandTocHierarchy(page, startPrefix, subItems, currentDepth + 1)
        allItems.push(...deeper)
      } else {
        allItems.push(...subItems)
      }
      continue
    }

    // Cas expansion classique : un autre looper a grossi
    const subRaw = await extractLooperItems(page, bestPrefix)
    if (!subRaw || subRaw.length < 2) {
      allItems.push(item)
      continue
    }

    log.info(`${item.title.substring(0, 40)}: ${subRaw.length} sous-items dans ${bestPrefix}`,
    )

    const subItems: IortTocItem[] = subRaw.map(x => ({
      title: x.text,
      resultIndex: x.index,
      depth: item.depth + 1,
      looperId: bestPrefix!,
      onclick: x.onclick || undefined,
    }))

    if (subItems.length < 15) {
      const deeper = await expandTocHierarchy(page, bestPrefix!, subItems, currentDepth + 1)
      allItems.push(...deeper)
    } else {
      allItems.push(...subItems)
    }
  }

  return allItems
}

/**
 * Sur PAGE_CodesJuridiques, tente de trouver un looper "parent" qui contrôle
 * le looper primaire (ex: M3 contrôle A2 — M3 = livres, A2 = articles du livre sélectionné).
 * Retourne les items collectés en itérant sur le looper parent.
 */
async function expandViaParentLooper(
  page: Page,
  childPrefix: string,
  childItems: IortTocItem[],
): Promise<IortTocItem[]> {
  // Snapshot initial de childPrefix
  const initialChildCount = childItems.length
  const initialChildKeys = new Set(childItems.map(x => x.title.substring(0, 30)))

  // Chercher tous les autres loopers disponibles (sans filtre arabe pour les candidats)
  const snapshot = await snapshotLoopers(page)
  const candidates = Object.keys(snapshot).filter(
    pfx => pfx !== childPrefix && pfx !== 'A1' && !IGNORED_LOOPER_PREFIXES.has(pfx) && snapshot[pfx] >= 2,
  )
  log.debug(`expandViaParentLooper candidates: ${candidates.join(', ')} (childPrefix=${childPrefix})`)

  for (const parentPrefix of candidates) {
    // Récupérer items sans filtre arabe (navigation peut être non-arabe)
    const parentRaw = await page.evaluate((pfx) => {
      const els = Array.from(document.querySelectorAll(`div[id^="${pfx}_"]`))
      return els.map(el => {
        const idMatch = el.id.match(/(\d+)$/)
        const index = idMatch ? parseInt(idMatch[1], 10) : 0
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
        const link = el.querySelector('a, [onclick]') as HTMLElement | null
        const onclick = link?.getAttribute('onclick') || ''
        return { index, text: text.substring(0, 200), depth: 0, onclick }
      }).filter(x => x && x.index > 0)
    }, parentPrefix) as Array<{ index: number; text: string; depth: number; onclick: string }>

    if (!parentRaw || parentRaw.length < 1) continue

    log.info(`Test parent ${parentPrefix} (${parentRaw.length} items): ${parentRaw.map(x => x.text.substring(0, 20)).join(' | ')}`,
    )

    // Tester chaque item parent pour détecter celui qui change childPrefix
    type RawItem = { index: number; text: string; depth: number; onclick: string }
    let triggerChildItems: RawItem[] | null = null
    let triggerParentIdx = -1

    for (let pi = 0; pi < parentRaw.length; pi++) {
      await clickLooperItem(page, parentPrefix, parentRaw[pi].index)
      await sleep(1000)

      const afterChild = await extractLooperItems(page, childPrefix)
      const afterCount = afterChild?.length ?? 0
      const afterKeys = new Set((afterChild ?? []).map(x => x.text.substring(0, 30)))
      const changed = afterCount !== initialChildCount ||
        [...afterKeys].some(k => !initialChildKeys.has(k))

      if (changed) {
        triggerChildItems = afterChild ?? null
        triggerParentIdx = pi
        log.info(`Parent ${parentPrefix}[${parentRaw[pi].index}] ("${parentRaw[pi].text.substring(0, 25)}") → ${childPrefix}: ${initialChildCount}→${afterCount}`,
        )
        break
      }
    }

    if (!triggerChildItems || triggerParentIdx < 0) continue

    // parentPrefix contrôle childPrefix → itérer sur tous les items parent restants
    log.info(`${parentPrefix} contrôle ${childPrefix} — expansion complète...`)
    const allItems: IortTocItem[] = []

    // Items du parent trigger (déjà chargés)
    allItems.push(...triggerChildItems.map(x => ({
      title: x.text,
      resultIndex: x.index,
      depth: 1,
      looperId: childPrefix,
      onclick: x.onclick || undefined,
    })))

    // Itérer sur les items restants du parent
    for (let pi = 0; pi < parentRaw.length; pi++) {
      if (pi === triggerParentIdx) continue  // déjà traité
      await clickLooperItem(page, parentPrefix, parentRaw[pi].index)
      await sleep(1000)

      const items = await extractLooperItems(page, childPrefix)
      if (!items || items.length < 2) continue

      allItems.push(...items.map(x => ({
        title: x.text,
        resultIndex: x.index,
        depth: 1,
        looperId: childPrefix,
        onclick: x.onclick || undefined,
      })))
    }

    log.info(`${parentPrefix}→${childPrefix}: ${allItems.length} items total`)
    return allItems
  }

  return []  // Aucun parent trouvé
}

/**
 * Extrait le contenu du panneau droit (zone de contenu inline) après un clic TOC.
 * Cherche le div non-TOC le plus large contenant du texte arabe.
 */
async function extractInlineContent(page: Page): Promise<string | null> {
  const content = await page.evaluate((excluded: string[]) => {
    const excludedSet = new Set(excluded)
    const results: { id: string; text: string }[] = []

    for (const el of document.querySelectorAll('div[id]')) {
      const m = el.id.match(/^([A-Z]\d+)_1$/)
      if (!m || excludedSet.has(m[1])) continue
      const text = (el.textContent || '').trim()
      if (text.length > 150 && /[\u0600-\u06FF]{20,}/.test(text)) {
        results.push({ id: el.id, text: text.substring(0, 5000) })
      }
    }
    return results.sort((a, b) => b.text.length - a.text.length)
  }, Array.from(TOC_LOOPER_PREFIXES))

  for (const { text } of content) {
    const c = cleanText(text)
    if (!isNavigationBoilerplate(c) && c.length > 100) return c
  }
  return null
}

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
  log.info('Parsing table des matières...')

  // Stratégie 1 : loopers standards PAGE_NavigationCode (A4, B4, C4, D4, E4)
  // Collecter TOUS les loopers non-vides et préférer celui avec le plus d'items
  // (typiquement C4/D4 = sections/articles) plutôt que A4 (chapitres/livres, trop haut niveau)
  const standardLooperData: { prefix: string; items: IortTocItem[] }[] = []
  for (const prefix of ['A4', 'B4', 'C4', 'D4', 'E4']) {
    const items = await extractLooperItems(page, prefix)
    if (items && items.length > 0) {
      log.info(`Looper ${prefix} → ${items.length} items`)
      standardLooperData.push({
        prefix,
        items: items.map(item => ({
          title: item.text,
          resultIndex: item.index,
          depth: item.depth,
          looperId: prefix,
          onclick: item.onclick || undefined,
        })),
      })
    }
  }
  if (standardLooperData.length > 0) {
    // Préférer le looper avec le plus d'items dans la plage 5-300 (granularité section/article)
    // Si tous sont < 5 items, prendre le plus grand quand même
    const best =
      standardLooperData.find(l => l.items.length >= 5 && l.items.length <= 300) ??
      standardLooperData.reduce((a, b) => (a.items.length >= b.items.length ? a : b))
    log.info(`Looper retenu: ${best.prefix} (${best.items.length} sections)`)

    // Si peu d'items (TOC lazy-loaded), tenter l'expansion hiérarchique
    // Un code juridique avec < 15 items est forcément au niveau livre/chapitre, pas article
    if (best.items.length < 15) {
      log.info('TOC superficielle — expansion hiérarchique (lazy-load)...')
      try {
        const expanded = await expandTocHierarchy(page, best.prefix, best.items)
        if (expanded.length > best.items.length) {
          log.info(`Expansion: ${best.items.length} → ${expanded.length} items`)
          return expanded
        }
      } catch (err) {
        log.warn('Expansion hiérarchique échouée:', err)
      }
    }

    return best.items
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
        log.info(`${prefix}: ${rawItems.length} items, ${arabicItems.length} arabes — ${rawItems.map(i => i.text.substring(0, 25)).join(' | ')}`)
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

  log.info(`Découverte loopers: ${discoveredLoopers.join(', ')}`)

  for (const prefix of discoveredLoopers) {
    const items = await extractLooperItems(page, prefix)
    if (items && items.length >= 2) {
      log.info(`Looper découvert ${prefix} → ${items.length} items arabes`)
      const tocItems = items.map(item => ({
        title: item.text,
        resultIndex: item.index,
        depth: item.depth,
        looperId: prefix,
        onclick: item.onclick || undefined,
      }))

      // Expansion hiérarchique si le looper découvert a peu d'items (TOC lazy-loaded)
      if (tocItems.length < 15) {
        log.info(`${prefix} superficiel (${tocItems.length} items) — expansion...`)
        try {
          // Stratégie A : expansion directe (drill-down ou looper suivant)
          const expanded = await expandTocHierarchy(page, prefix, tocItems)
          if (expanded.length > tocItems.length) {
            log.info(`Expansion directe ${prefix}: ${tocItems.length} → ${expanded.length} items`)
            return expanded
          }

          // Stratégie B : looper parent qui contrôle ce looper (ex: M3 → A2)
          const viaParent = await expandViaParentLooper(page, prefix, tocItems)
          if (viaParent.length > tocItems.length) {
            log.info(`Expansion via parent: ${tocItems.length} → ${viaParent.length} items`)
            return viaParent
          }
        } catch (err) {
          log.warn('Expansion looper découvert échouée:', err)
        }
      }

      return tocItems
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
    log.info(`${linkItems.length} liens de sections trouvés`)
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
  log.warn('⚠️  TOC vide. Page state:', JSON.stringify(pageState, null, 2))
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
  // ─── Fast path : lire directement le textContent du div looper ──────────────
  // Sur PAGE_CodesJuridiques (looper A2), le texte de l'article EST inline dans le div.
  // extractInlineContent() exclut A2 → on lit directement sans clic.
  // Pour A2 : toujours utiliser inline (même texte court) pour éviter popup incorrecte.
  // Pour autres loopers : seulement si > 100 chars (les titres TOC A4/B4/C4 font < 100).
  const inlineText = await page.evaluate((sel: string) => {
    const div = document.querySelector(sel)
    return (div?.textContent || '').trim()
  }, `div#${item.looperId}_${item.resultIndex}`)
  if (item.looperId === 'A2') {
    // PAGE_CodesJuridiques : texte inline = contenu article, retourner directement
    if (inlineText && inlineText.length > 15) {
      const cleaned = cleanText(inlineText)
      if (cleaned.length > 10) return cleaned
    }
    return null  // A2 vide → pas de fallback popup (popup montre toujours article 1)
  }
  if (inlineText && inlineText.length > 100) {
    const cleaned = cleanText(inlineText)
    if (!isNavigationBoilerplate(cleaned) && cleaned.length > 80) return cleaned
  }

  // Boutons WebDev standard (fallback uniquement)
  const isStandardLooper = /^[A-E]4$/.test(item.looperId)
  const looperViewBtn = isStandardLooper ? item.looperId.replace('4', '17') : 'A17'
  const viewButtons = isStandardLooper
    ? [looperViewBtn, 'A17'].filter((v, i, a) => a.indexOf(v) === i)
    : ['A17', 'M17', 'A7', 'M7', 'B17']

  // Helper : nettoyer les popups orphelines
  const closeOrphans = async () => {
    try {
      for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => {})
    } catch { /**/ }
  }

  await closeOrphans()

  // ─── Stratégie 0 : clic Playwright réel sur le lien de l'item TOC ─────────────
  // Le clic réel sélectionne l'item correctement (vs _PAGE_.value = idx qui échoue).
  // Le site ouvre soit une popup, soit met à jour un panneau inline.
  try {
    const divSelector = `div#${item.looperId}_${item.resultIndex}`
    const linkHandle = await page.$(divSelector + ' a')

    if (linkHandle) {
      const href = await linkHandle.getAttribute('href') || ''
      if (!isPdfUrl(href)) {
        // Attendre popup avec timeout court — si pas de popup → contenu inline
        const popupPromise = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null)
        await linkHandle.click()
        const popup = await popupPromise

        if (popup) {
          await popup.waitForLoadState('load')
          await sleep(700)
          if (isPdfUrl(popup.url())) {
            log.info(`PDF ignoré: ${popup.url()}`)
            await popup.close()
            return null
          }
          const text = await extractTextFromPage(popup)
          await popup.close()
          if (text && text.length > 80 && !isNavigationBoilerplate(text)) return text
        } else {
          // Pas de popup → contenu potentiellement mis à jour inline
          await sleep(800)
          const text = await extractInlineContent(page)
          if (text && text.length > 80 && !isNavigationBoilerplate(text)) return text
        }
      }
    }
  } catch { /**/ }

  await closeOrphans()

  // ─── Stratégie 1 : onclick stocké → _JSL direct ──────────────────────────────
  if (item.onclick && item.onclick.includes('_JSL')) {
    const jslMatch = item.onclick.match(/_JSL\s*\([^,]+,\s*'(\w+)'\s*,\s*'([^']*)'/)
    if (jslMatch) {
      const [, btnId, _target] = jslMatch
      try {
        const [detailPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 10000 }),
          page.evaluate(([idx, looperId, btn]: [number, string, string]) => {
            // @ts-expect-error WebDev
            const formField = _PAGE_[looperId]
            if (formField) formField.value = idx
            // @ts-expect-error WebDev
            _JSL(_PAGE_, btn, '_blank', '', '')
          }, [item.resultIndex, item.looperId, btnId] as [number, string, string]),
        ])
        await detailPage.waitForLoadState('load')
        await sleep(800)
        if (isPdfUrl(detailPage.url())) { await detailPage.close(); return null }
        const text = await extractTextFromPage(detailPage)
        await detailPage.close()
        if (text && text.length > 80 && !isNavigationBoilerplate(text)) return text
      } catch { /* fallback */ }
    }
  }

  await closeOrphans()

  // ─── Stratégie 2 : _JSL(_blank) avec chaque bouton view ─────────────────────
  for (const btn of viewButtons) {
    try {
      const [detailPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 10000 }),
        page.evaluate(([idx, looperId, btnId]: [number, string, string]) => {
          // @ts-expect-error WebDev
          const formField = _PAGE_[looperId]
          if (formField) formField.value = idx
          // @ts-expect-error WebDev
          _JSL(_PAGE_, btnId, '_blank', '', '')
        }, [item.resultIndex, item.looperId, btn] as [number, string, string]),
      ])
      await detailPage.waitForLoadState('load')
      await sleep(800)
      if (isPdfUrl(detailPage.url())) {
        await detailPage.close()
        return null
      }
      const text = await extractTextFromPage(detailPage)
      await detailPage.close()
      if (text && text.length > 80 && !isNavigationBoilerplate(text)) return text
    } catch { /* pas de popup */ }
  }

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

  // Fallback : body nettoyé — supprimer les divs TOC connus avant extraction
  // pour éviter de capturer le panneau de navigation gauche d'iort.tn
  const fullText = await page.evaluate(() => {
    ;[
      'script', 'style', 'nav', 'header', 'footer', 'form[name="_WD_FORM_"]',
      // Supprimer les divs loopers TOC (panneau navigation gauche iort.tn)
      'div[id^="A4_"]', 'div[id^="B4_"]', 'div[id^="C4_"]',
      'div[id^="D4_"]', 'div[id^="E4_"]', 'div[id^="A1_"]',
      'div[id^="M18_"]', 'div[id^="M78_"]', 'div[id^="M110_"]',
      'div[id^="M81_"]', 'div[id^="M59_"]',
    ].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove())
    })
    return document.body?.innerText || document.body?.textContent || ''
  })

  return cleanText(fullText)
}

// =============================================================================
// SAUVEGARDE EN DB
// =============================================================================

/**
 * Charge en une seule query tous les url_hash des sections déjà crawlées pour ce code.
 * Permet un skip instantané (sans Playwright) des sections inchangées en re-crawl.
 */
async function loadExistingCodeSectionHashes(
  sourceId: string,
  codeName: string,
): Promise<Set<string>> {
  const result = await db.query(
    `SELECT url_hash FROM web_pages
     WHERE web_source_id = $1 AND structured_data->>'codeName' = $2`,
    [sourceId, codeName],
  )
  return new Set(result.rows.map((r: { url_hash: string }) => r.url_hash as string))
}

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
      await db.query(
        `UPDATE web_pages SET status = 'crawled', last_crawled_at = NOW() WHERE id = $1`,
        [row.id],
      )
      return { id: row.id as string, skipped: true, updated: false }
    }
    await db.query(
      `UPDATE web_pages SET extracted_text = $1, content_hash = $2, word_count = $3,
       status = 'crawled', updated_at = NOW(), last_crawled_at = NOW() WHERE id = $4`,
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
    log.error(`"${codeName}" non trouvé parmi:`, availableCodes.map(c => c.name))
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
    log.info('PAGE_CodesJuridiques détectée, attente chargement dynamique...')
    await waitForStableContent(page, { intervalMs: 2000, timeoutMs: 15000 })
    log.info(`URL après attente: ${page.url()}`)

    // 4a. Navigation 2-niveaux spécifique PAGE_CodesJuridiques
    // T-links → L1 (PAGE_NavigationCode) → T2 sub-links → L2 (td.Texte articles)
    await crawlCodesJuridiquesPage(page, session, sourceId, codeName, dryRun, stats)
    stats.elapsedMs = Date.now() - startTime
    log.info(`✅ Terminé "${codeName}": ` +
      `${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} sautés, ${stats.errors} erreurs ` +
      `en ${Math.round(stats.elapsedMs / 1000)}s`,
    )
    return stats
  }

  // 4. Parser la table des matières (passe l'URL capturée avant navigation éventuelle)
  const tocItems = await parseTocItems(page, urlAfterNav)
  stats.totalSections = tocItems.length
  log.info(`"${codeName}": ${tocItems.length} sections dans la TOC`)

  if (tocItems.length === 0) {
    throw new Error('[IORT Codes] TOC vide — vérifier la structure de PAGE_NavigationCode')
  }

  // Pré-charger les sections déjà en DB — skip instantané sans Playwright en re-crawl
  const existingHashes = dryRun ? new Set<string>() : await loadExistingCodeSectionHashes(sourceId, codeName)
  if (!dryRun) {
    log.info(`${existingHashes.size} sections déjà en DB sur ${tocItems.length} dans la TOC`)
  }

  // 5. Extraire le texte de chaque section
  for (const item of tocItems) {
    await session.tick()

    try {
      if (dryRun) {
        log.info(`  [DRY] ${' '.repeat(item.depth * 2)}${item.title.substring(0, 80)}`)
        stats.crawled++
        await sleep(200)
        continue
      }

      // Skip instantané si déjà en DB (évite toute navigation Playwright)
      const expectedHash = hashUrl(generateCodeSectionUrl(codeName, item.title))
      if (existingHashes.has(expectedHash)) {
        stats.skipped++
        continue
      }

      const textContent = await extractSectionText(page, item)

      if (!textContent || textContent.length < 20 || isNavigationBoilerplate(textContent)) {
        stats.skipped++
        log.info(`Texte vide/boilerplate: "${item.title.substring(0, 60)}"`)
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
        log.info(`↻ MAJ: ${item.title.substring(0, 70)}`)
      } else {
        stats.crawled++
        log.info(`✓ ${item.title.substring(0, 70)} (${textContent.length} chars)`)
      }

      // Jitter aléatoire (minDelay + 0-3s) + pause longue tous les 50 items
      const jitter = IORT_RATE_CONFIG.minDelay + Math.floor(Math.random() * 3000)
      await sleep(jitter)

      const processed = stats.crawled + stats.skipped + stats.updated + stats.errors
      if (processed > 0 && processed % 50 === 0) {
        log.info(`Pause anti-ban (${processed} items traités)...`)
        await sleep(15000)
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stats.errors++
      log.error(`Erreur section "${item.title.substring(0, 40)}":`, msg)

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
  log.info(`✅ Terminé "${codeName}": ` +
    `${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} sautés, ${stats.errors} erreurs ` +
    `en ${Math.round(stats.elapsedMs / 1000)}s`,
  )

  return stats
}

// ─── PAGE_CodesJuridiques : navigation 2-niveaux ─────────────────────────────

/**
 * Extrait tous les articles d'une page L2 via le looper A2 (td.Texte cells).
 * Gère la pagination WebDev du looper A2 (_JSL A2_SUI).
 *
 * Structure L2 : div#A2_1..A2_5 → td[id^="tzzrl_"] class="Texte padding" → texte article
 */
async function extractAllArticlesFromA2(page: Page): Promise<string | null> {
  const allTexts: string[] = []
  let pageNum = 1

  while (pageNum <= 200) { // sécurité anti-boucle
    const pageTexts = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll(
        'td.Texte, td[class~="Texte"], td[id^="tzzrl_"]',
      ))
      return cells
        .map(el => (el.textContent || '').trim())
        .filter(t => t.length > 5 && /[\u0600-\u06FF]/.test(t))
    })

    if (pageTexts.length > 0) allTexts.push(...pageTexts)

    // Vérifier s'il y a plus de pages (champ hidden _A2_TOTALREC vs nb items actuels)
    const pagination = await page.evaluate(() => {
      const occEl = document.querySelector('input[name="_A2_OCC"]') as HTMLInputElement | null
      const totalEl = document.querySelector('input[name="_A2_TOTALREC"]') as HTMLInputElement | null
      const currentItems = document.querySelectorAll('div[id^="A2_"]').length
      const occ = occEl ? parseInt(occEl.value, 10) : 5
      const total = totalEl ? parseInt(totalEl.value, 10) : currentItems
      // Chercher le bouton "suivant" du looper A2
      const nextBtn = document.querySelector(
        'input[name="A2_SUI"], img[onclick*="A2_SUI"], a[onclick*="A2_SUI"], ' +
        '[onclick*=\'"A2_SUI"\'], [onclick*="\'A2_SUI\'"]',
      ) as HTMLElement | null
      return { occ, total, currentItems, hasNext: !!nextBtn }
    })

    if (!pagination.hasNext || pageTexts.length === 0) break

    // Clic sur "suivant" A2
    await page.evaluate(() => {
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'A2_SUI', '_self', '', '')
    })
    await sleep(3000)
    pageNum++
  }

  if (allTexts.length === 0) return null
  const combined = allTexts.join('\n\n')
  const cleaned = cleanText(combined)
  return isNavigationBoilerplate(cleaned) ? null : cleaned
}

/**
 * Crawl spécifique pour PAGE_CodesJuridiques (مجلة الديوانة, etc.).
 *
 * Structure :
 *   1. Clic T-link[0] → L1 (PAGE_NavigationCode) pour découvrir les T2 sub-links
 *   2. Pour chaque T2 sub-link : navigation fraîche (PAGE_CodesJuridiques → T-link → L1 → T2[i] → L2)
 *      → évite le cache WebDev qui renvoie toujours la même L2 via goBack()
 *   3. L2 → extraire td.Texte (A2 looper avec pagination)
 *
 * Important : le clic T-link doit passer par page.evaluate() car les liens ne sont
 * pas "visibles" pour Playwright CDP (boundingBox = 0,0).
 */
async function crawlCodesJuridiquesPage(
  page: Page,
  session: IortSessionManager,
  sourceId: string,
  codeName: string,
  dryRun: boolean,
  stats: IortCodeCrawlStats,
): Promise<void> {
  log.info('PAGE_CodesJuridiques — navigation T-link → L1 → T2 → L2...')

  const _codesJuridiquesUrl = page.url()

  // ─── Phase 1 : découverte des T2 sub-links (clic T-link[0] → L1) ──────────
  const firstTLinkText = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('div[id^="T"] a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
    const el = links[0] as HTMLElement | null
    if (el) { el.click(); return (el.textContent || '').trim().substring(0, 60) }
    return null
  })

  if (!firstTLinkText) {
    log.warn('⚠️  Aucun T-link trouvé sur PAGE_CodesJuridiques')
    return
  }

  log.info(`T-link[0] (découverte): "${firstTLinkText}"`)
  await page.waitForLoadState('load')
  await waitForStableContent(page, { intervalMs: 1000, timeoutMs: 8000 })

  const l1Url = page.url()
  log.info(`L1 URL: ${l1Url.split('/').pop()}`)

  const t2Links = await page.evaluate(() => {
    const t2 = document.getElementById('T2')
    if (!t2) return []
    return Array.from(t2.querySelectorAll('a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      .map((a, i) => ({
        index: i,
        title: (a.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120),
      }))
  })

  log.info(`${t2Links.length} sous-sections T2 découvertes`)

  if (t2Links.length === 0) {
    // Fallback : structure COC / Code Pénal — div#T3 (arbre persistant, pas de T2)
    log.info('div#T2 absent — tentative div#T3 (structure COC/Code Pénal)')
    await crawlT3StructurePage(page, session, sourceId, codeName, dryRun, stats)
    return
  }

  stats.totalSections = t2Links.length

  // ─── Phase 2 : crawl de chaque T2 sub-link avec navigation fraîche ────────
  // On navigue directement vers l1Url (stable dans la session WebDev), puis on clique T2[i].
  // Évite le cache WebDev qui renvoie la même L2 lorsqu'on utilise goBack()
  for (const t2Link of t2Links) {
    // Ne pas appeler session.tick() ici : il navigue vers la page de recherche
    // (createContext + navigateToSearch) et ferme le contexte WebDev codes.
    // Le crawl des codes gère sa propre navigation — on incrémente juste le compteur.
    session.tickWithoutNavigation()

    // Navigation fraîche vers L1 (URL de session stable)
    await page.goto(l1Url, { waitUntil: 'load', timeout: 60000 })
    await sleep(2000)

    // Clic T2[i] → L2
    await page.evaluate((idx: number) => {
      const t2 = document.getElementById('T2')
      if (!t2) return
      const links = Array.from(t2.querySelectorAll('a'))
        .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = links[idx] as HTMLElement | null
      if (el) el.click()
    }, t2Link.index)

    await page.waitForLoadState('load')
    await waitForStableContent(page, { intervalMs: 1500, timeoutMs: 10000 })

    const l2Url = page.url()
    log.info(`T2[${t2Link.index}] "${t2Link.title.substring(0, 40)}" → L2: ${l2Url.split('/').pop()}`,
    )

    // Extraire tous les articles de L2 (A2 looper avec pagination)
    const articleText = await extractAllArticlesFromA2(page)

    if (articleText && articleText.length > 20) {
      if (dryRun) {
        log.info(`  [DRY] ${t2Link.title.substring(0, 80)} (${articleText.length} chars)`)
        stats.crawled++
      } else {
        try {
          const { skipped, updated } = await saveCodeSection(
            sourceId, codeName, t2Link.title, articleText, 1,
          )
          if (skipped) {
            stats.skipped++
          } else if (updated) {
            stats.updated++
            log.info(`↻ MAJ: ${t2Link.title.substring(0, 70)}`)
          } else {
            stats.crawled++
            log.info(`✓ ${t2Link.title.substring(0, 70)} (${articleText.length} chars)`)
          }
        } catch (err) {
          stats.errors++
          log.error(`Erreur save "${t2Link.title.substring(0, 40)}":`, err)
        }
      }
    } else {
      stats.skipped++
      log.info(`Texte vide: "${t2Link.title.substring(0, 60)}"`)
    }

    // Jitter aléatoire (3-6s) + pause longue tous les 50 items
    const jitter = IORT_RATE_CONFIG.minDelay + Math.floor(Math.random() * 3000)
    await sleep(jitter)

    const processed = stats.crawled + stats.skipped + stats.updated + stats.errors
    if (processed > 0 && processed % 50 === 0) {
      log.info(`Pause anti-ban (${processed} items traités)...`)
      await sleep(15000)
    }
  }
}

// ─── Structure T3 (COC, Code Pénal — pas de div#T2) ───────────────────────────

/**
 * Extrait le contenu textuel de div#A31_ (zone article des codes sans looper A2).
 * Utilisé pour les codes dont la structure est COC-style : arbre T3 + A31_ comme
 * zone de contenu mise à jour après clic d'un lien terminal.
 */
async function extractContentFromA31(page: Page): Promise<string | null> {
  const text = await page.evaluate(() => {
    const el = document.getElementById('A31_')
    if (!el) return null
    const raw = (el.textContent || '').trim().replace(/\s+/g, ' ')
    return raw.length > 100 ? raw : null
  })
  if (!text) return null
  const cleaned = cleanText(text)
  return isNavigationBoilerplate(cleaned) ? null : cleaned
}

/**
 * Crawl spécifique pour les codes dont la structure est arbre T3 (COC, Code Pénal…).
 *
 * Structure :
 *   PAGE_CodesJuridiques → clic T-link[0] → PAGE_NavigationCode (L1)
 *   L1 : div#T3 = arbre TOC complet (161 liens pour le COC)
 *        div#A31_ = zone de contenu article (se met à jour après clic T3 leaf)
 *
 * Stratégie :
 *   1. Récupérer tous les liens de div#T3 (nœuds parents + feuilles)
 *   2. Pour chaque lien, cliquer directement sur T3[i] (T3 reste visible après navigation)
 *   3. Extraire le contenu de div#A31_
 *   4. Dédupliquer par hash (nœuds parents = même contenu que leur premier enfant)
 */
async function crawlT3StructurePage(
  page: Page,
  session: IortSessionManager,
  sourceId: string,
  codeName: string,
  dryRun: boolean,
  stats: IortCodeCrawlStats,
): Promise<void> {
  const t3Links = await page.evaluate(() => {
    const t3 = document.getElementById('T3')
    if (!t3) return []
    return Array.from(t3.querySelectorAll('a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      .map((a, i) => ({
        index: i,
        title: (a.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120),
      }))
  })

  if (t3Links.length === 0) {
    log.warn('⚠️  T3 vide — structure inconnue, abandon')
    return
  }

  log.info(`${t3Links.length} liens T3 à parcourir (nœuds + feuilles)`)
  stats.totalSections = t3Links.length

  const seenHashes = new Set<string>()
  const l1Url = page.url()

  for (const t3Link of t3Links) {
    session.tickWithoutNavigation()

    // Clic sur T3[i] — T3 reste visible dans le panneau droit après navigation
    await page.evaluate((idx: number) => {
      const t3 = document.getElementById('T3')
      if (!t3) return
      const links = Array.from(t3.querySelectorAll('a'))
        .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = links[idx] as HTMLElement | null
      if (el) el.click()
    }, t3Link.index)

    await page.waitForLoadState('load')
    await waitForStableContent(page, { intervalMs: 1500, timeoutMs: 10000 })

    log.info(`T3[${t3Link.index}] "${t3Link.title.substring(0, 50)}"`)

    // Extraire le contenu de A31_ (zone article COC)
    const articleText = await extractContentFromA31(page)

    if (!articleText || articleText.length < 50) {
      stats.skipped++
      continue
    }

    // Dédupliquer — les nœuds parents affichent le même contenu que leur premier enfant
    const hash = hashContent(articleText.substring(0, 500))
    if (seenHashes.has(hash)) {
      stats.skipped++
      log.info(`  Doublon ignoré: "${t3Link.title.substring(0, 50)}"`)
      continue
    }
    seenHashes.add(hash)

    if (dryRun) {
      log.info(`  [DRY] ${t3Link.title.substring(0, 80)} (${articleText.length} chars)`)
      stats.crawled++
    } else {
      try {
        const { skipped, updated } = await saveCodeSection(
          sourceId, codeName, t3Link.title, articleText, 1,
        )
        if (skipped) {
          stats.skipped++
        } else if (updated) {
          stats.updated++
          log.info(`↻ MAJ: ${t3Link.title.substring(0, 70)}`)
        } else {
          stats.crawled++
          log.info(`✓ ${t3Link.title.substring(0, 70)} (${articleText.length} chars)`)
        }
      } catch (err) {
        stats.errors++
        log.error(`Erreur save "${t3Link.title.substring(0, 40)}":`, err)
      }
    }

    // Si T3 a disparu (rare), recharger L1
    const t3Still = await page.evaluate(() => !!document.getElementById('T3'))
    if (!t3Still) {
      log.info('T3 disparu — rechargement L1...')
      await page.goto(l1Url, { waitUntil: 'load', timeout: 60000 })
      await sleep(2000)
    }

    // Jitter anti-ban (3-6s)
    await sleep(IORT_RATE_CONFIG.minDelay + Math.floor(Math.random() * 3000))

    const processed = stats.crawled + stats.skipped + stats.updated + stats.errors
    if (processed > 0 && processed % 50 === 0) {
      log.info(`Pause anti-ban (${processed} items traités)...`)
      await sleep(15000)
    }
  }
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
  log.info(`Navigation M62 → codes+recueils (${language.toUpperCase()})...`)

  await page.goto(IORT_SITEIORT_URL, {
    waitUntil: 'load',
    timeout: IORT_RATE_CONFIG.navigationTimeout,
  })
  await sleep(3000)

  if (language === 'fr') {
    log.info('Activation langue FR (M32)...')
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
  log.info(`${count} items A1 après M62 (${language.toUpperCase()})`)
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
    log.warn('Aucun item A1 — M62 n\'a pas chargé la liste')
    return []
  }

  log.info(`${allItems.length} items A1 totaux (codes + recueils)`)

  // Filtrer les codes déjà connus (crawlés séparément via crawlCode)
  const knownCodeNames = new Set(Object.keys(IORT_KNOWN_CODES))
  const recueils = allItems.filter(item => {
    // Garder si le nom ne correspond à aucun code connu (correspondance partielle)
    return !Array.from(knownCodeNames).some(code => item.name.includes(code) || code.includes(item.name))
  })

  log.info(`${recueils.length} recueils après filtrage des codes connus`)
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
      log.warn(`Aucun recueil disponible (${lang.toUpperCase()}) — skip`)
      continue
    }

    const targets = recueilName
      ? available.filter(r => r.name.includes(recueilName))
      : available

    log.info(`${targets.length}/${available.length} recueils à crawler (${lang.toUpperCase()})`)

    for (const recueil of targets) {
      log.info(`→ "${recueil.name}" (index ${recueil.selectIndex}, ${lang.toUpperCase()})`)

      try {
        await selectCodeAndNavigate(page, recueil)
        await waitForStableContent(page, { intervalMs: 2000, timeoutMs: 15000 })

        const capturedUrl = page.url()
        const tocItems = await parseTocItems(page, capturedUrl)
        log.info(`${tocItems.length} sections dans "${recueil.name}"`)

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
            log.error(`Erreur section "${item.title}":`, err)
            stats.errors++
          }
        }
      } catch (err) {
        log.error(`Erreur recueil "${recueil.name}":`, err)
        stats.errors++
      }

      await navigateToRecueilPage(session, lang)
      page = session.getPage()
      await sleep(3000)
    }

    if (language === 'both' && lang === 'ar') {
      log.info('Pause entre AR et FR...')
      await sleep(5000)
    }
  }

  stats.elapsedMs = Date.now() - startTime
  log.info(`✅ Terminé: ` +
    `${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} sautés, ${stats.errors} erreurs ` +
    `en ${Math.round(stats.elapsedMs / 1000)}s`,
  )

  return stats
}

export { getOrCreateIortSource, getOrCreateIortSiteiortSource }
