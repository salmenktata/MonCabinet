/**
 * API Route: Recherche sémantique dans les documents
 *
 * GET /api/search/semantic?q=query&limit=10&dossierId=xxx
 * - Génère l'embedding de la requête
 * - Recherche les chunks les plus similaires via pgvector
 * - Retourne les résultats avec score de similarité
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from '@/lib/ai/embeddings-service'
import { aiConfig, isSemanticSearchEnabled } from '@/lib/ai/config'

// =============================================================================
// TYPES
// =============================================================================

export interface SemanticSearchResult {
  documentId: string
  documentName: string
  dossierId: string | null
  dossierNumero: string | null
  contentChunk: string
  chunkIndex: number
  similarity: number
  metadata: Record<string, unknown>
}

export interface SemanticSearchResponse {
  query: string
  results: SemanticSearchResult[]
  totalResults: number
  searchTimeMs: number
}

// =============================================================================
// GET: Recherche sémantique
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse<SemanticSearchResponse | { error: string }>> {
  const startTime = Date.now()

  try {
    // Vérifier authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Vérifier que le service est activé
    if (!isSemanticSearchEnabled()) {
      return NextResponse.json(
        { error: 'Recherche sémantique désactivée' },
        { status: 503 }
      )
    }

    // Récupérer les paramètres
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 50)
    const dossierId = searchParams.get('dossierId')
    const threshold = Math.max(
      0,
      Math.min(
        parseFloat(searchParams.get('threshold') || String(aiConfig.rag.similarityThreshold)) || aiConfig.rag.similarityThreshold,
        1.0
      )
    )

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Requête de recherche trop courte (min 2 caractères)' },
        { status: 400 }
      )
    }

    // Générer l'embedding de la requête
    const queryEmbedding = await generateEmbedding(query)

    // Construire la requête SQL
    let sql: string
    let params: (string | number)[]

    if (dossierId) {
      // Recherche dans un dossier spécifique
      sql = `
        SELECT
          de.document_id,
          d.nom as document_name,
          d.dossier_id,
          dos.numero as dossier_numero,
          de.content_chunk,
          de.chunk_index,
          (1 - (de.embedding <=> $1::vector)) as similarity,
          de.metadata
        FROM document_embeddings de
        JOIN documents d ON de.document_id = d.id
        LEFT JOIN dossiers dos ON d.dossier_id = dos.id
        WHERE de.user_id = $2
          AND d.dossier_id = $3
          AND (1 - (de.embedding <=> $1::vector)) >= $4
        ORDER BY de.embedding <=> $1::vector
        LIMIT $5
      `
      params = [
        formatEmbeddingForPostgres(queryEmbedding.embedding),
        userId,
        dossierId,
        threshold,
        limit,
      ]
    } else {
      // Recherche dans tous les documents de l'utilisateur
      sql = `
        SELECT
          de.document_id,
          d.nom as document_name,
          d.dossier_id,
          dos.numero as dossier_numero,
          de.content_chunk,
          de.chunk_index,
          (1 - (de.embedding <=> $1::vector)) as similarity,
          de.metadata
        FROM document_embeddings de
        JOIN documents d ON de.document_id = d.id
        LEFT JOIN dossiers dos ON d.dossier_id = dos.id
        WHERE de.user_id = $2
          AND (1 - (de.embedding <=> $1::vector)) >= $3
        ORDER BY de.embedding <=> $1::vector
        LIMIT $4
      `
      params = [
        formatEmbeddingForPostgres(queryEmbedding.embedding),
        userId,
        threshold,
        limit,
      ]
    }

    const result = await db.query(sql, params)

    // Formater les résultats
    const results: SemanticSearchResult[] = result.rows.map((row) => ({
      documentId: row.document_id,
      documentName: row.document_name,
      dossierId: row.dossier_id,
      dossierNumero: row.dossier_numero,
      contentChunk: row.content_chunk,
      chunkIndex: row.chunk_index,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata || {},
    }))

    const searchTimeMs = Date.now() - startTime

    return NextResponse.json({
      query,
      results,
      totalResults: results.length,
      searchTimeMs,
    })
  } catch (error) {
    console.error('Erreur recherche sémantique:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// =============================================================================
// POST: Recherche sémantique avec options avancées
// =============================================================================

interface AdvancedSearchBody {
  query: string
  limit?: number
  threshold?: number
  dossierId?: string
  documentTypes?: string[]
  dateFrom?: string
  dateTo?: string
  includeJurisprudence?: boolean
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SemanticSearchResponse | { error: string }>> {
  const startTime = Date.now()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    if (!isSemanticSearchEnabled()) {
      return NextResponse.json(
        { error: 'Recherche sémantique désactivée' },
        { status: 503 }
      )
    }

    const body: AdvancedSearchBody = await request.json()
    const {
      query,
      limit = 10,
      threshold = aiConfig.rag.similarityThreshold,
      dossierId,
      documentTypes,
      includeJurisprudence = false,
    } = body

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Requête de recherche trop courte' },
        { status: 400 }
      )
    }

    // Générer l'embedding de la requête
    const queryEmbedding = await generateEmbedding(query)
    const embeddingStr = formatEmbeddingForPostgres(queryEmbedding.embedding)

    // Recherche dans les documents
    let documentsSql = `
      SELECT
        de.document_id,
        d.nom as document_name,
        d.dossier_id,
        dos.numero as dossier_numero,
        de.content_chunk,
        de.chunk_index,
        (1 - (de.embedding <=> $1::vector)) as similarity,
        de.metadata,
        'document' as source_type
      FROM document_embeddings de
      JOIN documents d ON de.document_id = d.id
      LEFT JOIN dossiers dos ON d.dossier_id = dos.id
      WHERE de.user_id = $2
        AND (1 - (de.embedding <=> $1::vector)) >= $3
    `

    const params: (string | number)[] = [embeddingStr, userId, threshold]
    let paramIndex = 4

    if (dossierId) {
      documentsSql += ` AND d.dossier_id = $${paramIndex}`
      params.push(dossierId)
      paramIndex++
    }

    if (documentTypes && documentTypes.length > 0) {
      documentsSql += ` AND d.type = ANY($${paramIndex})`
      params.push(documentTypes as unknown as string)
      paramIndex++
    }

    documentsSql += ` ORDER BY de.embedding <=> $1::vector LIMIT $${paramIndex}`
    params.push(Math.min(limit, 50))

    const documentsResult = await db.query(documentsSql, params)

    // Optionnel: Recherche dans la jurisprudence
    let jurisprudenceResults: SemanticSearchResult[] = []

    if (includeJurisprudence) {
      const juriSql = `
        SELECT
          j.id as document_id,
          j.decision_number || ' - ' || j.court as document_name,
          NULL as dossier_id,
          NULL as dossier_numero,
          COALESCE(j.summary, LEFT(j.full_text, 500)) as content_chunk,
          0 as chunk_index,
          (1 - (j.embedding <=> $1::vector)) as similarity,
          jsonb_build_object(
            'court', j.court,
            'chamber', j.chamber,
            'domain', j.domain,
            'date', j.decision_date,
            'articles', j.articles_cited
          ) as metadata,
          'jurisprudence' as source_type
        FROM jurisprudence j
        WHERE j.embedding IS NOT NULL
          AND (1 - (j.embedding <=> $1::vector)) >= $2
        ORDER BY j.embedding <=> $1::vector
        LIMIT $3
      `

      const juriResult = await db.query(juriSql, [
        embeddingStr,
        threshold,
        Math.ceil(limit / 3), // Limiter à 1/3 des résultats pour la jurisprudence
      ])

      jurisprudenceResults = juriResult.rows.map((row) => ({
        documentId: row.document_id,
        documentName: row.document_name,
        dossierId: row.dossier_id,
        dossierNumero: row.dossier_numero,
        contentChunk: row.content_chunk,
        chunkIndex: row.chunk_index,
        similarity: parseFloat(row.similarity),
        metadata: { ...row.metadata, sourceType: 'jurisprudence' },
      }))
    }

    // Combiner et trier les résultats
    const allResults: SemanticSearchResult[] = [
      ...documentsResult.rows.map((row) => ({
        documentId: row.document_id,
        documentName: row.document_name,
        dossierId: row.dossier_id,
        dossierNumero: row.dossier_numero,
        contentChunk: row.content_chunk,
        chunkIndex: row.chunk_index,
        similarity: parseFloat(row.similarity),
        metadata: { ...row.metadata, sourceType: 'document' },
      })),
      ...jurisprudenceResults,
    ]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    const searchTimeMs = Date.now() - startTime

    return NextResponse.json({
      query,
      results: allResults,
      totalResults: allResults.length,
      searchTimeMs,
    })
  } catch (error) {
    console.error('Erreur recherche sémantique avancée:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
