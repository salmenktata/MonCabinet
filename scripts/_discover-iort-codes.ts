/**
 * Script de découverte : navigation vers PAGE_Production (liste des codes IORT)
 * npx tsx scripts/_discover-iort-codes.ts
 */
import 'dotenv/config'
import { IortSessionManager } from '../lib/web-scraper/iort-scraper-utils'
import { IORT_SITEIORT_URL } from '../lib/web-scraper/iort-codes-scraper'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const session = new IortSessionManager()
  await session.init()
  const page = session.getPage()

  // Navigation confirmée par l'utilisateur :
  // Homepage → _JCL(M24) → _JEM(M180) → PAGE_Production?WD_ACTION_=MENU&ID=M180#M49
  console.log('=== Navigation vers PAGE_Production (codes) ===')
  await page.goto(IORT_SITEIORT_URL, { waitUntil: 'load', timeout: 60000 })
  await sleep(2500)

  console.log('1. _JCL(M24)...')
  await page.evaluate(() => {
    // @ts-expect-error WebDev
    _JCL(clWDUtil.sGetPageActionIE10() + '?M24', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await sleep(2500)

  console.log('2. _JEM(M180)...')
  await page.evaluate(() => {
    // @ts-expect-error WebDev
    _JEM('M180', '_self', '', '')
  })
  await page.waitForLoadState('load')
  await sleep(3000)

  console.log('URL:', page.url())
  console.log('Titre:', await page.title())

  // Inspecter la structure complète de PAGE_Production
  const pageInfo = await page.evaluate(() => {
    // Selects (liste de codes)
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      name: s.name,
      id: s.id,
      optionCount: s.options.length,
      options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() })),
    }))

    // Loopers
    const loopers = Array.from(new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1])
        .filter(Boolean),
    ))

    // Liens arabes visibles
    const links = Array.from(document.querySelectorAll('a, [onclick]'))
      .filter(el => /[\u0600-\u06FF]/.test(el.textContent || ''))
      .map(el => ({
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 80),
        onclick: (el.getAttribute('onclick') || '').substring(0, 100),
      }))
      .slice(0, 40)

    // _JSL IDs disponibles sur cette page
    const jslIds = Array.from(new Set(
      Array.from(document.querySelectorAll('[onclick]'))
        .flatMap(el => [...(el.getAttribute('onclick') || '').matchAll(/_JSL\s*\(_PAGE_\s*,\s*'(\w+)'/g)])
        .map(m => m[1]),
    )).sort()

    // Contenu principal (chercher le bloc codes)
    const mainContent = document.querySelector('#main, .main, #content, [id*="content"], [id*="CONTENT"]')
    const mainText = mainContent
      ? (mainContent.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 500)
      : ''

    // Texte du body complet
    const bodyText = (document.body.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 1000)

    return { selects, loopers, links, jslIds, mainText, bodyText }
  })

  console.log('\n--- Selects trouvés ---')
  console.log(JSON.stringify(pageInfo.selects, null, 2))

  console.log('\n--- Loopers ---')
  console.log(pageInfo.loopers.join(', '))

  console.log('\n--- _JSL IDs sur cette page ---')
  console.log(pageInfo.jslIds.join(', '))

  console.log('\n--- Liens arabes ---')
  pageInfo.links.forEach(l => {
    if (l.text && (l.onclick || l.text.length > 5)) {
      console.log(`  "${l.text}" → ${l.onclick || '(pas d onclic)'}`)
    }
  })

  console.log('\n--- Body (1000 chars) ---')
  console.log(pageInfo.bodyText)

  // Si on a un select avec des codes arabes, afficher et tester
  const codeSelect = pageInfo.selects.find(s =>
    s.options.some(o => /[\u0600-\u06FF]/.test(o.text) && o.text.length > 5),
  )

  if (codeSelect) {
    console.log(`\n✅ SELECT CODES TROUVÉ (name="${codeSelect.name}", ${codeSelect.optionCount} options)`)
    console.log('Options:')
    codeSelect.options.forEach((o, i) => console.log(`  ${i + 1}. value="${o.value}" text="${o.text}"`))

    // Tester la sélection de المجلة التجارية
    const commercial = codeSelect.options.find(o => o.text.includes('التجارية'))
    if (commercial) {
      console.log(`\nTest sélection المجلة التجارية (value="${commercial.value}")...`)
      await page.evaluate((val: string, name: string) => {
        const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement
        if (sel) {
          sel.value = val
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, commercial.value, codeSelect.name)
      await sleep(1000)

      // Déclencher la recherche
      const submitResult = await page.evaluate(() => {
        // Tenter les boutons de submit
        for (const id of ['A40', 'B40', 'A12', 'B12', 'A11', 'A9', 'A17']) {
          try {
            // @ts-expect-error WebDev
            _JSL(_PAGE_, id, '_self', '', '')
            return id
          } catch { /* essayer suivant */ }
        }
        const btn = document.querySelector('input[type="submit"], button[type="submit"]') as HTMLElement
        if (btn) { btn.click(); return 'button' }
        return 'none'
      })
      console.log(`Submit via: ${submitResult}`)
      await page.waitForLoadState('load').catch(() => {})
      await sleep(3000)

      console.log('URL après sélection:', page.url())
      const afterSelect = await page.evaluate(() => {
        const sels = Array.from(document.querySelectorAll('select')).map(s => ({ name: s.name, opts: Array.from(s.options).slice(0,3).map(o => o.text) }))
        const loopers = Array.from(new Set(Array.from(document.querySelectorAll('[id]')).map(el => el.id.match(/^([A-Z]\d+)_\d+$/)?.[1]).filter(Boolean)))
        const body = (document.body.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 500)
        return { sels, loopers, body }
      })
      console.log('Selects après:', JSON.stringify(afterSelect.sels))
      console.log('Loopers après:', afterSelect.loopers.join(', '))
      console.log('Body:', afterSelect.body.substring(0, 300))
    }
  } else {
    console.log('\n⚠️  Aucun select avec codes arabes trouvé')
    console.log('Vérifier les loopers pour les codes...')

    // Chercher dans les loopers
    for (const looperId of pageInfo.loopers.slice(0, 5)) {
      const items = await page.evaluate((id: string) => {
        return Array.from(document.querySelectorAll(`div[id^="${id}_"]`))
          .slice(0, 5)
          .map(el => (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 80))
      }, looperId)
      if (items.some(t => /[\u0600-\u06FF]/.test(t))) {
        console.log(`\nLooper ${looperId}:`)
        items.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
      }
    }
  }

  await session.close()
}

main().catch(e => { console.error(e); process.exit(1) })
