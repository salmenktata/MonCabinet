/**
 * Service Active Learning RAG (Phase 5.2)
 *
 * Identifie gaps KB via uncertainty sampling et feedback négatifs :
 * - Questions confidence RAG < 0.6
 * - Questions <5 sources trouvées
 * - Feedbacks négatifs récurrents (rating <3, >3 occurrences)
 *
 * Objectif : Identifier 50 docs manquants/mois pour acquisition prioritaire
 *
 * @module lib/ai/active-learning-service
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeGap {
  id: string
  topic: string // Sujet/domaine juridique
  occurrenceCount: number // Nombre questions sur ce sujet
  avgRating: number // Rating moyen feedbacks (1-5)
  avgConfidence: number // Confidence RAG moyenne (0-1)
  avgSourcesCount: number // Nombre sources moyen trouvées
  exampleQuestions: string[] // Questions exemplaires
  suggestedSources: string[] // Sources suggérées par avocats
  priorityScore: number // Score priorité (0-100)
  detectedAt: Date
}

export interface HighValueDocument {
  id: string
  title: string
  sourceType: 'jurisprudence' | 'legislation' | 'doctrine' | 'modele' | 'autre'
  sourceUrl?: string
  confidence: number // Confiance dans pertinence (0-1)
  estimatedImpact: number // Impact estimé (nombre questions affectées)
  suggestedBy: string[] // User IDs avocats ayant suggéré
  relatedGapIds: string[] // IDs gaps KB associés
}

export interface GapAnalysisOptions {
  daysBack?: number // Période analyse (défaut 30j)
  minOccurrences?: number // Occurrences min (défaut 3)
  maxRating?: number // Rating max (défaut 3)
  minConfidence?: number // Confidence min (défaut 0.6)
  domains?: string[] // Domaines juridiques filtrés
  limit?: number // Limite résultats (défaut 50)
}

export interface GapAnalysisResult {
  gaps: KnowledgeGap[]
  stats: {
    totalGapsFound: number
    totalQuestionsAnalyzed: number
    avgPriorityScore: number
    topDomains: { domain: string; count: number }[]
  }
  recommendations: string[]
}

export interface SourceSuggestion {
  sourceType: 'cassation.tn' | 'legislation.tn' | 'doctrine' | 'google_scholar'
  searchQuery: string
  estimatedResults: number
  priority: 'high' | 'medium' | 'low'
}

// =============================================================================
// CONSTANTES
// =============================================================================

const DEFAULT_OPTIONS: Required<GapAnalysisOptions> = {
  daysBack: 30,
  minOccurrences: 3,
  maxRating: 3,
  minConfidence: 0.6,
  domains: [],
  limit: 50,
}

// Poids pour calcul priority_score
const WEIGHTS = {
  occurrenceCount: 0.3, // 30% - Fréquence questions
  lowRating: 0.25, // 25% - Rating faible
  lowConfidence: 0.25, // 25% - Confidence RAG faible
  lowSourcesCount: 0.2, // 20% - Peu sources trouvées
}

// Seuils uncertainty sampling
const UNCERTAINTY_THRESHOLDS = {
  lowConfidence: 0.6,
  fewSources: 5,
  negativeRating: 3,
}

// =============================================================================
// FONCTION 1 : Identifier Gaps KB via Feedbacks
// =============================================================================

export async function findKnowledgeGaps(
  options: GapAnalysisOptions = {}
): Promise<GapAnalysisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    console.log(
      `[Active Learning] Recherche gaps KB (${opts.daysBack}j, min ${opts.minOccurrences} occurrences, rating ≤${opts.maxRating})...`
    )

    // 1. Récupérer gaps via fonction SQL
    let queryText = `
      SELECT
        topic,
        occurrence_count,
        avg_rating,
        suggested_sources,
        example_questions
      FROM get_knowledge_gaps($1, $2, $3)
    `

    const queryParams: any[] = [
      opts.minOccurrences,
      opts.maxRating,
      opts.daysBack,
    ]

    // Filtrer par domaines si spécifiés
    if (opts.domains.length > 0) {
      queryText = `
        WITH gaps AS (${queryText})
        SELECT * FROM gaps WHERE topic = ANY($4::text[])
      `
      queryParams.push(opts.domains)
    }

    const gapsResult = await db.query(queryText, queryParams)

    // 2. Enrichir avec métriques RAG (confidence, sources count)
    const enrichedGaps: KnowledgeGap[] = await Promise.all(
      gapsResult.rows.map(async row => {
        const metricsResult = await db.query(
          `
          SELECT
            AVG(rag_confidence) AS avg_confidence,
            AVG(sources_count) AS avg_sources_count
          FROM rag_feedback
          WHERE domain = $1
            AND rating <= $2
            AND created_at >= NOW() - ($3 || ' days')::INTERVAL
        `,
          [row.topic, opts.maxRating, opts.daysBack]
        )

        const metrics = metricsResult.rows[0] || {
          avg_confidence: 0.5,
          avg_sources_count: 3,
        }

        // 3. Calculer priority score
        const priorityScore = calculatePriorityScore({
          occurrenceCount: parseInt(row.occurrence_count, 10),
          avgRating: parseFloat(row.avg_rating),
          avgConfidence: parseFloat(metrics.avg_confidence) || 0.5,
          avgSourcesCount: parseFloat(metrics.avg_sources_count) || 3,
        })

        return {
          id: `gap_${row.topic}_${Date.now()}`,
          topic: row.topic,
          occurrenceCount: parseInt(row.occurrence_count, 10),
          avgRating: parseFloat(row.avg_rating),
          avgConfidence: parseFloat(metrics.avg_confidence) || 0.5,
          avgSourcesCount: parseFloat(metrics.avg_sources_count) || 3,
          exampleQuestions: row.example_questions || [],
          suggestedSources: row.suggested_sources || [],
          priorityScore,
          detectedAt: new Date(),
        }
      })
    )

    // 4. Trier par priorité décroissante et limiter
    const sortedGaps = enrichedGaps
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, opts.limit)

    // 5. Calculer statistiques
    const stats = {
      totalGapsFound: sortedGaps.length,
      totalQuestionsAnalyzed: sortedGaps.reduce(
        (sum, gap) => sum + gap.occurrenceCount,
        0
      ),
      avgPriorityScore:
        sortedGaps.reduce((sum, gap) => sum + gap.priorityScore, 0) /
          sortedGaps.length || 0,
      topDomains: getTopDomains(sortedGaps, 5),
    }

    // 6. Générer recommandations
    const recommendations = generateRecommendations(sortedGaps, stats)

    console.log(
      `[Active Learning] ✅ ${stats.totalGapsFound} gaps identifiés, priorité moy ${stats.avgPriorityScore.toFixed(1)}`
    )

    return { gaps: sortedGaps, stats, recommendations }
  } catch (error) {
    console.error('[Active Learning] Erreur findKnowledgeGaps:', error)
    throw error
  }
}

// =============================================================================
// FONCTION 2 : Calculer Priority Score
// =============================================================================

function calculatePriorityScore(params: {
  occurrenceCount: number
  avgRating: number
  avgConfidence: number
  avgSourcesCount: number
}): number {
  const { occurrenceCount, avgRating, avgConfidence, avgSourcesCount } = params

  // Normaliser composantes (0-100)
  const occurrenceScore = Math.min((occurrenceCount / 10) * 100, 100)
  const ratingScore = ((5 - avgRating) / 4) * 100 // Inversion : rating bas = score élevé
  const confidenceScore = ((1 - avgConfidence) / 1) * 100 // Inversion
  const sourcesScore = ((10 - avgSourcesCount) / 10) * 100 // Inversion

  // Calcul pondéré
  const priorityScore =
    occurrenceScore * WEIGHTS.occurrenceCount +
    ratingScore * WEIGHTS.lowRating +
    confidenceScore * WEIGHTS.lowConfidence +
    sourcesScore * WEIGHTS.lowSourcesCount

  return Math.round(priorityScore)
}

// =============================================================================
// FONCTION 3 : Identifier Documents Haute Valeur
// =============================================================================

export async function identifyHighValueDocuments(
  gapIds: string[]
): Promise<HighValueDocument[]> {
  try {
    console.log(
      `[Active Learning] Identification documents haute valeur pour ${gapIds.length} gaps...`
    )

    if (gapIds.length === 0) {
      return []
    }

    // 1. Récupérer sources suggérées depuis feedbacks
    const suggestionsResult = await db.query(
      `
      SELECT
        unnest(suggested_sources) AS source_suggestion,
        COUNT(*) AS suggestion_count,
        ARRAY_AGG(DISTINCT user_id) AS suggested_by_users,
        ARRAY_AGG(DISTINCT domain) AS related_domains
      FROM rag_feedback
      WHERE suggested_sources IS NOT NULL
        AND array_length(suggested_sources, 1) > 0
        AND rating <= 3
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY unnest(suggested_sources)
      HAVING COUNT(*) >= 2
      ORDER BY suggestion_count DESC
      LIMIT 50
    `
    )

    // 2. Transformer en HighValueDocument
    const highValueDocs: HighValueDocument[] = suggestionsResult.rows.map(
      (row, index) => {
        const sourceText = row.source_suggestion || ''

        // Détection type source
        let sourceType: HighValueDocument['sourceType'] = 'autre'
        let sourceUrl: string | undefined

        if (
          sourceText.match(/arrêt|cassation|appel|tribunal/i) ||
          sourceText.match(/\d{4,5}\/\d{4}/)
        ) {
          sourceType = 'jurisprudence'
          if (sourceText.includes('cassation.tn')) {
            sourceUrl = sourceText.match(/https?:\/\/[^\s]+/)?.[0]
          }
        } else if (
          sourceText.match(/article|code|loi|décret/i) ||
          sourceText.match(/n°\s*\d+/)
        ) {
          sourceType = 'legislation'
        } else if (
          sourceText.match(/doctrine|commentaire|analyse|thèse/i)
        ) {
          sourceType = 'doctrine'
        }

        // Calculer confidence et impact
        const suggestionCount = parseInt(row.suggestion_count, 10)
        const confidence = Math.min(suggestionCount / 5, 1) // Max 1.0 si 5+ suggestions
        const estimatedImpact = suggestionCount * 3 // Estimation conservatrice

        return {
          id: `doc_${index}_${Date.now()}`,
          title: sourceText.substring(0, 200),
          sourceType,
          sourceUrl,
          confidence,
          estimatedImpact,
          suggestedBy: row.suggested_by_users || [],
          relatedGapIds: gapIds, // Simplification : associer tous gaps
        }
      }
    )

    // 3. Trier par confidence × estimatedImpact
    const sortedDocs = highValueDocs.sort(
      (a, b) =>
        b.confidence * b.estimatedImpact - a.confidence * a.estimatedImpact
    )

    console.log(
      `[Active Learning] ✅ ${sortedDocs.length} documents haute valeur identifiés`
    )

    return sortedDocs
  } catch (error) {
    console.error(
      '[Active Learning] Erreur identifyHighValueDocuments:',
      error
    )
    throw error
  }
}

// =============================================================================
// FONCTION 4 : Suggérer Sources d'Acquisition
// =============================================================================

export async function suggestSourcesAcquisition(
  gap: KnowledgeGap
): Promise<SourceSuggestion[]> {
  try {
    const suggestions: SourceSuggestion[] = []

    // 1. Cassation.tn (jurisprudence)
    if (
      gap.topic.includes('jurisprudence') ||
      gap.avgSourcesCount < 5 ||
      gap.exampleQuestions.some(q => q.match(/arrêt|jurisprudence|cassation/i))
    ) {
      suggestions.push({
        sourceType: 'cassation.tn',
        searchQuery: buildCassationSearchQuery(gap),
        estimatedResults: estimateResultsCount('cassation', gap),
        priority: gap.priorityScore > 70 ? 'high' : 'medium',
      })
    }

    // 2. Legislation.tn (codes, lois)
    if (
      gap.topic.includes('legislation') ||
      gap.exampleQuestions.some(q => q.match(/article|code|loi|décret/i))
    ) {
      suggestions.push({
        sourceType: 'legislation.tn',
        searchQuery: buildLegislationSearchQuery(gap),
        estimatedResults: estimateResultsCount('legislation', gap),
        priority: gap.priorityScore > 60 ? 'high' : 'medium',
      })
    }

    // 3. Doctrine (da5ira.com, blogs juridiques)
    if (
      gap.topic.includes('doctrine') ||
      gap.avgConfidence < 0.5 ||
      gap.exampleQuestions.some(q =>
        q.match(/commentaire|analyse|interprétation/i)
      )
    ) {
      suggestions.push({
        sourceType: 'doctrine',
        searchQuery: buildDoctrineSearchQuery(gap),
        estimatedResults: estimateResultsCount('doctrine', gap),
        priority: gap.priorityScore > 50 ? 'medium' : 'low',
      })
    }

    // 4. Google Scholar (recherche académique)
    if (gap.priorityScore > 80 || gap.avgSourcesCount < 3) {
      suggestions.push({
        sourceType: 'google_scholar',
        searchQuery: buildScholarSearchQuery(gap),
        estimatedResults: estimateResultsCount('scholar', gap),
        priority: 'low', // Toujours basse priorité (sources secondaires)
      })
    }

    // Trier par priorité (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])

    return suggestions
  } catch (error) {
    console.error('[Active Learning] Erreur suggestSourcesAcquisition:', error)
    throw error
  }
}

// =============================================================================
// FONCTION 5 : Construire Requêtes de Recherche
// =============================================================================

function buildCassationSearchQuery(gap: KnowledgeGap): string {
  // Extraction mots-clés juridiques depuis questions
  const keywords = extractLegalKeywords(gap.exampleQuestions)
  return keywords.slice(0, 3).join(' ')
}

function buildLegislationSearchQuery(gap: KnowledgeGap): string {
  const keywords = extractLegalKeywords(gap.exampleQuestions)
  // Ajouter "code" ou "loi" si absent
  if (!keywords.some(k => k.match(/code|loi/i))) {
    keywords.unshift('code')
  }
  return keywords.slice(0, 3).join(' ')
}

function buildDoctrineSearchQuery(gap: KnowledgeGap): string {
  const keywords = extractLegalKeywords(gap.exampleQuestions)
  return `${keywords.slice(0, 2).join(' ')} tunisie`
}

function buildScholarSearchQuery(gap: KnowledgeGap): string {
  const keywords = extractLegalKeywords(gap.exampleQuestions)
  return `${keywords.slice(0, 2).join(' ')} droit tunisien`
}

function extractLegalKeywords(questions: string[]): string[] {
  const allText = questions.join(' ').toLowerCase()

  // Patterns juridiques courants
  const patterns = [
    /(?:article|art\.?)\s+\d+/gi,
    /code\s+[\w\s]+(?:civil|pénal|commerce|travail)/gi,
    /(?:cassation|appel|tribunal)\s+[\w\s]*/gi,
    /(?:contrat|bail|divorce|succession|prescription|responsabilité)/gi,
    /(?:droit\s+(?:civil|pénal|commercial|travail|famille))/gi,
  ]

  const keywords: string[] = []
  for (const pattern of patterns) {
    const matches = allText.match(pattern)
    if (matches) {
      keywords.push(...matches.map(m => m.trim()))
    }
  }

  // Dédupliquer et limiter
  return Array.from(new Set(keywords)).slice(0, 10)
}

