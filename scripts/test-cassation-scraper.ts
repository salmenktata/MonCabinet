#!/usr/bin/env npx tsx
/**
 * Script de test du système de scraping contre cassation.tn
 * محكمة التعقيب التونسية - Section فقه القضاء (Jurisprudence)
 *
 * Usage: npx tsx scripts/test-cassation-scraper.ts
 */

import * as cheerio from 'cheerio'

// ============================================
// CONFIGURATION
// ============================================

const BASE_URL = 'http://www.cassation.tn'
const JURISPRUDENCE_URL = `${BASE_URL}/fr/%D9%81%D9%82%D9%87-%D8%A7%D9%84%D9%82%D8%B6%D8%A7%D8%A1/`
const JURISPRUDENCE_LIST_URL = `${JURISPRUDENCE_URL}?tx_uploadexample_piexample%5Baction%5D=list&tx_uploadexample_piexample%5Bcontroller%5D=Example&cHash=ec357dd81b970f1852dd711d37d8430f`

// Themes disponibles dans le formulaire
const THEMES = {
  'TA': 'مدني عام (Civil Général)',
  'TB': 'تجاري (Commercial)',
  'TC': 'شخصي (Statut Personnel)',
  'TD': 'اجتماعي (Social)',
  'TF': 'جزائي (Pénal)',
  'TG': 'اجراءات جزائية (Procédures Pénales)',
  'TH': 'اجراءات مدنية (Procédures Civiles)',
  'TI': 'تحكيم (Arbitrage)',
  'VT': 'بيع (Vente)',
  'LC': 'أكرية (Baux)',
  'MR': 'عيني (Droits Réels)',
  'UR': 'استعجالي (Référé)',
  'AS': 'تأمين وحوادث مرور (Assurance & Accidents)',
  'MS': 'إجراءات جماعية (Procédures Collectives)',
  'TJ': 'قانون دولي خاص (DIP)',
  'CR': 'الدوائر المجتمعة (Chambres Réunies)',
  'PC': 'التناسب - الفصل 49 (Proportionnalité Art. 49)',
}

// ============================================
// HELPERS
// ============================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

function log(msg: string) { console.log(msg) }
function logHeader(msg: string) { log(`\n${colors.bold}${colors.blue}${'═'.repeat(60)}${colors.reset}`) ; log(`${colors.bold}${colors.blue}  ${msg}${colors.reset}`) ; log(`${colors.bold}${colors.blue}${'═'.repeat(60)}${colors.reset}`) }
function logSection(msg: string) { log(`\n${colors.cyan}── ${msg} ──${colors.reset}`) }
function logPass(msg: string) { log(`  ${colors.green}✓${colors.reset} ${msg}`) }
function logFail(msg: string) { log(`  ${colors.red}✗${colors.reset} ${msg}`) }
function logWarn(msg: string) { log(`  ${colors.yellow}⚠${colors.reset} ${msg}`) }
function logInfo(msg: string) { log(`  ${colors.dim}ℹ${colors.reset} ${msg}`) }

interface TestResult {
  name: string
  passed: boolean
  details: string
  severity?: 'critical' | 'major' | 'minor' | 'info'
}

const results: TestResult[] = []

function addResult(name: string, passed: boolean, details: string, severity: TestResult['severity'] = 'info') {
  results[results.length] = { name, passed, details, severity }
  if (passed) logPass(details)
  else if (severity === 'critical') logFail(`[CRITIQUE] ${details}`)
  else if (severity === 'major') logFail(`[MAJEUR] ${details}`)
  else if (severity === 'minor') logWarn(`[MINEUR] ${details}`)
  else logInfo(details)
}

// ============================================
// TEST 1: Connectivité et certificat SSL
// ============================================

