/**
 * Service de recherche RAG enrichie avec filtres juridiques
 *
 * Ce service étend la recherche sémantique classique avec :
 * - Filtres juridiques (tribunal, chambre, domaine, date)
 * - Métadonnées structurées enrichies
 * - Relations juridiques (graphe de connaissances)
 * - Labels bilingues AR/FR
 *
 * @module lib/ai/enhanced-rag-search-service
 */

import { db } from '@/lib/db/postgres'
import { generateEmbedding, formatEmbeddingForPostgres } from './embeddings-service'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Filtres de recherche juridique
 */
export interface EnhancedSearchFilters {
  /** Catégorie de document (jurisprudence, code, doctrine, etc.) */
  category?: string

  /** Domaine juridique (civil, commercial, pénal, etc.) */
  domain?: string

  /** Code tribunal (TRIBUNAL_CASSATION, TRIBUNAL_APPEL, etc.) */
  tribunal?: string

  /** Code chambre (CHAMBRE_CIVILE, CHAMBRE_COMMERCIALE, etc.) */
  chambre?: string

  /** Plage de dates */
  dateRange?: {
    from?: Date
    to?: Date
  }

  /** Langue du document (ar, fr, bi) */
  language?: 'ar' | 'fr' | 'bi'

  /** Confiance minimum d'extraction (0-1) */
  minConfidence?: number

  /** Type de document selon taxonomie */
  documentType?: string
}

/**
 * Métadonnées juridiques structurées
 */
export interface LegalMetadata {
  tribunalCode: string | null
  tribunalLabelAr: string | null
  tribunalLabelFr: string | null
  chambreCode: string | null
  chambreLabelAr: string | null
  chambreLabelFr: string | null
  decisionDate: Date | null
  decisionNumber: string | null
  legalBasis: string[] | null
  extractionConfidence: number | null
}

/**
 * Relation juridique avec un document
 */
export interface LegalRelation {
  relationType: string
  relatedKbId: string
  relatedTitle: string
  relatedCategory: string
  context: string | null
  confidence: number | null
  direction: 'outgoing' | 'incoming'
}

/**
 * Résultat de recherche enrichi
 */
export interface EnhancedSearchResult {
  kbId: string
  title: string
  category: string
  similarity: number
  chunkContent?: string
  chunkIndex?: number

  /** Métadonnées juridiques structurées */
  metadata: LegalMetadata

  /** Relations juridiques */
  relations?: {
    cites: LegalRelation[]
    citedBy: LegalRelation[]
    supersedes: LegalRelation[]
    supersededBy: LegalRelation[]
    relatedCases: LegalRelation[]
  }
}

// =============================================================================
// RECHERCHE SÉMANTIQUE ENRICHIE
// =============================================================================

/**
 * Recherche sémantique avec filtres juridiques et métadonnées enrichies
 *
 * @param query - Requête utilisateur
 * @param filters - Filtres juridiques optionnels
 * @param options - Options de recherche
 * @returns Résultats enrichis avec métadonnées et relations
 */
