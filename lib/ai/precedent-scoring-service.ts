/**
 * Service PageRank pour Arrêts Tunisiens (Phase 4.4)
 *
 * Calcule un score d'importance (precedent_value) pour chaque arrêt
 * de jurisprudence tunisienne basé sur :
 * - Citations entrantes (autres arrêts qui citent cet arrêt)
 * - Hiérarchie juridictionnelle (Cassation > Appel > TPI)
 * - Algorithme PageRank adapté au contexte juridique
 *
 * @module lib/ai/precedent-scoring-service
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Nœud du graphe de citations
 */
interface GraphNode {
  id: string
  title: string
  tribunalCode: string | null
  citedByIds: string[] // IDs arrêts qui citent ce nœud
  citesIds: string[] // IDs arrêts cités par ce nœud
  pageRank: number
  hierarchyLevel: number // 1=Cassation, 2=Appel, 3=TPI, 4=Doctrine
}

/**
 * Résultat calcul PageRank
 */
export interface PageRankResult {
  success: boolean
  totalNodes: number
  updatedNodes: number
  iterations: number
  convergenceReached: boolean
  topPrecedents: Array<{
    id: string
    title: string
    pageRank: number
    citedByCount: number
    tribunalCode: string | null
  }>
  errors: string[]
}

/**
 * Options PageRank
 */
export interface PageRankOptions {
  dampingFactor?: number // Facteur d'amortissement (0.85 par défaut)
  maxIterations?: number // Max itérations (20 par défaut)
  convergenceThreshold?: number // Seuil convergence (0.0001 par défaut)
  hierarchyBoost?: boolean // Activer boost hiérarchique (true par défaut)
  minCitations?: number // Min citations pour être inclus (0 par défaut)
  domain?: string // Filtrer par domaine juridique
}

// =============================================================================
// CONSTANTES
// =============================================================================

const DEFAULT_DAMPING_FACTOR = 0.85
const DEFAULT_MAX_ITERATIONS = 20
const DEFAULT_CONVERGENCE_THRESHOLD = 0.0001

/**
 * Boost hiérarchique par niveau tribunal
 */
