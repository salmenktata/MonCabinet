'use server'

import { query } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { hash } from 'bcryptjs'

/**
 * Créer un nouveau compte utilisateur
 */
export async function registerUserAction(data: {
  email: string
  password: string
  nom: string
  prenom: string
}) {
  try {
    // Validation
    if (!data.email || !data.password) {
      return { error: 'Email et mot de passe requis' }
    }

    if (data.password.length < 6) {
      return { error: 'Le mot de passe doit contenir au moins 6 caractères' }
    }

    // Vérifier si l'email existe déjà
    const existingResult = await query(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    )

    if (existingResult.rows.length > 0) {
      return { error: 'Un compte existe déjà avec cet email' }
    }

    // Hasher le mot de passe
    const passwordHash = await hash(data.password, 10)

    // Créer l'utilisateur
    const userResult = await query(
      `INSERT INTO users (email, password_hash, nom, prenom, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, email, nom, prenom`,
      [data.email, passwordHash, data.nom, data.prenom]
    )

    const user = userResult.rows[0]

    // Créer le profil vide
    await query(
      `INSERT INTO profiles (user_id, created_at)
       VALUES ($1, NOW())`,
      [user.id]
    )

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
      },
    }
  } catch (error) {
    console.error('Erreur inscription:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de l\'inscription' }
  }
}
