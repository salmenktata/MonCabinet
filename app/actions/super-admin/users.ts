'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email/email-service'
import { safeParseInt } from '@/lib/utils/safe-number'
import { rewardReferrerIfEligible } from '@/lib/plans/referral-service'
import { getJ0WelcomeEmailHtml, getJ0WelcomeEmailText } from '@/lib/email/templates/trial-onboarding-emails'

// =============================================================================
// VÉRIFICATION SUPER ADMIN
// =============================================================================

async function checkSuperAdminAccess(): Promise<{ adminId: string; adminEmail: string } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { error: 'Non authentifié' }
  }

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
  await query(
    `INSERT INTO admin_audit_logs
     (admin_id, admin_email, action_type, target_type, target_id, target_identifier, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      adminId,
      adminEmail,
      actionType,
      targetType,
      targetId,
      targetIdentifier,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null
    ]
  )
}

// =============================================================================
// EMAILS TEMPLATES
// =============================================================================

/**
 * Échappe les caractères HTML pour prévenir les injections XSS
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char)
}

function getApprovalEmailHtml(userName: string) {
  const safeName = escapeHtml(userName)
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #22c55e;">Bienvenue sur Qadhya !</h1>
      <p>Bonjour ${safeName},</p>
      <p>Nous avons le plaisir de vous informer que votre demande d'inscription a été <strong>approuvée</strong>.</p>
      <p>Vous pouvez maintenant vous connecter et commencer à utiliser la plateforme.</p>
      <div style="margin: 30px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/login"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Se connecter
        </a>
      </div>
      <p>Cordialement,<br>L'équipe Qadhya</p>
    </div>
  `
}

function getRejectionEmailHtml(userName: string, reason?: string) {
  const safeName = escapeHtml(userName)
  const safeReason = reason ? escapeHtml(reason) : ''
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #ef4444;">Demande d'inscription refusée</h1>
      <p>Bonjour ${safeName},</p>
      <p>Nous sommes désolés de vous informer que votre demande d'inscription a été <strong>refusée</strong>.</p>
      ${safeReason ? `<p><strong>Raison :</strong> ${safeReason}</p>` : ''}
      <p>Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à nous contacter.</p>
      <p>Cordialement,<br>L'équipe Qadhya</p>
    </div>
  `
}

function getSuspensionEmailHtml(userName: string, reason?: string) {
  const safeName = escapeHtml(userName)
  const safeReason = reason ? escapeHtml(reason) : ''
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #ef4444;">Compte suspendu</h1>
      <p>Bonjour ${safeName},</p>
      <p>Nous vous informons que votre compte a été <strong>suspendu</strong>.</p>
      ${safeReason ? `<p><strong>Raison :</strong> ${safeReason}</p>` : ''}
      <p>Si vous souhaitez contester cette décision, veuillez nous contacter.</p>
      <p>Cordialement,<br>L'équipe Qadhya</p>
    </div>
  `
}

