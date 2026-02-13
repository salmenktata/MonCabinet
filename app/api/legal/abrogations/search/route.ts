import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import type { AbrogationSearchResult, AbrogationSearchResponse } from '@/types/legal-abrogations'

/**
 * API REST - Recherche Fuzzy Abrogations Juridiques
 *
 * GET /api/legal/abrogations/search
 *
 * Query params:
 * - q: Requête de recherche (référence de loi, code, etc.)
 * - threshold: Seuil de similarité (0-1, default: 0.6)
 * - limit: Nombre de résultats (default: 10, max: 50)
 * - domain: Filtre par domaine (optionnel)
 *
 * Response:
 * {
 *   total: number,
 *   query: string,
 *   threshold: number,
 *   data: AbrogationSearchResult[]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Paramètres de recherche
    const query = searchParams.get('q')
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Paramètre "q" (requête de recherche) requis' },
        { status: 400 }
      )
    }

    const threshold = parseFloat(searchParams.get('threshold') || '0.6')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)
    const domain = searchParams.get('domain')

    // Validation seuil
    if (threshold < 0 || threshold > 1) {
      return NextResponse.json(
        { error: 'Le seuil doit être entre 0 et 1' },
        { status: 400 }
      )
    }

    // Appel à la fonction PostgreSQL find_abrogations
    const sqlQuery = `
      SELECT * FROM find_abrogations($1, $2, $3)
      ${domain ? 'WHERE domain = $4' : ''}
    `
    const params = domain ? [query, threshold, limit, domain] : [query, threshold, limit]

    const result = await db.query(sqlQuery, params)

    // Formater les résultats
    const data: AbrogationSearchResult[] = result.rows.map((row) => ({
      id: row.id,
      abrogatedReference: row.abrogated_reference,
      abrogatedReferenceAr: row.abrogated_reference_ar,
      abrogatingReference: row.abrogating_reference,
      abrogatingReferenceAr: row.abrogating_reference_ar,
      abrogationDate: row.abrogation_date,
      scope: row.scope as 'total' | 'partial' | 'implicit',
      affectedArticles: row.affected_articles || [],
      jortUrl: row.jort_url || '',
      sourceUrl: row.source_url || '',
      notes: row.notes || '',
      domain: row.domain,
      verified: row.verified,
      confidence: row.confidence as 'high' | 'medium' | 'low',
      verificationStatus: row.verification_status as 'verified' | 'pending' | 'disputed',
      similarityScore: parseFloat(row.similarity_score),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    const response: AbrogationSearchResponse = {
      total: data.length,
      query,
      threshold,
      data,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[API Legal Abrogations Search] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recherche d\'abrogations' },
      { status: 500 }
    )
  }
}
