/**
 * Service de Filtrage Intelligent par Contexte (Phase 2.2)
 *
 * Priorise et filtre les sources selon le contexte juridique avec scores adaptatifs
 *
 * Règles de priorisation :
 * - Jurisprudence récente (<5 ans) : +20%
 * - Tribunal Cassation : +15%
 * - Domaine match query : +25%
 * - Document cité >5 fois : +10%
 * - Contradiction détectée : -30%
 *
 * Diversité garantie :
 * - Max 40% même tribunal
 * - Min 3 catégories différentes
 *
 * @module lib/ai/context-aware-filtering-service
 */

import type { HybridSearchResult } from './hybrid-retrieval-service'

// =============================================================================
// TYPES
// =============================================================================

export interface ContextualSource extends HybridSearchResult {
  priorityScore: number
  priorityFactors: PriorityFactors
  metadata?: {
    tribunalCode?: string
    chambreCode?: string
    decisionDate?: Date
    citationCount?: number
    hasContradiction?: boolean
    domain?: string
  }
}

export interface PriorityFactors {
  baseScore: number
  recencyBoost: number
  tribunalBoost: number
  domainBoost: number
  citationBoost: number
  contradictionPenalty: number
}

export interface FilteringOptions {
  targetCount?: number
  maxSameTribunal?: number // Ratio max (0-1)
  minCategories?: number
  prioritizeCassation?: boolean
  prioritizeRecent?: boolean
  excludeContradictions?: boolean
  detectedDomain?: string
}

export interface FilteringResult {
  sources: ContextualSource[]
  diversity: {
    tribunalDistribution: Map<string, number>
    categoryDistribution: Map<string, number>
    maxTribunalRatio: number
    numCategories: number
  }
  metrics: {
    totalCandidates: number
    filteredCount: number
    avgPriorityScore: number
    durationMs: number
  }
}

// =============================================================================
// Configuration par défaut
// =============================================================================

const DEFAULT_OPTIONS: Required<FilteringOptions> = {
  targetCount: 20,
  maxSameTribunal: 0.4, // Max 40% même tribunal
  minCategories: 3,
  prioritizeCassation: true,
  prioritizeRecent: true,
  excludeContradictions: true,
  detectedDomain: '',
}

// Poids des facteurs de priorisation
const PRIORITY_WEIGHTS = {
  recency: 0.2, // +20% si <5 ans
  tribunal: 0.15, // +15% si Cassation
  domain: 0.25, // +25% si domaine match
  citation: 0.1, // +10% si >5 citations
  contradiction: -0.3, // -30% si contradiction
}

// =============================================================================
// FONCTION PRINCIPALE : Filtrage Contextuel
// =============================================================================

/**
 * Filtre et priorise les sources selon le contexte juridique
 *
 * @param candidates - Résultats hybrides à filtrer
 * @param options - Options de filtrage
 * @returns Sources filtrées et priorisées + métriques
 *
 * @example
 * ```ts
 * const filtered = await filterByContext(hybridResults, {
 *   targetCount: 15,
 *   detectedDomain: 'droit_civil',
 *   prioritizeCassation: true
 * })
 * console.log(`${filtered.sources.length} sources prioritaires`)
 * ```
 */
export async function filterByContext(
  candidates: HybridSearchResult[],
  options: FilteringOptions = {}
): Promise<FilteringResult> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // 1. Enrichir avec métadonnées (si disponibles)
  let enrichedCandidates = await enrichWithMetadata(candidates)

  // 2. Calculer score de priorité pour chaque source
  enrichedCandidates = enrichedCandidates.map(source => ({
    ...source,
    priorityScore: computeSourcePriority(source, opts),
    priorityFactors: computePriorityFactors(source, opts),
  }))

  // 3. Trier par priorité décroissante
  enrichedCandidates.sort((a, b) => b.priorityScore - a.priorityScore)

  // 4. Filtrer contradictions (si activé)
  if (opts.excludeContradictions) {
    enrichedCandidates = enrichedCandidates.filter(
      s => !s.metadata?.hasContradiction
    )
  }

  // 5. Garantir diversité (tribunal + catégorie)
  const diversifiedSources = ensureDiversity(enrichedCandidates, opts)

  // 6. Limiter au nombre cible
  const finalSources = diversifiedSources.slice(0, opts.targetCount)

  // 7. Calculer métriques diversité
  const diversity = computeDiversityMetrics(finalSources)

  const durationMs = Date.now() - startTime
  const avgPriorityScore =
    finalSources.reduce((sum, s) => sum + s.priorityScore, 0) / finalSources.length

  console.log(
    `[Context Filtering] ${candidates.length} → ${finalSources.length} sources (${diversity.numCategories} catégories, tribunal max ${(diversity.maxTribunalRatio * 100).toFixed(1)}%, ${durationMs}ms)`
  )

  return {
    sources: finalSources,
    diversity,
    metrics: {
      totalCandidates: candidates.length,
      filteredCount: finalSources.length,
      avgPriorityScore,
      durationMs,
    },
  }
}

