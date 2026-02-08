/**
 * Service d'extraction de la structure du site web
 *
 * Extrait les indices structurels d'une page web pour aider à la classification:
 * - Breadcrumbs (fil d'Ariane)
 * - Analyse de l'URL
 * - Navigation et menus
 * - Hiérarchie des titres
 */

import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'

// =============================================================================
// TYPES
// =============================================================================

export interface SiteStructure {
  breadcrumbs: Breadcrumb[]
  urlPath: UrlPathAnalysis
  navigation: NavigationItem[]
  headings: HeadingHierarchy
  sectionContext: SectionContext | null
}

export interface Breadcrumb {
  label: string
  url: string | null
  level: number
}

export interface UrlPathAnalysis {
  fullPath: string
  segments: UrlSegment[]
  queryParams: Record<string, string>
  detectedPatterns: UrlPattern[]
}

export interface UrlSegment {
  value: string
  position: number
  isNumeric: boolean
  isDate: boolean
  suggestedMeaning: string | null
}

export interface UrlPattern {
  pattern: string
  confidence: number
  suggestedCategory: string | null
  suggestedDomain: string | null
  suggestedDocumentType: string | null
}

export interface NavigationItem {
  label: string
  url: string | null
  isActive: boolean
  level: number
}

export interface HeadingHierarchy {
  h1: string | null
  h2: string[]
  h3: string[]
  structure: HeadingNode[]
}

export interface HeadingNode {
  level: number
  text: string
  children: HeadingNode[]
}

export interface SectionContext {
  parentSection: string | null
  currentSection: string | null
  siblingPages: string[]
}

export interface StructuralHint {
  source: 'breadcrumb' | 'url' | 'navigation' | 'heading' | 'meta'
  suggestedCategory: string | null
  suggestedDomain: string | null
  suggestedDocumentType: string | null
  confidence: number
  evidence: string
}

// =============================================================================
// PATTERNS DE DÉTECTION
// =============================================================================

