/**
 * API Route: Re-consolidation batch des documents juridiques
 *
 * POST /api/admin/legal-documents/reconsolidate
 * - Trouve les legal_documents "stale" (pages crawlées après la dernière consolidation)
 * - Re-consolide par batch (batchSize, défaut 20)
 *
 * Réservé aux administrateurs (session admin OU CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { reconsolidateStaleDocs } from '@/lib/legal-documents/content-consolidation-service'

export const POST = withAdminApiAuth(
  async (request: NextRequest): Promise<NextResponse> => {
    try {
      const body = await request.json().catch(() => ({}))
      const batchSize = Math.min(Number(body.batchSize) || 20, 50)

      const result = await reconsolidateStaleDocs(batchSize)

      return NextResponse.json({
        success: true,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        remaining: result.remaining,
      })
    } catch (error) {
      console.error('Erreur re-consolidation batch:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Erreur inconnue' },
        { status: 500 }
      )
    }
  },
  { allowCronSecret: true }
)
