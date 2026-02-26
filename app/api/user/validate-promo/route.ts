/**
 * GET /api/user/validate-promo?code=XYZ&plan=pro
 * Valide un code promo et retourne la remise applicable
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

const PLAN_PRICES: Record<string, number> = {
  pro: 89,
  expert: 229,
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const code = req.nextUrl.searchParams.get('code')?.toUpperCase().trim()
  const plan = req.nextUrl.searchParams.get('plan') // 'pro' ou 'expert'

  if (!code || !plan) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  if (!['pro', 'expert'].includes(plan)) {
    return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
  }

  const result = await query(
    `SELECT id, code, discount_type, discount_value, applies_to, max_uses, used_count, expires_at
     FROM promo_codes
     WHERE code = $1 AND is_active = true`,
    [code]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ valid: false, error: 'Code invalide ou inactif' })
  }

  const promo = result.rows[0]

  // Vérifier expiration
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Code expiré' })
  }

  // Vérifier quota
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return NextResponse.json({ valid: false, error: 'Code épuisé' })
  }

  // Vérifier applicabilité au plan
  if (promo.applies_to !== 'all' && promo.applies_to !== plan) {
    return NextResponse.json({ valid: false, error: `Ce code est réservé au plan ${promo.applies_to === 'pro' ? 'Pro' : 'Expert'}` })
  }

  const originalPrice = PLAN_PRICES[plan]
  let discountedPrice: number

  if (promo.discount_type === 'percent') {
    discountedPrice = Math.round(originalPrice * (1 - promo.discount_value / 100))
  } else {
    discountedPrice = Math.max(0, originalPrice - promo.discount_value)
  }

  return NextResponse.json({
    valid: true,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    originalPrice,
    discountedPrice,
    savings: originalPrice - discountedPrice,
  })
}
