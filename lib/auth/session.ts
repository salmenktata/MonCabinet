/**
 * Utilitaires d'authentification NextAuth pour Server Components
 *
 * Fournit des helpers pour vérifier et récupérer la session utilisateur
 * dans les Server Components et API Routes.
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'

/**
 * Récupère la session utilisateur côté serveur
 *
 * @returns Session utilisateur ou null si non connecté
 */
export async function getSession() {
  return await getServerSession(authOptions)
}

/**
 * Récupère l'utilisateur connecté ou redirige vers /login
 *
 * Utile pour les pages protégées qui nécessitent une authentification.
 *
 * @returns Session utilisateur (garanti non-null)
 * @throws Redirige vers /login si non authentifié
 */
export async function requireAuth() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  return session
}

/**
 * Récupère l'ID de l'utilisateur connecté
 *
 * @returns ID utilisateur ou null si non connecté
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.user?.id || null
}

/**
 * Vérifie si l'utilisateur est connecté
 *
 * @returns true si connecté, false sinon
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return !!session?.user
}
