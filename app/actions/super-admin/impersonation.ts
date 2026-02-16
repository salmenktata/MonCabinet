'use server'

import { query } from '@/lib/db/postgres'
import { getSession, startImpersonation, stopImpersonation, getImpersonationStatus } from '@/lib/auth/session'
import { headers } from 'next/headers'

// =============================================================================
// VÉRIFICATION SUPER ADMIN
// =============================================================================

async function checkSuperAdminAccess(): Promise<{ adminId: string; adminEmail: string } | { error: string }> {
  // En impersonation, vérifier l'admin original (pas l'utilisateur impersoné)
  const impersonation = await getImpersonationStatus()
  if (impersonation.isImpersonating && impersonation.originalAdmin) {
    const result = await query('SELECT id, email, role FROM users WHERE email = $1', [impersonation.originalAdmin.email])
    const user = result.rows[0]
    if (user?.role === 'super_admin') {
      return { adminId: user.id, adminEmail: user.email }
    }
  }

  const session = await getSession()
  if (!session?.user?.id) return { error: 'Non authentifié' }

  const result = await query('SELECT id, email, role FROM users WHERE id = $1', [session.user.id])
  const user = result.rows[0]

  if (!user || user.role !== 'super_admin') {
    return { error: 'Accès réservé aux super administrateurs' }
  }

  return { adminId: user.id, adminEmail: user.email }
}

// =============================================================================
// AUDIT LOG
// =============================================================================

async function createAuditLog(
  adminId: string,
  adminEmail: string,
  actionType: string,
  targetType: string,
  targetId: string,
  targetIdentifier: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>
) {
  const headersList = await headers()
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown'

  await query(
    `INSERT INTO admin_audit_logs
     (admin_id, admin_email, action_type, target_type, target_id, target_identifier, old_value, new_value, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      adminId,
      adminEmail,
      actionType,
      targetType,
      targetId,
      targetIdentifier,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress
    ]
  )
}

// =============================================================================
// ACTIONS
// =============================================================================

export async function startImpersonationAction(targetUserId: string): Promise<{ error?: string }> {
  const authCheck = await checkSuperAdminAccess()
  if ('error' in authCheck) return { error: authCheck.error }

  // Vérifier que la cible existe, est approuvée, et n'est pas super_admin
  const targetResult = await query(
    'SELECT id, email, nom, prenom, role, status FROM users WHERE id = $1',
    [targetUserId]
  )
  const target = targetResult.rows[0]

  if (!target) return { error: 'Utilisateur introuvable' }
  if (target.status !== 'approved') return { error: 'L\'utilisateur n\'est pas approuvé' }
  if (target.role === 'super_admin') return { error: 'Impossible d\'impersonner un super administrateur' }
  if (target.id === authCheck.adminId) return { error: 'Impossible de s\'impersonner soi-même' }

  const result = await startImpersonation(targetUserId)
  if (!result.success) return { error: result.error || 'Erreur lors de l\'impersonation' }

  const targetName = target.nom && target.prenom ? `${target.prenom} ${target.nom}` : target.email

  await createAuditLog(
    authCheck.adminId,
    authCheck.adminEmail,
    'impersonation_start',
    'user',
    targetUserId,
    target.email,
    undefined,
    { targetName, targetEmail: target.email, targetRole: target.role }
  )

  return {}
}

export async function stopImpersonationAction(): Promise<{ error?: string }> {
  const impersonation = await getImpersonationStatus()
  if (!impersonation.isImpersonating) return { error: 'Pas d\'impersonation en cours' }

  // Récupérer l'admin ID depuis le cookie original avant de le supprimer
  const adminResult = await query('SELECT id, email FROM users WHERE email = $1', [impersonation.originalAdmin!.email])
  const admin = adminResult.rows[0]

  const result = await stopImpersonation()
  if (!result.success) return { error: result.error || 'Erreur lors de l\'arrêt' }

  if (admin && impersonation.targetUser) {
    await createAuditLog(
      admin.id,
      admin.email,
      'impersonation_stop',
      'user',
      '',
      impersonation.targetUser.email,
      { targetName: impersonation.targetUser.name, targetEmail: impersonation.targetUser.email },
      undefined
    )
  }

  return {}
}