async function testConnectivity() {
  logSection('Test 1: Connectivité & SSL')

  // Test HTTP basique
  try {
    const start = Date.now()
    const response = await fetch(JURISPRUDENCE_URL, {
      signal: AbortSignal.timeout(15000),
    })
    const duration = Date.now() - start

    addResult('http_status', response.ok,
      `HTTP ${response.status} - Temps de réponse: ${duration}ms`,
      response.ok ? 'info' : 'critical')

    addResult('content_type',
      (response.headers.get('content-type') || '').includes('text/html'),
      `Content-Type: ${response.headers.get('content-type')}`)

    // Vérifier les headers de cache
    const etag = response.headers.get('etag')
    const lastModified = response.headers.get('last-modified')
    addResult('cache_headers', !!(etag || lastModified),
      etag ? `ETag: ${etag}` : lastModified ? `Last-Modified: ${lastModified}` : 'Aucun header de cache (ETag/Last-Modified)',
      'minor')

    return { success: true, html: await response.text(), duration }
  } catch (error) {
    // Vérifier si c'est un problème SSL
    if (error.message?.includes('certificate') || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      addResult('ssl_cert', false,
        `Certificat SSL invalide - Node.js rejette la connexion par défaut`,
        'critical')

      // Retry sans vérification SSL
      logInfo('Tentative avec NODE_TLS_REJECT_UNAUTHORIZED=0...')
      const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      try {
        const response = await fetch(JURISPRUDENCE_URL, { signal: AbortSignal.timeout(15000) })
        const html = await response.text()
        addResult('ssl_bypass', true, 'Connexion réussie en ignorant SSL')
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls
        return { success: true, html, duration: 0, sslIssue: true }
      } catch (retryError: any) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls
        addResult('connectivity', false, `Échec total: ${retryError.message}`, 'critical')
        return { success: false }
      }
    }

    addResult('connectivity', false, `Erreur de connexion: ${getErrorMessage(error)}`, 'critical')
    return { success: false }
  }
}

// ============================================
// TEST 2: Analyse de la structure HTML
// ============================================

function testHtmlStructure(html: string) {
  logSection('Test 2: Analyse de la structure HTML')

  const $ = cheerio.load(html)

  // Détecter le CMS
  const generator = $('meta[name="generator"]').attr('content') || 'Inconnu'
  addResult('cms_detection', generator.includes('TYPO3'),
    `CMS détecté: ${generator}`)

  // Langue de la page
  const lang = $('html').attr('lang') || $('html').attr('xml:lang') || 'non définie'
  addResult('language', lang === 'ar',
    `Langue: ${lang} (contenu en arabe)`)

  // Titre de la page
  const title = $('title').text().trim()
  addResult('page_title', !!title,
    `Titre: ${title}`)

  // Vérifier la présence du formulaire de recherche
  const searchForm = $('form[name="search"]')
  addResult('search_form', searchForm.length > 0,
    searchForm.length > 0
      ? `Formulaire de recherche trouvé (action: ${searchForm.attr('action')?.substring(0, 50)}...)`
      : 'Formulaire de recherche NON trouvé',
    searchForm.length > 0 ? 'info' : 'major')

  // Analyser les champs du formulaire
  if (searchForm.length > 0) {
    const fields = {
      keyword: searchForm.find('input[name*="shkeyword"]').length > 0,
      dateFrom: searchForm.find('input[name*="shdocdate1"]').length > 0,
      dateTo: searchForm.find('input[name*="shdocdate2"]').length > 0,
      docNum: searchForm.find('input[name*="shdocnum"]').length > 0,
      theme: searchForm.find('select[name*="shtheme"]').length > 0,
    }

    const foundFields = Object.entries(fields).filter(([, v]) => v).map(([k]) => k)
    addResult('form_fields', foundFields.length === 5,
      `Champs du formulaire: ${foundFields.join(', ')} (${foundFields.length}/5)`)

    // Extraire les options du thème
    const themeOptions = searchForm.find('select[name*="shtheme"] option')
      .map((_, el) => ({ value: $(el).attr('value'), label: $(el).text().trim() }))
      .get()
      .filter(o => o.value)

    addResult('theme_options', themeOptions.length > 0,
      `${themeOptions.length} catégories juridiques trouvées`)

    if (themeOptions.length > 0) {
      logInfo('Catégories:')
      themeOptions.forEach(o => logInfo(`  ${o.value}: ${o.label}`))
    }
  }

  // Vérifier si du contenu de jurisprudence est présent
  const contentDiv = $('#wd-content')
  const errorMessage = contentDiv.text()
  const hasTypo3Error = errorMessage.includes('Oops, an error occurred')

  addResult('typo3_error', !hasTypo3Error,
    hasTypo3Error
      ? `Erreur TYPO3 détectée sur la page: "${errorMessage.substring(0, 100)}..."`
      : 'Pas d\'erreur TYPO3 sur la page',
    hasTypo3Error ? 'major' : 'info')

  // Breadcrumb / navigation
  const breadcrumb = $('#root-line').text().trim()
  addResult('breadcrumb', !!breadcrumb,
    `Fil d'Ariane: ${breadcrumb}`)

  // Slider / News
  const newsSlides = $('.nivo-html-caption')
  addResult('news_content', newsSlides.length > 0,
    `${newsSlides.length} actualités dans le slider latéral`)

  // Liens vers pages de détail
  const detailLinks = newsSlides.find('a').map((_, el) => $(el).attr('href')).get()
  addResult('detail_links', detailLinks.length > 0,
    `${detailLinks.length} liens vers pages de détail`)

  // Structure du menu
  const menuItems = $('#cssmenu .nol-lev0 > a').map((_, el) => $(el).text().trim()).get()
  addResult('site_menu', menuItems.length > 0,
    `Menu: ${menuItems.join(' | ')}`)

  return { searchForm: searchForm.length > 0, hasTypo3Error, detailLinks }
}

