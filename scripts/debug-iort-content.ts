#!/usr/bin/env tsx
/**
 * Debug: inspecter le contenu de PAGE_NavigationCode après navigation depuis PAGE_CodesJuridiques
 * Objectif : comprendre pourquoi extractTextFromPage retourne "boilerplate"
 */

import { chromium } from 'playwright'

const SITEIORT = 'https://www.iort.tn/siteiort'
const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()

  // 1. Navigation vers la liste codes
  await page.goto(SITEIORT, { waitUntil: 'load', timeout: 30000 })
  await DELAY(3000)

  await page.evaluate(() => { /* @ts-expect-error */ _JEM('M62', '_self', '', '') })
  await page.waitForLoadState('load')
  await DELAY(5000)

  // 2. Clic sur مجلة الديوانة
  await page.evaluate(() => {
    const div = document.querySelector('div#A1_1')
    const btn = div?.querySelector('a, input[type="button"], [onclick]') as HTMLElement | null
    if (btn) btn.click()
  })
  await page.waitForLoadState('load')
  await DELAY(12000)

  console.log('URL PAGE_CodesJuridiques:', page.url())
  console.log('T-links:', await page.evaluate(() => document.querySelectorAll('div[id^="T"] a').length))

  // 3. Cliquer sur le PREMIER T-looper link (peu importe son type)
  const firstTLink = await page.evaluate(() => {
    const tLinks = Array.from(document.querySelectorAll('div[id^="T"] a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
    return tLinks[0] ? (tLinks[0].textContent || '').trim().substring(0, 60) : null
  })
  console.log('\nPremier T-link:', firstTLink)

  const urlBefore = page.url()
  console.log('Clic sur le premier T-link...')
  await page.evaluate(() => {
    const tLinks = Array.from(document.querySelectorAll('div[id^="T"] a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
    const el = tLinks[0] as HTMLElement | null
    if (el) el.click()
  })
  await page.waitForLoadState('load')
  await DELAY(15000) // attendre chargement asynchrone WebDev

  const currentUrl = page.url()
  console.log('URL avant clic:', urlBefore.split('/').slice(-1)[0])
  console.log('URL après clic:', currentUrl)
  console.log('Est sur PAGE_NavigationCode:', currentUrl.includes('PAGE_NavigationCode'))

  // 4. Analyser le contenu de PAGE_NavigationCode
  console.log('\n=== ANALYSE DE LA PAGE ===')
  const analysis = await page.evaluate(() => {
    const a2 = document.querySelector('div#A2_1')
    const allDivs = Array.from(document.querySelectorAll('div[id]')).filter(el => {
      const m = el.id.match(/^([A-Z]\d+)_1$/)
      return m !== null
    })

    return {
      url: location.href,
      title: document.title,
      'div#A2_1': a2 ? {
        exists: true,
        textLength: (a2.textContent || '').trim().length,
        text: (a2.textContent || '').trim().substring(0, 300),
      } : { exists: false },
      // Chercher aussi d'autres structures WebDev
      'specialDivs': ['nass', 'content', 'texte', 'article', 'A2', 'X1', 'contenu'].map(id => {
        const el = document.getElementById(id) || document.querySelector('.' + id) || document.querySelector('div#' + id)
        return el ? { id, len: (el.textContent || '').trim().length, text: (el.textContent || '').trim().substring(0, 100) } : null
      }).filter(Boolean),
      'allX_1divs': allDivs.map(el => ({
        id: el.id,
        textLength: (el.textContent || '').trim().length,
        textPreview: (el.textContent || '').trim().substring(0, 80),
        startsWithGovt: /^الجمهورية التونسية/.test((el.textContent || '').trim()),
      })).filter(d => d.textLength > 50),
      bodyFirstChars: (document.body.textContent || '').trim().substring(0, 200),
    }
  })

  console.log('URL:', analysis.url)
  console.log('Title:', analysis.title)
  console.log('\ndiv#A2_1:', JSON.stringify(analysis['div#A2_1'], null, 2))
  console.log('\nTous les X_1 divs avec contenu:')
  for (const d of analysis['allX_1divs']) {
    console.log(`  ${d.id}: ${d.textLength} chars, starts_govt=${d.startsWithGovt}, preview="${d.textPreview}"`)
  }
  console.log('\nBody (200 premiers chars):', analysis.bodyFirstChars)

  // 5. Inspecter toute la structure de la page
  console.log('\n=== STRUCTURE COMPLÈTE ===')
  await DELAY(5000)
  const structure = await page.evaluate(() => {
    const allIds = Array.from(document.querySelectorAll('[id]')).map(el => ({
      id: el.id,
      tag: el.tagName,
      textLen: (el.textContent || '').trim().length,
      hasArabic: /[\u0600-\u06FF]{10,}/.test(el.textContent || ''),
    })).filter(x => x.textLen > 100 && x.hasArabic).slice(0, 20)

    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
    }))

    return { allIds, iframes, totalTextLen: (document.body.textContent || '').trim().length }
  })
  console.log('Total body text:', structure.totalTextLen, 'chars')
  console.log('Iframes:', structure.iframes)
  console.log('Éléments avec contenu arabe:')
  structure.allIds.forEach(x => console.log(`  #${x.id} <${x.tag}>: ${x.textLen} chars`))

  console.log('\n=== CONTENU COMPLET DE #A31_ ===')
  const a31Full = await page.evaluate(() => {
    const el = document.getElementById('A31_')
    if (!el) return null
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
    return {
      len: text.length,
      // Afficher plusieurs tranches pour comprendre la structure
      slice0_500: text.substring(0, 500),
      slice2000_2500: text.substring(2000, 2500),
      slice5000_5500: text.substring(5000, 5500),
      slice10000_10500: text.substring(10000, 10500),
      // Compter les occurrences de الفصل N
      faslCount: (text.match(/الفصل\s+\d+/g) || []).length,
      madaCount: (text.match(/الفصل\s+\d+/g) || []).length,
      hasAtwila: text.includes('اطلاع'),
    }
  })
  console.log('A31_ structure:', JSON.stringify(a31Full, null, 2))

  // Trouver les liens dans T2 et voir s'ils sont cliquables
  console.log('\n=== LIENS DANS T2 ===')
  const t2Links = await page.evaluate(() => {
    const t2 = document.getElementById('T2')
    if (!t2) return []
    const links = Array.from(t2.querySelectorAll('a'))
    return links.slice(0, 10).map(a => ({
      text: (a.textContent || '').trim().substring(0, 50),
      href: a.getAttribute('href'),
      onclick: a.getAttribute('onclick'),
    }))
  })
  console.log('T2 links:', JSON.stringify(t2Links, null, 2))

  // Test: cliquer sur un T2 leaf item (الباب الأول) et voir si on obtient PAGE_NavigationCode avec A2 looper
  if (t2Links.length > 0) {
    console.log('\n=== TEST: Clic T2 "الباب الأول" ===')
    const urlBefore = page.url()
    await page.evaluate(() => {
      const t2 = document.getElementById('T2')
      if (!t2) return
      const links = Array.from(t2.querySelectorAll('a')).filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = links[1] as HTMLElement | null  // الباب الأول
      if (el) el.click()
    })
    await page.waitForLoadState('load')
    await DELAY(8000)

    const urlAfter = page.url()
    console.log('URL avant clic T2:', urlBefore.split('/').pop())
    console.log('URL après clic T2:', urlAfter)
    console.log('URL changée:', urlAfter !== urlBefore)

    // Vérifier si A2 looper avec articles existe maintenant
    const a2Check = await page.evaluate(() => {
      const a2_1 = document.getElementById('A2_1')
      const tzzrl = document.querySelectorAll('td[id^="tzzrl_"]')
      const tdTexte = document.querySelectorAll('td.Texte, td[class*="Texte"]')
      return {
        a2_1Exists: !!a2_1,
        a2_1Text: a2_1 ? (a2_1.textContent || '').trim().substring(0, 100) : null,
        tzzrlCount: tzzrl.length,
        tzzrlFirst: tzzrl.length > 0 ? (tzzrl[0].textContent || '').trim().substring(0, 100) : null,
        tdTexteCount: tdTexte.length,
        tdTexteFirst: tdTexte.length > 0 ? (tdTexte[0].textContent || '').trim().substring(0, 100) : null,
      }
    })
    console.log('Après clic T2:', JSON.stringify(a2Check, null, 2))
  }

  // Test: Essayer la recherche IORT pour les articles individuels
  console.log('\n=== TEST: Navigation vers la recherche المجلات ===')
  const searchUrl = page.url()
  // Naviguer vers le formulaire de recherche dans les mجلات
  await page.goto('https://www.iort.tn/siteiort', { waitUntil: 'load', timeout: 30000 })
  await DELAY(3000)
  await page.evaluate(() => {
    // @ts-expect-error WebDev
    _JEM('M63', '_self', '', '')  // M63 = بحث في المجلات (?)
  })
  await page.waitForLoadState('load')
  await DELAY(5000)
  const urlSearch = page.url()
  console.log('URL après M63:', urlSearch)
  const loopers = await page.evaluate(() => {
    return Array.from(new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
        .filter(Boolean),
    )).join(', ')
  })
  console.log('Loopers disponibles:', loopers)
  console.log('Page title:', await page.title())

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
