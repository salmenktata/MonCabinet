#!/usr/bin/env tsx
/**
 * Script d'exploration: cartographie la structure du site iort.tn
 *
 * Usage:
 *   npx tsx scripts/explore-iort-tn.ts
 *   npx tsx scripts/explore-iort-tn.ts --section codes
 *   npx tsx scripts/explore-iort-tn.ts --section constitution
 *   npx tsx scripts/explore-iort-tn.ts --section jort
 *
 * Produit:
 *   - tmp/iort-tn-exploration.json  : structure complète
 *   - tmp/iort-tn-*.png             : screenshots par section
 */

import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = 'https://www.iort.tn/siteiort'
const TMP_DIR = path.join(process.cwd(), 'tmp')

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--ignore-certificate-errors',
]

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface MenuEntry {
  id: string
  text: string
  jslTarget: string | null
  href: string | null
  type: 'menu' | 'link' | 'button'
}

interface PageStructure {
  url: string
  title: string
  menus: MenuEntry[]
  forms: Array<{
    name: string
    inputs: Array<{ name: string; type: string; options?: string[] }>
  }>
  loopers: string[]   // div[id^="X_"] ou [id^="A4_"]
  submitButtons: Array<{ id: string; text: string; jslId: string }>
  textContent: string
  hasSearchForm: boolean
  hasPagination: boolean
  pageCount: number
}