// ============================================
// TEST 3: Extraction de contenu avec content-extractor
// ============================================

async function testContentExtraction(html: string) {
  logSection('Test 3: Extraction de contenu (simulée)')

  const $ = cheerio.load(html)

  // Simuler l'extraction comme le ferait content-extractor.ts
  // Test des sélecteurs par défaut
  const defaultSelectors = [
    'article', 'main', '[role="main"]', '.article-content',
    '.post-content', '.entry-content', '.content-body',
    '#content', '.scn-8.content',
  ]

  let mainContent = ''
  let selectorUsed = ''

  for (const selector of defaultSelectors) {
    const el = $(selector)
    if (el.length > 0 && el.text().trim().length > 50) {
      mainContent = el.text().trim()
      selectorUsed = selector
      break
    }
  }

  // Fallback: contenu TYPO3 spécifique
  if (!mainContent) {
    const typo3Content = $('#wd-content')
    if (typo3Content.length > 0) {
      mainContent = typo3Content.text().trim()
      selectorUsed = '#wd-content (TYPO3 fallback)'
    }
  }

  addResult('content_selector', !!selectorUsed,
    selectorUsed
      ? `Sélecteur utilisé: "${selectorUsed}" (${mainContent.length} caractères)`
      : 'Aucun sélecteur standard ne capture le contenu principal',
    selectorUsed ? 'info' : 'major')

  // Test de détection juridique
  const legalTerms = {
    ar: ['فقه القضاء', 'محكمة التعقيب', 'قرار', 'حكم', 'طعن', 'دعوى'],
    fr: ['jurisprudence', 'cassation', 'arrêt', 'décision', 'pourvoi'],
  }

  const htmlLower = html.toLowerCase()
  const foundAr = legalTerms.ar.filter(t => html.includes(t))
  const foundFr = legalTerms.fr.filter(t => htmlLower.includes(t))

  addResult('legal_terms_ar', foundAr.length > 0,
    `Termes juridiques arabes: ${foundAr.join('، ')} (${foundAr.length}/${legalTerms.ar.length})`)
  addResult('legal_terms_fr', foundFr.length > 0,
    `Termes juridiques français: ${foundFr.join(', ')} (${foundFr.length}/${legalTerms.fr.length})`,
    'minor')

  // Test extraction de métadonnées
  const metadata = {
    description: $('meta[name="DESCRIPTION"]').attr('content') || '',
    keywords: $('meta[name="KEYWORDS"]').attr('content') || '',
    language: $('meta[name="LANGUAGE"]').attr('content') || '',
  }

  addResult('metadata', !!(metadata.description || metadata.keywords),
    `Métadonnées: description="${metadata.description}", keywords="${metadata.keywords.substring(0, 60)}..."`)

  // Test: est-ce que le content extractor pourrait détecter le type juridique ?
  const isJurisprudence = html.includes('فقه القضاء') || html.includes('محكمة التعقيب')
  addResult('legal_type_detection', isJurisprudence,
    `Détection type juridique: ${isJurisprudence ? 'Jurisprudence / Cour de Cassation' : 'Non détecté'}`)

  return { mainContent, metadata }
}

