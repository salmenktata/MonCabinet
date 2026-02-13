import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import type { LegalAbrogation } from '@/types/legal-abrogations'

/**
 * API REST - Liste des Abrogations Juridiques
 *
 * GET /api/legal/abrogations
 *
 * Query params:
 * - domain: Filtre par domaine juridique (penal, civil, travail, etc.)
 * - verified: Filtre abrogations vérifiées (true/false)
 * - confidence: Filtre par niveau de confiance (high/medium/low)
 * - limit: Nombre de résultats (default: 50, max: 200)
 * - offset: Pagination offset (default: 0)
 * - sort: Tri (abrogation_date_desc|abrogation_date_asc|relevance)
 *
 * Response:
 * {
 *   total: number,
 *   limit: number,
 *   offset: number,
 *   data: LegalAbrogation[]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Paramètres de filtrage
    const domain = searchParams.get('domain')
    const verified = searchParams.get('verified')
    const confidence = searchParams.get('confidence')

    // Paramètres de pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Paramètres de tri
    const sort = searchParams.get('sort') || 'abrogation_date_desc'

    // Construction de la requête SQL
    const conditions: string[] = ['1=1']
    const params: any[] = []
    let paramIndex = 1

    if (domain) {
      params.push(domain)
      conditions.push(`domain = $${paramIndex++}`)
    }

    if (verified !== null && verified !== undefined) {
      params.push(verified === 'true')
      conditions.push(`verified = $${paramIndex++}`)
    }

    if (confidence) {
      params.push(confidence)
      conditions.push(`confidence = $${paramIndex++}`)
    }

    // Déterminer l'ordre de tri
    let orderBy = 'abrogation_date DESC'
    switch (sort) {
      case 'abrogation_date_asc':
        orderBy = 'abrogation_date ASC'
        break
      case 'abrogation_date_desc':
        orderBy = 'abrogation_date DESC'
        break
      case 'relevance':
        orderBy = 'confidence DESC, verified DESC, abrogation_date DESC'
        break
    }

    // Compter le total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM legal_abrogations
      WHERE ${conditions.join(' AND ')}
    `
    const countResult = await db.query(countQuery, params)
    const total = parseInt(countResult.rows[0].total)

    // Récupérer les résultats paginés
    params.push(limit, offset)
    const dataQuery = `
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
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `
    const dataResult = await db.query(dataQuery, params)

    // Formater les résultats
    const data: LegalAbrogation[] = dataResult.rows.map((row) => ({
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
    }))

    return NextResponse.json({
      total,
      limit,
      offset,
      data,
    })
  } catch (error) {
    console.error('[API Legal Abrogations] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des abrogations' },
      { status: 500 }
    )
  }
}
