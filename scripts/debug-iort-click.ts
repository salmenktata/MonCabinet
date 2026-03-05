#!/usr/bin/env tsx
/**
 * Debug: tester si le rechargement de page corrige les clics sur PAGE_CodesJuridiques
 *
 * Hypothèse: quand WebDev navigue en interne (AJAX), les event listeners
 * sur les <a> du TOC ne sont pas réinitialisés → les clics ne font rien.
 * Un page.reload() force la réinitialisation du JS et devrait corriger ça.
 *
 * Usage: npx tsx scripts/debug-iort-click.ts
 */

import { chromium } from 'playwright'

const SITEIORT = 'https://www.iort.tn/siteiort'
const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()

  console.log('\n=== Étape 1: Navigation vers siteiort ===')
  await page.goto(SITEIORT, { waitUntil: 'load', timeout: 30000 })
  await DELAY(3000)
  console.log('URL:', page.url())

  // Activer la section المجلات (M62)
  console.log('\n=== Étape 2: Navigation M62 (المجلات) ===')
  await page.evaluate(() => {
    // @ts-expect-error WebDev
    _JEM('M62', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await DELAY(5000)
  console.log('URL après M62:', page.url())

  // Compter les codes dans A1
  const a1Count = await page.evaluate(() =>
    document.querySelectorAll('div[id^="A1_"]').length,
  )
  console.log(`A1 count: ${a1Count}`)

  if (a1Count === 0) {
    console.error('Looper A1 vide — navigation échouée')
    await browser.close()
    return
  }

  // Trouver مجلة الديوانة dans A1
  const diouanaIdx = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div[id^="A1_"]'))
    for (const div of divs) {
      if ((div.textContent || '').includes('الديوانة')) {
        const m = div.id.match(/A1_(\d+)/)
        return m ? parseInt(m[1]) : null
      }
    }
    return null
  })
  console.log(`مجلة الديوانة index: ${diouanaIdx}`)

  if (!diouanaIdx) {
    console.error('مجلة الديوانة non trouvée')
    await browser.close()
    return
  }

  // Cliquer sur "اطلاع" pour الديوانة
  console.log('\n=== Étape 3: Clic اطلاع sur مجلة الديوانة ===')
  const clicked = await page.evaluate((idx: number) => {
    const div = document.querySelector(`div#A1_${idx}`)
    if (!div) return false
    const btn = div.querySelector('a, input[type="button"], [onclick]') as HTMLElement | null
    if (btn) { btn.click(); return true }
    return false
  }, diouanaIdx)
  console.log(`Clic: ${clicked}`)
  await page.waitForLoadState('load')
  await DELAY(12000)

  const urlAfterSelect = page.url()
  console.log('URL après sélection:', urlAfterSelect)
  console.log('PAGE_CodesJuridiques?', urlAfterSelect.includes('PAGE_CodesJuridiques'))

  // Analyser les liens TOC disponibles
  const tocLinks = await page.evaluate(() => {
    // Liens dans les zones T (TOC) - div#T1_, div#T2_, div#T3_, ...
    const tLinks = Array.from(document.querySelectorAll('div[id^="T"] a'))
    const arabicFilter = /[\u0600-\u06FF]/
    return {
      tLinksCount: tLinks.length,
      tLinksFirst5: tLinks.slice(0, 5).map(a => ({
        text: (a.textContent || '').trim().substring(0, 50),
        href: a.getAttribute('href'),
        onclick: a.getAttribute('onclick'),
        parentId: a.parentElement?.id || a.parentElement?.tagName,
      })),
      allLinksCount: document.querySelectorAll('a').length,
    }
  })
  console.log('\nTOC links analyse:', JSON.stringify(tocLinks, null, 2))

  // === TEST 1: Clic sans rechargement ===
  console.log('\n=== TEST 1: Clic direct (sans rechargement) ===')
  if (tocLinks.tLinksCount > 0) {
    const firstTitle = tocLinks.tLinksFirst5[0]?.text || ''
    const urlBefore = page.url()
    console.log(`Clic sur: "${firstTitle.substring(0, 40)}"`)
    console.log(`URL avant: ${urlBefore.substring(urlBefore.lastIndexOf('/') + 1)}`)

    // Méthode A: evaluate click
    await page.evaluate(() => {
      const tLinks = Array.from(document.querySelectorAll('div[id^="T"] a'))
      const el = tLinks.find(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      if (el) {
        console.log('[debug] click via evaluate:', el.textContent?.trim().substring(0, 30))
        ;(el as HTMLElement).click()
      }
    })
    await DELAY(5000)
    const urlAfterA = page.url()
    console.log(`Méthode A (evaluate click) → URL COMPLÈTE: ${urlAfterA}`)
    console.log(`Navigation: ${urlAfterA !== urlBefore ? 'OUI ✓' : 'NON ✗'}`)

    if (urlAfterA !== urlBefore) {
      await page.goBack()
      await page.waitForLoadState('load')
      await DELAY(3000)
    }
  }

  // === TEST 2: Clic avec Playwright locator ===
  console.log('\n=== TEST 2: Playwright locator click ===')
  {
    const urlBefore = page.url()
    const firstArabicLocator = page.locator('div[id^="T"] a').filter({ hasText: /[\u0600-\u06FF]/ }).first()
    const text = await firstArabicLocator.textContent().catch(() => null)
    console.log(`Clic locator sur: "${text?.trim().substring(0, 40)}"`)

    try {
      await firstArabicLocator.scrollIntoViewIfNeeded({ timeout: 3000 })
      await firstArabicLocator.click({ timeout: 8000 })
    } catch (e) {
      console.log(`Locator click error: ${e}`)
    }
    await DELAY(5000)
    const urlAfterB = page.url()
    console.log(`Méthode B (locator) → URL: ${urlAfterB.substring(urlAfterB.lastIndexOf('/') + 1)}`)
    console.log(`Navigation: ${urlAfterB !== urlBefore ? 'OUI ✓' : 'NON ✗'}`)

    if (urlAfterB !== urlBefore) {
      await page.goBack()
      await page.waitForLoadState('load')
      await DELAY(3000)
    }
  }

  // === TEST 3: Reload puis clic ===
  console.log('\n=== TEST 3: page.reload() puis clic ===')
  const urlBeforeReload = page.url()
  console.log(`URL avant reload: ${urlBeforeReload.substring(urlBeforeReload.lastIndexOf('/') + 1)}`)
  await page.reload({ waitUntil: 'load' })
  await DELAY(8000)
  const urlAfterReload = page.url()
  console.log(`URL après reload: ${urlAfterReload.substring(urlAfterReload.lastIndexOf('/') + 1)}`)
  console.log(`PAGE_CodesJuridiques maintenu: ${urlAfterReload.includes('PAGE_CodesJuridiques')}`)

  const tocLinksAfterReload = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div[id^="T"] a')).length,
  )
  console.log(`TOC links après reload: ${tocLinksAfterReload}`)

  {
    const urlBefore = page.url()
    const firstArabicLocator = page.locator('div[id^="T"] a').filter({ hasText: /[\u0600-\u06FF]/ }).first()
    const text = await firstArabicLocator.textContent().catch(() => null)
    console.log(`Clic après reload sur: "${text?.trim().substring(0, 40)}"`)

    try {
      await firstArabicLocator.scrollIntoViewIfNeeded({ timeout: 3000 })
      await firstArabicLocator.click({ timeout: 8000 })
    } catch (e) {
      console.log(`Click error après reload: ${e}`)
    }
    await DELAY(6000)
    const urlAfterC = page.url()
    console.log(`Méthode C (après reload) → URL: ${urlAfterC.substring(urlAfterC.lastIndexOf('/') + 1)}`)
    console.log(`Navigation: ${urlAfterC !== urlBefore ? 'OUI ✓' : 'NON ✗'}`)
    if (urlAfterC.includes('PAGE_NavigationCode')) {
      // Chercher le contenu dans div#A2_1
      const content = await page.evaluate(() => {
        const el = document.querySelector('div#A2_1')
        return el ? (el.textContent || '').trim().substring(0, 200) : 'div#A2_1 non trouvé'
      })
      console.log(`\n=== CONTENU ARTICLE ===\n${content}\n`)
    }
  }

  console.log('\n=== TEST 4: mouse.click() avec coordonnées ===')
  // Naviguer vers PAGE_CodesJuridiques si on a quitté
  if (!page.url().includes('PAGE_CodesJuridiques')) {
    await page.goBack()
    await page.waitForLoadState('load')
    await DELAY(3000)
  }
  {
    const urlBefore = page.url()

    const coords = await page.evaluate(() => {
      const tLinks = Array.from(document.querySelectorAll('div[id^="T"] a'))
        .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = tLinks[0] as HTMLElement | undefined
      if (!el) return null
      // Scroll d'abord
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent?.trim().substring(0, 40) }
    })
    if (coords) {
      await DELAY(500) // attendre le scroll
      console.log(`mouse.click à (${coords.x.toFixed(0)}, ${coords.y.toFixed(0)}) sur "${coords.text}"`)
      await page.mouse.click(coords.x, coords.y)
      await DELAY(6000)
      const urlAfterD = page.url()
      console.log(`Méthode D (mouse.click) → URL: ${urlAfterD.substring(urlAfterD.lastIndexOf('/') + 1)}`)
      console.log(`Navigation: ${urlAfterD !== urlBefore ? 'OUI ✓' : 'NON ✗'}`)
    } else {
      console.log('Pas de coordonnées trouvées')
    }
  }

  console.log('\n=== RÉSUMÉ ===')
  console.log('Laisser le navigateur ouvert 30s pour inspection manuelle...')
  await DELAY(30000)

  await browser.close()
  console.log('Terminé.')
}

main().catch(err => {
  console.error('Erreur:', err)
  process.exit(1)
})