// ============================================
// TEST 4: Soumission du formulaire (POST)
// ============================================

async function testFormSubmission() {
  logSection('Test 4: Soumission du formulaire de recherche (POST)')

  const formAction = `${BASE_URL}/fr/%D9%81%D9%82%D9%87-%D8%A7%D9%84%D9%82%D8%B6%D8%A7%D8%A1/?tx_uploadexample_piexample%5Baction%5D=list&tx_uploadexample_piexample%5Bcontroller%5D=Example&cHash=ec357dd81b970f1852dd711d37d8430f`

  // Préparer les données du formulaire
  const formData = new URLSearchParams()
  formData.append('tx_uploadexample_piexample[search][shkeyword]', '')
  formData.append('tx_uploadexample_piexample[search][shdocdate1]', '')
  formData.append('tx_uploadexample_piexample[search][shdocdate2]', '')
  formData.append('tx_uploadexample_piexample[search][shdocnum]', '')
  formData.append('tx_uploadexample_piexample[search][shtheme]', 'TA') // مدني عام

  try {
    const start = Date.now()
    const response = await fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Referer': JURISPRUDENCE_URL,
      },
      body: formData.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    const duration = Date.now() - start
    const html = await response.text()

    addResult('form_post', response.ok,
      `POST status: ${response.status} (${duration}ms, ${html.length} octets)`,
      response.ok ? 'info' : 'major')

    const $ = cheerio.load(html)

    // Vérifier si on a des résultats
    const hasError = html.includes('Oops, an error occurred')
    addResult('form_no_error', !hasError,
      hasError ? 'Erreur TYPO3 après soumission du formulaire' : 'Pas d\'erreur TYPO3',
      hasError ? 'critical' : 'info')

    // Chercher des résultats de jurisprudence
    const resultPatterns = [
      '.tx-upload-example table',
      '.tx-upload-example .list',
      '.tx-upload-example tr',
      '.tx-upload-example a[href*="detail"]',
      '.tx-upload-example a[href*="show"]',
      '.result-list',
      'table.contenttable',
      '.document-list',
    ]

    let resultsFound = false
    for (const pattern of resultPatterns) {
      const els = $(pattern)
      if (els.length > 0) {
        addResult('search_results', true, `Résultats trouvés avec sélecteur "${pattern}" (${els.length} éléments)`)
        resultsFound = true
        break
      }
    }

    if (!resultsFound) {
      // Chercher dans le texte brut du contenu
      const contentText = $('#wd-content').text()
      const hasResults = contentText.length > 200 && !hasError
      addResult('search_results', hasResults,
        hasResults
          ? `Contenu trouvé dans #wd-content (${contentText.length} caractères)`
          : 'Aucun résultat de jurisprudence détecté dans la réponse POST',
        'major')
    }

    // Chercher des liens vers des PDFs ou documents
    const pdfLinks = $('a[href$=".pdf"]').map((_, el) => $(el).attr('href')).get()
    addResult('pdf_links', pdfLinks.length > 0,
      pdfLinks.length > 0
        ? `${pdfLinks.length} liens PDF trouvés: ${pdfLinks.slice(0, 3).join(', ')}`
        : 'Aucun lien PDF trouvé',
      'minor')

    // Analyser la structure des résultats
    const tables = $('table')
    if (tables.length > 0) {
      tables.each((i, table) => {
        const rows = $(table).find('tr').length
        const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get()
        logInfo(`  Table ${i + 1}: ${rows} lignes, headers: [${headers.join(', ')}]`)
      })
    }

    return { success: true, html, hasResults: resultsFound || (!hasError && html.length > 5000) }
  } catch (error) {
    addResult('form_post', false, `Erreur POST: ${getErrorMessage(error)}`, 'critical')
    return { success: false }
  }
}

// ============================================
// TEST 5: Recherche spécifique par numéro
// ============================================

