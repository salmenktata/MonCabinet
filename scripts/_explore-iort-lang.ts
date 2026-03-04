/**
 * Script d'exploration pour identifier l'interface française du site IORT.
 *
 * Usage: npx tsx scripts/_explore-iort-lang.ts
 *
 * Objectif : trouver comment accéder aux textes en français sur iort.gov.tn
 * (menu homepage M8 ? sélecteur de langue dans le formulaire ? bouton sur la page de détail ?)
 */

import 'dotenv/config'
import { chromium } from 'playwright'

const IORT_BASE_URL = 'http://www.iort.gov.tn'

async function main() {
  console.log('[Explore] Démarrage exploration IORT FR...')

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'fr-FR',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)

  try {
    // =========================================================================
    // 1. HOMEPAGE : Identifier tous les liens/menus disponibles
    // =========================================================================
    console.log('\n=== 1. HOMEPAGE ===')
    await page.goto(IORT_BASE_URL, { waitUntil: 'load' })
    await page.waitForTimeout(3000)

    // Lister tous les liens _JSL visibles avec leur ID
    const menuItems = await page.evaluate(() => {
      const items: Array<{ id: string; text: string; onclick: string }> = []
      const allLinks = document.querySelectorAll('a[href*="_JSL"], a[href*="javascript"]')
      allLinks.forEach(link => {
        const text = (link as HTMLElement).innerText?.trim() || ''
        const href = link.getAttribute('href') || ''
        if (text && text.length > 2 && text.length < 200) {
          // Extraire l'ID du menu depuis _JSL(_PAGE_, 'MXX', ...)
          const match = href.match(/_JSL\([^,]+,\s*['"]([^'"]+)['"]/)
          items.push({
            id: match?.[1] || '?',
            text,
            onclick: href.substring(0, 100),
          })
        }
      })
      return items
    })

    console.log(`Menus homepage (${menuItems.length}) :`)
    menuItems.forEach(item => {
      console.log(`  [${item.id}] ${item.text}`)
    })

    // =========================================================================
    // 2. Chercher un menu FR (M8 ou autre) sur la homepage
    // =========================================================================
    console.log('\n=== 2. RECHERCHE MENU FRANÇAIS ===')
    const frMenu = menuItems.find(m =>
      m.text.toLowerCase().includes('franç') ||
      m.text.includes('Français') ||
      m.text.toLowerCase().includes('french') ||
      m.id === 'M8'
    )
    if (frMenu) {
      console.log(`✅ Menu FR trouvé : [${frMenu.id}] "${frMenu.text}"`)
    } else {
      console.log('❌ Pas de menu FR évident sur la homepage')
      console.log('Essai de navigation directe vers M8...')
    }

    // =========================================================================
    // 3. Naviguer vers M7 (JORT AR) et inspecter le formulaire
    // =========================================================================
    console.log('\n=== 3. FORMULAIRE JORT AR (M7) ===')
    await page.evaluate(() => {
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'M7', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await page.waitForTimeout(3000)

    // Naviguer vers le formulaire de recherche (A9)
    const hasSearchForm = await page.$('select[name="A8"]')
    if (!hasSearchForm) {
      await page.evaluate(() => {
        // @ts-expect-error WebDev
        _JSL(_PAGE_, 'A9', '_self', '', '')
      })
      await page.waitForLoadState('load')
      await page.waitForTimeout(3000)
    }

    // Lister tous les selects du formulaire
    const selects = await page.evaluate(() => {
      const result: Array<{ name: string; options: string[] }> = []
      document.querySelectorAll('select').forEach(sel => {
        const options: string[] = []
        sel.querySelectorAll('option').forEach(opt => {
          options.push(`${opt.value}: "${opt.text}"`)
        })
        result.push({ name: sel.name || sel.id || '?', options })
      })
      return result
    })

    console.log(`Selects dans le formulaire AR :`)
    selects.forEach(s => {
      console.log(`  select[${s.name}]: ${s.options.slice(0, 10).join(', ')}`)
    })

    // =========================================================================
    // 4. Essayer de naviguer vers M8 depuis la homepage (JORT FR potentiel)
    // =========================================================================
    console.log('\n=== 4. TENTATIVE NAVIGATION M8 (JORT FR) ===')
    await page.goto(IORT_BASE_URL, { waitUntil: 'load' })
    await page.waitForTimeout(3000)

    try {
      await page.evaluate(() => {
        // @ts-expect-error WebDev
        _JSL(_PAGE_, 'M8', '_self', '', '')
      })
      await page.waitForLoadState('load')
      await page.waitForTimeout(3000)

      const url = page.url()
      const title = await page.title()
      console.log(`URL après M8: ${url}`)
      console.log(`Titre après M8: ${title}`)

      // Vérifier si on a un formulaire de recherche
      const hasForm = await page.$('select[name="A8"]')
      console.log(`Formulaire de recherche présent: ${!!hasForm}`)

      if (!hasForm) {
        // Essayer A9 pour accéder au formulaire
        try {
          await page.evaluate(() => {
            // @ts-expect-error WebDev
            _JSL(_PAGE_, 'A9', '_self', '', '')
          })
          await page.waitForLoadState('load')
          await page.waitForTimeout(3000)
          const hasFormAfterA9 = await page.$('select[name="A8"]')
          console.log(`Formulaire après A9: ${!!hasFormAfterA9}`)
        } catch (e) {
          console.log('A9 non disponible depuis M8')
        }
      }

      // Lister les selects du formulaire FR (si différents)
      const selectsFr = await page.evaluate(() => {
        const result: Array<{ name: string; options: string[] }> = []
        document.querySelectorAll('select').forEach(sel => {
          const options: string[] = []
          sel.querySelectorAll('option').forEach(opt => {
            options.push(`${opt.value}: "${opt.text}"`)
          })
          result.push({ name: sel.name || sel.id || '?', options })
        })
        return result
      })

      if (selectsFr.length > 0) {
        console.log(`Selects dans le formulaire FR :`)
        selectsFr.forEach(s => {
          console.log(`  select[${s.name}]: ${s.options.slice(0, 10).join(', ')}`)
        })
      }
    } catch (e) {
      console.log(`Erreur navigation M8: ${e instanceof Error ? e.message : e}`)
    }

    // =========================================================================
    // 5. Naviguer via M32 (switcher FR) puis explorer les menus disponibles
    // =========================================================================
    console.log('\n=== 5. APRÈS M32 (switcher Français) ===')
    await page.goto(IORT_BASE_URL, { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    await page.evaluate(() => {
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'M32', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await page.waitForTimeout(4000)

    const frPageTitle = await page.title()
    console.log(`Titre après M32: ${frPageTitle}`)

    const frMenuItems = await page.evaluate(() => {
      const items: Array<{ id: string; text: string }> = []
      document.querySelectorAll('a[href*="_JSL"], a[href*="javascript"]').forEach(link => {
        const text = (link as HTMLElement).innerText?.trim() || ''
        const href = link.getAttribute('href') || ''
        if (text && text.length > 2 && text.length < 200) {
          const match = href.match(/_JSL\([^,]+,\s*['"]([^'"]+)['"]/)
          items.push({ id: match?.[1] || '?', text })
        }
      })
      return items
    })
    console.log(`Menus après M32 (${frMenuItems.length}) :`)
    frMenuItems.forEach(item => console.log(`  [${item.id}] ${item.text}`))

    // Essayer de naviguer vers le JORT FR depuis le menu FR
    // Chercher un menu ressemblant à M7 (JORT lois/décrets)
    const jortFrCandidate = frMenuItems.find(m =>
      m.text.toLowerCase().includes('journal') ||
      m.text.toLowerCase().includes('loi') ||
      m.text.toLowerCase().includes('décret') ||
      m.text.toLowerCase().includes('officiel') ||
      m.text.toLowerCase().includes('textes')
    )
    if (jortFrCandidate) {
      console.log(`\n✅ Candidat JORT FR : [${jortFrCandidate.id}] "${jortFrCandidate.text}"`)
      // Tenter la navigation
      try {
        await page.evaluate((id) => {
          // @ts-expect-error WebDev
          _JSL(_PAGE_, id, '_self', '', '')
        }, jortFrCandidate.id)
        await page.waitForLoadState('load')
        await page.waitForTimeout(3000)

        const hasFormFr = await page.$('select[name="A8"]')
        console.log(`Formulaire de recherche après ${jortFrCandidate.id}: ${!!hasFormFr}`)

        if (!hasFormFr) {
          await page.evaluate(() => {
            // @ts-expect-error WebDev
            _JSL(_PAGE_, 'A9', '_self', '', '')
          })
          await page.waitForLoadState('load')
          await page.waitForTimeout(3000)
          const hasFormAfterA9 = await page.$('select[name="A8"]')
          console.log(`Formulaire après A9: ${!!hasFormAfterA9}`)
        }

        const selectsFr = await page.evaluate(() => {
          const result: Array<{ name: string; options: string[] }> = []
          document.querySelectorAll('select').forEach(sel => {
            const options: string[] = []
            sel.querySelectorAll('option').forEach(opt => options.push(`"${opt.text}"`))
            result.push({ name: sel.name || sel.id || '?', options: options.slice(0, 10) })
          })
          return result
        })
        if (selectsFr.length > 0) {
          console.log('Selects dans le formulaire FR :')
          selectsFr.forEach(s => console.log(`  select[${s.name}]: ${s.options.join(', ')}`))
        }
      } catch (e) {
        console.log(`Erreur navigation ${jortFrCandidate.id}: ${e instanceof Error ? e.message : e}`)
      }
    } else {
      console.log('Aucun menu JORT FR évident trouvé après M32')
    }

    // Essayer tous les menus après M32 pour trouver le JORT FR
    console.log('\n=== 5b. SCAN TOUS MENUS DEPUIS MODE FR ===')
    for (const menuId of ['A8', 'M7', 'M8', 'M9', 'M10', 'M11', 'M33', 'M34', 'M35', 'M36', 'M37', 'M38', 'M39', 'M40']) {
      try {
        await page.goto(IORT_BASE_URL, { waitUntil: 'load' })
        await page.waitForTimeout(2000)
        // Switcher en FR d'abord
        await page.evaluate(() => { // @ts-expect-error WebDev
          _JSL(_PAGE_, 'M32', '_self', '', '') })
        await page.waitForLoadState('load')
        await page.waitForTimeout(2000)
        // Naviguer vers le menu cible
        await page.evaluate((id) => { // @ts-expect-error WebDev
          _JSL(_PAGE_, id, '_self', '', '') }, menuId)
        await page.waitForLoadState('load')
        await page.waitForTimeout(2000)
        const title = await page.title()
        const hasForm = await page.$('select[name="A8"]')
        if (hasForm) {
          const selectsFr = await page.evaluate(() => {
            const result: Array<{ name: string; options: string[] }> = []
            document.querySelectorAll('select').forEach(sel => {
              const options: string[] = []
              sel.querySelectorAll('option').forEach(opt => options.push(`"${opt.text}"`))
              result.push({ name: sel.name || sel.id || '?', options: options.slice(0, 8) })
            })
            return result
          })
          console.log(`\n✅ [M32+${menuId}] Formulaire trouvé! Titre: "${title}"`)
          selectsFr.forEach(s => console.log(`   select[${s.name}]: ${s.options.join(', ')}`))
        }
      } catch { /* silencieux */ }
    }

    // =========================================================================
    // 6. Essayer d'autres IDs de menu (M1-M20) pour trouver l'entrée FR
    // =========================================================================
    console.log('\n=== 5. SCAN MENUS M1-M20 DEPUIS HOMEPAGE ===')
    const menuIds = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M9', 'M10',
                     'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20']

    for (const menuId of menuIds) {
      if (menuId === 'M4' || menuId === 'M7') continue // Déjà connus
      try {
        await page.goto(IORT_BASE_URL, { waitUntil: 'load' })
        await page.waitForTimeout(2000)
        await page.evaluate((id) => {
          // @ts-expect-error WebDev
          _JSL(_PAGE_, id, '_self', '', '')
        }, menuId)
        await page.waitForLoadState('load')
        await page.waitForTimeout(2000)

        const title = await page.title()
        const bodyText = await page.evaluate(() =>
          document.body.innerText.substring(0, 200)
        )
        if (!bodyText.includes('WD_ACTION') && bodyText.length > 10) {
          console.log(`[${menuId}] "${title}" → ${bodyText.substring(0, 100)}...`)
        }
      } catch {
        // Silencieux si le menu n'existe pas
      }
    }

  } finally {
    await browser.close()
    console.log('\n[Explore] Terminé. Analyser les résultats ci-dessus pour configurer le crawl FR.')
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
