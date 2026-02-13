import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import type { LegalAbrogation } from '@/types/legal-abrogations'

/**
 * API REST - Détail d'une Abrogation Juridique
 *
 * GET /api/legal/abrogations/:id
 *
 * Params:
 * - id: UUID de l'abrogation
 *
 * Response: LegalAbrogation | { error: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validation UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'ID invalide (UUID attendu)' }, { status: 400 })
    }

    const query = `
      SELECT
        id,
        abrogated_reference,
        abrogated_reference_ar,
        abrogating_reference,
        abrogating_reference_ar,
        abrogation_date,
        scope,
        affected_articles,
        jort_url,
        source_url,
        notes,
        domain,
        verified,
        confidence,
        verification_status,
        created_at,
        updated_at
      FROM legal_abrogations
      WHERE id = $1
    `

    const result = await db.query(query, [id])

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Abrogation non trouvée' },
        { status: 404 }
      )
    }

    const row = result.rows[0]
    const abrogation: LegalAbrogation = {
      id: row.id,
      abrogatedReference: row.abrogated_reference,
      abrogatedReferenceAr: row.abrogated_reference_ar,
      abrogatingReference: row.abrogating_reference,
      abrogatingReferenceAr: row.abrogating_reference_ar,
      abrogationDate: row.abrogation_date,
      scope: row.scope as 'total' | 'partial' | 'implicit',
      affectedArticles: row.affected_articles || [],
      jortUrl: row.jort_url,
      sourceUrl: row.source_url,
      notes: row.notes,
      domain: row.domain,
      verified: row.verified,
      confidence: row.confidence as 'high' | 'medium' | 'low',
      verificationStatus: row.verification_status as 'verified' | 'pending' | 'disputed',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    return NextResponse.json(abrogation)
  } catch (error) {
    console.error('[API Legal Abrogations Detail] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'abrogation' },
      { status: 500 }
    )
  }
}