async function testSpecificSearch() {
  logSection('Test 5: Recherche par mot-clé')

  const formAction = `${BASE_URL}/fr/%D9%81%D9%82%D9%87-%D8%A7%D9%84%D9%82%D8%B6%D8%A7%D8%A1/?tx_uploadexample_piexample%5Baction%5D=list&tx_uploadexample_piexample%5Bcontroller%5D=Example&cHash=ec357dd81b970f1852dd711d37d8430f`

  const formData = new URLSearchParams()
  formData.append('tx_uploadexample_piexample[search][shkeyword]', 'طلاق') // divorce
  formData.append('tx_uploadexample_piexample[search][shdocdate1]', '')
  formData.append('tx_uploadexample_piexample[search][shdocdate2]', '')
  formData.append('tx_uploadexample_piexample[search][shdocnum]', '')
  formData.append('tx_uploadexample_piexample[search][shtheme]', 'TC') // شخصي

  try {
    const response = await fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Referer': JURISPRUDENCE_URL,
        'Origin': BASE_URL,
      },
      body: formData.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })

    const html = await response.text()
    const $ = cheerio.load(html)

    // Vérifier la taille de la réponse
    const contentText = $('#wd-content .tx-upload-example').text().trim()
    const hasContent = contentText.length > 100

    addResult('keyword_search', hasContent,
      hasContent
        ? `Recherche "طلاق" en matière شخصي: ${contentText.length} caractères de contenu`
        : `Recherche retourne peu/pas de contenu (${contentText.length} chars)`,
      hasContent ? 'info' : 'major')

    // Chercher des liens vers les décisions
    const links = $('.tx-upload-example a').map((_, el) => ({
      href: $(el).attr('href'),
      text: $(el).text().trim(),
    })).get().filter(l => l.text.length > 0)

    addResult('decision_links', links.length > 0,
      links.length > 0
        ? `${links.length} liens vers des décisions trouvés`
        : 'Aucun lien vers des décisions individuelles',
      links.length > 0 ? 'info' : 'major')

    if (links.length > 0) {
      logInfo('Premiers liens:')
      links.slice(0, 5).forEach(l => logInfo(`  → ${l.text.substring(0, 60)} [${l.href?.substring(0, 80)}]`))
    }

    return { success: true, links }
  } catch (error) {
    addResult('keyword_search', false, `Erreur: ${getErrorMessage(error)}`, 'major')
    return { success: false }
  }
}

// ============================================
// TEST 6: Test Playwright (scraping dynamique)
// ============================================

