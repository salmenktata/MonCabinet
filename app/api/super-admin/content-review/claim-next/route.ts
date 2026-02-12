import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { claimNextReviewItem } from '@/app/actions/super-admin/content-review'

/**
 * POST /api/super-admin/content-review/claim-next
 * Réclame le prochain item de revue disponible
 */
export async function POST(req: NextRequest) {
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

    // Utiliser l'ID utilisateur
    const userId = session.user.id

    // Récupérer le prochain item
    const item = await claimNextReviewItem(userId)

    if (!item) {
      return NextResponse.json(null, { status: 200 })
    }

    return NextResponse.json(item)
  } catch (error) {
    console.error('[ContentReview] Erreur claim next:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
