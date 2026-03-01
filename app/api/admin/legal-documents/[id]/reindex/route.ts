/**
 * API Route: Réindexation forcée d'un document juridique
 *
 * POST /api/admin/legal-documents/[id]/reindex
 *   - Re-chunke et re-embeds un document approuvé sans changer son statut d'approbation
 *
 * Réservé aux administrateurs (session admin OU CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST: Réindexer un document juridique (force re-chunking + re-embedding)
 */
export const POST = withAdminApiAuth(
  async (
    _request: NextRequest,
    ctx: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const params = ctx.params ? await ctx.params : {}
      const id = params.id

      if (!id) {
        return NextResponse.json({ error: 'ID document manquant' }, { status: 400 })
      }

      const docResult = await db.query(
        `SELECT id, citation_key, is_approved, consolidation_status
         FROM legal_documents WHERE id = $1`,
        [id]
      )

      if (docResult.rows.length === 0) {
        return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
      }

      const doc = docResult.rows[0]

      if (!doc.is_approved) {
        return NextResponse.json(
          { error: 'Le document doit être approuvé avant réindexation' },
          { status: 400 }
        )
      }

      if (doc.consolidation_status !== 'complete') {
        return NextResponse.json(
          { error: 'La consolidation doit être complète avant réindexation' },
          { status: 400 }
        )
      }

      const result = await indexLegalDocument(id)

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Erreur lors de la réindexation', documentId: id },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        documentId: id,
        chunksCreated: result.chunksCreated,
        message: `Document ${doc.citation_key} réindexé — ${result.chunksCreated} chunk(s) créé(s)`,
      })
    } catch (error) {
      console.error('[API] Erreur réindexation:', error)
      return NextResponse.json(
        { error: 'Erreur serveur' },
        { status: 500 }
      )
    }
  },
  { allowCronSecret: true }
)