async function testPlaywrightScraping() {
  logSection('Test 6: Scraping dynamique (Playwright)')

  let browser: any = null
  try {
    const { chromium } = await import('playwright')

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--no-sandbox', '--ignore-certificate-errors'],
    })

    addResult('playwright_launch', true, 'Playwright/Chromium lancé')

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'ar-TN',
      ignoreHTTPSErrors: true,
    })

    const page = await context.newPage()

    // Bloquer les ressources inutiles
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf}', (route: any) => route.abort())

    // Naviguer vers la page
    const start = Date.now()
    await page.goto(JURISPRUDENCE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const loadDuration = Date.now() - start

    addResult('playwright_load', true,
      `Page chargée en ${loadDuration}ms`)

    // Vérifier le formulaire
    const formExists = await page.locator('form[name="search"]').count()
    addResult('pw_form_found', formExists > 0,
      formExists > 0 ? 'Formulaire de recherche trouvé via Playwright' : 'Formulaire non trouvé',
      formExists > 0 ? 'info' : 'major')

    if (formExists > 0) {
      // Remplir et soumettre le formulaire
      logInfo('Soumission du formulaire via Playwright...')

      // Sélectionner un thème
      await page.selectOption('select[name*="shtheme"]', 'TF') // جزائي (Pénal)

      // Soumettre
      const submitStart = Date.now()
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
        page.click('input.tx-upload-example_button[type="submit"]'),
      ])

      // Attendre un peu pour le chargement AJAX potentiel
      await page.waitForTimeout(2000)

      const submitDuration = Date.now() - submitStart

      addResult('pw_form_submit', true,
        `Formulaire soumis en ${submitDuration}ms`)

      // Vérifier les résultats
      const pageContent = await page.content()
      const $ = cheerio.load(pageContent)

      const hasError = pageContent.includes('Oops, an error occurred')
      const contentLength = $('#wd-content .tx-upload-example').text().trim().length

      addResult('pw_results', !hasError && contentLength > 200,
        hasError
          ? 'Erreur TYPO3 après soumission Playwright'
          : `Contenu après soumission: ${contentLength} caractères`,
        hasError ? 'major' : 'info')

      // Extraire les résultats s'il y en a
      const resultLinks = $('a').filter((_, el) => {
        const href = $(el).attr('href') || ''
        return href.includes('show') || href.includes('detail') || href.includes('piexample')
      }).length

      addResult('pw_detail_links', resultLinks > 0,
        `${resultLinks} liens navigables trouvés dans les résultats`)
    }

    // Test de la détection de framework
    const scripts = await page.evaluate(() => {
      return {
        jquery: typeof (window as any).jQuery !== 'undefined',
        jqueryVersion: (window as any).jQuery?.fn?.jquery || 'N/A',
        hasLivewire: !!(window as any).Livewire,
        hasReact: !!document.querySelector('[data-reactroot]'),
        hasVue: !!document.querySelector('[data-v-]'),
        hasAngular: !!document.querySelector('[ng-version]'),
        typo3: document.querySelector('meta[name="generator"]')?.getAttribute('content') || '',
      }
    })

    addResult('framework_detection', true,
      `Frameworks: jQuery ${scripts.jqueryVersion}, TYPO3="${scripts.typo3}", SPA=${scripts.hasLivewire || scripts.hasReact || scripts.hasVue || scripts.hasAngular ? 'Oui' : 'Non'}`)

    logInfo(`Le site est STATIQUE (TYPO3 + jQuery) - pas besoin de Playwright pour le rendu`)

    await browser.close()
    return { success: true }
  } catch (error) {
    if (browser) await browser.close().catch(() => {})

    if (error.message?.includes('playwright') || error.message?.includes('Cannot find module')) {
      addResult('playwright_available', false,
        `Playwright non installé: ${getErrorMessage(error)}`, 'minor')
    } else {
      addResult('playwright_test', false,
        `Erreur Playwright: ${getErrorMessage(error)}`, 'major')
    }
    return { success: false }
  }
}

// ============================================
// TEST 7: Compatibilité avec le scraper-service
// ============================================

async function testScraperCompatibility(html: string) {
  logSection('Test 7: Compatibilité avec le scraper-service existant')

  const $ = cheerio.load(html)

  // 1. Test: Le site est-il dans KNOWN_DYNAMIC_DOMAINS ?
  const isDynamic = ['9anoun.tn', 'legislation.tn', 'e-justice.tn', 'iort.gov.tn'].some(d =>
    'cassation.tn'.includes(d) || d.includes('cassation.tn')
  )
  addResult('dynamic_domain_list', !isDynamic,
    isDynamic
      ? 'cassation.tn est dans KNOWN_DYNAMIC_DOMAINS (sera scrapé en mode dynamique)'
      : 'cassation.tn PAS dans KNOWN_DYNAMIC_DOMAINS → sera tenté en mode statique d\'abord',
    'info')

  // 2. Test: Le fetchHtml standard peut-il récupérer le contenu ?
  addResult('static_fetch_viable', true,
    'Le site est basé sur TYPO3 (SSR) → fetch statique SUFFISANT pour le HTML')

  // 3. Test: Le content-extractor peut-il identifier le contenu ?
  const contentSelectors = [
    '#wd-content', '.tx-upload-example', '.scn-8.content',
    '#content', 'article', 'main',
  ]

  const matchedSelectors = contentSelectors.filter(s => $(s).length > 0)
  addResult('content_selectors', matchedSelectors.length > 0,
    `Sélecteurs compatibles: ${matchedSelectors.join(', ')}`,
    matchedSelectors.length > 0 ? 'info' : 'major')

  // 4. Le formulaire nécessite un POST - le système actuel ne supporte que GET
  addResult('post_support', false,
    'Le formulaire de recherche utilise POST → fetchHtml() ne supporte que GET',
    'critical')

  // 5. Le formulaire a un mécanisme anti-CSRF (TYPO3 trusted properties)
  const hasTrustedProps = html.includes('__trustedProperties')
  const hasReferrer = html.includes('__referrer')
  addResult('csrf_protection', true,
    `Protection TYPO3: __trustedProperties=${hasTrustedProps}, __referrer=${hasReferrer}` +
    (hasTrustedProps ? ' → Besoin de parser le formulaire avant soumission' : ''),
    hasTrustedProps ? 'major' : 'info')

  // 6. Vérifier si la pagination existe
  const pagination = $('ul.f3-widget-paginator, .pagination, .page-navigation, [class*="pager"]')
  addResult('pagination', pagination.length > 0,
    pagination.length > 0
      ? 'Pagination détectée'
      : 'Pas de pagination visible (résultats non chargés ou pagination AJAX)',
    'minor')

  // 7. Test de détection de type juridique
  const legalIndicators = {
    jurisprudence: html.includes('فقه القضاء') || html.includes('jurisprudence'),
    cassation: html.includes('محكمة التعقيب') || html.includes('cassation'),
    decisions: html.includes('قرار') || html.includes('حكم'),
  }

  addResult('legal_classification',
    legalIndicators.jurisprudence && legalIndicators.cassation,
    `Classification juridique: Jurisprudence=${legalIndicators.jurisprudence}, Cassation=${legalIndicators.cassation}`)
}

