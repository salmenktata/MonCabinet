/**
 * API Bulk actions sur les sources web
 * POST /api/admin/web-sources/bulk
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { updateWebSource, createCrawlJob } from '@/lib/web-scraper/source-service'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
  }

  // Verify super_admin role
  const userResult = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
  if (userResult.rows[0]?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
  }

  const body = await request.json()
  const { action, sourceIds } = body as { action: string; sourceIds: string[] }

  if (!action || !Array.isArray(sourceIds) || sourceIds.length === 0) {
    return NextResponse.json({ error: 'action et sourceIds requis' }, { status: 400 })
  }

  if (!['crawl', 'activate', 'deactivate'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }

  let success = 0
  let failed = 0
  const errors: string[] = []

  for (const id of sourceIds) {
    try {
      switch (action) {
        case 'crawl':
          await createCrawlJob(id, 'incremental')
          break
        case 'activate':
          await updateWebSource(id, { isActive: true })
          break
        case 'deactivate':
          await updateWebSource(id, { isActive: false })
          break
      }
      success++
    } catch (err) {
      failed++
      errors.push(`${id}: ${err instanceof Error ? err.message : 'Erreur'}`)
    }
  }

  return NextResponse.json({ success, failed, errors })
}
