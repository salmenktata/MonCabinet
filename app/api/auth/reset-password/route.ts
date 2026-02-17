/**
 * API Reset Password - Réinitialisation effective du mot de passe
 * POST /api/auth/reset-password
 *
 * Valide le token et met à jour le mot de passe
 *
 * Rate limited: 3 tentatives / heure par IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { hash } from 'bcryptjs'
import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import { passwordResetLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'

const log = createLogger('Auth:ResetPassword')

// Schéma de validation
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
})
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export async function POST(request: NextRequest) {
  // Rate limiting par IP
  const clientIP = getClientIP(request)
  const rateLimitResult = passwordResetLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
    return NextResponse.json(
      {
        error: 'Trop de tentatives. Veuillez réessayer plus tard.',
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: getRateLimitHeaders(rateLimitResult),
      }
    )
  }

  try {
    // 1. Parser et valider les données
    const body = await request.json()
    const validatedData = resetPasswordSchema.parse(body)

    // 2. Vérifier que le token existe et n'a pas expiré
    const tokenResult = await query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.email
       FROM password_reset_tokens prt
       INNER JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1`,
      [validatedData.token]
    )

    if (tokenResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 400 }
      )
    }

    const tokenData = tokenResult.rows[0]

    // 3. Vérifier que le token n'a pas déjà été utilisé
    if (tokenData.used_at) {
      return NextResponse.json(
        { error: 'Ce lien a déjà été utilisé. Veuillez faire une nouvelle demande.' },
        { status: 400 }
      )
    }

    // 4. Vérifier que le token n'a pas expiré
    const now = new Date()
    const expiresAt = new Date(tokenData.expires_at)

    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Ce lien a expiré. Veuillez faire une nouvelle demande.' },
        { status: 400 }
      )
    }

    // 5. Hasher le nouveau mot de passe
    const newPasswordHash = await hash(validatedData.newPassword, 10)

    // 6. Mettre à jour le mot de passe de l'utilisateur
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, tokenData.user_id]
    )

    // 7. Marquer le token comme utilisé
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [tokenData.id]
    )

    log.info('Mot de passe réinitialisé', { email: tokenData.email })

    // 8. Invalider tous les autres tokens de cet utilisateur
    await query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND id != $2 AND used_at IS NULL`,
      [tokenData.user_id, tokenData.id]
    )

    // 9. Retourner succès
    return NextResponse.json(
      {
        success: true,
        message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
      },
      { status: 200 }
    )
  } catch (error) {
    log.exception('Erreur', error)

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
      { error: 'Erreur lors de la réinitialisation du mot de passe' },
      { status: 500 }
    )
  }
}
