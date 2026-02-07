/**
 * API Route: Administration - Pages d'une source web
 *
 * GET /api/admin/web-sources/[id]/pages
 * - Liste les pages crawlées d'une source
 * - Paramètres: status, isIndexed, search, limit, offset
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  getWebSource,
  listWebPages,
} from '@/lib/web-scraper'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role; return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// GET: Liste des pages
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params

    // Vérifier que la source existe
    const source = await getWebSource(id)
    if (!source) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const isIndexed = searchParams.get('isIndexed')
    const search = searchParams.get('search') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const { pages, total } = await listWebPages(id, {
      status,
      isIndexed: isIndexed ? isIndexed === 'true' : undefined,
      search,
      limit,
      offset,
    })

    return NextResponse.json({
      pages,
      total,
      source: {
        id: source.id,
        name: source.name,
        baseUrl: source.baseUrl,
      },
      pagination: {
        limit,
        offset,
        hasMore: offset + pages.length < total,
      },
    })
  } catch (error) {
    console.error('Erreur liste pages web source:', error)
    return NextResponse.json(
      { error: 'Erreur récupération des pages' },
      { status: 500 }
    )
  }
}
