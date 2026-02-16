/**
 * Service de détection de similarité entre documents (Phase 4)
 *
 * Détecte automatiquement documents similaires via :
 * 1. Embeddings similaires (cosine > seuil)
 * 2. Keywords partagés (> overlap minimum)
 * 3. Même domaine juridique + concepts communs
 *
 * Construit le graphe similar_to pour améliorer re-ranking
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

export interface SimilarDocument {
  id: string
  title: string
  category: string
  docType?: string
  similarity: number  // Score 0-1
  sharedKeywords: string[]
  keywordOverlap: number  // 0-1
}

export interface SimilarityDetectionOptions {
  /** Seuil minimum de similarité embedding (défaut: 0.85) */
  minSimilarity?: number
  /** Nombre max de documents similaires par document (défaut: 10) */
  maxResults?: number
  /** Overlap minimum keywords (défaut: 0.5) */
  minKeywordOverlap?: number
  /** Filtrer par même catégorie uniquement (défaut: true) */
  sameCategoryOnly?: boolean
  /** Filtrer par même langue uniquement (défaut: true) */
  sameLanguageOnly?: boolean
  /** Auto-validation (défaut: false, requiert validation humaine) */
  autoValidate?: boolean
}

export interface RelationCreationResult {
  success: boolean
  relationsCreated: number
  errors: string[]
}

// =============================================================================
// DÉTECTION SIMILARITÉ
// =============================================================================

/**
 * Détecte documents similaires à un document donné
 *
 * @param kbId - ID du document source
 * @param options - Options de détection
 * @returns Liste de documents similaires triés par score
 */
export async function detectSimilarDocuments(
  kbId: string,
  options: SimilarityDetectionOptions = {}
): Promise<SimilarDocument[]> {
  const {
    minSimilarity = 0.85,
    maxResults = 10,
    minKeywordOverlap = 0.5,
    sameCategoryOnly = true,
    sameLanguageOnly = true,
  } = options

  // Récupérer document source
  const sourceResult = await db.query(
    `SELECT id, category, language, tags, embedding, metadata
     FROM knowledge_base
     WHERE id = $1 AND is_active = true`,
    [kbId]
  )

  if (sourceResult.rows.length === 0) {
    throw new Error(`Document ${kbId} non trouvé`)
  }

  const sourceDoc = sourceResult.rows[0]

  if (!sourceDoc.embedding) {
    throw new Error(`Document ${kbId} n'a pas d'embedding`)
  }

  // Construire query recherche documents similaires
  let query = `
    SELECT
      kb.id,
      kb.title,
      kb.category,
      kb.doc_type,
      kb.tags,
      -- Cosine similarity
      1 - (kb.embedding <=> $1::vector) as similarity
    FROM knowledge_base kb
    WHERE kb.is_active = true
      AND kb.id != $2
      AND kb.embedding IS NOT NULL
  `

  const values: any[] = [sourceDoc.embedding, kbId]

  // Filtres optionnels
  if (sameCategoryOnly) {
    values.push(sourceDoc.category)
    query += ` AND kb.category = $${values.length}`
  }

  if (sameLanguageOnly) {
    values.push(sourceDoc.language)
    query += ` AND kb.language = $${values.length}`
  }

  // Exclure documents déjà en relation similar_to
  query += `
    AND NOT EXISTS (
      SELECT 1 FROM kb_legal_relations rel
      WHERE (rel.source_kb_id = $2 AND rel.target_kb_id = kb.id)
         OR (rel.source_kb_id = kb.id AND rel.target_kb_id = $2)
      AND rel.relation_type = 'similar_to'
    )
  `

  // Seuil similarité
  query += ` AND (1 - (kb.embedding <=> $1::vector)) >= ${minSimilarity}`

  // Trier par similarité décroissante
  query += ` ORDER BY similarity DESC LIMIT ${maxResults}`

  const result = await db.query(query, values)

  // Calculer keyword overlap pour chaque candidat
  const sourceTags = (sourceDoc.tags as string[]) || []
  const similarDocs: SimilarDocument[] = []

  for (const row of result.rows) {
    const targetTags = (row.tags as string[]) || []

    // Calculer overlap
    const sharedKeywords = sourceTags.filter((tag) => targetTags.includes(tag))
    const keywordOverlap =
      sourceTags.length > 0 && targetTags.length > 0
        ? sharedKeywords.length / Math.max(sourceTags.length, targetTags.length)
        : 0

    // Filtrer par overlap minimum
    if (keywordOverlap < minKeywordOverlap && sourceTags.length > 0) {
      continue
    }

    similarDocs.push({
      id: row.id,
      title: row.title,
      category: row.category,
      docType: row.doc_type,
      similarity: parseFloat(row.similarity),
      sharedKeywords,
      keywordOverlap,
    })
  }

  return similarDocs
}

