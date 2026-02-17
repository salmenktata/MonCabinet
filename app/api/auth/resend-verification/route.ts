/**
 * API Resend Verification - Renvoyer email de vérification
 * POST /api/auth/resend-verification
 *
 * Génère un nouveau token et renvoie l'email de vérification
 *
 * Rate limited: 3 demandes / 15 minutes par email
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import crypto from 'crypto'
import { Resend } from 'resend'
import { resendVerificationLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)
const log = createLogger('Auth:ResendVerification')

// Schéma de validation
const resendVerificationSchema = z.object({
  email: z.string().email('Email invalide'),
})

export async function POST(request: NextRequest) {
  // Rate limiting par IP et email
  const clientIP = getClientIP(request)
  const rateLimitResult = resendVerificationLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
    return NextResponse.json(
      {
        error: 'Trop de demandes. Veuillez réessayer plus tard.',
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
    const validatedData = resendVerificationSchema.parse(body)

    const email = validatedData.email.toLowerCase()

    // 2. Vérifier si l'utilisateur existe
    const userResult = await query(
      'SELECT id, email, nom, prenom, email_verified FROM users WHERE email = $1',
      [email]
    )

    if (userResult.rows.length === 0) {
      // Ne pas révéler si l'email existe ou non
      return NextResponse.json(
        {
          success: true,
          message: 'Si cet email existe, vous recevrez un email de vérification.',
        },
        { status: 200 }
      )
    }

    const user = userResult.rows[0]

    // 3. Vérifier si l'email est déjà vérifié
    if (user.email_verified) {
      return NextResponse.json(
        {
          success: true,
          message: 'Votre email est déjà vérifié.',
        },
        { status: 200 }
      )
    }

    // 4. Générer un nouveau token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // 5. Mettre à jour le token en base de données
    await query(
      `UPDATE users
       SET email_verification_token = $1,
           email_verification_expires = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [verificationToken, expiresAt, user.id]
    )

    // 6. Construire le lien de vérification
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${verificationToken}`

    // 7. Envoyer l'email
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'notifications@moncabinet.tn',
        to: [user.email],
        subject: 'Vérifiez votre adresse email - Qadhya',
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
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>✉️ Vérification de votre email</h1>
                </div>
                <div class="content">
                  <p>Bonjour ${user.prenom || ''} ${user.nom || ''},</p>

                  <p>Bienvenue sur <strong>Qadhya</strong> !</p>

                  <p>Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>

                  <div style="text-align: center;">
                    <a href="${verificationUrl}" class="button">Vérifier mon email</a>
                  </div>

                  <p>Ou copiez ce lien dans votre navigateur :</p>
                  <p style="background: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">
                    ${verificationUrl}
                  </p>

                  <p><strong>Note :</strong> Ce lien est valable pendant 24 heures.</p>

                  <p>Cordialement,<br>L'équipe Qadhya</p>
                </div>
                <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} Qadhya - Gestion Cabinet Juridique</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `
Bonjour ${user.prenom || ''} ${user.nom || ''},

Bienvenue sur Qadhya !

Vérifiez votre adresse email en cliquant sur ce lien (valable 24h) :
${verificationUrl}

Cordialement,
L'équipe Qadhya
        `,
      })

      log.info('Email renvoyé', { email })
    } catch (emailError) {
      log.exception('Erreur envoi email', emailError)
      return NextResponse.json(
        { error: 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // 8. Retourner succès
    return NextResponse.json(
      {
        success: true,
        message: 'Email de vérification renvoyé avec succès.',
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
      { error: 'Erreur lors du renvoi de l\'email de vérification' },
      { status: 500 }
    )
  }
}