// =============================================================================
// Enrichissement Métadonnées
// =============================================================================

async function enrichWithMetadata(
  candidates: HybridSearchResult[]
): Promise<ContextualSource[]> {
  if (candidates.length === 0) {
    return []
  }

  // Extraire document_ids depuis chunk_id (format: doc_UUID_chunk_N)
  const documentIds = new Set<string>()
  const chunkToDocMap = new Map<string, string>()

  candidates.forEach(c => {
    const match = c.chunkId.match(/^(.+)_chunk_\d+$/)
    if (match) {
      const docId = match[1]
      documentIds.add(docId)
      chunkToDocMap.set(c.chunkId, docId)
    }
  })

  if (documentIds.size === 0) {
    console.warn('[Context Filtering] Aucun document_id extrait des chunk_ids')
    return candidates.map(c => createDefaultContextualSource(c))
  }

  try {
    // Batch query vers kb_structured_metadata
    const { db } = await import('@/lib/db/postgres')
    const metadataQuery = `
      SELECT
        document_id,
        tribunal_code,
        chambre_code,
        decision_date,
        domain,
        citation_count,
        has_contradiction
      FROM kb_structured_metadata
      WHERE document_id = ANY($1::UUID[])
    `

    const result = await db.query(metadataQuery, [Array.from(documentIds)])

    // Créer map document_id → metadata
    const metadataMap = new Map(
      result.rows.map(row => [
        row.document_id,
        {
          tribunalCode: row.tribunal_code,
          chambreCode: row.chambre_code,
          decisionDate: row.decision_date ? new Date(row.decision_date) : undefined,
          citationCount: row.citation_count || 0,
          hasContradiction: row.has_contradiction || false,
          domain: row.domain,
        },
      ])
    )

    // Enrichir candidates avec métadonnées
    return candidates.map(c => {
      const docId = chunkToDocMap.get(c.chunkId)
      const metadata = docId ? metadataMap.get(docId) : undefined

      return {
        ...c,
        priorityScore: 0,
        priorityFactors: {
          baseScore: 0,
          recencyBoost: 0,
          tribunalBoost: 0,
          domainBoost: 0,
          citationBoost: 0,
          contradictionPenalty: 0,
        },
        metadata: metadata || {
          tribunalCode: undefined,
          chambreCode: undefined,
          decisionDate: undefined,
          citationCount: 0,
          hasContradiction: false,
          domain: undefined,
        },
      }
    })
  } catch (error) {
    console.error('[Context Filtering] Erreur enrichissement métadonnées:', error)
    // Fallback : retourner sans métadonnées
    return candidates.map(c => createDefaultContextualSource(c))
  }
}

/**
 * Crée un ContextualSource par défaut (sans métadonnées enrichies)
 */
function createDefaultContextualSource(
  candidate: HybridSearchResult
): ContextualSource {
  return {
    ...candidate,
    priorityScore: 0,
    priorityFactors: {
      baseScore: 0,
      recencyBoost: 0,
      tribunalBoost: 0,
      domainBoost: 0,
      citationBoost: 0,
      contradictionPenalty: 0,
    },
    metadata: {
      tribunalCode: undefined,
      chambreCode: undefined,
      decisionDate: undefined,
      citationCount: 0,
      hasContradiction: false,
      domain: undefined,
    },
  }
}

// =============================================================================
// Calcul Score Priorité
// =============================================================================

/**
 * Calcule le score de priorité d'une source selon le contexte
 *
 * Score = baseScore * (1 + boosts - penalties)
 */
function computeSourcePriority(
  source: ContextualSource,
  opts: Required<FilteringOptions>
): number {
  const factors = computePriorityFactors(source, opts)

  // Score de base = RRF score ou Dense score
  const baseScore = source.rrfScore || source.denseScore || 0.5

  // Appliquer multiplicateurs
  const totalBoost =
    factors.recencyBoost +
    factors.tribunalBoost +
    factors.domainBoost +
    factors.citationBoost +
    factors.contradictionPenalty

  return baseScore * (1 + totalBoost)
}