/**
 * Calcule keywords overlap entre deux listes de tags
 */
function calculateKeywordOverlap(tags1: string[], tags2: string[]): {
  sharedKeywords: string[]
  overlap: number
} {
  if (tags1.length === 0 || tags2.length === 0) {
    return { sharedKeywords: [], overlap: 0 }
  }

  const sharedKeywords = tags1.filter((tag) => tags2.includes(tag))
  const overlap = sharedKeywords.length / Math.max(tags1.length, tags2.length)

  return { sharedKeywords, overlap }
}

// =============================================================================
// CRÉATION RELATIONS
// =============================================================================

/**
 * Crée relations similar_to pour un document
 *
 * @param kbId - ID du document source
 * @param similarDocs - Documents similaires détectés
 * @param options - Options de création
 * @returns Résultat création (succès, nombre, erreurs)
 */
export async function createSimilarToRelations(
  kbId: string,
  similarDocs: SimilarDocument[],
  options: { autoValidate?: boolean } = {}
): Promise<RelationCreationResult> {
  const { autoValidate = false } = options

  const errors: string[] = []
  let relationsCreated = 0

  for (const doc of similarDocs) {
    try {
      // Utiliser fonction SQL pour créer relation bidirectionnelle
      const result = await db.query(
        `SELECT create_similar_to_relation($1, $2, $3, $4)`,
        [kbId, doc.id, doc.similarity, autoValidate]
      )

      const created = result.rows[0].create_similar_to_relation

      if (created) {
        relationsCreated++
        console.log(
          `[Similar To] Relation créée : ${kbId} <-> ${doc.id} (similarity: ${doc.similarity.toFixed(3)})`
        )
      } else {
        console.log(`[Similar To] Relation déjà existante : ${kbId} <-> ${doc.id}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Erreur création relation ${kbId} <-> ${doc.id}: ${message}`)
      console.error(`[Similar To] ${errors[errors.length - 1]}`)
    }
  }

  return {
    success: errors.length === 0,
    relationsCreated,
    errors,
  }
}

/**
 * Détecte ET crée relations similar_to pour un document
 * (Fonction combinée convenience)
 */
export async function detectAndCreateSimilarToRelations(
  kbId: string,
  options: SimilarityDetectionOptions = {}
): Promise<{
  similarDocs: SimilarDocument[]
  relationResult: RelationCreationResult
}> {
  // 1. Détecter documents similaires
  const similarDocs = await detectSimilarDocuments(kbId, options)

  console.log(`[Similar To] ${similarDocs.length} documents similaires détectés pour ${kbId}`)

  // 2. Créer relations
  const relationResult = await createSimilarToRelations(kbId, similarDocs, {
    autoValidate: options.autoValidate,
  })

  return { similarDocs, relationResult }
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Construit le graphe similar_to pour toute la base de connaissances
 *
 * @param options - Options de construction
 * @returns Statistiques de construction
 */
export async function buildSimilarityGraph(
  options: SimilarityDetectionOptions & {
    batchSize?: number
    categories?: string[]
    dryRun?: boolean
  } = {}
): Promise<{
  totalDocuments: number
  documentsProcessed: number
  totalRelationsCreated: number
  errors: string[]
}> {
  const {
    batchSize = 100,
    categories,
    dryRun = false,
    ...detectionOptions
  } = options

  // Récupérer documents à traiter
  let query = `
    SELECT id, title, category
    FROM knowledge_base
    WHERE is_active = true
      AND embedding IS NOT NULL
  `

  const values: any[] = []

  if (categories && categories.length > 0) {
    values.push(categories)
    query += ` AND category = ANY($1)`
  }

  query += ` ORDER BY created_at DESC`

  if (batchSize > 0) {
    query += ` LIMIT ${batchSize}`
  }

  const result = await db.query(query, values)
  const documents = result.rows

  console.log(`[Build Similarity Graph] ${documents.length} documents à traiter`)

  if (dryRun) {
    console.log('[Build Similarity Graph] Mode DRY-RUN : pas de création relations')
  }

  let totalRelationsCreated = 0
  const allErrors: string[] = []

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]

    console.log(
      `[${i + 1}/${documents.length}] Traitement : ${doc.title.slice(0, 50)}...`
    )

    try {
      const similarDocs = await detectSimilarDocuments(doc.id, detectionOptions)

      console.log(`  → ${similarDocs.length} documents similaires détectés`)

      if (!dryRun && similarDocs.length > 0) {
        const relationResult = await createSimilarToRelations(
          doc.id,
          similarDocs,
          { autoValidate: detectionOptions.autoValidate }
        )

        totalRelationsCreated += relationResult.relationsCreated
        allErrors.push(...relationResult.errors)

        console.log(`  → ${relationResult.relationsCreated} relations créées`)
      }

      // Pause entre documents pour éviter surcharge
      if (i < documents.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      allErrors.push(`Erreur traitement ${doc.id}: ${message}`)
      console.error(`  ❌ ${message}`)
    }
  }

  return {
    totalDocuments: documents.length,
    documentsProcessed: documents.length,
    totalRelationsCreated,
    errors: allErrors,
  }
}

// =============================================================================
// STATISTIQUES & MONITORING
// =============================================================================

/**
 * Obtient statistiques du graphe similar_to
 */
export async function getSimilarityGraphStats(): Promise<{
  totalRelations: number
  validatedRelations: number
  avgStrength: number
  topDocuments: Array<{
    id: string
    title: string
    similarCount: number
    avgStrength: number
  }>
}> {
  // Stats globales
  const statsResult = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE validated = true) as validated,
      ROUND(AVG(relation_strength), 3) as avg_strength
    FROM kb_legal_relations
    WHERE relation_type = 'similar_to'
  `)

  const stats = statsResult.rows[0]

  // Top documents avec le plus de relations
  const topDocsResult = await db.query(`
    SELECT
      kb.id,
      kb.title,
      COUNT(DISTINCT rel.target_kb_id) as similar_count,
      ROUND(AVG(rel.relation_strength), 3) as avg_strength
    FROM knowledge_base kb
    INNER JOIN kb_legal_relations rel ON kb.id = rel.source_kb_id
    WHERE rel.relation_type = 'similar_to'
      AND rel.validated = true
      AND kb.is_active = true
    GROUP BY kb.id, kb.title
    ORDER BY similar_count DESC, avg_strength DESC
    LIMIT 10
  `)

  return {
    totalRelations: parseInt(stats.total) || 0,
    validatedRelations: parseInt(stats.validated) || 0,
    avgStrength: parseFloat(stats.avg_strength) || 0,
    topDocuments: topDocsResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      similarCount: parseInt(row.similar_count),
      avgStrength: parseFloat(row.avg_strength),
    })),
  }
}

/**
 * Obtient documents similaires pour un document (pour affichage UI)
 */
export async function getSimilarDocumentsForUI(
  kbId: string,
  limit: number = 10
): Promise<SimilarDocument[]> {
  const result = await db.query(
    `SELECT * FROM get_similar_documents($1, 0.7, $2)`,
    [kbId, limit]
  )

  return result.rows.map((row) => ({
    id: row.similar_doc_id,
    title: row.title,
    category: row.category,
    docType: row.doc_type,
    similarity: parseFloat(row.relation_strength),
    sharedKeywords: [], // Non calculé ici
    keywordOverlap: 0,
  }))
}