// Patterns d'URL pour la classification
const URL_CLASSIFICATION_PATTERNS: Array<{
  pattern: RegExp
  category?: string
  domain?: string
  documentType?: string
  confidence: number
}> = [
  // Jurisprudence
  { pattern: /\/jurisprudence\//i, category: 'jurisprudence', confidence: 0.9 },
  { pattern: /\/cassation\//i, category: 'jurisprudence', documentType: 'arret_cassation', confidence: 0.85 },
  { pattern: /\/appel\//i, category: 'jurisprudence', documentType: 'arret_appel', confidence: 0.8 },
  { pattern: /\/jugement/i, category: 'jurisprudence', documentType: 'jugement', confidence: 0.8 },
  { pattern: /\/arret/i, category: 'jurisprudence', confidence: 0.75 },

  // Législation
  { pattern: /\/lois?\//i, category: 'legislation', confidence: 0.9 },
  { pattern: /\/legislation\//i, category: 'legislation', confidence: 0.9 },
  { pattern: /\/decret/i, category: 'legislation', documentType: 'decret', confidence: 0.8 },
  { pattern: /\/arrete/i, category: 'legislation', documentType: 'arrete', confidence: 0.8 },
  { pattern: /\/circulaire/i, category: 'legislation', documentType: 'circulaire', confidence: 0.8 },

  // Codes
  { pattern: /\/codes?\//i, category: 'codes', confidence: 0.9 },
  { pattern: /\/code-/i, category: 'codes', confidence: 0.85 },
  { pattern: /-article-\d+/i, category: 'codes', confidence: 0.8 },

  // JORT
  { pattern: /\/jort/i, category: 'jort', confidence: 0.95 },
  { pattern: /\/journal-officiel/i, category: 'jort', confidence: 0.9 },

  // Doctrine
  { pattern: /\/doctrine\//i, category: 'doctrine', confidence: 0.9 },
  { pattern: /\/article/i, category: 'doctrine', documentType: 'article', confidence: 0.6 },
  { pattern: /\/commentaire/i, category: 'doctrine', documentType: 'commentaire', confidence: 0.8 },

  // Modèles
  { pattern: /\/modele/i, category: 'modeles', confidence: 0.85 },
  { pattern: /\/formulaire/i, category: 'modeles', documentType: 'formulaire_administratif', confidence: 0.8 },
  { pattern: /\/contrat/i, category: 'modeles', documentType: 'modele_contrat', confidence: 0.7 },

  // Conventions
  { pattern: /\/convention/i, category: 'conventions', confidence: 0.85 },
  { pattern: /\/traite/i, category: 'conventions', documentType: 'traite', confidence: 0.8 },

  // Domaines juridiques
  { pattern: /\/civil\//i, domain: 'civil', confidence: 0.8 },
  { pattern: /\/commercial\//i, domain: 'commercial', confidence: 0.8 },
  { pattern: /\/penal\//i, domain: 'penal', confidence: 0.8 },
  { pattern: /\/famille\//i, domain: 'famille', confidence: 0.8 },
  { pattern: /\/travail\//i, domain: 'travail', confidence: 0.8 },
  { pattern: /\/fiscal\//i, domain: 'fiscal', confidence: 0.8 },
  { pattern: /\/administratif\//i, domain: 'administratif', confidence: 0.8 },
  { pattern: /\/immobilier\//i, domain: 'immobilier', confidence: 0.8 },
]

// Sélecteurs pour les breadcrumbs
const BREADCRUMB_SELECTORS = [
  // Standard
  'nav[aria-label*="breadcrumb"]',
  'nav[aria-label*="fil"]',
  '.breadcrumb',
  '.breadcrumbs',
  '.fil-ariane',
  '#breadcrumb',
  '#breadcrumbs',
  '[itemtype*="BreadcrumbList"]',
  // Bootstrap
  'ol.breadcrumb',
  'ul.breadcrumb',
  // Semantic
  'nav.breadcrumb',
  // Arabe
  '[class*="مسار"]',
  // Custom patterns
  '.path-links',
  '.page-path',
  '.navigation-path',
]

// Sélecteurs pour la navigation
const NAVIGATION_SELECTORS = [
  'nav.main-nav',
  'nav.primary-nav',
  'nav#main-navigation',
  '.main-menu',
  '.primary-menu',
  '#main-menu',
  'nav.sidebar-nav',
  '.sidebar-menu',
  // Arabe
  '[class*="قائمة"]',
]

// Mots-clés dans les breadcrumbs pour la classification
const BREADCRUMB_KEYWORDS: Record<string, { category?: string; domain?: string; documentType?: string }> = {
  // Catégories
  'jurisprudence': { category: 'jurisprudence' },
  'فقه القضاء': { category: 'jurisprudence' },
  'législation': { category: 'legislation' },
  'النصوص القانونية': { category: 'legislation' },
  'codes': { category: 'codes' },
  'المجلات': { category: 'codes' },
  'jort': { category: 'jort' },
  'journal officiel': { category: 'jort' },
  'الرائد الرسمي': { category: 'jort' },
  'doctrine': { category: 'doctrine' },
  'الفقه': { category: 'doctrine' },
  'modèles': { category: 'modeles' },
  'النماذج': { category: 'modeles' },
  'conventions': { category: 'conventions' },
  'الاتفاقيات': { category: 'conventions' },

  // Tribunaux
  'cour de cassation': { category: 'jurisprudence', documentType: 'arret_cassation' },
  'محكمة التعقيب': { category: 'jurisprudence', documentType: 'arret_cassation' },
  'cour d\'appel': { category: 'jurisprudence', documentType: 'arret_appel' },
  'محكمة الاستئناف': { category: 'jurisprudence', documentType: 'arret_appel' },
  'tribunal': { category: 'jurisprudence', documentType: 'jugement' },
  'المحكمة': { category: 'jurisprudence' },

  // Domaines
  'droit civil': { domain: 'civil' },
  'القانون المدني': { domain: 'civil' },
  'droit commercial': { domain: 'commercial' },
  'القانون التجاري': { domain: 'commercial' },
  'droit pénal': { domain: 'penal' },
  'القانون الجزائي': { domain: 'penal' },
  'droit de la famille': { domain: 'famille' },
  'الأحوال الشخصية': { domain: 'famille' },
  'droit du travail': { domain: 'travail' },
  'قانون الشغل': { domain: 'travail' },
  'droit fiscal': { domain: 'fiscal' },
  'القانون الجبائي': { domain: 'fiscal' },
  'droit administratif': { domain: 'administratif' },
  'القانون الإداري': { domain: 'administratif' },
  'droit immobilier': { domain: 'immobilier' },
  'القانون العقاري': { domain: 'immobilier' },
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Extrait la structure complète d'une page web
 */
export function extractSiteStructure(html: string, url: string): SiteStructure {
  const $ = cheerio.load(html)

  return {
    breadcrumbs: extractBreadcrumbs($),
    urlPath: analyzeUrl(url),
    navigation: extractNavigation($),
    headings: extractHeadings($),
    sectionContext: extractSectionContext($, url),
  }
}

/**
 * Génère des indices de classification à partir de la structure
 */
export function generateStructuralHints(structure: SiteStructure): StructuralHint[] {
  const hints: StructuralHint[] = []

  // Indices depuis les breadcrumbs
  for (const crumb of structure.breadcrumbs) {
    const labelLower = crumb.label.toLowerCase()

    for (const [keyword, classification] of Object.entries(BREADCRUMB_KEYWORDS)) {
      if (labelLower.includes(keyword.toLowerCase())) {
        hints.push({
          source: 'breadcrumb',
          suggestedCategory: classification.category || null,
          suggestedDomain: classification.domain || null,
          suggestedDocumentType: classification.documentType || null,
          confidence: 0.8 - (crumb.level * 0.1), // Plus haut dans la hiérarchie = plus fiable
          evidence: `Breadcrumb "${crumb.label}" contient "${keyword}"`,
        })
      }
    }
  }

  // Indices depuis l'URL
  for (const pattern of structure.urlPath.detectedPatterns) {
    hints.push({
      source: 'url',
      suggestedCategory: pattern.suggestedCategory,
      suggestedDomain: pattern.suggestedDomain,
      suggestedDocumentType: pattern.suggestedDocumentType,
      confidence: pattern.confidence,
      evidence: `URL match pattern "${pattern.pattern}"`,
    })
  }

  // Indices depuis la navigation active
  const activeNav = structure.navigation.filter(n => n.isActive)
  for (const nav of activeNav) {
    const labelLower = nav.label.toLowerCase()

    for (const [keyword, classification] of Object.entries(BREADCRUMB_KEYWORDS)) {
      if (labelLower.includes(keyword.toLowerCase())) {
        hints.push({
          source: 'navigation',
          suggestedCategory: classification.category || null,
          suggestedDomain: classification.domain || null,
          suggestedDocumentType: classification.documentType || null,
          confidence: 0.7,
          evidence: `Navigation active "${nav.label}" contient "${keyword}"`,
        })
      }
    }
  }

  // Indices depuis les titres
  if (structure.headings.h1) {
    const h1Lower = structure.headings.h1.toLowerCase()

    // Patterns dans H1
    if (h1Lower.includes('arrêt') || h1Lower.includes('قرار')) {
      hints.push({
        source: 'heading',
        suggestedCategory: 'jurisprudence',
        suggestedDomain: null,
        suggestedDocumentType: null,
        confidence: 0.7,
        evidence: `H1 contient "arrêt/قرار"`,
      })
    }

    if (h1Lower.includes('loi') || h1Lower.includes('قانون')) {
      hints.push({
        source: 'heading',
        suggestedCategory: 'legislation',
        suggestedDomain: null,
        suggestedDocumentType: 'loi',
        confidence: 0.7,
        evidence: `H1 contient "loi/قانون"`,
      })
    }

    if (h1Lower.includes('article') || h1Lower.includes('الفصل')) {
      hints.push({
        source: 'heading',
        suggestedCategory: 'codes',
        suggestedDomain: null,
        suggestedDocumentType: null,
        confidence: 0.6,
        evidence: `H1 contient "article/الفصل"`,
      })
    }

    if (h1Lower.includes('décret') || h1Lower.includes('أمر')) {
      hints.push({
        source: 'heading',
        suggestedCategory: 'legislation',
        suggestedDomain: null,
        suggestedDocumentType: 'decret',
        confidence: 0.7,
        evidence: `H1 contient "décret/أمر"`,
      })
    }
  }

  return hints
}

/**
 * Fusionne les indices structurels en une classification suggérée
 */
export function fuseStructuralHints(hints: StructuralHint[]): {
  category: string | null
  domain: string | null
  documentType: string | null
  confidence: number
} {
  if (hints.length === 0) {
    return { category: null, domain: null, documentType: null, confidence: 0 }
  }

  // Agréger les votes par attribut
  const categoryVotes: Record<string, number> = {}
  const domainVotes: Record<string, number> = {}
  const documentTypeVotes: Record<string, number> = {}

  for (const hint of hints) {
    if (hint.suggestedCategory) {
      categoryVotes[hint.suggestedCategory] = (categoryVotes[hint.suggestedCategory] || 0) + hint.confidence
    }
    if (hint.suggestedDomain) {
      domainVotes[hint.suggestedDomain] = (domainVotes[hint.suggestedDomain] || 0) + hint.confidence
    }
    if (hint.suggestedDocumentType) {
      documentTypeVotes[hint.suggestedDocumentType] = (documentTypeVotes[hint.suggestedDocumentType] || 0) + hint.confidence
    }
  }

  // Sélectionner les gagnants
  const getWinner = (votes: Record<string, number>): { value: string | null; score: number } => {
    const entries = Object.entries(votes)
    if (entries.length === 0) return { value: null, score: 0 }
    entries.sort((a, b) => b[1] - a[1])
    return { value: entries[0][0], score: entries[0][1] }
  }

  const categoryWinner = getWinner(categoryVotes)
  const domainWinner = getWinner(domainVotes)
  const documentTypeWinner = getWinner(documentTypeVotes)

  // Calculer la confiance globale
  const totalConfidence = hints.reduce((sum, h) => sum + h.confidence, 0)
  const maxPossibleConfidence = hints.length // Si toutes les confiances étaient 1.0
  const normalizedConfidence = Math.min(totalConfidence / Math.max(maxPossibleConfidence, 1), 1)

  return {
    category: categoryWinner.value,
    domain: domainWinner.value,
    documentType: documentTypeWinner.value,
    confidence: normalizedConfidence,
  }
}

// =============================================================================
// FONCTIONS D'EXTRACTION
// =============================================================================

/**
 * Extrait les breadcrumbs de la page
 */
function extractBreadcrumbs($: CheerioAPI): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = []

  // Essayer chaque sélecteur
  for (const selector of BREADCRUMB_SELECTORS) {
    const container = $(selector).first()
    if (container.length === 0) continue

    // Chercher les liens dans le breadcrumb
    const links = container.find('a, span, li')
    let level = 0

    links.each((_, el) => {
      const $el = $(el)
      const text = $el.text().trim()

      // Ignorer les séparateurs et éléments vides
      if (!text || text === '>' || text === '/' || text === '→' || text === '»') {
        return
      }

      const href = $el.attr('href') || null

      breadcrumbs.push({
        label: text,
        url: href ? resolveUrl(href) : null,
        level: level++,
      })
    })

    if (breadcrumbs.length > 0) break
  }

  return breadcrumbs
}

/**
 * Analyse l'URL pour extraire des indices
 */
function analyzeUrl(url: string): UrlPathAnalysis {
  try {
    const urlObj = new URL(url)
    const segments: UrlSegment[] = []
    const detectedPatterns: UrlPattern[] = []

    // Analyser chaque segment du chemin
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0)

    pathSegments.forEach((segment, index) => {
      const isNumeric = /^\d+$/.test(segment)
      const isDate = /^\d{4}(-\d{2})?(-\d{2})?$/.test(segment)

      let suggestedMeaning: string | null = null

      // Détecter la signification du segment
      if (isDate) {
        suggestedMeaning = 'date'
      } else if (isNumeric) {
        suggestedMeaning = 'id'
      } else if (segment.includes('article')) {
        suggestedMeaning = 'article'
      } else if (segment.includes('code')) {
        suggestedMeaning = 'code'
      }

      segments.push({
        value: segment,
        position: index,
        isNumeric,
        isDate,
        suggestedMeaning,
      })
    })

    // Détecter les patterns
    for (const patternDef of URL_CLASSIFICATION_PATTERNS) {
      if (patternDef.pattern.test(url)) {
        detectedPatterns.push({
          pattern: patternDef.pattern.source,
          confidence: patternDef.confidence,
          suggestedCategory: patternDef.category || null,
          suggestedDomain: patternDef.domain || null,
          suggestedDocumentType: patternDef.documentType || null,
        })
      }
    }

    // Extraire les paramètres de requête
    const queryParams: Record<string, string> = {}
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value
    })

    return {
      fullPath: urlObj.pathname,
      segments,
      queryParams,
      detectedPatterns,
    }
  } catch {
    return {
      fullPath: url,
      segments: [],
      queryParams: {},
      detectedPatterns: [],
    }
  }
}

/**
 * Extrait les éléments de navigation
 */
function extractNavigation($: CheerioAPI): NavigationItem[] {
  const navigation: NavigationItem[] = []

  for (const selector of NAVIGATION_SELECTORS) {
    const nav = $(selector).first()
    if (nav.length === 0) continue

    nav.find('a').each((_, el) => {
      const $el = $(el)
      const text = $el.text().trim()
      const href = $el.attr('href') || null

      if (!text) return

      // Détecter si l'élément est actif
      const isActive = $el.hasClass('active') ||
                      $el.hasClass('current') ||
                      $el.attr('aria-current') === 'page' ||
                      $el.parent().hasClass('active')

      // Détecter le niveau (basé sur la profondeur du DOM)
      let level = 0
      let parent = $el.parent()
      while (parent.length > 0 && !parent.is('nav') && level < 5) {
        if (parent.is('ul') || parent.is('ol')) level++
        parent = parent.parent()
      }

      navigation.push({
        label: text,
        url: href ? resolveUrl(href) : null,
        isActive,
        level,
      })
    })

    if (navigation.length > 0) break
  }

  return navigation
}

/**
 * Extrait la hiérarchie des titres
 */
function extractHeadings($: CheerioAPI): HeadingHierarchy {
  const h1 = $('h1').first().text().trim() || null
  const h2: string[] = []
  const h3: string[] = []

  $('h2').each((_, el) => {
    const text = $(el).text().trim()
    if (text) h2.push(text)
  })

  $('h3').each((_, el) => {
    const text = $(el).text().trim()
    if (text) h3.push(text)
  })

  // Construire la structure hiérarchique
  const structure: HeadingNode[] = []
  let currentH2: HeadingNode | null = null

  $('h1, h2, h3, h4').each((_, el) => {
    const $el = $(el)
    const text = $el.text().trim()
    if (!text) return

    const tagName = el.tagName.toLowerCase()
    const level = parseInt(tagName.charAt(1), 10)

    const node: HeadingNode = { level, text, children: [] }

    if (level === 1) {
      structure.push(node)
      currentH2 = null
    } else if (level === 2) {
      structure.push(node)
      currentH2 = node
    } else if (level === 3 && currentH2) {
      currentH2.children.push(node)
    }
  })

  return { h1, h2, h3, structure }
}

/**
 * Extrait le contexte de la section
 */
function extractSectionContext($: CheerioAPI, url: string): SectionContext | null {
  // Chercher des liens "précédent/suivant" ou pagination
  const siblingPages: string[] = []

  // Liens de navigation interne
  $('a[rel="prev"], a[rel="next"], .prev-next a, .pagination a').each((_, el) => {
    const href = $(el).attr('href')
    if (href) {
      siblingPages.push(resolveUrl(href))
    }
  })

  // Sections parentes depuis les breadcrumbs
  let parentSection: string | null = null
  let currentSection: string | null = null

  $('.breadcrumb a, .breadcrumbs a').each((index, el) => {
    const $el = $(el)
    const text = $el.text().trim()

    if (index === 0) {
      // Premier niveau = section parente
      parentSection = text
    }
  })

  // Section courante = dernier élément du breadcrumb
  const lastBreadcrumb = $('.breadcrumb > :last-child, .breadcrumbs > :last-child').text().trim()
  if (lastBreadcrumb) {
    currentSection = lastBreadcrumb
  }

  if (!parentSection && !currentSection && siblingPages.length === 0) {
    return null
  }

  return {
    parentSection,
    currentSection,
    siblingPages,
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Résout une URL relative
 */
function resolveUrl(href: string): string {
  // Si c'est déjà une URL absolue, la retourner
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href
  }

  // Sinon, retourner le chemin tel quel (sera résolu par le caller)
  return href
}
