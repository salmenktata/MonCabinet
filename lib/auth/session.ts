/**
 * Système d'authentification robuste avec cookies HttpOnly
 *
 * Utilise jose pour JWT et cookies HttpOnly pour la sécurité maximale.
 * Les tokens ne sont jamais accessibles côté client (protection XSS).
 */

import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import { compare } from 'bcryptjs'

// =============================================================================
// CONFIGURATION
// =============================================================================

// SÉCURITÉ: Ne jamais utiliser de fallback pour le secret JWT
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    'NEXTAUTH_SECRET est requis. Définissez cette variable d\'environnement avec une valeur sécurisée.'
  )
}

const SECRET_KEY = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)

const COOKIE_NAME = 'auth_session'
// Note: secure=true uniquement si HTTPS (vérifié via NEXTAUTH_URL)
const isHttps = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isHttps,
  sameSite: 'lax' as const,
  path: '/',
}
const SESSION_DURATION = 30 * 24 * 60 * 60 // 30 jours en secondes

// =============================================================================
// TYPES
// =============================================================================

export interface SessionUser {
  id: string
  email: string
  name: string
  role?: string
  status?: string
  plan?: string
}

export interface Session {
  user: SessionUser
  expires: string
}

interface TokenPayload extends JWTPayload {
  user: SessionUser
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Récupère l'utilisateur depuis la base pour valider la session
 * Permet d'invalider les sessions si le compte est suspendu/rejeté
 */
async function fetchUserForSession(userId: string): Promise<SessionUser | null> {
  const result = await query(
    'SELECT id, email, nom, prenom, role, status, plan FROM users WHERE id = $1',
    [userId]
  )

  const user = result.rows[0]
  if (!user) return null

  const status = user.status || 'approved'
  if (status !== 'approved') return null

  return {
    id: user.id,
    email: user.email,
    name: user.nom && user.prenom ? `${user.prenom} ${user.nom}` : user.email,
    role: user.role || 'user',
    status,
    plan: user.plan || 'free',
  }
}

// =============================================================================
// FONCTIONS JWT
// =============================================================================

/**
 * Crée un token JWT signé
 */
async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .setSubject(user.id)
    .sign(SECRET_KEY)
}

/**
 * Vérifie et décode un token JWT
 */
async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY)
    return (payload as TokenPayload).user
  } catch (error) {
    // Token expiré ou invalide
    return null
  }
}

// =============================================================================
// GESTION COOKIES
// =============================================================================

/**
 * Définit le cookie de session HttpOnly
 */
export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await createToken(user)
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_DURATION,
  })
}

/**
 * Supprime le cookie de session
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// =============================================================================
// API PUBLIQUE - SESSION
// =============================================================================

/**
 * Récupère la session utilisateur depuis le cookie HttpOnly
 * Compatible avec l'ancienne API NextAuth
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value

    if (!token) return null

    const tokenUser = await verifyToken(token)
    if (!tokenUser?.id) return null

    // Validation côté base pour éviter les sessions périmées après changement de statut
    const user = await fetchUserForSession(tokenUser.id)
    if (!user) return null

    return {
      user,
      expires: new Date(Date.now() + SESSION_DURATION * 1000).toISOString(),
    }
  } catch (error) {
    console.error('[Session] Erreur lecture session:', error)
    return null
  }
}

/**
 * Récupère l'utilisateur connecté ou redirige vers /login
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  return session
}

/**
 * Récupère l'ID de l'utilisateur connecté
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.user?.id || null
}

/**
 * Vérifie si l'utilisateur est connecté
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}

/**
 * Récupère l'utilisateur actuel
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession()
  return session?.user || null
}

// =============================================================================
// AUTHENTIFICATION
// =============================================================================

/**
 * Codes d'erreur d'authentification
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'PENDING_APPROVAL'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REJECTED'

export interface AuthResult {
  user?: SessionUser
  error?: AuthErrorCode
  message?: string
}

/**
 * Authentifie un utilisateur avec email/mot de passe
 * Retourne l'utilisateur si les credentials sont valides
 * Vérifie également le status du compte
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const result = await query(
      'SELECT id, email, password_hash, nom, prenom, role, status, plan FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    )

    const user = result.rows[0]
    if (!user) {
      console.log('[Auth] Utilisateur non trouvé:', email)
      return { error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }
    }

    const isValid = await compare(password, user.password_hash)
    if (!isValid) {
      console.log('[Auth] Mot de passe invalide pour:', email)
      return { error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }
    }

    // Vérifier le status du compte
    const status = user.status || 'approved' // Par défaut approved pour compatibilité

    if (status === 'pending') {
      console.log('[Auth] Compte en attente:', email)
      return {
        error: 'PENDING_APPROVAL',
        message: 'Votre compte est en attente d\'approbation'
      }
    }

    if (status === 'suspended') {
      console.log('[Auth] Compte suspendu:', email)
      return {
        error: 'ACCOUNT_SUSPENDED',
        message: 'Votre compte a été suspendu. Contactez le support.'
      }
    }

    if (status === 'rejected') {
      console.log('[Auth] Compte rejeté:', email)
      return {
        error: 'ACCOUNT_REJECTED',
        message: 'Votre demande d\'inscription a été refusée'
      }
    }

    // Mettre à jour last_login_at et login_count
    await query(
      `UPDATE users SET
        last_login_at = NOW(),
        login_count = COALESCE(login_count, 0) + 1
       WHERE id = $1`,
      [user.id]
    )

    console.log('[Auth] Connexion réussie:', email)

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.nom && user.prenom ? `${user.prenom} ${user.nom}` : user.email,
        role: user.role || 'user',
        status: status,
        plan: user.plan || 'free',
      }
    }
  } catch (error) {
    console.error('[Auth] Erreur authentification:', error)
    return { error: 'INVALID_CREDENTIALS', message: 'Erreur serveur' }
  }
}

/**
 * Connecte un utilisateur (authentifie + crée session)
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: SessionUser; error?: string; errorCode?: AuthErrorCode }> {
  const result = await authenticateUser(email, password)

  if (result.error || !result.user) {
    return {
      success: false,
      error: result.message || 'Email ou mot de passe incorrect',
      errorCode: result.error
    }
  }

  await setSessionCookie(result.user)
  return { success: true, user: result.user }
}

/**
 * Déconnecte l'utilisateur
 */
export async function logoutUser(): Promise<void> {
  await clearSessionCookie()
}
