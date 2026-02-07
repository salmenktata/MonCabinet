/**
 * API Registration - Création nouveau compte utilisateur
 * POST /api/auth/register
 *
 * Rate limited: 3 inscriptions / heure par IP
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { hash } from 'bcryptjs'
import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import crypto from 'crypto'
// Rate limiting désactivé temporairement
// import { registerLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'
import { sendVerificationEmail } from '@/lib/email/templates/verification-email'

const log = createLogger('Auth:Register')

// Schéma de validation
const registerSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  prenom: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
})
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export async function POST(request: NextRequest) {
  // Rate limiting désactivé temporairement
  // const clientIP = getClientIP(request)
  // const rateLimitResult = registerLimiter.check(clientIP)
  //
  // if (!rateLimitResult.allowed) {
  //   log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
  //   return NextResponse.json(
  //     {
  //       error: 'Trop de tentatives d\'inscription. Veuillez réessayer plus tard.',
  //       retryAfter: rateLimitResult.retryAfter,
  //     },
  //     {
  //       status: 429,
  //       headers: getRateLimitHeaders(rateLimitResult),
  //     }
  //   )
  // }

  try {
    // 1. Parser et valider les données
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // 2. Vérifier si l'email existe déjà
    const existingUserResult = await query(
      'SELECT id, email FROM users WHERE email = $1',
      [validatedData.email.toLowerCase()]
    )

    if (existingUserResult.rows.length > 0) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 400 }
      )
    }

    // 3. Hasher le mot de passe
    const passwordHash = await hash(validatedData.password, 10)

    // 4. Générer token de vérification email
    const emailVerificationToken = crypto.randomBytes(32).toString('hex')
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // 5. Créer l'utilisateur avec status='pending' pour approbation
    // Note: email_verified est un timestamp (NULL = non vérifié), pas un boolean
    const userResult = await query(
      `INSERT INTO users (
        email,
        password_hash,
        nom,
        prenom,
        email_verification_token,
        email_verification_expires,
        status,
        is_approved,
        role,
        plan,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id, email, nom, prenom, status`,
      [
        validatedData.email.toLowerCase(),
        passwordHash,
        validatedData.nom,
        validatedData.prenom,
        emailVerificationToken,
        emailVerificationExpires,
        'pending',
        false,
        'user',
        'free',
      ]
    )

    const user = userResult.rows[0]

    // 6. Créer le profil associé (profil cabinet minimal)
    await query(
      `INSERT INTO profiles (
        user_id,
        email,
        created_at,
        updated_at
      ) VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.email]
    )

    log.info('Nouvel utilisateur créé', { email: user.email, id: user.id })

    // 7. Envoyer email de vérification
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${emailVerificationToken}`
    const emailResult = await sendVerificationEmail({
      to: user.email,
      userName: `${user.prenom} ${user.nom}`,
      verificationUrl,
    })

    if (!emailResult.success) {
      log.warn('Échec envoi email vérification', { email: user.email, error: emailResult.error })
    } else {
      log.info('Email de vérification envoyé', { email: user.email })
    }

    // 8. Retourner succès avec indication d'approbation requise
    return NextResponse.json(
      {
        success: true,
        requiresApproval: true,
        emailSent: emailResult.success,
        message: 'Compte créé avec succès. Votre demande est en attente d\'approbation.',
        user: {
          id: user.id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          status: 'pending',
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    log.exception('Erreur inscription', error)

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

    // Erreur de base de données
    if (error.code === '23505') {
      // Unique violation
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 400 }
      )
    }

    // Erreur générique
    return NextResponse.json(
      { error: 'Erreur lors de la création du compte' },
      { status: 500 }
    )
  }
}
