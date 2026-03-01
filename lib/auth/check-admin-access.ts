/**
 * Helpers d'accès admin centralisés.
 * Remplace les 42 implémentations locales de checkAdminAccess dans les routes API et server actions.
 *
 * Règle : admin ET super_admin ont accès à toutes les routes /api/admin/*
 */

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'

const ADMIN_ROLES = ['admin', 'super_admin'] as const

/**
 * Pour les API Routes — reçoit un userId déjà extrait de la session.
 *
 * @example
 * const session = await getSession()
 * if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
 * if (!(await checkAdminAccess(session.user.id))) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
 */
export async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await query('SELECT role FROM users WHERE id = $1', [userId])
  return ADMIN_ROLES.includes(result.rows[0]?.role)
}

/**
 * Pour les Server Actions — récupère la session et vérifie le rôle.
 *
 * @returns { userId } si autorisé, { error } sinon.
 *
 * @example
 * const authCheck = await checkAdminAccessAction()
 * if ('error' in authCheck) return { error: authCheck.error }
 * const { userId } = authCheck
 */
export async function checkAdminAccessAction(): Promise<{ userId: string } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'Non authentifié' }

  const result = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
  if (!ADMIN_ROLES.includes(result.rows[0]?.role)) {
    return { error: 'Accès réservé aux administrateurs' }
  }

  return { userId: session.user.id }
}
