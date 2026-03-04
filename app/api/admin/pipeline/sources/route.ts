/**
 * GET /api/admin/pipeline/sources
 * Liste des web sources ayant au moins un document KB
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const result = await db.query(
      `SELECT DISTINCT ws.id, ws.name, ws.base_url, ws.categories
      FROM web_sources ws
      INNER JOIN web_pages wp ON wp.web_source_id = ws.id
      INNER JOIN knowledge_base kb ON wp.knowledge_base_id = kb.id
      WHERE kb.is_active = true OR kb.pipeline_stage = 'rejected'
      ORDER BY ws.name`
    )

    return NextResponse.json({ sources: result.rows })
  } catch (error) {
    console.error('[Pipeline API] Erreur sources:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