function getReactivationEmailHtml(userName: string) {
  const safeName = escapeHtml(userName)
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #22c55e;">Compte réactivé</h1>
      <p>Bonjour ${safeName},</p>
      <p>Nous avons le plaisir de vous informer que votre compte a été <strong>réactivé</strong>.</p>
      <p>Vous pouvez à nouveau vous connecter et utiliser la plateforme.</p>
      <div style="margin: 30px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/login"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Se connecter
        </a>
      </div>
      <p>Cordialement,<br>L'équipe Qadhya</p>
    </div>
  `
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Approuver un utilisateur
 */
export async function approveUserAction(userId: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, nom, prenom, status FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    if (user.status !== 'pending') {
      return { error: `Impossible d'approuver un utilisateur avec le status: ${user.status}` }
    }

    // Mettre à jour le status + démarrer l'essai 14 jours automatiquement
    const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    await query(
      `UPDATE users SET
        status = 'approved',
        is_approved = TRUE,
        approved_by = $1,
        approved_at = NOW(),
        plan = 'trial',
        plan_expires_at = $3,
        trial_started_at = NOW(),
        trial_ai_uses_remaining = 30,
        referral_code = COALESCE(referral_code, generate_referral_code())
       WHERE id = $2`,
      [authCheck.adminId, userId, trialExpiresAt]
    )

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'user_approved',
      'user',
      userId,
      user.email,
      { status: 'pending' },
      { status: 'approved', plan: 'trial', trial_expires_at: trialExpiresAt }
    )

    // Récupérer le referral_code généré (pour l'email J0)
    const updatedUser = await query(
      'SELECT referral_code FROM users WHERE id = $1',
      [userId]
    )
    const referralCode = updatedUser.rows[0]?.referral_code || '—'

    // Envoyer email J0 bienvenue trial (remplace l'email d'approbation générique)
    const userName = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email
    await sendEmail({
      to: user.email,
      subject: 'Bienvenue sur Qadhya — Votre essai de 14 jours commence maintenant !',
      html: getJ0WelcomeEmailHtml(userName, referralCode),
      text: getJ0WelcomeEmailText(userName),
    })

    // Marquer J0 comme envoyé
    query(
      `UPDATE users SET trial_emails_sent = '["j0_welcome"]'::jsonb WHERE id = $1`,
      [userId]
    ).catch(() => null)

    // Marquer la notification comme traitée
    await query(
      `UPDATE admin_notifications
       SET is_actioned = TRUE, actioned_at = NOW(), actioned_by = $1, action_result = 'approved'
       WHERE target_id = $2 AND notification_type = 'new_registration' AND is_actioned = FALSE`,
      [authCheck.adminId, userId]
    )

    revalidatePath('/super-admin/users')
    revalidatePath('/super-admin/dashboard')
    revalidatePath('/super-admin/notifications')

    return { success: true }
  } catch (error) {
    console.error('Erreur approbation utilisateur:', error)
    return { error: 'Erreur lors de l\'approbation' }
  }
}

/**
 * Rejeter un utilisateur
 */
export async function rejectUserAction(userId: string, reason?: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, nom, prenom, status FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    if (user.status !== 'pending') {
      return { error: `Impossible de rejeter un utilisateur avec le status: ${user.status}` }
    }

    // Mettre à jour le status
    await query(
      `UPDATE users SET
        status = 'rejected',
        is_approved = FALSE,
        rejected_at = NOW(),
        rejection_reason = $1
       WHERE id = $2`,
      [reason || null, userId]
    )

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'user_rejected',
      'user',
      userId,
      user.email,
      { status: 'pending' },
      { status: 'rejected', reason }
    )

    // Envoyer email
    const userName = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email
    await sendEmail({
      to: user.email,
      subject: 'Votre demande d\'inscription Qadhya',
      html: getRejectionEmailHtml(userName, reason)
    })

    // Marquer la notification comme traitée
    await query(
      `UPDATE admin_notifications
       SET is_actioned = TRUE, actioned_at = NOW(), actioned_by = $1, action_result = 'rejected'
       WHERE target_id = $2 AND notification_type = 'new_registration' AND is_actioned = FALSE`,
      [authCheck.adminId, userId]
    )

    revalidatePath('/super-admin/users')
    revalidatePath('/super-admin/dashboard')
    revalidatePath('/super-admin/notifications')

    return { success: true }
  } catch (error) {
    console.error('Erreur rejet utilisateur:', error)
    return { error: 'Erreur lors du rejet' }
  }
}

/**
 * Suspendre un utilisateur
 */
