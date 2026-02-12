import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getReviewQueue } from '@/app/actions/super-admin/content-review'
import type { ReviewStatus, ReviewType, ReviewPriority } from '@/lib/web-scraper/types'

/**
 * GET /api/super-admin/content-review/queue
 * Récupère la queue de revue de contenu avec filtres
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

    // Parser les query params
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const statusParam = searchParams.get('status')
    const typeParam = searchParams.get('type')
    const priorityParam = searchParams.get('priority')

    // Construire les options de filtre
    const options: {
      status?: ReviewStatus[]
      reviewTypes?: ReviewType[]
      priority?: ReviewPriority[]
      limit: number
      offset: number
    } = {
      limit,
      offset,
    }

    if (statusParam && statusParam !== 'all') {
      options.status = [statusParam as ReviewStatus]
    }

    if (typeParam && typeParam !== 'all') {
      options.reviewTypes = [typeParam as ReviewType]
    }

    if (priorityParam && priorityParam !== 'all') {
      options.priority = [priorityParam as ReviewPriority]
    }

    // Récupérer la queue
    const result = await getReviewQueue(options)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[ContentReview] Erreur récupération queue:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
