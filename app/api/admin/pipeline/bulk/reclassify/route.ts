/**
 * POST /api/admin/pipeline/bulk/reclassify
 * Reclassifie N documents en batch (max 100)
 * Body: { docIds: string[], category: string, subcategory?: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { bulkReclassify } from '@/lib/pipeline/document-pipeline-service'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { docIds, category, subcategory } = body as { docIds: string[]; category: string; subcategory?: string }

    if (!Array.isArray(docIds) || docIds.length === 0) {
      return NextResponse.json({ error: 'docIds requis (tableau non vide)' }, { status: 400 })
    }

    if (!category || category.trim().length === 0) {
      return NextResponse.json({ error: 'Catégorie requise' }, { status: 400 })
    }

    if (docIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 documents par batch' }, { status: 400 })
    }

    const result = await bulkReclassify(docIds, session.user.id, category.trim(), subcategory?.trim() || null)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Pipeline API] Erreur bulk reclassify:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
