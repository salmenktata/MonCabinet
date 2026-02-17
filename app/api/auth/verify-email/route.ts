/**
 * API Verify Email - Vérification de l'adresse email
 * GET /api/auth/verify-email?token=xxx
 *
 * Valide le token et marque l'email comme vérifié
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { query } from '@/lib/db/postgres'

export async function GET(request: NextRequest) {
  try {
    // 1. Récupérer le token depuis les paramètres URL
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.redirect(
        new URL('/auth/verify-email?error=missing_token', process.env.NEXT_PUBLIC_APP_URL!)
      )
    }

    // 2. Rechercher l'utilisateur avec ce token
    const userResult = await query(
      `SELECT id, email, email_verified, email_verification_expires
       FROM users
       WHERE email_verification_token = $1`,
      [token]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.redirect(
        new URL('/auth/verify-email?error=invalid_token', process.env.NEXT_PUBLIC_APP_URL!)
      )
    }

    const user = userResult.rows[0]

    // 3. Vérifier si l'email est déjà vérifié
    if (user.email_verified) {
      return NextResponse.redirect(
        new URL('/auth/verify-email?success=already_verified', process.env.NEXT_PUBLIC_APP_URL!)
      )
    }

    // 4. Vérifier que le token n'a pas expiré
    const now = new Date()
    const expiresAt = new Date(user.email_verification_expires)

    if (now > expiresAt) {
      return NextResponse.redirect(
        new URL('/auth/verify-email?error=token_expired', process.env.NEXT_PUBLIC_APP_URL!)
      )
    }

    // 5. Marquer l'email comme vérifié
    await query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    )

    console.log('[VerifyEmail] Email vérifié pour:', user.email)

    // 6. Rediriger vers page de succès
    return NextResponse.redirect(
      new URL('/auth/verify-email?success=verified', process.env.NEXT_PUBLIC_APP_URL!)
    )
  } catch (error) {
    console.error('[VerifyEmail] Erreur:', error)

    return NextResponse.redirect(
      new URL('/auth/verify-email?error=server_error', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }
}
