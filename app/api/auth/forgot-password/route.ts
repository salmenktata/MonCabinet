/**
 * API Forgot Password - Demande de réinitialisation de mot de passe
 * POST /api/auth/forgot-password
 *
 * Génère un token unique et envoie un email avec le lien de reset
 *
 * Rate limited: 3 demandes / heure par IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import crypto from 'crypto'
import { Resend } from 'resend'
import { passwordResetLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)
const log = createLogger('Auth:ForgotPassword')

// Schéma de validation
const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
})

export async function POST(request: NextRequest) {
  // Rate limiting par IP
  const clientIP = getClientIP(request)
  const rateLimitResult = passwordResetLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
    return NextResponse.json(
      {
        error: 'Trop de demandes de réinitialisation. Veuillez réessayer plus tard.',
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
    const validatedData = forgotPasswordSchema.parse(body)

    const email = validatedData.email.toLowerCase()

    // 2. Vérifier si l'utilisateur existe
    const userResult = await query(
      'SELECT id, email, nom, prenom FROM users WHERE email = $1',
      [email]
    )

    // IMPORTANT: Ne pas révéler si l'email existe ou non (sécurité)
    if (userResult.rows.length === 0) {
      log.info('Email non trouvé', { email })
      // Retourner succès même si l'email n'existe pas
      return NextResponse.json(
        {
          success: true,
          message: 'Si cet email existe, vous recevrez un lien de réinitialisation.',
        },
        { status: 200 }
      )
    }

    const user = userResult.rows[0]

    // 3. Générer un token unique et sécurisé
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 heure

    // 4. Stocker le token en base de données
    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, resetToken, expiresAt]
    )

    // 5. Construire le lien de réinitialisation
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`

    // 6. Envoyer l'email
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'notifications@moncabinet.tn',
        to: [user.email],
        subject: 'Réinitialisation de votre mot de passe - Qadhya',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; background: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
                .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🔐 Réinitialisation de mot de passe</h1>
                </div>
                <div class="content">
                  <p>Bonjour ${user.prenom || ''} ${user.nom || ''},</p>

                  <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>Qadhya</strong>.</p>

                  <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>

                  <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
                  </div>

                  <p>Ou copiez ce lien dans votre navigateur :</p>
                  <p style="background: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">
                    ${resetUrl}
                  </p>

                  <div class="warning">
                    <strong>⚠️ Important :</strong>
                    <ul>
                      <li>Ce lien est valable pendant <strong>1 heure</strong></li>
                      <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                      <li>Ne partagez jamais ce lien avec qui que ce soit</li>
                    </ul>
                  </div>

                  <p>Cordialement,<br>L'équipe Qadhya</p>
                </div>
                <div class="footer">
                  <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                  <p>&copy; ${new Date().getFullYear()} Qadhya - Gestion Cabinet Juridique</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `
Bonjour ${user.prenom || ''} ${user.nom || ''},

Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Qadhya.

Utilisez ce lien pour créer un nouveau mot de passe (valable 1 heure) :
${resetUrl}

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

Cordialement,
L'équipe Qadhya
        `,
      })

      log.info('Email envoyé', { email })
    } catch (emailError) {
      log.exception('Erreur envoi email', emailError)
      return NextResponse.json(
        { error: 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // 7. Retourner succès (toujours le même message pour la sécurité)
    return NextResponse.json(
      {
        success: true,
        message: 'Si cet email existe, vous recevrez un lien de réinitialisation.',
      },
      { status: 200 }
    )
  } catch (error) {
    log.exception('Erreur', error)

    // Erreur de validation Zod
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Email invalide',
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
      { error: 'Erreur lors de la demande de réinitialisation' },
      { status: 500 }
    )
  }
}
