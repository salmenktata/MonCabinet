/**
 * API pour réindexer les documents Google Drive trop longs
 * POST /api/admin/reindex-long-docs
 *
 * Utilise le service reindexLongDocuments qui:
 * 1. Trouve docs >50KB avec erreur "trop long"
 * 2. Les découpe en sections avec table des matières
 * 3. Crée embeddings pour chaque section
 *
 * Body: { sourceId: string, limit?: number, dryRun?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { reindexLongDocuments } from '@/lib/web-scraper/reindex-long-documents'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json()
    const { sourceId, limit = 10, dryRun = false } = body

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId requis' },
        { status: 400 }
      )
    }

    console.log(`[ReindexLongDocs] Démarrage réindexation docs longs source ${sourceId} (limit: ${limit}, dryRun: ${dryRun})`)

    const startTime = Date.now()
    const result = await reindexLongDocuments(sourceId, {
      limit,
      dryRun,
    })

    const duration = Date.now() - startTime

    return NextResponse.json({
      duration,
      dryRun,
      ...result, // result already contains success boolean
    })
  } catch (error) {
    console.error('[ReindexLongDocs] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
