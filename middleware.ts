/**
 * Middleware d'authentification avec cookies HttpOnly
 *
 * Protège les routes définies dans le matcher.
 * Redirige vers /login si l'utilisateur n'est pas authentifié.
 * Vérifie le rôle super_admin pour les routes /super-admin/*
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// SÉCURITÉ: Ne jamais utiliser de fallback pour le secret JWT
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    'NEXTAUTH_SECRET est requis. Définissez cette variable d\'environnement avec une valeur sécurisée.'
  )
}

const SECRET_KEY = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)

const COOKIE_NAME = 'auth_session'

interface TokenPayload {
  user: {
    id: string
    email: string
    name: string
    role?: string
    status?: string
    plan?: string
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const pathname = request.nextUrl.pathname

  // Pas de token = pas authentifié
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Vérifier le token JWT
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY)
    const tokenPayload = payload as unknown as TokenPayload

    // Valider la structure du token
    if (!tokenPayload?.user?.id || !tokenPayload?.user?.email) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'invalid_token')
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    const user = tokenPayload.user

    // Vérifier le status de l'utilisateur
    if (user.status && user.status !== 'approved') {
      // Autoriser l'accès à pending-approval
      if (pathname === '/pending-approval') {
        return NextResponse.next()
      }

      // Rediriger selon le status
      if (user.status === 'pending') {
        return NextResponse.redirect(new URL('/pending-approval', request.url))
      }
      if (user.status === 'suspended' || user.status === 'rejected') {
        // Déconnecter l'utilisateur
        const response = NextResponse.redirect(new URL('/login?error=account_suspended', request.url))
        response.cookies.delete(COOKIE_NAME)
        return response
      }
    }

    // Pages réservées au super_admin dans le dashboard
    const superAdminOnlyPages = [
      '/parametres/base-connaissances',
      '/client/jurisprudence-timeline',
      '/client/legal-reasoning',
    ]
    if (superAdminOnlyPages.some(page => pathname.startsWith(page))) {
      if (user.role !== 'super_admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }

    // Vérifier le rôle pour les routes super-admin
    if (pathname.startsWith('/super-admin')) {
      // Toutes les pages super-admin réservées aux super_admin uniquement
      if (user.role !== 'super_admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }

    // Passer le pathname au layout via header (pour vérification rôle admin)
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  } catch {
    // Token invalide ou expiré
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete(COOKIE_NAME)
    return response
  }
}

/**
 * Routes protégées par authentification
 */
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/clients/:path*',
    '/client/:path*',
    '/dossiers/:path*',
    '/factures/:path*',
    '/parametres/:path*',
    '/echeances/:path*',
    '/templates/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/documents/:path*',
    '/time-tracking/:path*',
    '/super-admin/:path*',
    '/assistant-ia/:path*',
  ],
}
