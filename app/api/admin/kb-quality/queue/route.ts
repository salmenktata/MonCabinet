/**
 * API : Queue de Validation Qualité KB
 *
 * GET /api/admin/kb-quality/queue - Liste docs à valider (priorisés)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

// =============================================================================
// Types
// =============================================================================

interface QueueDocument {
  id: string
  title: string
  category: string
  source: string
  createdAt: Date
  extractionConfidence: number
  missingFields: string[]
  priority: number
  metadata?: {
    tribunalCode?: string
    chambreCode?: string
    decisionDate?: string
    author?: string
  }
}

// =============================================================================
// GET - Liste des documents à valider
// =============================================================================

export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const { searchParams } = new URL(request.url)

    // Paramètres de filtrage
    const category = searchParams.get('category')
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0')
    const maxConfidence = parseFloat(searchParams.get('maxConfidence') || '0.85')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Requête avec priorisation intelligente
    let whereClause = `
      WHERE m.extraction_confidence IS NOT NULL
        AND m.extraction_confidence >= $1
        AND m.extraction_confidence <= $2
    `
    const params: any[] = [minConfidence, maxConfidence]
    let paramIndex = 3

    if (category) {
      whereClause += ` AND kb.category = $${paramIndex++}`
      params.push(category)
    }

    const query = `
      WITH document_priority AS (
        SELECT
          kb.id,
          kb.title,
          kb.category,
          kb.created_at,
          COALESCE(kb.metadata->>'sourceName', 'unknown') as source,
          m.extraction_confidence,
          m.extraction_method,
          m.tribunal_code,
          m.chambre_code,
          m.decision_date,
          m.author,
          -- Calculer le nombre de champs manquants
          CASE
            WHEN kb.category = 'jurisprudence' THEN
              (CASE WHEN m.tribunal_code IS NULL THEN 1 ELSE 0 END +
               CASE WHEN m.chambre_code IS NULL THEN 1 ELSE 0 END +
               CASE WHEN m.decision_date IS NULL THEN 1 ELSE 0 END +
               CASE WHEN m.solution IS NULL THEN 1 ELSE 0 END)
            WHEN kb.category IN ('code', 'législation') THEN
              (CASE WHEN m.loi_number IS NULL THEN 1 ELSE 0 END +
               CASE WHEN m.code_name IS NULL THEN 1 ELSE 0 END)
            WHEN kb.category = 'doctrine' THEN
              (CASE WHEN m.author IS NULL THEN 1 ELSE 0 END +
               CASE WHEN m.publication_date IS NULL THEN 1 ELSE 0 END)
            ELSE 0
          END as missing_fields_count,
          -- Calculer priorité (0-100, plus haut = plus urgent)
          (
            -- Poids 1 : Confiance faible (40 points max)
            (1 - COALESCE(m.extraction_confidence, 0)) * 40 +
            -- Poids 2 : Champs manquants (30 points max)
            CASE
              WHEN kb.category = 'jurisprudence' THEN
                (CASE WHEN m.tribunal_code IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.chambre_code IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.decision_date IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.solution IS NULL THEN 1 ELSE 0 END) * 7.5
              WHEN kb.category IN ('code', 'législation') THEN
                (CASE WHEN m.loi_number IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.code_name IS NULL THEN 1 ELSE 0 END) * 15
              WHEN kb.category = 'doctrine' THEN
                (CASE WHEN m.author IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN m.publication_date IS NULL THEN 1 ELSE 0 END) * 15
              ELSE 0
            END +
            -- Poids 3 : Catégorie critique (20 points)
            CASE
              WHEN kb.category = 'jurisprudence' THEN 20
              WHEN kb.category IN ('code', 'législation') THEN 15
              WHEN kb.category = 'doctrine' THEN 10
              ELSE 5
            END +
            -- Poids 4 : Récence (10 points max - docs récents prioritaires)
            CASE
              WHEN kb.created_at > NOW() - INTERVAL '7 days' THEN 10
              WHEN kb.created_at > NOW() - INTERVAL '30 days' THEN 5
              ELSE 0
            END
          ) as priority
        FROM knowledge_base kb
        INNER JOIN kb_structured_metadata m ON kb.id = m.knowledge_base_id
        ${whereClause}
      )
      SELECT
        id,
        title,
        category,
        source,
        created_at as "createdAt",
        extraction_confidence as "extractionConfidence",
        extraction_method as "extractionMethod",
        missing_fields_count as "missingFieldsCount",
        priority,
        tribunal_code as "tribunalCode",
        chambre_code as "chambreCode",
        decision_date as "decisionDate",
        author
      FROM document_priority
      ORDER BY priority DESC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `

    params.push(limit, offset)

    const result = await db.query(query, params)

    // Compter le total pour pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM knowledge_base kb
      INNER JOIN kb_structured_metadata m ON kb.id = m.knowledge_base_id
      ${whereClause}
    `
    const countResult = await db.query(countQuery, params.slice(0, paramIndex - 2))
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    return NextResponse.json({
      success: true,
      data: {
        documents: result.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    })
  } catch (error) {
    console.error('[API KB Quality Queue] Erreur GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
})