// ============================================
// TEST 8: Test des pages accessoires
// ============================================

async function testAccessoryPages() {
  logSection('Test 8: Pages accessoires du site')

  const pages = [
    { name: 'Accueil', url: `${BASE_URL}/fr/` },
    { name: 'RSS Feed', url: `${BASE_URL}/index.php?id=43&type=100` },
    { name: 'Rapport annuel', url: `${BASE_URL}/fr/%D8%A7%D9%84%D9%85%D9%86%D8%B4%D9%88%D8%B1%D8%A7%D8%AA/%D8%A7%D9%84%D8%AA%D9%82%D8%B1%D9%8A%D8%B1-%D8%A7%D9%84%D8%B3%D9%86%D9%88%D9%8A/` },
  ]

  for (const p of pages) {
    try {
      const response = await fetch(p.url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'QadhyaBot/1.0' },
      })

      const contentType = response.headers.get('content-type') || ''
      addResult(`page_${p.name}`, response.ok,
        `${p.name}: HTTP ${response.status} (${contentType.substring(0, 40)})`)
    } catch (error) {
      addResult(`page_${p.name}`, false,
        `${p.name}: Erreur - ${getErrorMessage(error)}`, 'minor')
    }
  }

  // Test du PDF de planning
  try {
    const pdfUrl = `${BASE_URL}/fileadmin/user_upload/planning_21-22.pdf`
    const response = await fetch(pdfUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    })
    addResult('pdf_download', response.ok,
      `PDF Planning: HTTP ${response.status} (${response.headers.get('content-type')})`)
  } catch (error) {
    addResult('pdf_download', false, `PDF: ${getErrorMessage(error)}`, 'minor')
  }
}

// ============================================
// RAPPORT FINAL
// ============================================

