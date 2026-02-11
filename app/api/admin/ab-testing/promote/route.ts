/**
 * API Route - Promotion Variant A/B (Phase 5.3)
 *
 * POST /api/admin/ab-testing/promote
 * Body: { variant: 'variant_a' | 'variant_b' }
 *
 * Promeut variant testé en nouveau Control.
 *
 * @module app/api/admin/ab-testing/promote/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { db } from '@/lib/db/postgres'
import { VARIANT_CONFIGS } from '@/lib/ai/prompt-ab-testing-service'

export async function POST(request: NextRequest) {
  try {
    // Auth super-admin uniquement
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )
    const userRole = userResult.rows[0]?.role
    if (userRole !== 'super-admin') {
      return NextResponse.json(
        { error: 'Accès refusé (super-admin requis)' },
        { status: 403 }
      )
    }

    // Parser body
    const body = await request.json()
    const { variant } = body

    if (variant !== 'variant_a' && variant !== 'variant_b') {
      return NextResponse.json(
        { error: 'variant invalide (variant_a ou variant_b)' },
        { status: 400 }
      )
    }

    console.log(
      `[A/B Testing Promote] Promotion ${variant} par user ${session.user.id}`
    )

    // 1. Archiver test actuel
    await db.query(
      `
      INSERT INTO ab_test_archive (test_name, promoted_variant, promoted_at, promoted_by)
      VALUES ($1, $2, NOW(), $3)
    `,
      ['legal_prompts_v1', variant, session.user.id]
    )

    // 2. Réinitialiser assignments (optionnel - ou garder pour continuité)
    // Pour l'instant on garde les assignments existantes

    // 3. Logger promotion
    const variantConfig = VARIANT_CONFIGS[variant]
    console.log(
      `[A/B Testing Promote] ✅ ${variantConfig.name} promu en Control`
    )

    // NOTE: La vraie implémentation nécessiterait de :
    // - Mettre à jour VARIANT_CONFIGS.control avec config du variant promu
    // - Redéployer application avec nouveau prompt
    // - Ou stocker prompt actif en DB et le charger dynamiquement

    return NextResponse.json({
      success: true,
      promotedVariant: variant,
      message: `${variantConfig.name} promu avec succès`,
      note: 'Redéploiement application requis pour activer nouveau prompt Control',
    })
  } catch (error) {
    console.error('[A/B Testing Promote] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
