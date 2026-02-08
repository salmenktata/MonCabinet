/**
 * Service d'enrichissement contextuel
 *
 * Utilise le contexte des pages voisines pour améliorer la classification:
 * - Pages du même code juridique
 * - Pages de la même source
 * - Pages avec structure similaire
 */

import { db } from '@/lib/db/postgres'
import type { LegalDomain, LegalContentCategory, DocumentNature } from './types'

// =============================================================================
// TYPES
// =============================================================================

export interface ContextualSignal {
  source: 'siblings' | 'same_code' | 'same_structure'
  category: LegalContentCategory | null
  domain: LegalDomain | null
  documentType: DocumentNature | null
  confidence: number
  evidence: string
  sampleCount: number
}

export interface EnrichmentResult {
  signals: ContextualSignal[]
  confidenceBoost: number
  suggestedCategory: LegalContentCategory | null
  suggestedDomain: LegalDomain | null
  suggestedDocumentType: DocumentNature | null
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const MIN_SIMILAR_PAGES = 3  // Minimum de pages similaires pour confiance
const CONFIDENCE_BOOST_PER_PAGE = 0.05  // Boost par page similaire
const MAX_CONFIDENCE_BOOST = 0.20  // Boost maximum

// =============================================================================
// ENRICHISSEMENT PRINCIPAL
// =============================================================================

/**
 * Enrichit une classification en utilisant le contexte
 */
export async function enrichWithContext(
  pageId: string,
  url: string,
  webSourceId: string,
  currentClassification: {
    category: LegalContentCategory | null
    domain: LegalDomain | null
    documentType: DocumentNature | null
  }
): Promise<EnrichmentResult> {
  const signals: ContextualSignal[] = []

  // 1. Analyser les pages du même code juridique
  const codeContext = await analyzeSameCodePages(url, webSourceId, pageId)
  if (codeContext) {
    signals.push(codeContext)
  }

  // 2. Analyser les pages avec URL similaire
  const urlContext = await analyzeSimilarUrlPages(url, webSourceId, pageId)
  if (urlContext) {
    signals.push(urlContext)
  }

  // 3. Analyser les pages de la même section
  const sectionContext = await analyzeSameSectionPages(url, webSourceId, pageId)
  if (sectionContext) {
    signals.push(sectionContext)
  }

  // 4. Fusionner les signaux
  const result = fuseContextualSignals(signals, currentClassification)

  return result
}

// =============================================================================
// ANALYSEURS SPÉCIFIQUES
// =============================================================================

/**
 * Analyse les pages du même code juridique
 * Ex: Toutes les pages du "Code des Obligations et Contrats"
 */
async function analyzeSameCodePages(
  url: string,
  webSourceId: string,
  excludePageId: string
): Promise<ContextualSignal | null> {
  // Extraire le code base de l'URL
  const codePattern = extractCodePattern(url)
  if (!codePattern) return null

  const result = await db.query<{
    primary_category: LegalContentCategory
    domain: LegalDomain
    document_nature: DocumentNature
    count: string
  }>(
    `SELECT
      lc.primary_category,
      lc.domain,
      lc.document_nature,
      COUNT(*) as count
    FROM web_pages wp
    JOIN legal_classifications lc ON wp.id = lc.web_page_id
    WHERE wp.web_source_id = $1
      AND wp.url LIKE $2
      AND wp.id != $3
      AND lc.confidence_score >= 0.7
      AND lc.requires_validation = false
    GROUP BY lc.primary_category, lc.domain, lc.document_nature
    ORDER BY count DESC
    LIMIT 1`,
    [webSourceId, `%${codePattern}%`, excludePageId]
  )

  if (result.rows.length === 0 || parseInt(result.rows[0].count, 10) < MIN_SIMILAR_PAGES) {
    return null
  }

  const row = result.rows[0]
  const count = parseInt(row.count, 10)

  return {
    source: 'same_code',
    category: row.primary_category,
    domain: row.domain,
    documentType: row.document_nature,
    confidence: Math.min(0.9, 0.6 + (count * 0.05)),
    evidence: `${count} pages du même code classées similairement`,
    sampleCount: count,
  }
}

/**
 * Analyse les pages avec URL similaire (même pattern)
 */
async function analyzeSimilarUrlPages(
  url: string,
  webSourceId: string,
  excludePageId: string
): Promise<ContextualSignal | null> {
  // Extraire le pattern d'URL (sans les IDs)
  const urlPattern = url.replace(/\/\d+/g, '/%').replace(/[0-9a-f-]{30,}/gi, '%')

  const result = await db.query<{
    primary_category: LegalContentCategory
    domain: LegalDomain
    document_nature: DocumentNature
    count: string
  }>(
    `SELECT
      lc.primary_category,
      lc.domain,
      lc.document_nature,
      COUNT(*) as count
    FROM web_pages wp
    JOIN legal_classifications lc ON wp.id = lc.web_page_id
    WHERE wp.web_source_id = $1
      AND wp.url SIMILAR TO $2
      AND wp.id != $3
      AND lc.confidence_score >= 0.7
    GROUP BY lc.primary_category, lc.domain, lc.document_nature
    ORDER BY count DESC
    LIMIT 1`,
    [webSourceId, urlPattern, excludePageId]
  )

  if (result.rows.length === 0 || parseInt(result.rows[0].count, 10) < MIN_SIMILAR_PAGES) {
    return null
  }

  const row = result.rows[0]
  const count = parseInt(row.count, 10)

  return {
    source: 'siblings',
    category: row.primary_category,
    domain: row.domain,
    documentType: row.document_nature,
    confidence: Math.min(0.85, 0.5 + (count * 0.05)),
    evidence: `${count} pages avec URL similaire`,
    sampleCount: count,
  }
}

/**
 * Analyse les pages de la même section (breadcrumbs similaires)
 */
async function analyzeSameSectionPages(
  url: string,
  webSourceId: string,
  excludePageId: string
): Promise<ContextualSignal | null> {
  // Extraire le chemin de section (avant le dernier /)
  const parts = url.split('/')
  if (parts.length < 3) return null

  const sectionPath = parts.slice(0, -1).join('/')

  const result = await db.query<{
    primary_category: LegalContentCategory
    domain: LegalDomain
    document_nature: DocumentNature
    count: string
  }>(
    `SELECT
      lc.primary_category,
      lc.domain,
      lc.document_nature,
      COUNT(*) as count
    FROM web_pages wp
    JOIN legal_classifications lc ON wp.id = lc.web_page_id
    WHERE wp.web_source_id = $1
      AND wp.url LIKE $2
      AND wp.id != $3
      AND lc.confidence_score >= 0.7
    GROUP BY lc.primary_category, lc.domain, lc.document_nature
    ORDER BY count DESC
    LIMIT 1`,
    [webSourceId, `${sectionPath}/%`, excludePageId]
  )

  if (result.rows.length === 0 || parseInt(result.rows[0].count, 10) < MIN_SIMILAR_PAGES) {
    return null
  }

  const row = result.rows[0]
  const count = parseInt(row.count, 10)

  return {
    source: 'same_structure',
    category: row.primary_category,
    domain: row.domain,
    documentType: row.document_nature,
    confidence: Math.min(0.80, 0.5 + (count * 0.05)),
    evidence: `${count} pages de la même section`,
    sampleCount: count,
  }
}

// =============================================================================
// FUSION DES SIGNAUX
// =============================================================================

/**
 * Fusionne les signaux contextuels avec la classification actuelle
 */
function fuseContextualSignals(
  signals: ContextualSignal[],
  currentClassification: {
    category: LegalContentCategory | null
    domain: LegalDomain | null
    documentType: DocumentNature | null
  }
): EnrichmentResult {
  if (signals.length === 0) {
    return {
      signals: [],
      confidenceBoost: 0,
      suggestedCategory: null,
      suggestedDomain: null,
      suggestedDocumentType: null,
    }
  }

  // Calculer le boost de confiance
  let confidenceBoost = 0
  let matchingSignals = 0

  for (const signal of signals) {
    // Bonus si le signal confirme la classification actuelle
    let isMatching = false

    if (currentClassification.category && signal.category === currentClassification.category) {
      isMatching = true
    }
    if (currentClassification.domain && signal.domain === currentClassification.domain) {
      isMatching = true
    }
    if (currentClassification.documentType && signal.documentType === currentClassification.documentType) {
      isMatching = true
    }

    if (isMatching) {
      matchingSignals++
      confidenceBoost += CONFIDENCE_BOOST_PER_PAGE * signal.sampleCount
    }
  }

  // Limiter le boost maximum
  confidenceBoost = Math.min(confidenceBoost, MAX_CONFIDENCE_BOOST)

  // Suggérer des valeurs si la classification actuelle est incomplète
  const categoryVotes = new Map<LegalContentCategory, number>()
  const domainVotes = new Map<LegalDomain, number>()
  const documentTypeVotes = new Map<DocumentNature, number>()

  for (const signal of signals) {
    if (signal.category) {
      categoryVotes.set(
        signal.category,
        (categoryVotes.get(signal.category) || 0) + signal.confidence * signal.sampleCount
      )
    }
    if (signal.domain) {
      domainVotes.set(
        signal.domain,
        (domainVotes.get(signal.domain) || 0) + signal.confidence * signal.sampleCount
      )
    }
    if (signal.documentType) {
      documentTypeVotes.set(
        signal.documentType,
        (documentTypeVotes.get(signal.documentType) || 0) + signal.confidence * signal.sampleCount
      )
    }
  }

  const getTopVote = <T extends string>(votes: Map<T, number>): T | null => {
    if (votes.size === 0) return null
    return Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0][0]
  }

