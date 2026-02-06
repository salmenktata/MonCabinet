/**
 * API Route: POST /api/auth/logout
 * Déconnexion - supprime le cookie de session
 */

import { NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'auth_session'

export async function POST() {
  try {
    // Créer la réponse
    const response = NextResponse.json({ success: true })

    // Supprimer le cookie en le rendant expiré
    response.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Expire immédiatement
    })

    return response
  } catch (error) {
    console.error('[API Logout] Erreur:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