export async function suspendUserAction(userId: string, reason?: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, nom, prenom, status, role FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    if (user.role === 'super_admin') {
      return { error: 'Impossible de suspendre un super administrateur' }
    }

    if (user.status !== 'approved') {
      return { error: `Impossible de suspendre un utilisateur avec le status: ${user.status}` }
    }

    // Mettre à jour le status
    await query(
      `UPDATE users SET
        status = 'suspended',
        is_approved = FALSE,
        suspended_at = NOW(),
        suspension_reason = $1
       WHERE id = $2`,
      [reason || null, userId]
    )

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'user_suspended',
      'user',
      userId,
      user.email,
      { status: 'approved' },
      { status: 'suspended', reason }
    )

    // Envoyer email
    const userName = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email
    await sendEmail({
      to: user.email,
      subject: 'Votre compte Qadhya a été suspendu',
      html: getSuspensionEmailHtml(userName, reason)
    })

    revalidatePath('/super-admin/users')
    revalidatePath('/super-admin/dashboard')

    return { success: true }
  } catch (error) {
    console.error('Erreur suspension utilisateur:', error)
    return { error: 'Erreur lors de la suspension' }
  }
}

/**
 * Réactiver un utilisateur
 */
export async function reactivateUserAction(userId: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, nom, prenom, status FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    if (user.status !== 'suspended' && user.status !== 'rejected') {
      return { error: `Impossible de réactiver un utilisateur avec le status: ${user.status}` }
    }

    const oldStatus = user.status

    // Mettre à jour le status
    await query(
      `UPDATE users SET
        status = 'approved',
        is_approved = TRUE,
        approved_by = $1,
        approved_at = NOW(),
        suspended_at = NULL,
        suspension_reason = NULL,
        rejected_at = NULL,
        rejection_reason = NULL
       WHERE id = $2`,
      [authCheck.adminId, userId]
    )

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'user_reactivated',
      'user',
      userId,
      user.email,
      { status: oldStatus },
      { status: 'approved' }
    )

    // Envoyer email
    const userName = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email
    await sendEmail({
      to: user.email,
      subject: 'Votre compte Qadhya a été réactivé',
      html: getReactivationEmailHtml(userName)
    })

    revalidatePath('/super-admin/users')
    revalidatePath('/super-admin/dashboard')

    return { success: true }
  } catch (error) {
    console.error('Erreur réactivation utilisateur:', error)
    return { error: 'Erreur lors de la réactivation' }
  }
}

/**
 * Changer le rôle d'un utilisateur
 */
export async function changeUserRoleAction(userId: string, newRole: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const validRoles = ['user', 'admin', 'super_admin']
    if (!validRoles.includes(newRole)) {
      return { error: 'Rôle invalide' }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    if (user.role === newRole) {
      return { error: 'L\'utilisateur a déjà ce rôle' }
    }

    // Empêcher la suppression du dernier super_admin
    if (user.role === 'super_admin' && newRole !== 'super_admin') {
      const countResult = await query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'"
      )
      if (parseInt(countResult.rows[0].count, 10) <= 1) {
        return { error: 'Impossible de retirer le rôle du dernier super administrateur' }
      }
    }

    const oldRole = user.role

    // Mettre à jour le rôle
    await query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [newRole, userId]
    )

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'role_changed',
      'user',
      userId,
      user.email,
      { role: oldRole },
      { role: newRole }
    )

    revalidatePath('/super-admin/users')
    revalidatePath(`/super-admin/users/${userId}`)

    return { success: true }
  } catch (error) {
    console.error('Erreur changement de rôle:', error)
    return { error: 'Erreur lors du changement de rôle' }
  }
}

/**
 * Changer le plan d'un utilisateur
 */
