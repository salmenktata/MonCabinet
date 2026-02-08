/**
 * API Route pour la gestion des suggestions de taxonomie
 * GET /api/super-admin/taxonomy/suggestions - Récupérer les suggestions
 * POST /api/super-admin/taxonomy/suggestions - Approuver/Rejeter une suggestion
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
  mergeSuggestion,
  invalidateTaxonomyCache,
} from '@/lib/web-scraper/taxonomy-service'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

/**
 * GET - Récupérer les suggestions en attente
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    let suggestions

    if (status === 'pending') {
      suggestions = await getPendingSuggestions()
    } else {
      // Récupérer les suggestions avec un statut spécifique
      const result = await db.query(
        `SELECT * FROM taxonomy_suggestions
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [status, limit]
      )
      suggestions = result.rows.map(row => ({
        id: row.id,
        type: row.type,
        suggestedCode: row.suggested_code,
        suggestedLabelFr: row.suggested_label_fr,
        suggestedLabelAr: row.suggested_label_ar,
        suggestedParentCode: row.suggested_parent_code,
        reason: row.reason,
        basedOnPages: row.based_on_pages || [],
        occurrenceCount: row.occurrence_count,
        sampleUrls: row.sample_urls || [],
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        reviewNotes: row.review_notes,
        createdTaxonomyId: row.created_taxonomy_id,
        createdAt: row.created_at,
      }))
    }

    // Compter par statut
    const statsResult = await db.query(`
      SELECT status, COUNT(*) as count
      FROM taxonomy_suggestions
      GROUP BY status
    `)

    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      merged: 0,
    }

    for (const row of statsResult.rows) {
      stats[row.status as keyof typeof stats] = parseInt(row.count, 10)
    }

    return NextResponse.json({
      success: true,
      data: suggestions,
      stats,
    })
  } catch (error) {
    console.error('[API Taxonomy Suggestions] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des suggestions' },
      { status: 500 }
    )
  }
}

/**
 * POST - Approuver, rejeter ou fusionner une suggestion
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { suggestionId, action, parentCode, notes, mergeWithCode } = body

    if (!suggestionId || !action) {
      return NextResponse.json(
        { error: 'suggestionId et action requis' },
        { status: 400 }
      )
    }

    const validActions = ['approve', 'reject', 'merge']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Action invalide. Actions valides: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'approve':
        result = await approveSuggestion(
          suggestionId,
          session.user.id,
          parentCode,
          notes
        )
        invalidateTaxonomyCache()
        return NextResponse.json({
          success: true,
          data: result,
          message: 'Suggestion approuvée et élément créé',
        })

      case 'reject':
        await rejectSuggestion(suggestionId, session.user.id, notes)
        return NextResponse.json({
          success: true,
          message: 'Suggestion rejetée',
        })

      case 'merge':
        if (!mergeWithCode) {
          return NextResponse.json(
            { error: 'mergeWithCode requis pour fusionner' },
            { status: 400 }
          )
        }
        await mergeSuggestion(suggestionId, mergeWithCode, session.user.id, notes)
        return NextResponse.json({
          success: true,
          message: `Suggestion fusionnée avec ${mergeWithCode}`,
        })
    }
  } catch (error) {
    console.error('[API Taxonomy Suggestions] Erreur POST:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors du traitement' },
      { status: 500 }
    )
  }
}
