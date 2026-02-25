/**
 * POST /api/admin/kb/enrich-court-metadata
 *
 * Enrichit les métadonnées judiciaires (numéro arrêt, date, chambre) des docs JURIS
 * en batch par extraction regex sur le full_text.
 *
 * Cible : docs category='jurisprudence' sans courtDecisionNumber dans metadata.
 *
 * Body:
 *   batchSize  (default: 20)   — nombre de docs à traiter
 *   sourceUrl  (optional)      — filtrer par URL source (ex: 'cassation.tn')
 *
 * Réponse:
 *   processed, enriched, skipped, errors
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { enrichCourtMetadataBatch } from '@/lib/ai/kb-quality-analyzer-service'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const POST = withAdminApiAuth(async (request) => {
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '20', 10), 100)
    const sourceUrl: string | undefined = body.sourceUrl || undefined

    const result = await enrichCourtMetadataBatch(batchSize, sourceUrl)

    return NextResponse.json({
      success: true,
      message: `Enrichissement terminé: ${result.enriched}/${result.processed} docs enrichis`,
      ...result,
    })
  } catch (error) {
    console.error('[EnrichCourtMetadata] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
