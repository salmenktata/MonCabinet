import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await req.json()
    const { sourceId, sourceTitre, isPositive, isNegative } = body

    if (!sourceId || !sourceTitre) {
      return NextResponse.json(
        { error: 'sourceId et sourceTitre requis' },
        { status: 400 }
      )
    }

    // Enregistrer le feedback dans la base de données
    const query = `
      INSERT INTO source_feedback (user_id, source_id, source_titre, is_positive, is_negative, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, source_id)
      DO UPDATE SET
        is_positive = $4,
        is_negative = $5,
        updated_at = NOW()
      RETURNING *
    `

    const result = await db.query(query, [
      session.user.id,
      sourceId,
      sourceTitre,
      isPositive || false,
      isNegative || false,
    ])

    return NextResponse.json({
      success: true,
      feedback: result.rows[0],
    })
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du feedback:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer les statistiques de feedback
    const query = `
      SELECT
        source_id,
        source_titre,
        COUNT(*) FILTER (WHERE is_positive = true) as positive_count,
        COUNT(*) FILTER (WHERE is_negative = true) as negative_count,
        COUNT(*) as total_count
      FROM source_feedback
      WHERE user_id = $1
      GROUP BY source_id, source_titre
      ORDER BY total_count DESC
      LIMIT 100
    `

    const result = await db.query(query, [session.user.id])

    return NextResponse.json({
      success: true,
      feedbacks: result.rows,
    })
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