  return {
    signals,
    confidenceBoost,
    suggestedCategory: !currentClassification.category ? getTopVote(categoryVotes) : null,
    suggestedDomain: !currentClassification.domain ? getTopVote(domainVotes) : null,
    suggestedDocumentType: !currentClassification.documentType ? getTopVote(documentTypeVotes) : null,
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Extrait le nom du code juridique de l'URL
 * Ex: "/codes/code-obligations-contrats/article-1" → "code-obligations-contrats"
 */
function extractCodePattern(url: string): string | null {
  // Pattern pour codes juridiques
  const codeMatch = url.match(/\/codes?\/([\w-]+)/)
  if (codeMatch) {
    return codeMatch[1]
  }

  // Pattern pour jurisprudence
  const juriMatch = url.match(/\/jurisprudence\/([\w-]+)/)
  if (juriMatch) {
    return juriMatch[1]
  }

  return null
}

/**
 * Détecte les anomalies de classification
 * Si une page est classée différemment de ses voisines
 */
export async function detectClassificationAnomalies(
  webSourceId: string,
  limit: number = 20
): Promise<Array<{
  pageId: string
  url: string
  classification: {
    category: LegalContentCategory
    domain: LegalDomain | null
  }
  contextualMajority: {
    category: LegalContentCategory
    domain: LegalDomain | null
    count: number
  }
  isAnomaly: boolean
}>> {
  const result = await db.query<{
    page_id: string
    url: string
    primary_category: LegalContentCategory
    domain: LegalDomain
    context_category: LegalContentCategory
    context_domain: LegalDomain
    context_count: string
  }>(
    `WITH page_contexts AS (
      SELECT
        wp.id as page_id,
        wp.url,
        lc.primary_category,
        lc.domain,
        -- Trouver la classification majoritaire des pages similaires
        (
          SELECT lc2.primary_category
          FROM web_pages wp2
          JOIN legal_classifications lc2 ON wp2.id = lc2.web_page_id
          WHERE wp2.web_source_id = wp.web_source_id
            AND wp2.url LIKE (regexp_replace(wp.url, '/[^/]+$', '/%'))
            AND wp2.id != wp.id
            AND lc2.confidence_score >= 0.7
          GROUP BY lc2.primary_category
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) as context_category,
        (
          SELECT lc2.domain
          FROM web_pages wp2
          JOIN legal_classifications lc2 ON wp2.id = lc2.web_page_id
          WHERE wp2.web_source_id = wp.web_source_id
            AND wp2.url LIKE (regexp_replace(wp.url, '/[^/]+$', '/%'))
            AND wp2.id != wp.id
            AND lc2.confidence_score >= 0.7
          GROUP BY lc2.domain
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) as context_domain,
        (
          SELECT COUNT(*)
          FROM web_pages wp2
          JOIN legal_classifications lc2 ON wp2.id = lc2.web_page_id
          WHERE wp2.web_source_id = wp.web_source_id
            AND wp2.url LIKE (regexp_replace(wp.url, '/[^/]+$', '/%'))
            AND wp2.id != wp.id
            AND lc2.confidence_score >= 0.7
        ) as context_count
      FROM web_pages wp
      JOIN legal_classifications lc ON wp.id = lc.web_page_id
      WHERE wp.web_source_id = $1
    )
    SELECT *
    FROM page_contexts
    WHERE context_count >= 3
      AND (
        primary_category != context_category
        OR domain != context_domain
      )
    ORDER BY context_count DESC
    LIMIT $2`,
    [webSourceId, limit]
  )

  return result.rows.map(row => ({
    pageId: row.page_id,
    url: row.url,
    classification: {
      category: row.primary_category,
      domain: row.domain,
    },
    contextualMajority: {
      category: row.context_category,
      domain: row.context_domain,
      count: parseInt(row.context_count, 10),
    },
    isAnomaly: true,
  }))
}