async function explorePage(page: import('playwright').Page, url: string, label: string): Promise<PageStructure> {
  console.log(`\n--- Explorer: ${label} ---`)
  console.log(`URL: ${url}`)

  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  await sleep(4000)

  const currentUrl = page.url()
  console.log(`URL effective: ${currentUrl}`)

  // Screenshot
  const screenshotPath = path.join(TMP_DIR, `iort-tn-${label.replace(/[^\w]/g, '-')}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`Screenshot: ${screenshotPath}`)

  // Analyser la structure
  const structure = await page.evaluate(() => {
    const result = {
      title: document.title,
      menus: [] as MenuEntry[],
      forms: [] as Array<{ name: string; inputs: Array<{ name: string; type: string; options?: string[] }> }>,
      loopers: [] as string[],
      submitButtons: [] as Array<{ id: string; text: string; jslId: string }>,
      allJSLCalls: [] as string[],
      allLinkTexts: [] as Array<{ text: string; href: string; onclick: string }>,
      bodyTextPreview: '',
    }

    result.title = document.title

    // Extraire tous les éléments cliquables avec _JSL
    document.querySelectorAll('[onclick*="_JSL"], a[href*="_JSL"]').forEach(el => {
      const onclick = el.getAttribute('onclick') || el.getAttribute('href') || ''
      const match = onclick.match(/_JSL\([^,]+,\s*['"]([^'"]+)['"]/)
      if (match) {
        const entry: MenuEntry = {
          id: el.getAttribute('id') || el.getAttribute('name') || '',
          text: (el as HTMLElement).textContent?.trim().substring(0, 100) || '',
          jslTarget: match[1],
          href: el.getAttribute('href') || null,
          type: el.tagName === 'A' ? 'link' : 'button',
        }
        result.menus.push(entry)
      }
    })

    // Extraire tous les links (pour menus non-JSL)
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || ''
      const onclick = a.getAttribute('onclick') || ''
      const text = a.textContent?.trim() || ''
      if (text.length > 2 && text.length < 200) {
        result.allLinkTexts.push({ text, href, onclick })
      }
    })

    // Formulaires
    document.querySelectorAll('form, [name]').forEach(form => {
      const formName = form.getAttribute('name') || form.id || ''
      const inputs: Array<{ name: string; type: string; options?: string[] }> = []

      form.querySelectorAll('input, select, textarea').forEach(input => {
        const inputName = input.getAttribute('name') || input.id || ''
        const inputType = input.tagName.toLowerCase() === 'select' ? 'select' : (input.getAttribute('type') || 'text')
        const entry: { name: string; type: string; options?: string[] } = { name: inputName, type: inputType }

        if (input.tagName.toLowerCase() === 'select') {
          const options: string[] = []
          input.querySelectorAll('option').forEach(opt => {
            const text = opt.textContent?.trim() || ''
            if (text) options.push(text)
          })
          if (options.length > 0) entry.options = options.slice(0, 20)
        }

        if (inputName) inputs.push(entry)
      })

      if (inputs.length > 0) {
        result.forms.push({ name: formName, inputs })
      }
    })

    // Loopers WebDev (div[id] avec pattern alphanumérique court)
    const looperPattern = /^([A-Z][0-9]+|[A-Z]{1,3}[0-9]{1,3})_\d+$/
    const loopers = new Set<string>()
    document.querySelectorAll('div[id], td[id], tr[id]').forEach(el => {
      const id = el.getAttribute('id') || ''
      const match = id.match(/^([A-Z][A-Z0-9]{0,4})_\d+$/)
      if (match) {
        loopers.add(match[1])
      }
    })
    result.loopers = Array.from(loopers)

    // Boutons de submit
    document.querySelectorAll('input[type="image"], input[type="submit"], button[onclick*="_JSL"], img[onclick*="_JSL"]').forEach(el => {
      const onclick = el.getAttribute('onclick') || ''
      const match = onclick.match(/_JSL\([^,]+,\s*['"]([^'"]+)['"]/)
      if (match) {
        result.submitButtons.push({
          id: el.getAttribute('id') || el.getAttribute('name') || '',
          text: (el as HTMLElement).title || el.getAttribute('alt') || match[1],
          jslId: match[1],
        })
      }
    })

    // Texte principal (500 premiers chars)
    result.bodyTextPreview = (document.body?.innerText || '').trim().substring(0, 500)

    return result
  })

  return {
    url: currentUrl,
    title: structure.title,
    menus: structure.menus,
    forms: structure.forms,
    loopers: structure.loopers,
    submitButtons: structure.submitButtons,
    textContent: structure.bodyTextPreview,
    hasSearchForm: structure.forms.some(f => f.inputs.some(i => i.type === 'select' && (i.options?.length || 0) > 3)),
    hasPagination: structure.menus.some(m => m.text.includes('>') || m.text.includes('>>') || m.jslTarget?.includes('A10')),
    pageCount: structure.loopers.length,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const sectionArg = args.includes('--section') ? args[args.indexOf('--section') + 1] : null

  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ar-TN',
    extraHTTPHeaders: { 'Accept-Language': 'ar-TN,ar;q=0.9,fr;q=0.7' },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  const exploration: Record<string, PageStructure> = {}

  try {
    // 1. Homepage
    if (!sectionArg || sectionArg === 'home') {
      const home = await explorePage(page, BASE_URL, 'home')
      exploration.home = home

      console.log('\n=== MENU PRINCIPAL (iort.tn) ===')
      console.log(`Titre: ${home.title}`)
      console.log(`\nÉléments cliquables (_JSL):`)
      for (const m of home.menus) {
        console.log(`  [${m.jslTarget}] "${m.text}"`)
      }
      console.log(`\nLoopers WebDev détectés: ${home.loopers.join(', ') || 'aucun'}`)
      console.log(`\nAperçu texte:\n${home.textContent.substring(0, 300)}`)
    }

    // 2. Naviguer vers chaque section du menu et explorer
    if (!sectionArg || sectionArg === 'nav') {
      const homePage = exploration.home || await explorePage(page, BASE_URL, 'home')
      exploration.home = homePage

      console.log('\n=== EXPLORATION DES SECTIONS MENU ===')

      // Cliquer sur chaque item de menu et capturer la page résultante
      const menuTargets = homePage.menus
        .filter(m => m.jslTarget && m.jslTarget.match(/^M\d+$/))
        .slice(0, 10) // max 10 menus

      for (const menuItem of menuTargets) {
        if (!menuItem.jslTarget) continue
        console.log(`\nNavigation vers menu ${menuItem.jslTarget}: "${menuItem.text}"`)

        // Recharger la homepage avant chaque navigation
        await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
        await sleep(3000)

        try {
          await page.evaluate((target) => {
            // @ts-expect-error WebDev
            if (typeof _JSL === 'function') _JSL(_PAGE_, target, '_self', '', '')
          }, menuItem.jslTarget)
          await page.waitForLoadState('load')
          await sleep(3000)

          const sectionUrl = page.url()
          const screenshot = path.join(TMP_DIR, `iort-tn-menu-${menuItem.jslTarget}.png`)
          await page.screenshot({ path: screenshot })

          const sectionHTML = await page.content()
          const title = await page.title()
          const loopers = await page.evaluate(() => {
            const s = new Set<string>()
            document.querySelectorAll('[id]').forEach(el => {
              const m = el.id.match(/^([A-Z][A-Z0-9]{0,4})_\d+$/)
              if (m) s.add(m[1])
            })
            return Array.from(s)
          })
          const textPreview = await page.evaluate(() => document.body?.innerText?.trim().substring(0, 200) || '')
          const currentUrl = page.url()

          console.log(`  → URL: ${currentUrl}`)
          console.log(`  → Titre: ${title}`)
          console.log(`  → Loopers: ${loopers.join(', ') || 'aucun'}`)
          console.log(`  → Texte: ${textPreview.substring(0, 150)}`)

          exploration[`menu_${menuItem.jslTarget}`] = {
            url: currentUrl,
            title,
            menus: [],
            forms: [],
            loopers,
            submitButtons: [],
            textContent: textPreview,
            hasSearchForm: false,
            hasPagination: false,
            pageCount: 0,
          }
        } catch (err) {
          console.warn(`  Erreur navigation ${menuItem.jslTarget}:`, (err as Error).message)
        }
      }
    }

    // 3. Section spécifique demandée
    if (sectionArg && sectionArg !== 'home' && sectionArg !== 'nav') {
      const sectionUrls: Record<string, string> = {
        codes: 'https://www.iort.tn/siteiort',       // explore puis nav vers codes
        constitution: 'https://www.iort.tn/siteiort', // explore puis nav vers constitution
        jort: 'https://www.iort.tn/siteiort',         // explore puis nav vers JORT
      }

      const baseUrl = sectionUrls[sectionArg] || BASE_URL
      const struct = await explorePage(page, baseUrl, sectionArg)
      exploration[sectionArg] = struct

      console.log(`\n=== SECTION: ${sectionArg} ===`)
      console.log(JSON.stringify(struct, null, 2))
    }

  } finally {
    await browser.close()
  }

  // Sauvegarder l'exploration
  const outputPath = path.join(TMP_DIR, 'iort-tn-exploration.json')
  fs.writeFileSync(outputPath, JSON.stringify(exploration, null, 2), 'utf-8')
  console.log(`\n✅ Exploration sauvegardée: ${outputPath}`)

  // Résumé
  console.log('\n=== RÉSUMÉ ===')
  for (const [key, data] of Object.entries(exploration)) {
    console.log(`\n[${key}] ${data.title}`)
    console.log(`  URL: ${data.url}`)
    if (data.menus.length > 0) {
      console.log(`  Menus JSL: ${data.menus.map(m => `${m.jslTarget}="${m.text.substring(0, 30)}"`).join(', ')}`)
    }
    if (data.loopers.length > 0) {
      console.log(`  Loopers: ${data.loopers.join(', ')}`)
    }
  }
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
