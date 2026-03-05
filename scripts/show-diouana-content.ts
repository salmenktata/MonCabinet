#!/usr/bin/env tsx
import { chromium } from 'playwright'

const SITEIORT = 'https://www.iort.tn/siteiort'
const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()

  // Navigation vers مجلة الديوانة
  await page.goto(SITEIORT, { waitUntil: 'load', timeout: 30000 })
  await DELAY(3000)
  await page.evaluate(() => { /* @ts-expect-error */ _JCL(clWDUtil.sGetPageActionIE10() + '?M24', '_self', '', '') })
  await page.waitForLoadState('load')
  await DELAY(3000)
  await page.evaluate(() => { /* @ts-expect-error */ _JEM('M180', '_self', '', '') })
  await page.waitForLoadState('load')
  await DELAY(5000)

  // Clic sur مجلة الديوانة (A1_1)
  await page.evaluate(() => {
    const div = document.querySelector('div#A1_1')
    const btn = div?.querySelector('a, [onclick]') as HTMLElement | null
    if (btn) btn.click()
  })
  await page.waitForLoadState('load')
  await DELAY(12000)

  const codesJuridiquesUrl = page.url()
  console.log('PAGE_CodesJuridiques URL:', codesJuridiquesUrl)

  // Click T-link[0] → L1
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('div[id^="T"] a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
    const el = links[0] as HTMLElement | null
    if (el) el.click()
  })
  await page.waitForLoadState('load')
  await DELAY(10000)

  const l1Url = page.url()
  console.log('L1 URL:', l1Url)

  // Collecter T2 links
  const t2Links = await page.evaluate(() => {
    const t2 = document.getElementById('T2')
    if (!t2) return []
    return Array.from(t2.querySelectorAll('a'))
      .filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      .map((a, i) => ({ index: i, title: (a.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120) }))
  })
  console.log(`\n${t2Links.length} sous-sections T2\n`)

  // Montrer le contenu des 5 premières sections avec texte
  let shown = 0
  for (const t2Link of t2Links) {
    if (shown >= 5) break

    await page.goto(l1Url, { waitUntil: 'load', timeout: 60000 })
    await DELAY(5000)

    await page.evaluate((idx: number) => {
      const t2 = document.getElementById('T2')
      if (!t2) return
      const links = Array.from(t2.querySelectorAll('a')).filter(a => /[\u0600-\u06FF]/.test(a.textContent || ''))
      const el = links[idx] as HTMLElement | null
      if (el) el.click()
    }, t2Link.index)
    await page.waitForLoadState('load')
    await DELAY(8000)

    const texts = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td.Texte, td[class~="Texte"], td[id^="tzzrl_"]'))
      return cells.map(el => (el.textContent || '').trim()).filter(t => t.length > 5 && /[\u0600-\u06FF]/.test(t))
    })

    if (texts.length > 0) {
      console.log(`\n${'═'.repeat(60)}`)
      console.log(`Section: ${t2Link.title}`)
      console.log(`${'═'.repeat(60)}`)
      texts.forEach(t => console.log(t.substring(0, 500)))
      shown++
    }
  }

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