/**
 * Calcule les facteurs détaillés de priorité
 */
function computePriorityFactors(
  source: ContextualSource,
  opts: Required<FilteringOptions>
): PriorityFactors {
  const factors: PriorityFactors = {
    baseScore: source.rrfScore || source.denseScore || 0.5,
    recencyBoost: 0,
    tribunalBoost: 0,
    domainBoost: 0,
    citationBoost: 0,
    contradictionPenalty: 0,
  }

  const metadata = source.metadata

  // 1. Récence (jurisprudence <5 ans)
  if (opts.prioritizeRecent && metadata?.decisionDate) {
    const age = Date.now() - metadata.decisionDate.getTime()
    const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000
    if (age < fiveYears) {
      factors.recencyBoost = PRIORITY_WEIGHTS.recency
    }
  }

  // 2. Tribunal (Cassation prioritaire)
  if (opts.prioritizeCassation && metadata?.tribunalCode === 'TRIBUNAL_CASSATION') {
    factors.tribunalBoost = PRIORITY_WEIGHTS.tribunal
  }

  // 3. Domaine (match avec query)
  if (opts.detectedDomain && metadata?.domain === opts.detectedDomain) {
    factors.domainBoost = PRIORITY_WEIGHTS.domain
  }

  // 4. Citations (document cité >5 fois)
  if (metadata?.citationCount && metadata.citationCount > 5) {
    factors.citationBoost = PRIORITY_WEIGHTS.citation
  }

  // 5. Contradiction (pénalité si détectée)
  if (metadata?.hasContradiction) {
    factors.contradictionPenalty = PRIORITY_WEIGHTS.contradiction
  }

  return factors
}

// =============================================================================
// Garantie Diversité
// =============================================================================

/**
 * Garantit la diversité des sources (tribunal + catégorie)
 *
 * Règles :
 * - Max 40% d'un même tribunal
 * - Min 3 catégories différentes
 */
function ensureDiversity(
  sources: ContextualSource[],
  opts: Required<FilteringOptions>
): ContextualSource[] {
  const result: ContextualSource[] = []
  const tribunalCount = new Map<string, number>()
  const categoryCount = new Map<string, number>()

  for (const source of sources) {
    const tribunal = source.metadata?.tribunalCode || 'unknown'
    const category = source.category

    // Vérifier contrainte tribunal (max 40%)
    const currentTribunalCount = tribunalCount.get(tribunal) || 0
    const tribunalRatio = currentTribunalCount / (result.length || 1)

    if (tribunalRatio >= opts.maxSameTribunal && result.length > 0) {
      // Skip ce tribunal (trop représenté)
      continue
    }

    // Ajouter source
    result.push(source)
    tribunalCount.set(tribunal, currentTribunalCount + 1)
    categoryCount.set(category, (categoryCount.get(category) || 0) + 1)

    // Arrêter si objectif atteint ET min catégories respecté
    if (
      result.length >= opts.targetCount &&
      categoryCount.size >= opts.minCategories
    ) {
      break
    }
  }

  // Si pas assez de catégories, forcer diversité
  if (categoryCount.size < opts.minCategories) {
    console.warn(
      `[Context Filtering] Diversité catégorie insuffisante (${categoryCount.size}/${opts.minCategories})`
    )
    // TODO: Ajouter sources de catégories manquantes
  }

  return result
}

// =============================================================================
// Métriques Diversité
// =============================================================================

function computeDiversityMetrics(sources: ContextualSource[]) {
  const tribunalDist = new Map<string, number>()
  const categoryDist = new Map<string, number>()

  sources.forEach(s => {
    const tribunal = s.metadata?.tribunalCode || 'unknown'
    const category = s.category

    tribunalDist.set(tribunal, (tribunalDist.get(tribunal) || 0) + 1)
    categoryDist.set(category, (categoryDist.get(category) || 0) + 1)
  })

  const maxTribunalCount = Math.max(...Array.from(tribunalDist.values()), 0)
  const maxTribunalRatio = sources.length > 0 ? maxTribunalCount / sources.length : 0

  return {
    tribunalDistribution: tribunalDist,
    categoryDistribution: categoryDist,
    maxTribunalRatio,
    numCategories: categoryDist.size,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { filterByContext as default }
