import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    if (id) {
      const result = await db.query(
        `SELECT id, question, context, conseil, sources, actions, domain, created_at
         FROM consultations
         WHERE id = $1 AND user_id = $2`,
        [id, session.user.id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Consultation non trouvée' }, { status: 404 })
      }

      const row = result.rows[0]
      return NextResponse.json({
        id: row.id,
        question: row.question,
        conseil: row.conseil,
        sources: row.sources || [],
        actions: row.actions || [],
        domain: row.domain,
        createdAt: row.created_at,
      })
    }

    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const result = await db.query(
      `SELECT id, question, domain, created_at
       FROM consultations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [session.user.id, limit]
    )

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('[API consultations] Erreur:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
