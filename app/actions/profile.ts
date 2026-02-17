'use server'

import { query } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { getSession } from '@/lib/auth/session'
import { hash } from 'bcryptjs'
import { revalidatePath } from 'next/cache'

/**
 * Mettre à jour le profil utilisateur (nom, prénom)
 */
export async function updateProfileAction(data: { nom: string; prenom: string }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Mettre à jour les infos utilisateur dans la table users
    await query(
      'UPDATE users SET nom = $1, prenom = $2, updated_at = NOW() WHERE id = $3',
      [data.nom, data.prenom, userId]
    )

    // Mettre à jour aussi le profil si la table existe
    await query(
      `UPDATE profiles SET updated_at = NOW() WHERE user_id = $1`,
      [userId]
    )

    revalidatePath('/profile')
    return { success: true }
  } catch (error) {
    console.error('Erreur mise à jour profil:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la mise à jour du profil' }
  }
}

/**
 * Changer le mot de passe utilisateur
 */
export async function changePasswordAction(data: {
  currentPassword: string
  newPassword: string
}) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Validation
    if (data.newPassword.length < 6) {
      return { error: 'Le mot de passe doit contenir au moins 6 caractères' }
    }

    // Hasher le nouveau mot de passe
    const newPasswordHash = await hash(data.newPassword, 10)

    // Mettre à jour le mot de passe
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    )

    revalidatePath('/profile')
    return { success: true }
  } catch (error) {
    console.error('Erreur changement mot de passe:', error)
    return { error: getErrorMessage(error) || 'Erreur lors du changement de mot de passe' }
  }
}

/**
 * Mettre à jour l'email utilisateur
 * NOTE: Nécessite une vérification par email dans une vraie app
 */
export async function updateEmailAction(newEmail: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Vérifier que l'email n'est pas déjà utilisé
    const existingResult = await query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [newEmail, userId]
    )

    if (existingResult.rows.length > 0) {
      return { error: 'Cette adresse email est déjà utilisée' }
    }

    // Mettre à jour l'email
    await query(
      'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
      [newEmail, userId]
    )

    revalidatePath('/profile')
    return {
      success: true,
      message: 'Email mis à jour. Veuillez vous reconnecter avec votre nouvelle adresse.',
    }
  } catch (error) {
    console.error('Erreur mise à jour email:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la mise à jour de l\'email' }
  }
}