function estimateResultsCount(
  sourceType: 'cassation' | 'legislation' | 'doctrine' | 'scholar',
  gap: KnowledgeGap
): number {
  // Estimation conservatrice basée sur type source
  const baseEstimates = {
    cassation: 20,
    legislation: 10,
    doctrine: 30,
    scholar: 50,
  }

  // Ajuster selon priorité gap
  const multiplier = gap.priorityScore > 70 ? 1.5 : gap.priorityScore > 50 ? 1.0 : 0.5
  return Math.round(baseEstimates[sourceType] * multiplier)
}

// =============================================================================
// FONCTION 6 : Prioriser Gaps (alias pour findKnowledgeGaps)
// =============================================================================

export async function prioritizeGaps(
  options: GapAnalysisOptions = {}
): Promise<KnowledgeGap[]> {
  const result = await findKnowledgeGaps(options)
  return result.gaps
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function getTopDomains(
  gaps: KnowledgeGap[],
  limit: number
): { domain: string; count: number }[] {
  const domainCounts = new Map<string, number>()

  for (const gap of gaps) {
    domainCounts.set(gap.topic, (domainCounts.get(gap.topic) || 0) + 1)
  }

  return Array.from(domainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function generateRecommendations(
  gaps: KnowledgeGap[],
  stats: GapAnalysisResult['stats']
): string[] {
  const recommendations: string[] = []

  // Recommandation 1 : Priorité acquisition
  if (gaps.length > 0) {
    const topGaps = gaps.slice(0, 5)
    recommendations.push(
      `Acquérir en priorité des documents sur : ${topGaps.map(g => g.topic).join(', ')}`
    )
  }

  // Recommandation 2 : Sources suggérées
  const totalSuggestedSources = gaps.reduce(
    (sum, gap) => sum + gap.suggestedSources.length,
    0
  )
  if (totalSuggestedSources > 0) {
    recommendations.push(
      `${totalSuggestedSources} sources suggérées par avocats à explorer`
    )
  }

  // Recommandation 3 : Domaines critiques
  if (stats.topDomains.length > 0) {
    const criticalDomain = stats.topDomains[0]
    recommendations.push(
      `Domaine critique : ${criticalDomain.domain} (${criticalDomain.count} gaps)`
    )
  }

  // Recommandation 4 : Confidence RAG faible
  const lowConfidenceGaps = gaps.filter(g => g.avgConfidence < 0.5)
  if (lowConfidenceGaps.length > 0) {
    recommendations.push(
      `${lowConfidenceGaps.length} gaps avec confidence RAG très faible (<0.5) - Priorité maximale`
    )
  }

  // Recommandation 5 : Questions fréquentes
  const frequentGaps = gaps.filter(g => g.occurrenceCount >= 5)
  if (frequentGaps.length > 0) {
    recommendations.push(
      `${frequentGaps.length} gaps avec questions très fréquentes (≥5 occurrences) - Fort impact`
    )
  }

  return recommendations
}

// =============================================================================
// EXPORT PAR DÉFAUT
// =============================================================================

export default {
  findKnowledgeGaps,
  identifyHighValueDocuments,
  suggestSourcesAcquisition,
  prioritizeGaps,
}
