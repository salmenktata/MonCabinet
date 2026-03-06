#!/usr/bin/env tsx
/**
 * Debug: investiguer la structure HTML de PAGE_CodesJuridiques pour les codes
 * dont le div#T2 est absent sur L1 (ex : COC, Code Pénal).
 *
 * Usage:
 *   npx tsx scripts/debug-iort-coc.ts --code "مجلة الالتزامات والعقود"
 *   npx tsx scripts/debug-iort-coc.ts --code "مجلة الجزائية"
 *
 * Produit:
 *   tmp/<slug>-page-codes.png     : screenshot liste codes
 *   tmp/<slug>-l0.png             : screenshot PAGE_CodesJuridiques
 *   tmp/<slug>-l1.png             : screenshot après clic T-link
 *   tmp/<slug>-l1.html            : HTML complet de L1
 *   tmp/<slug>-structure.json     : résumé structuré
 */

import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright'

const SITEIORT = 'https://www.iort.tn/siteiort'
const TMP_DIR = path.join(process.cwd(), 'tmp')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const jitter = (base: number, extra: number) => sleep(base + Math.floor(Math.random() * extra))

function slugify(s: string): string {
  return s.replace(/[\u0600-\u06FF]/g, c => c.codePointAt(0)!.toString(16))
    .replace(/[^a-z0-9]/gi, '-')
    .substring(0, 40)
}

