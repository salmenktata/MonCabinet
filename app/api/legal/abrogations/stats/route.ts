import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import type { AbrogationStats, LegalAbrogation } from '@/types/legal-abrogations'

/**
 * API REST - Statistiques des Abrogations Juridiques
 *
 * GET /api/legal/abrogations/stats
 *
 * Response: AbrogationStats
 * {
 *   total: number,
 *   byDomain: { penal: 2, travail: 5, ... },
 *   byScope: { total: 10, partial: 30, implicit: 3 },
 *   byConfidence: { high: 40, medium: 5, low: 2 },
 *   verified: number,
 *   pending: number,
 *   disputed: number,
 *   recentAbrogations: LegalAbrogation[]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Total
    const totalQuery = 'SELECT COUNT(*) as total FROM legal_abrogations'
    const totalResult = await db.query(totalQuery)
    const total = parseInt(totalResult.rows[0].total)

    // Par domaine
    const domainQuery = `
      SELECT domain, COUNT(*) as count
      FROM legal_abrogations
      WHERE domain IS NOT NULL
      GROUP BY domain
      ORDER BY count DESC
    `
    const domainResult = await db.query(domainQuery)
    const byDomain = domainResult.rows.reduce(
      (acc, row) => {
        acc[row.domain] = parseInt(row.count)
        return acc
      },
      {} as Record<string, number>
    )

    // Par scope
    const scopeQuery = `
      SELECT scope, COUNT(*) as count
      FROM legal_abrogations
      GROUP BY scope
    `
    const scopeResult = await db.query(scopeQuery)
    const byScope = scopeResult.rows.reduce(
      (acc, row) => {
        acc[row.scope] = parseInt(row.count)
        return acc
      },
      {} as Record<string, number>
    )

    // Par confidence
    const confidenceQuery = `
      SELECT confidence, COUNT(*) as count
      FROM legal_abrogations
      WHERE confidence IS NOT NULL
      GROUP BY confidence
    `
    const confidenceResult = await db.query(confidenceQuery)
    const byConfidence = confidenceResult.rows.reduce(
      (acc, row) => {
        acc[row.confidence] = parseInt(row.count)
        return acc
      },
      {} as Record<string, number>
    )

    // Par statut de vérification
    const verificationQuery = `
      SELECT
        COUNT(*) FILTER (WHERE verified = true) as verified,
        COUNT(*) FILTER (WHERE verification_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE verification_status = 'disputed') as disputed
      FROM legal_abrogations
    `
    const verificationResult = await db.query(verificationQuery)
    const verified = parseInt(verificationResult.rows[0].verified || '0')
    const pending = parseInt(verificationResult.rows[0].pending || '0')
    const disputed = parseInt(verificationResult.rows[0].disputed || '0')

    // Abrogations récentes (10 dernières)
    const recentQuery = `
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
      ORDER BY abrogation_date DESC
      LIMIT 10
    `
    const recentResult = await db.query(recentQuery)
    const recentAbrogations: LegalAbrogation[] = recentResult.rows.map((row) => ({
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

    const stats: AbrogationStats = {
      total,
      byDomain: byDomain as any,
      byScope: byScope as any,
      byConfidence: byConfidence as any,
      verified,
      pending,
      disputed,
      recentAbrogations,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('[API Legal Abrogations Stats] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}
