import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

/**
 * POST /api/admin/cleanup-orphan-chunks
 *
 * Supprime les chunks de knowledge_base_chunks dont le document parent
 * n'existe plus dans knowledge_base (chunks orphelins).
 */
export const POST = withAdminApiAuth(async (_req, _ctx, _session) => {
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
}, { allowCronSecret: true })

/**
 * GET /api/admin/cleanup-orphan-chunks
 * Compte les chunks orphelins sans supprimer (dry-run)
 */
export const GET = withAdminApiAuth(async (_req, _ctx, _session) => {
  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM knowledge_base_chunks
    WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
  `)

  return NextResponse.json({
    orphanedChunks: parseInt(result.rows[0].count, 10),
  })
}, { allowCronSecret: true })
