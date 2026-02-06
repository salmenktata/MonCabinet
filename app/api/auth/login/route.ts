/**
 * API Route: POST /api/auth/login
 * Authentification avec cookies HttpOnly
 *
 * Rate limited: 5 tentatives / 15 minutes par IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { authenticateUser, SessionUser } from '@/lib/auth/session'
import { loginLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'

const log = createLogger('Auth:Login')

// Configuration cookies
const COOKIE_NAME = 'auth_session'
const SESSION_DURATION = 30 * 24 * 60 * 60 // 30 jours en secondes

/**
 * Crée un token JWT signé
 */
async function createToken(user: SessionUser): Promise<string> {
  const secretKey = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .setSubject(user.id)
    .sign(secretKey)
}

export async function POST(request: NextRequest) {
  // Rate limiting par IP
  const clientIP = getClientIP(request)
  const rateLimitResult = loginLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
    return NextResponse.json(
      {
        success: false,
        error: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: getRateLimitHeaders(rateLimitResult),
      }
    )
  }

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email et mot de passe requis' },
        { status: 400, headers: getRateLimitHeaders(rateLimitResult) }
      )
    }

    // Authentifier l'utilisateur
    const result = await authenticateUser(email, password)

    if (result.error || !result.user) {
      log.info('Échec connexion', { email, ip: clientIP, errorCode: result.error })

      // Gérer les différents codes d'erreur
      const statusCode = result.error === 'PENDING_APPROVAL' ? 403 :
                         result.error === 'ACCOUNT_SUSPENDED' ? 403 :
                         result.error === 'ACCOUNT_REJECTED' ? 403 : 401

      return NextResponse.json(
        {
          success: false,
          error: result.message || 'Email ou mot de passe incorrect',
          errorCode: result.error
        },
        { status: statusCode, headers: getRateLimitHeaders(rateLimitResult) }
      )
    }

    // Connexion réussie - créer le token JWT
    const token = await createToken(result.user)

    // Reset le rate limiter pour cette IP
    loginLimiter.reset(clientIP)
    log.info('Connexion réussie', { email, ip: clientIP })

    // Créer la réponse avec le cookie défini directement
    const response = NextResponse.json({
      success: true,
      user: result.user,
    })

    // Définir le cookie dans la réponse HTTP
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION,
    })

    return response
  } catch (error) {
    log.exception('Erreur login', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