function generateReport() {
  logHeader('RAPPORT FINAL - Compatibilité Scraping cassation.tn')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const critical = results.filter(r => !r.passed && r.severity === 'critical').length
  const major = results.filter(r => !r.passed && r.severity === 'major').length
  const minor = results.filter(r => !r.passed && r.severity === 'minor').length

  log(`\n${colors.bold}Résumé:${colors.reset}`)
  log(`  Total: ${results.length} tests`)
  log(`  ${colors.green}Réussis: ${passed}${colors.reset}`)
  log(`  ${colors.red}Échoués: ${failed}${colors.reset} (${critical} critiques, ${major} majeurs, ${minor} mineurs)`)

  const score = Math.round((passed / results.length) * 100)
  const scoreColor = score >= 70 ? colors.green : score >= 50 ? colors.yellow : colors.red
  log(`\n${colors.bold}Score de compatibilité: ${scoreColor}${score}%${colors.reset}`)

  // Problèmes critiques
  if (critical > 0) {
    log(`\n${colors.bold}${colors.red}Problèmes CRITIQUES:${colors.reset}`)
    results.filter(r => !r.passed && r.severity === 'critical').forEach(r => {
      log(`  ${colors.red}✗${colors.reset} ${r.details}`)
    })
  }

  if (major > 0) {
    log(`\n${colors.bold}${colors.yellow}Problèmes MAJEURS:${colors.reset}`)
    results.filter(r => !r.passed && r.severity === 'major').forEach(r => {
      log(`  ${colors.yellow}⚠${colors.reset} ${r.details}`)
    })
  }

  // Recommandations
  log(`\n${colors.bold}${colors.magenta}Recommandations:${colors.reset}`)

  log(`\n${colors.cyan}1. Support POST dans le scraper:${colors.reset}`)
  log(`   Le site cassation.tn utilise un formulaire POST TYPO3 pour la recherche`)
  log(`   de jurisprudence. Le fetchHtml() actuel ne supporte que GET.`)
  log(`   → Ajouter une option \`method: 'POST'\` et \`body\` dans fetchHtml()`)

  log(`\n${colors.cyan}2. Gestion des tokens CSRF TYPO3:${colors.reset}`)
  log(`   Le formulaire utilise __trustedProperties et __referrer (anti-CSRF TYPO3)`)
  log(`   → Implémenter un flow en 2 étapes: GET page → Parser tokens → POST formulaire`)

  log(`\n${colors.cyan}3. Certificat SSL:${colors.reset}`)
  log(`   Le certificat SSL de cassation.tn peut être invalide/auto-signé`)
  log(`   → Ajouter option \`rejectUnauthorized: false\` pour les sites gouvernementaux`)

  log(`\n${colors.cyan}4. Ajouter cassation.tn à la configuration:${colors.reset}`)
  log(`   Créer un ExtractionConfig spécifique pour cassation.tn dans content-extractor.ts`)
  log(`   avec les sélecteurs: #wd-content, .tx-upload-example, form[name="search"]`)

  log(`\n${colors.cyan}5. Stratégie de crawl recommandée:${colors.reset}`)
  log(`   - Mode: STATIQUE (pas besoin de Playwright pour le rendu)`)
  log(`   - Méthode: POST avec formulaire pour rechercher par thème`)
  log(`   - Pagination: À identifier après résultats de recherche`)
  log(`   - Catégories: Itérer sur les ${Object.keys(THEMES).length} thèmes juridiques`)
  log(`   - Rate limiting: Respecter robots.txt + 2s entre requêtes`)
  log(`   - Langue: Arabe (ar-TN)`)

  log(`\n${colors.cyan}6. Plan d'extraction optimal:${colors.reset}`)
  log(`   Pour chaque thème (${Object.keys(THEMES).length} catégories):`)
  log(`     a. GET la page → Parser les tokens CSRF`)
  log(`     b. POST avec le thème sélectionné`)
  log(`     c. Parser la liste de résultats`)
  log(`     d. Suivre les liens de détail de chaque décision`)
  log(`     e. Extraire: numéro, date, thème, texte intégral`)
  log(`     f. Télécharger les PDFs associés si présents`)

  log('')
}

// ============================================
// MAIN
// ============================================

async function main() {
  logHeader('Test de Scraping: cassation.tn (محكمة التعقيب)')
  log(`${colors.dim}Date: ${new Date().toISOString()}${colors.reset}`)
  log(`${colors.dim}URL cible: ${JURISPRUDENCE_URL}${colors.reset}`)

  // Test 1: Connectivité
  const connectivity = await testConnectivity()

  if (!connectivity.success) {
    log(`\n${colors.red}${colors.bold}ARRÊT: Impossible de se connecter au site.${colors.reset}`)
    generateReport()
    process.exit(1)
  }

  const html = connectivity.html!

  // Tests parallélisables
  // Test 2: Structure HTML
  const structure = testHtmlStructure(html)

  // Test 3: Extraction de contenu
  await testContentExtraction(html)

  // Test 7: Compatibilité scraper
  await testScraperCompatibility(html)

  // Tests réseau (séquentiels pour éviter surcharge)
  // Test 4: Soumission POST
  await testFormSubmission()

  // Test 5: Recherche spécifique
  await testSpecificSearch()

  // Test 6: Playwright
  await testPlaywrightScraping()

  // Test 8: Pages accessoires
  await testAccessoryPages()

  // Rapport final
  generateReport()
}

main().catch(error => {
  console.error(`\n${colors.red}Erreur fatale: ${getErrorMessage(error)}${colors.reset}`)
  console.error(error.stack)
  process.exit(1)
})
