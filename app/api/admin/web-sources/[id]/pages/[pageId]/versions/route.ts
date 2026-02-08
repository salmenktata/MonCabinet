import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { pageId } = await params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const result = await db.query(
      `SELECT * FROM get_web_page_versions($1, $2, $3)`,
      [pageId, limit, offset]
    )

    const versions = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      version: row.version,
      title: row.title,
      contentHash: row.content_hash,
      wordCount: row.word_count,
      changeType: row.change_type,
      diffSummary: row.diff_summary,
      createdAt: row.created_at,
    }))

    return NextResponse.json({ versions })
  } catch (error) {
    console.error('Erreur GET versions:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { pageId } = await params
    const body = await request.json()
    const { versionId } = body

    if (!versionId) {
      return NextResponse.json({ error: 'versionId requis' }, { status: 400 })
    }

    // Récupérer la version à restaurer
    const versionResult = await db.query(
      `SELECT * FROM web_page_versions WHERE id = $1 AND web_page_id = $2`,
      [versionId, pageId]
    )

    if (versionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Version non trouvée' }, { status: 404 })
    }

    const version = versionResult.rows[0]

    // Sauvegarder l'état actuel avant restauration
    await db.query(`SELECT create_web_page_version($1, 'restore')`, [pageId])

    // Restaurer la version
    await db.query(
      `UPDATE web_pages SET
        title = $1, extracted_text = $2, content_hash = $3,
        word_count = $4, metadata = $5, updated_at = NOW()
       WHERE id = $6`,
      [version.title, version.extracted_text, version.content_hash,
       version.word_count, version.metadata, pageId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur POST restore version:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