export async function enhancedSemanticSearch(
  query: string,
  filters: EnhancedSearchFilters = {},
  options: {
    limit?: number
    threshold?: number
    includeRelations?: boolean
    userId?: string
    dossierId?: string
  } = {}
): Promise<EnhancedSearchResult[]> {
  const limit = options.limit || 10
  const threshold = options.threshold || 0.65

  try {
    // 1. Générer embedding de la requête
    const embeddingResult = await generateEmbedding(query)
    const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

    // 2. Construire la requête SQL avec filtres
    const queryParams: any[] = [embeddingStr, threshold, limit]
    let paramIndex = 4

    // Ajouter filtres optionnels
    if (filters.tribunal) {
      queryParams.push(filters.tribunal)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.chambre) {
      queryParams.push(filters.chambre)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.domain) {
      queryParams.push(filters.domain)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.documentType) {
      queryParams.push(filters.documentType)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.dateRange?.from) {
      queryParams.push(filters.dateRange.from.toISOString().split('T')[0])
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.dateRange?.to) {
      queryParams.push(filters.dateRange.to.toISOString().split('T')[0])
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.language) {
      queryParams.push(filters.language)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    if (filters.minConfidence) {
      queryParams.push(filters.minConfidence)
      paramIndex++
    } else {
      queryParams.push(null)
      paramIndex++
    }

    // 3. Appeler fonction PostgreSQL
    const searchQuery = `
      SELECT
        kb_id,
        title,
        category,
        similarity,
        tribunal_code,
        tribunal_label_ar,
        tribunal_label_fr,
        chambre_code,
        chambre_label_ar,
        chambre_label_fr,
        decision_date,
        decision_number,
        legal_basis,
        extraction_confidence
      FROM search_kb_with_legal_filters($1::vector, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `

    const result = await db.query(searchQuery, queryParams)

    // 4. Enrichir résultats avec relations si demandé
    const enrichedResults: EnhancedSearchResult[] = []

    for (const row of result.rows) {
      const enrichedResult: EnhancedSearchResult = {
        kbId: row.kb_id,
        title: row.title,
        category: row.category,
        similarity: parseFloat(row.similarity),
        metadata: {
          tribunalCode: row.tribunal_code,
          tribunalLabelAr: row.tribunal_label_ar,
          tribunalLabelFr: row.tribunal_label_fr,
          chambreCode: row.chambre_code,
          chambreLabelAr: row.chambre_label_ar,
          chambreLabelFr: row.chambre_label_fr,
          decisionDate: row.decision_date ? new Date(row.decision_date) : null,
          decisionNumber: row.decision_number,
          legalBasis: row.legal_basis,
          extractionConfidence: row.extraction_confidence ? parseFloat(row.extraction_confidence) : null,
        },
      }

      // Ajouter relations juridiques si demandé
      if (options.includeRelations) {
        enrichedResult.relations = await getLegalRelationsForDocument(row.kb_id)
      }

      enrichedResults.push(enrichedResult)
    }

    return enrichedResults
  } catch (error) {
    console.error('[Enhanced RAG Search] Erreur recherche enrichie:', error)
    throw error
  }
}

/**
 * Obtient les relations juridiques d'un document
 */
async function getLegalRelationsForDocument(
  kbId: string
): Promise<EnhancedSearchResult['relations']> {
  try {
    const relationsQuery = `
      SELECT
        relation_type,
        related_kb_id,
        related_title,
        related_category,
        context,
        confidence,
        direction
      FROM get_legal_relations($1, NULL)
    `

    const result = await db.query(relationsQuery, [kbId])

    const relations: EnhancedSearchResult['relations'] = {
      cites: [],
      citedBy: [],
      supersedes: [],
      supersededBy: [],
      relatedCases: [],
    }

    for (const row of result.rows) {
      const relation: LegalRelation = {
        relationType: row.relation_type,
        relatedKbId: row.related_kb_id,
        relatedTitle: row.related_title,
        relatedCategory: row.related_category,
        context: row.context,
        confidence: row.confidence ? parseFloat(row.confidence) : null,
        direction: row.direction,
      }

      // Grouper par type de relation
      if (row.relation_type === 'cites') {
        relations.cites.push(relation)
      } else if (row.relation_type === 'cited_by') {
        relations.citedBy.push(relation)
      } else if (row.relation_type === 'supersedes') {
        relations.supersedes.push(relation)
      } else if (row.relation_type === 'superseded_by') {
        relations.supersededBy.push(relation)
      } else if (row.relation_type === 'related_case') {
        relations.relatedCases.push(relation)
      }
    }

    return relations
  } catch (error) {
    console.error('[Enhanced RAG Search] Erreur récupération relations:', error)
    return {
      cites: [],
      citedBy: [],
      supersedes: [],
      supersededBy: [],
      relatedCases: [],
    }
  }
}

// =============================================================================
// RECHERCHE AVEC CHUNKS
// =============================================================================

/**
 * Recherche sémantique enrichie avec chunks (pour RAG chat)
 *
 * Cette fonction combine :
 * - Recherche vectorielle dans les chunks
 * - Métadonnées structurées du document parent
 * - Relations juridiques
 */
export async function enhancedSemanticSearchWithChunks(
  query: string,
  filters: EnhancedSearchFilters = {},
  options: {
    limit?: number
    threshold?: number
    includeRelations?: boolean
    userId?: string
    dossierId?: string
  } = {}
): Promise<EnhancedSearchResult[]> {
  const limit = options.limit || 10
  const threshold = options.threshold || 0.65

  try {
    // 1. Générer embedding de la requête
    const embeddingResult = await generateEmbedding(query)
    const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

    // 2. Construire requête SQL avec jointure chunks + métadonnées
    const searchQuery = `
      WITH ranked_chunks AS (
        SELECT
          kb.id AS kb_id,
          kb.title,
          kb.category,
          chunk.chunk_index,
          chunk.content AS chunk_content,
          (1 - (chunk.embedding <=> $1::vector))::FLOAT AS similarity,
          meta.tribunal_code,
          trib_tax.label_ar AS tribunal_label_ar,
          trib_tax.label_fr AS tribunal_label_fr,
          meta.chambre_code,
          chambre_tax.label_ar AS chambre_label_ar,
          chambre_tax.label_fr AS chambre_label_fr,
          meta.decision_date,
          meta.decision_number,
          meta.legal_basis,
          meta.extraction_confidence,
          ROW_NUMBER() OVER (PARTITION BY kb.id ORDER BY (1 - (chunk.embedding <=> $1::vector)) DESC) AS rank_in_doc
        FROM kb_chunks chunk
        INNER JOIN knowledge_base kb ON chunk.knowledge_base_id = kb.id
        LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
        LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
        LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
        WHERE
          kb.is_indexed = true
          AND (1 - (chunk.embedding <=> $1::vector)) >= $2
          -- Filtres juridiques
          AND ($3::TEXT IS NULL OR meta.tribunal_code = $3)
          AND ($4::TEXT IS NULL OR meta.chambre_code = $4)
          AND ($5::TEXT IS NULL OR kb.taxonomy_domain_code = $5)
          AND ($6::TEXT IS NULL OR kb.taxonomy_document_type_code = $6)
          AND ($7::DATE IS NULL OR meta.decision_date >= $7 OR meta.document_date >= $7)
          AND ($8::DATE IS NULL OR meta.decision_date <= $8 OR meta.document_date <= $8)
          AND ($9::VARCHAR(5) IS NULL OR meta.language = $9 OR meta.language = 'bi')
          AND ($10::FLOAT IS NULL OR meta.extraction_confidence >= $10)
      )
      SELECT *
      FROM ranked_chunks
      WHERE rank_in_doc <= 2  -- Max 2 chunks par document
      ORDER BY similarity DESC
      LIMIT $11
    `

    const queryParams: any[] = [
      embeddingStr,
      threshold,
      filters.tribunal || null,
      filters.chambre || null,
      filters.domain || null,
      filters.documentType || null,
      filters.dateRange?.from?.toISOString().split('T')[0] || null,
      filters.dateRange?.to?.toISOString().split('T')[0] || null,
      filters.language || null,
      filters.minConfidence || null,
      limit,
    ]

    const result = await db.query(searchQuery, queryParams)

    // 3. Enrichir résultats
    const enrichedResults: EnhancedSearchResult[] = []

    for (const row of result.rows) {
      const enrichedResult: EnhancedSearchResult = {
        kbId: row.kb_id,
        title: row.title,
        category: row.category,
        similarity: parseFloat(row.similarity),
        chunkContent: row.chunk_content,
        chunkIndex: row.chunk_index,
        metadata: {
          tribunalCode: row.tribunal_code,
          tribunalLabelAr: row.tribunal_label_ar,
          tribunalLabelFr: row.tribunal_label_fr,
          chambreCode: row.chambre_code,
          chambreLabelAr: row.chambre_label_ar,
          chambreLabelFr: row.chambre_label_fr,
          decisionDate: row.decision_date ? new Date(row.decision_date) : null,
          decisionNumber: row.decision_number,
          legalBasis: row.legal_basis,
          extractionConfidence: row.extraction_confidence ? parseFloat(row.extraction_confidence) : null,
        },
      }

      // Ajouter relations juridiques si demandé
      if (options.includeRelations) {
        enrichedResult.relations = await getLegalRelationsForDocument(row.kb_id)
      }

      enrichedResults.push(enrichedResult)
    }

    return enrichedResults
  } catch (error) {
    console.error('[Enhanced RAG Search] Erreur recherche chunks enrichie:', error)
    throw error
  }
}

// =============================================================================
// STATISTIQUES ET MONITORING
// =============================================================================

/**
 * Obtient des statistiques sur les métadonnées extraites
 */
export async function getMetadataExtractionStats(): Promise<{
  totalDocuments: number
  documentsWithMetadata: number
  coveragePercent: number
  avgConfidence: number
  byMethod: {
    llm: number
    regex: number
    hybrid: number
    manual: number
  }
  validatedCount: number
}> {
  const query = `SELECT * FROM vw_metadata_extraction_stats`
  const result = await db.query(query)

  if (result.rows.length === 0) {
    return {
      totalDocuments: 0,
      documentsWithMetadata: 0,
      coveragePercent: 0,
      avgConfidence: 0,
      byMethod: { llm: 0, regex: 0, hybrid: 0, manual: 0 },
      validatedCount: 0,
    }
  }

  const row = result.rows[0]
  return {
    totalDocuments: parseInt(row.total_documents, 10),
    documentsWithMetadata: parseInt(row.documents_with_metadata, 10),
    coveragePercent: parseFloat(row.coverage_percent),
    avgConfidence: parseFloat(row.avg_confidence || '0'),
    byMethod: {
      llm: parseInt(row.extracted_llm || '0', 10),
      regex: parseInt(row.extracted_regex || '0', 10),
      hybrid: parseInt(row.extracted_hybrid || '0', 10),
      manual: parseInt(row.extracted_manual || '0', 10),
    },
    validatedCount: parseInt(row.validated_count || '0', 10),
  }
}

/**
 * Obtient des statistiques sur les relations juridiques
 */
export async function getLegalRelationsStats(): Promise<
  Array<{
    relationType: string
    count: number
    avgConfidence: number
  }>
> {
  const query = `
    SELECT
      relation_type,
      COUNT(*)::INTEGER AS count,
      AVG(confidence)::FLOAT AS avg_confidence
    FROM kb_legal_relations
    WHERE validated = true
    GROUP BY relation_type
    ORDER BY count DESC
  `

  const result = await db.query(query)

  return result.rows.map((row) => ({
    relationType: row.relation_type,
    count: parseInt(row.count, 10),
    avgConfidence: parseFloat(row.avg_confidence || '0'),
  }))
}

// Note: Les types sont déjà exportés en début de fichier avec 'export interface'
// Pas besoin de les ré-exporter ici