async function main() {
  const codeArg = process.argv.indexOf('--code')
  if (codeArg === -1 || !process.argv[codeArg + 1]) {
    console.error('Usage: npx tsx scripts/debug-iort-coc.ts --code "اسم المجلة"')
    process.exit(1)
  }
  const targetCode = process.argv[codeArg + 1]
  const slug = slugify(targetCode)

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

  console.log(`\n>>> Diagnostic IORT pour: "${targetCode}"`)
  console.log(`>>> Slug: ${slug}`)
  console.log('>>> Lancement du navigateur (headless: false pour debug visuel)...\n')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ar-TN',
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  try {
    // ─── Étape 1 : Accueil ──────────────────────────────────────────────────────
    console.log('[1] Navigation vers iort.tn...')
    await page.goto(SITEIORT, { waitUntil: 'load', timeout: 60000 })
    await jitter(4000, 2000)

    // ─── Étape 2 : Liste des codes (M62) ───────────────────────────────────────
    console.log('[2] Navigation vers la liste des codes (M62)...')
    await page.evaluate(() => { /* @ts-expect-error WebDev */ _JEM('M62', '_self', '', '') })
    await page.waitForLoadState('load')
    await jitter(6000, 3000)

    await page.screenshot({ path: path.join(TMP_DIR, `${slug}-page-codes.png`), fullPage: false })
    console.log(`    Screenshot: tmp/${slug}-page-codes.png`)

    // ─── Étape 3 : Trouver et cliquer le code cible dans le looper A1 ──────────
    console.log(`[3] Recherche de "${targetCode}" dans le looper A1...`)
    const codeEntry = await page.evaluate((target: string) => {
      const entries = Array.from(document.querySelectorAll('div[id^="A1_"]'))
      for (const div of entries) {
        const text = (div.textContent || '').trim()
        if (text.includes(target)) {
          return { id: div.id, text: text.substring(0, 80) }
        }
      }
      // Fallback : chercher dans tout le DOM
      const allWithTarget = Array.from(document.querySelectorAll('[id]'))
        .filter(el => (el.textContent || '').includes(target))
        .map(el => ({ id: el.id, text: (el.textContent || '').trim().substring(0, 80) }))
      return allWithTarget[0] ?? null
    }, targetCode)

    if (!codeEntry) {
      console.error(`    ERREUR : "${targetCode}" introuvable dans le DOM. Vérifier le nom exact.`)
      const allCodes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('div[id^="A1_"]'))
          .map(el => ({ id: el.id, text: (el.textContent || '').trim().substring(0, 80) }))
      )
      console.log('    Codes disponibles dans A1_N:')
      allCodes.forEach(c => console.log(`      ${c.id}: ${c.text}`))
      await browser.close()
      process.exit(1)
    }

    console.log(`    Trouvé: ${codeEntry.id} → "${codeEntry.text}"`)
    await jitter(1500, 1000)

    // Clic sur le bouton "اطلاع" dans ce div
    const clicked = await page.evaluate((divId: string) => {
      const div = document.getElementById(divId)
      if (!div) return false
      const btn = div.querySelector('a, input[type="button"], [onclick]') as HTMLElement | null
      if (btn) { btn.click(); return true }
      return false
    }, codeEntry.id)

    if (!clicked) {
      console.error(`    ERREUR : impossible de cliquer dans ${codeEntry.id}`)
      await browser.close()
      process.exit(1)
    }

    await page.waitForLoadState('load')
    await jitter(12000, 4000) // WebDev est lent, attendre le JS asynchrone

    // ─── Étape 4 : PAGE_CodesJuridiques ────────────────────────────────────────
    const l0Url = page.url()
    console.log(`\n[4] PAGE après clic code: ${l0Url.split('/').pop()}`)
    console.log(`    Est PAGE_CodesJuridiques: ${l0Url.includes('PAGE_CodesJuridiques')}`)

    await page.screenshot({ path: path.join(TMP_DIR, `${slug}-l0.png`), fullPage: true })
    console.log(`    Screenshot: tmp/${slug}-l0.png`)

    // Analyser les divs T présents sur PAGE_CodesJuridiques
    const l0TDivs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div[id^="T"]'))
        .map(el => ({
          id: el.id,
          hasLinks: el.querySelectorAll('a').length,
          arabicLinks: Array.from(el.querySelectorAll('a'))
            .filter(a => /[\u0600-\u06FF]/.test(a.textContent || '')).length,
          textPreview: (el.textContent || '').trim().substring(0, 80),
        }))
    })
    console.log(`\n    div[id^="T"] sur L0 (${l0TDivs.length} trouvés):`)
    l0TDivs.forEach(d => console.log(`      #${d.id}: ${d.hasLinks} liens (${d.arabicLinks} arabes) — "${d.textPreview}"`))

    // ─── Étape 5 : Clic sur le premier T-link ──────────────────────────────────
    console.log('\n[5] Clic sur le premier T-link...')
    const firstTLinkText = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('div[id^="T"] a'))
        .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = links[0] as HTMLElement | null
      if (el) { el.click(); return (el.textContent || '').trim().substring(0, 60) }
      return null
    })

    if (!firstTLinkText) {
      console.warn('    AVERTISSEMENT : aucun T-link arabe trouvé sur PAGE_CodesJuridiques')
    } else {
      console.log(`    T-link cliqué: "${firstTLinkText}"`)
    }

    await page.waitForLoadState('load')
    await jitter(15000, 5000) // attendre le chargement asynchrone WebDev

    // ─── Étape 6 : Dump exhaustif de L1 ────────────────────────────────────────
    const l1Url = page.url()
    console.log(`\n[6] L1 URL: ${l1Url.split('/').pop()}`)
    console.log(`    Est PAGE_NavigationCode: ${l1Url.includes('PAGE_NavigationCode')}`)

    await page.screenshot({ path: path.join(TMP_DIR, `${slug}-l1.png`), fullPage: true })
    console.log(`    Screenshot: tmp/${slug}-l1.png`)

    // Sauvegarder le HTML complet
    const l1Html = await page.content()
    fs.writeFileSync(path.join(TMP_DIR, `${slug}-l1.html`), l1Html, 'utf-8')
    console.log(`    HTML complet: tmp/${slug}-l1.html (${l1Html.length} chars)`)

    // Analyse structurée de L1
    const l1Structure = await page.evaluate(() => {
      // Tous les divs T (T1, T2, T3...)
      const tDivs = Array.from(document.querySelectorAll('div[id^="T"]')).map(el => ({
        id: el.id,
        isT2: el.id === 'T2',
        hasLinks: el.querySelectorAll('a').length,
        arabicLinks: Array.from(el.querySelectorAll('a'))
          .filter(a => /[\u0600-\u06FF]/.test(a.textContent || '')).length,
        linkSamples: Array.from(el.querySelectorAll('a'))
          .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
          .slice(0, 5)
          .map(a => ({
            text: (a.textContent || '').trim().substring(0, 60),
            href: a.getAttribute('href'),
            onclick: a.getAttribute('onclick'),
          })),
        textPreview: (el.textContent || '').trim().substring(0, 100),
      }))

      // Tous les loopers WebDev (X_1 patterns)
      const loopers = Array.from(new Set(
        Array.from(document.querySelectorAll('div[id]'))
          .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
          .filter((x): x is string => !!x),
      )).sort()

      // Premier élément de chaque looper
      const looperDetails = loopers.map(prefix => {
        const first = document.getElementById(`${prefix}_1`)
        const all = Array.from(document.querySelectorAll(`div[id^="${prefix}_"]`))
        return {
          prefix,
          count: all.length,
          firstTextLen: first ? (first.textContent || '').trim().length : 0,
          firstPreview: first ? (first.textContent || '').trim().substring(0, 80) : '',
          hasArabic: first ? /[\u0600-\u06FF]{5,}/.test(first.textContent || '') : false,
        }
      })

      // Tous les liens arabes de la page
      const allArabicLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => /[\u0600-\u06FF]{3,}/.test(a.textContent || ''))
        .slice(0, 30)
        .map(a => ({
          text: (a.textContent || '').trim().substring(0, 80),
          href: a.getAttribute('href'),
          onclick: (a.getAttribute('onclick') || '').substring(0, 80),
          parentId: a.parentElement?.id || a.closest('[id]')?.id || '',
        }))

      // Structure td.Texte / tzzrl (format A2 looper L2)
      const tdTexte = Array.from(document.querySelectorAll('td.Texte, td[class*="Texte"]'))
      const tzzrl = Array.from(document.querySelectorAll('td[id^="tzzrl_"]'))

      // Éléments avec beaucoup de texte arabe
      const richElements = Array.from(document.querySelectorAll('[id]'))
        .map(el => ({
          id: el.id,
          tag: el.tagName,
          len: (el.textContent || '').trim().length,
          arabicRatio: ((el.textContent || '').match(/[\u0600-\u06FF]/g) || []).length /
            Math.max(1, (el.textContent || '').trim().length),
        }))
        .filter(x => x.len > 200 && x.arabicRatio > 0.3)
        .sort((a, b) => b.len - a.len)
        .slice(0, 15)

      return {
        url: location.href,
        title: document.title,
        tDivs,
        tDivsTotal: tDivs.length,
        t2Exists: !!document.getElementById('T2'),
        t1Exists: !!document.getElementById('T1'),
        t3Exists: !!document.getElementById('T3'),
        loopers,
        looperDetails,
        allArabicLinks,
        tdTexteCount: tdTexte.length,
        tzzrlCount: tzzrl.length,
        tdTexteSample: tdTexte.slice(0, 3).map(el => (el.textContent || '').trim().substring(0, 100)),
        richElements,
        bodyTextLen: (document.body.textContent || '').trim().length,
      }
    })

    // ─── Étape 7 : Affichage console et sauvegarde JSON ────────────────────────
    console.log('\n=== RÉSULTAT DIAGNOSTIC L1 ===')
    console.log(`URL: ${l1Structure.url}`)
    console.log(`Title: ${l1Structure.title}`)
    console.log(`Body text: ${l1Structure.bodyTextLen} chars`)
    console.log(`\ndiv#T2 existe: ${l1Structure.t2Exists}`)
    console.log(`div#T1 existe: ${l1Structure.t1Exists}`)
    console.log(`div#T3 existe: ${l1Structure.t3Exists}`)
    console.log(`td.Texte count: ${l1Structure.tdTexteCount}`)
    console.log(`td[tzzrl_] count: ${l1Structure.tzzrlCount}`)

    console.log(`\nTous les div[id^="T"] (${l1Structure.tDivsTotal}):`)
    l1Structure.tDivs.forEach(d => {
      console.log(`  #${d.id}: ${d.hasLinks} liens (${d.arabicLinks} arabes)`)
      d.linkSamples.forEach(l => console.log(`    → "${l.text}"`))
    })

    console.log(`\nLoopers WebDev présents: [${l1Structure.loopers.join(', ')}]`)
    l1Structure.looperDetails
      .filter(l => l.hasArabic && l.count > 0)
      .forEach(l => console.log(`  ${l.prefix}: ${l.count} items, preview="${l.firstPreview.substring(0, 60)}"`))

    console.log(`\nLiens arabes (${l1Structure.allArabicLinks.length}):`)
    l1Structure.allArabicLinks.slice(0, 15).forEach(l =>
      console.log(`  #${l.parentId} → "${l.text}"`)
    )

    console.log('\nÉléments riches (texte arabe):')
    l1Structure.richElements.forEach(e =>
      console.log(`  #${e.id} <${e.tag}>: ${e.len} chars, arabicRatio=${e.arabicRatio.toFixed(2)}`)
    )

    if (l1Structure.tdTexteSample.length > 0) {
      console.log('\ntd.Texte samples:')
      l1Structure.tdTexteSample.forEach(t => console.log(`  "${t}"`))
    }

    // Sauvegarder le JSON
    const outputPath = path.join(TMP_DIR, `${slug}-structure.json`)
    fs.writeFileSync(outputPath, JSON.stringify({ targetCode, slug, l1Structure }, null, 2), 'utf-8')
    console.log(`\n>>> Structure sauvegardée: tmp/${slug}-structure.json`)

    // ─── Étape 8 : Laisser le navigateur ouvert 10s pour inspection visuelle ───
    console.log('\n>>> Navigateur ouvert 10s pour inspection manuelle...')
    await sleep(10000)

  } finally {
    await browser.close()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
