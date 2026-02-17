import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * POST /api/admin/cleanup-orphan-chunks
 *
 * Supprime les chunks de knowledge_base_chunks dont le document parent
 * n'existe plus dans knowledge_base (chunks orphelins).
 *
 * Headers requis:
 * - Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Compter d'abord
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM knowledge_base_chunks
      WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
    `)
    const count = parseInt(countResult.rows[0].count, 10)

    if (count === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: 'Aucun chunk orphelin trouvé' })
    }

    // Supprimer les chunks orphelins
    await db.query(`
      DELETE FROM knowledge_base_chunks
      WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
    `)

    return NextResponse.json({
      success: true,
      deleted: count,
      message: `${count} chunks orphelins supprimés`,
    })
  } catch (error) {
    console.error('[cleanup-orphan-chunks] Error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

/**
 * GET /api/admin/cleanup-orphan-chunks
 * Compte les chunks orphelins sans supprimer (dry-run)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM knowledge_base_chunks
    WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
  `)

  return NextResponse.json({
    orphanedChunks: parseInt(result.rows[0].count, 10),
  })
}
