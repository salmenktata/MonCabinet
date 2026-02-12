import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getReviewQueueStats } from '@/app/actions/super-admin/content-review'

/**
 * GET /api/super-admin/content-review/stats
 * Récupère les statistiques de la queue de revue
 */
export async function GET(req: NextRequest) {
  try {
    // Vérifier l'authentification et les permissions
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier que l'utilisateur est super-admin
    const adminCheck = await db.query(
      `SELECT is_super_admin FROM users WHERE id = $1`,
      [session.user.id]
    )

    if (!adminCheck.rows[0]?.is_super_admin) {
      return NextResponse.json(
        { error: 'Accès réservé aux super admins' },
        { status: 403 }
      )
    }

    // Récupérer les stats
    const stats = await getReviewQueueStats()

    // Mapper vers le format attendu par le composant
    const response = {
      pending: stats.pendingCount,
      assigned: stats.assignedCount,
      inProgress: 0, // TODO: Ajouter dans ReviewQueueStats si nécessaire
      completed: stats.completedToday,
      byType: stats.byType,
      byPriority: stats.byPriority,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ContentReview] Erreur récupération stats:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
