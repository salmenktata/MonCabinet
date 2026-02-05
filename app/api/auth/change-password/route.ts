/**
 * API Change Password - Modification mot de passe utilisateur connecté
 * POST /api/auth/change-password
 */

import { NextRequest, NextResponse } from 'next/server'
import { hash, compare } from 'bcryptjs'
import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'

// Schéma de validation
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est requis'),
  newPassword: z
    .string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le nouveau mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le nouveau mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le nouveau mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le nouveau mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
})
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Le nouveau mot de passe doit être différent de l\'ancien',
    path: ['newPassword'],
  })

export async function POST(request: NextRequest) {
  try {
    // 1. Vérifier que l'utilisateur est authentifié
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    // 2. Parser et valider les données
    const body = await request.json()
    const validatedData = changePasswordSchema.parse(body)

    // 3. Récupérer l'utilisateur avec son hash actuel
    const userResult = await query(
      'SELECT id, email, password_hash FROM users WHERE id = $1',
      [session.user.id]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Utilisateur introuvable' },
        { status: 404 }
      )
    }

    const user = userResult.rows[0]

    // 4. Vérifier que le mot de passe actuel est correct
    const isCurrentPasswordValid = await compare(
      validatedData.currentPassword,
      user.password_hash
    )

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Le mot de passe actuel est incorrect' },
        { status: 400 }
      )
    }

    // 5. Hasher le nouveau mot de passe
    const newPasswordHash = await hash(validatedData.newPassword, 10)

    // 6. Mettre à jour le mot de passe
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, session.user.id]
    )

    console.log('[ChangePassword] Mot de passe modifié pour:', user.email)

    // 7. Retourner succès
    return NextResponse.json(
      {
        success: true,
        message: 'Mot de passe modifié avec succès',
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[ChangePassword] Erreur:', error)

    // Erreur de validation Zod
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }

    // Erreur générique
    return NextResponse.json(
      { error: 'Erreur lors de la modification du mot de passe' },
      { status: 500 }
    )
  }
}