const HIERARCHY_BOOST = {
  1: 1.3, // Cour de Cassation (محكمة التعقيب)
  2: 1.1, // Cour d'Appel (محكمة الاستئناف)
  3: 1.0, // Tribunal de Première Instance (المحكمة الابتدائية)
  4: 0.9, // Doctrine (الفقه)
  5: 0.8, // Autre
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Calcule PageRank pour arrêts tunisiens et met à jour colonne precedent_value
 *
 * @param options - Options calcul PageRank
 * @returns Résultat avec stats et top précédents
 *
 * @example
 * ```ts
 * const result = await computePrecedentScores({
 *   dampingFactor: 0.85,
 *   maxIterations: 20,
 *   hierarchyBoost: true
 * })
 *
 * console.log(`${result.updatedNodes} arrêts mis à jour, convergence en ${result.iterations} itérations`)
 * console.log(`Top précédent: ${result.topPrecedents[0].title} (score ${result.topPrecedents[0].pageRank})`)
 * ```
 */
export async function computePrecedentScores(
  options: PageRankOptions = {}
): Promise<PageRankResult> {
  const errors: string[] = []

  const opts = {
    dampingFactor: options.dampingFactor || DEFAULT_DAMPING_FACTOR,
    maxIterations: options.maxIterations || DEFAULT_MAX_ITERATIONS,
    convergenceThreshold: options.convergenceThreshold || DEFAULT_CONVERGENCE_THRESHOLD,
    hierarchyBoost: options.hierarchyBoost ?? true,
    minCitations: options.minCitations || 0,
    domain: options.domain,
  }

  console.log('[PageRank] Début calcul scores précédents tunisiens...')
  console.log(`[PageRank] Config: damping=${opts.dampingFactor}, iterations=${opts.maxIterations}`)

  try {
    // 1. Construire graphe de citations
    const graph = await buildCitationGraph(opts.domain, opts.minCitations)

    if (graph.length === 0) {
      return {
        success: false,
        totalNodes: 0,
        updatedNodes: 0,
        iterations: 0,
        convergenceReached: false,
        topPrecedents: [],
        errors: ['Aucun arrêt trouvé pour construire le graphe'],
      }
    }

    console.log(`[PageRank] Graphe construit: ${graph.length} nœuds`)

    // 2. Calculer PageRank itératif
    const { iterations, converged } = computePageRankIterative(
      graph,
      opts.dampingFactor,
      opts.maxIterations,
      opts.convergenceThreshold,
      opts.hierarchyBoost
    )

    console.log(
      `[PageRank] PageRank calculé: ${iterations} itérations, convergence=${converged}`
    )

    // 3. Normaliser scores 0-1
    normalizeScores(graph)

    console.log(`[PageRank] Scores normalisés 0-1`)

    // 4. Sauvegarder en DB
    const updatedCount = await saveScoresToDatabase(graph)

    console.log(`[PageRank] ${updatedCount} arrêts mis à jour en DB`)

    // 5. Top précédents
    const topPrecedents = graph
      .sort((a, b) => b.pageRank - a.pageRank)
      .slice(0, 20)
      .map(node => ({
        id: node.id,
        title: node.title,
        pageRank: node.pageRank,
        citedByCount: node.citedByIds.length,
        tribunalCode: node.tribunalCode,
      }))

    console.log(
      `[PageRank] Top précédent: ${topPrecedents[0]?.title} (score ${topPrecedents[0]?.pageRank.toFixed(4)})`
    )

    return {
      success: true,
      totalNodes: graph.length,
      updatedNodes: updatedCount,
      iterations,
      convergenceReached: converged,
      topPrecedents,
      errors,
    }
  } catch (error) {
    console.error('[PageRank] Erreur calcul:', error)
    return {
      success: false,
      totalNodes: 0,
      updatedNodes: 0,
      iterations: 0,
      convergenceReached: false,
      topPrecedents: [],
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

// =============================================================================
// CONSTRUCTION GRAPHE
// =============================================================================

/**
 * Construit le graphe de citations depuis la DB
 */
async function buildCitationGraph(
  domain?: string,
  minCitations = 0
): Promise<GraphNode[]> {
  console.log('[PageRank] Construction graphe citations...')

  // Requête tous arrêts jurisprudence avec métadonnées
  const nodesQuery = `
    SELECT
      kb.id,
      kb.title,
      meta.tribunal_code
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE kb.category = 'jurisprudence'
      AND meta.decision_date IS NOT NULL
      ${domain ? 'AND kb.taxonomy_domain_code = $1' : ''}
  `

  const nodesParams = domain ? [domain] : []
  const nodesResult = await db.query(nodesQuery, nodesParams)

  console.log(`[PageRank] ${nodesResult.rows.length} arrêts récupérés`)

  // Requête relations citations validées
  const relationsQuery = `
    SELECT
      source_kb_id,
      target_kb_id,
      relation_type
    FROM kb_legal_relations
    WHERE validated = true
      AND relation_type IN ('cites', 'cited_by', 'confirms', 'applies', 'implements')
  `

  const relationsResult = await db.query(relationsQuery)

  console.log(`[PageRank] ${relationsResult.rows.length} relations citations`)

  // Construire mappings
  const nodeIds = new Set(nodesResult.rows.map(r => r.id))

  // Citations par nœud
  const citedByMap = new Map<string, string[]>()
  const citesMap = new Map<string, string[]>()

  for (const rel of relationsResult.rows) {
    // Vérifier que source et target sont dans le graphe
    if (!nodeIds.has(rel.source_kb_id) || !nodeIds.has(rel.target_kb_id)) {
      continue
    }

    // target est cité par source
    if (!citedByMap.has(rel.target_kb_id)) {
      citedByMap.set(rel.target_kb_id, [])
    }
    citedByMap.get(rel.target_kb_id)!.push(rel.source_kb_id)

    // source cite target
    if (!citesMap.has(rel.source_kb_id)) {
      citesMap.set(rel.source_kb_id, [])
    }
    citesMap.get(rel.source_kb_id)!.push(rel.target_kb_id)
  }

  // Créer nœuds du graphe
  let graph: GraphNode[] = nodesResult.rows.map(row => ({
    id: row.id,
    title: row.title,
    tribunalCode: row.tribunal_code,
    citedByIds: citedByMap.get(row.id) || [],
    citesIds: citesMap.get(row.id) || [],
    pageRank: 1.0, // Initialisation uniforme
    hierarchyLevel: getHierarchyLevel(row.tribunal_code),
  }))

  // Filtrer par min citations si spécifié
  if (minCitations > 0) {
    const beforeFilter = graph.length
    graph = graph.filter(node => node.citedByIds.length >= minCitations)
    console.log(
      `[PageRank] Filtrage min ${minCitations} citations: ${graph.length}/${beforeFilter} nœuds`
    )
  }

  return graph
}

/**
 * Détermine niveau hiérarchique tribunal
 */
function getHierarchyLevel(tribunalCode: string | null): number {
  if (!tribunalCode) return 5
  const code = tribunalCode.toLowerCase()
  if (code.includes('cassation') || code.includes('تعقيب')) return 1
  if (code.includes('appel') || code.includes('استئناف')) return 2
  if (code.includes('instance') || code.includes('ابتدائية')) return 3
  if (code.includes('doctrine') || code.includes('فقه')) return 4
  return 5
}

// =============================================================================
// ALGORITHME PAGERANK
// =============================================================================

/**
 * Calcule PageRank itératif avec convergence
 */
function computePageRankIterative(
  graph: GraphNode[],
  dampingFactor: number,
  maxIterations: number,
  convergenceThreshold: number,
  applyHierarchyBoost: boolean
): { iterations: number; converged: boolean } {
  const N = graph.length
  if (N === 0) return { iterations: 0, converged: false }

  console.log(
    `[PageRank] Calcul itératif: N=${N} nœuds, d=${dampingFactor}, max_iter=${maxIterations}`
  )

  // Initialisation uniforme
  graph.forEach(node => {
    node.pageRank = 1.0 / N
  })

  // Construire index pour accès rapide
  const nodeIndex = new Map(graph.map(node => [node.id, node]))

  let converged = false

  for (let iter = 0; iter < maxIterations; iter++) {
    const newRanks = new Map<string, number>()

    // Calcul nouveau PageRank pour chaque nœud
    for (const node of graph) {
      // Somme des contributions des nœuds pointant vers node
      let rankSum = 0

      for (const citingId of node.citedByIds) {
        const citingNode = nodeIndex.get(citingId)
        if (!citingNode) continue

        // Contribution = PR(citingNode) / nombre liens sortants
        const outgoingCount = citingNode.citesIds.length || 1
        rankSum += citingNode.pageRank / outgoingCount
      }

      // Formule PageRank : PR(A) = (1-d)/N + d × Σ(PR(Ti)/C(Ti))
      let newRank = (1 - dampingFactor) / N + dampingFactor * rankSum

      // Boost hiérarchique (optionnel)
      if (applyHierarchyBoost) {
        const boost = HIERARCHY_BOOST[node.hierarchyLevel as keyof typeof HIERARCHY_BOOST] || 1.0
        newRank *= boost
      }

      newRanks.set(node.id, newRank)
    }

    // Vérifier convergence
    let maxDiff = 0
    for (const node of graph) {
      const newRank = newRanks.get(node.id) || 0
      const diff = Math.abs(newRank - node.pageRank)
      maxDiff = Math.max(maxDiff, diff)
    }

    // Mettre à jour PageRank
    graph.forEach(node => {
      node.pageRank = newRanks.get(node.id) || node.pageRank
    })

    console.log(`[PageRank] Itération ${iter + 1}/${maxIterations} - diff max: ${maxDiff.toFixed(6)}`)

    // Convergence atteinte
    if (maxDiff < convergenceThreshold) {
      converged = true
      console.log(`[PageRank] Convergence atteinte en ${iter + 1} itérations`)
      return { iterations: iter + 1, converged: true }
    }
  }

  console.log(
    `[PageRank] Max itérations atteint (${maxIterations}), convergence=${converged}`
  )
  return { iterations: maxIterations, converged }
}

/**
 * Normalise scores PageRank entre 0 et 1
 */
function normalizeScores(graph: GraphNode[]): void {
  if (graph.length === 0) return

  const minRank = Math.min(...graph.map(n => n.pageRank))
  const maxRank = Math.max(...graph.map(n => n.pageRank))

  const range = maxRank - minRank

  if (range === 0) {
    // Tous les scores identiques
    graph.forEach(node => {
      node.pageRank = 0.5
    })
    return
  }

  // Normalisation min-max
  graph.forEach(node => {
    node.pageRank = (node.pageRank - minRank) / range
  })

  console.log(
    `[PageRank] Normalisation: min=${minRank.toFixed(4)}, max=${maxRank.toFixed(4)}, range=${range.toFixed(4)}`
  )
}

// =============================================================================
// SAUVEGARDE BASE DE DONNÉES
// =============================================================================

/**
 * Sauvegarde scores PageRank en DB (colonne precedent_value)
 */
async function saveScoresToDatabase(graph: GraphNode[]): Promise<number> {
  console.log('[PageRank] Sauvegarde scores en DB...')

  let updatedCount = 0

  // Batch update par 100
  const batchSize = 100

  for (let i = 0; i < graph.length; i += batchSize) {
    const batch = graph.slice(i, i + batchSize)

    // Construire query UPDATE multiple
    const updatePromises = batch.map(node =>
      db.query(
        `UPDATE kb_structured_metadata
         SET precedent_value = $1
         WHERE knowledge_base_id = $2`,
        [node.pageRank, node.id]
      )
    )

    await Promise.all(updatePromises)
    updatedCount += batch.length

    if ((i + batchSize) % 500 === 0) {
      console.log(`[PageRank] ${updatedCount}/${graph.length} arrêts mis à jour...`)
    }
  }

  console.log(`[PageRank] Sauvegarde terminée: ${updatedCount} arrêts`)

  return updatedCount
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Obtient top N arrêts par PageRank pour un domaine
 */
export async function getTopPrecedentsByDomain(
  domain: string,
  limit = 20
): Promise<
  Array<{
    id: string
    title: string
    decisionNumber: string | null
    pageRank: number
    citedByCount: number
    tribunalLabel: string | null
  }>
> {
  const query = `
    SELECT
      kb.id,
      kb.title,
      meta.decision_number,
      meta.precedent_value AS page_rank,
      meta.tribunal_code,
      trib_tax.label_fr AS tribunal_label,
      (SELECT COUNT(*)
       FROM kb_legal_relations
       WHERE target_kb_id = kb.id
         AND validated = true
         AND relation_type IN ('cites', 'cited_by', 'confirms')
      ) AS cited_by_count
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
    WHERE kb.category = 'jurisprudence'
      AND kb.taxonomy_domain_code = $1
      AND meta.precedent_value IS NOT NULL
      AND meta.precedent_value > 0
    ORDER BY meta.precedent_value DESC, cited_by_count DESC
    LIMIT $2
  `

  const result = await db.query(query, [domain, limit])

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    decisionNumber: row.decision_number,
    pageRank: parseFloat(row.page_rank || '0'),
    citedByCount: parseInt(row.cited_by_count || '0'),
    tribunalLabel: row.tribunal_label,
  }))
}

/**
 * Obtient stats globales PageRank
 */
export async function getPageRankStats(): Promise<{
  totalScored: number
  avgScore: number
  maxScore: number
  topTribunal: string | null
}> {
  const query = `
    SELECT
      COUNT(*) AS total_scored,
      AVG(precedent_value) AS avg_score,
      MAX(precedent_value) AS max_score,
      (SELECT meta.tribunal_code
       FROM kb_structured_metadata meta
       WHERE meta.precedent_value = MAX(kb_structured_metadata.precedent_value)
       LIMIT 1
      ) AS top_tribunal
    FROM kb_structured_metadata
    WHERE precedent_value IS NOT NULL AND precedent_value > 0
  `

  const result = await db.query(query)
  const row = result.rows[0]

  return {
    totalScored: parseInt(row.total_scored || '0'),
    avgScore: parseFloat(row.avg_score || '0'),
    maxScore: parseFloat(row.max_score || '0'),
    topTribunal: row.top_tribunal,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  computePrecedentScores as default,
  getTopPrecedentsByDomain,
  getPageRankStats,
  getHierarchyLevel,
}
