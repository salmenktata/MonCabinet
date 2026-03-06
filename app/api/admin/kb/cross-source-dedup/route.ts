import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getErrorMessage } from '@/lib/utils/error-utils'
import {
  scanCrossSourceDuplicates,
  getCrossSourceDupStats,
  revertDedup,
} from '@/lib/kb/cross-source-dedup-service'

export const maxDuration = 120

/**
 * GET /api/admin/kb/cross-source-dedup
 *
 * Retourne les statistiques de déduplication cross-source sans modifier la DB.
 */
export const GET = withAdminApiAuth(async () => {
  try {
    const stats = await getCrossSourceDupStats()
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    console.error('[CrossSourceDedup] GET error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})

/**
 * POST /api/admin/kb/cross-source-dedup
 *
 * Body: { action: 'scan' | 'resolve', dryRun?: boolean, minSimilarity?: number, maxDocs?: number }
 *
 * - scan   : Détecte les doublons cross-source (dryRun=true par défaut, sans modification)
 * - resolve: Détecte et applique la résolution (désactive non-canonical via rag_enabled=false)
 */
export const POST = withAdminApiAuth(async (req: NextRequest) => {
  try {
    const body = await req.json() as {
      action?: string
      dryRun?: boolean
      minSimilarity?: number
      maxDocs?: number
    }

    const { action = 'scan', minSimilarity = 0.90, maxDocs = 500 } = body
    const dryRun = action === 'scan' ? true : (body.dryRun ?? false)

    if (action !== 'scan' && action !== 'resolve') {
      return NextResponse.json(
        { success: false, error: 'action doit être "scan" ou "resolve"' },
        { status: 400 }
      )
    }

    const result = await scanCrossSourceDuplicates({ dryRun, minSimilarity, maxDocs })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[CrossSourceDedup] POST error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})

/**
 * PATCH /api/admin/kb/cross-source-dedup
 *
 * Body: { docId: string }
 *
 * Annule la déduplication d'un document (restaure rag_enabled=true).
 */
export const PATCH = withAdminApiAuth(async (req: NextRequest) => {
  try {
    const { docId } = await req.json() as { docId?: string }

    if (!docId) {
      return NextResponse.json(
        { success: false, error: 'docId requis' },
        { status: 400 }
      )
    }

    await revertDedup(docId)
    return NextResponse.json({ success: true, message: `Déduplication annulée pour ${docId}` })
  } catch (error) {
    console.error('[CrossSourceDedup] PATCH error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