export async function changeUserPlanAction(userId: string, newPlan: string, expiresAt?: Date) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const validPlans = ['free', 'trial', 'pro', 'enterprise', 'expired_trial']
    if (!validPlans.includes(newPlan)) {
      return { error: 'Plan invalide' }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, plan FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    const oldPlan = user.plan

    // Mettre à jour le plan avec gestion des colonnes trial
    if (newPlan === 'trial') {
      const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      await query(
        `UPDATE users SET
           plan = $1,
           plan_expires_at = $2,
           trial_started_at = NOW(),
           trial_ai_uses_remaining = 30
         WHERE id = $3`,
        [newPlan, trialExpiresAt, userId]
      )
    } else {
      await query(
        'UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3',
        [newPlan, expiresAt || null, userId]
      )
    }

    // Log d'audit
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'plan_changed',
      'user',
      userId,
      user.email,
      { plan: oldPlan },
      { plan: newPlan, expires_at: expiresAt }
    )

    // Récompenser le parrain si le filleul souscrit à un plan payant
    if (newPlan === 'pro' || newPlan === 'enterprise') {
      rewardReferrerIfEligible(userId).catch((err) =>
        console.warn('Erreur reward referral (non-bloquant):', err)
      )
    }

    revalidatePath('/super-admin/users')
    revalidatePath(`/super-admin/users/${userId}`)
    revalidatePath('/super-admin/plans')

    return { success: true }
  } catch (error) {
    console.error('Erreur changement de plan:', error)
    return { error: 'Erreur lors du changement de plan' }
  }
}

/**
 * Supprimer définitivement un utilisateur
 */
export async function deleteUserAction(userId: string, confirmEmail: string) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    // Récupérer l'utilisateur
    const userResult = await query(
      'SELECT id, email, nom, prenom, role FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]

    if (!user) {
      return { error: 'Utilisateur non trouvé' }
    }

    // Vérifier la confirmation email
    if (user.email !== confirmEmail) {
      return { error: 'L\'email de confirmation ne correspond pas' }
    }

    // Empêcher la suppression d'un super_admin
    if (user.role === 'super_admin') {
      return { error: 'Impossible de supprimer un super administrateur' }
    }

    // Empêcher l'auto-suppression
    if (user.id === authCheck.adminId) {
      return { error: 'Impossible de supprimer votre propre compte' }
    }

    // Log d'audit AVANT suppression
    await createAuditLog(
      authCheck.adminId,
      authCheck.adminEmail,
      'user_deleted',
      'user',
      userId,
      user.email,
      { email: user.email, nom: user.nom, prenom: user.prenom, role: user.role },
      undefined
    )

    // Supprimer l'utilisateur (CASCADE supprimera les données liées)
    await query('DELETE FROM users WHERE id = $1', [userId])

    revalidatePath('/super-admin/users')
    revalidatePath('/super-admin/dashboard')

    return { success: true }
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

/**
 * Liste paginée des utilisateurs avec filtres
 */
export async function listUsersAction(options: {
  status?: string
  role?: string
  plan?: string
  search?: string
  limit?: number
  offset?: number
}) {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { status, role, plan, search, limit = 20, offset = 0 } = options

    // Construire la requête
    let whereClause = 'WHERE 1=1'
    const params: (string | number)[] = []
    let paramIndex = 1

    if (status && status !== 'all') {
      whereClause += ` AND status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (role && role !== 'all') {
      whereClause += ` AND role = $${paramIndex}`
      params.push(role)
      paramIndex++
    }

    if (plan && plan !== 'all') {
      whereClause += ` AND plan = $${paramIndex}`
      params.push(plan)
      paramIndex++
    }

    if (search) {
      whereClause += ` AND (email ILIKE $${paramIndex} OR nom ILIKE $${paramIndex} OR prenom ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    // Compter le total
    const countResult = await query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    // Récupérer les utilisateurs
    const usersResult = await query(
      `SELECT
        id, email, nom, prenom, role, status, plan, plan_expires_at,
        created_at, last_login_at, login_count, is_approved
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return {
      success: true,
      users: usersResult.rows,
      total,
      limit,
      offset
    }
  } catch (error) {
    console.error('Erreur liste utilisateurs:', error)
    return { error: 'Erreur lors de la récupération des utilisateurs' }
  }
}
