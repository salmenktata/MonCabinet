/**
 * API Registration - Création nouveau compte utilisateur
 * POST /api/auth/register
 *
 * Rate limited: 3 inscriptions / heure par IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { hash } from 'bcryptjs'
import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import crypto from 'crypto'
import { registerLimiter, getClientIP, getRateLimitHeaders } from '@/lib/rate-limiter'
import { createLogger } from '@/lib/logger'
import { sendVerificationEmail } from '@/lib/email/templates/verification-email'
import { seedUserData } from '@/lib/db/seed-user-data'

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
  // Phase 2 : token d'invitation beta (bypass approbation manuelle)
  invitationToken: z.string().optional(),
  // Phase 3 : code de parrainage (1 mois offert au parrain après souscription)
  referralCode: z.string().max(20).optional(),
})
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimitResult = registerLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    log.warn('Rate limit atteint', { ip: clientIP, retryAfter: rateLimitResult.retryAfter })
    return NextResponse.json(
      {
        error: 'Trop de tentatives d\'inscription. Veuillez réessayer plus tard.',
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

    // 2b. Phase 2 : Valider le token d'invitation (si fourni)
    let waitlistEntry: { id: string; email: string } | null = null
    if (validatedData.invitationToken) {
      const inviteResult = await query(
        `SELECT id, email FROM waitlist
         WHERE invitation_token = $1 AND status = 'invited'`,
        [validatedData.invitationToken]
      )
      if (inviteResult.rows.length > 0) {
        waitlistEntry = inviteResult.rows[0] as { id: string; email: string }
        // Vérifier que l'email correspond au token
        if (waitlistEntry.email !== validatedData.email.toLowerCase()) {
          return NextResponse.json(
            { error: 'Ce lien d\'invitation ne correspond pas à cet email.' },
            { status: 400 }
          )
        }
      }
      // Token invalide → ignorer silencieusement (pas de blocage)
    }

    // 2c. Phase 3 : Valider le code de parrainage (si fourni)
    let referrerUserId: string | null = null
    if (validatedData.referralCode) {
      const referrerResult = await query(
        `SELECT id FROM users WHERE referral_code = $1 AND status = 'approved'`,
        [validatedData.referralCode.toUpperCase()]
      )
      if (referrerResult.rows.length > 0) {
        referrerUserId = referrerResult.rows[0].id
      }
    }

    // 3. Hasher le mot de passe
    const passwordHash = await hash(validatedData.password, 10)

    // 4. Générer token de vérification email
    const emailVerificationToken = crypto.randomBytes(32).toString('hex')
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // 5. Déterminer le statut initial
    // Si invitation valide → approuvé directement + trial démarré
    // Sinon → pending (approbation manuelle)
    const isInvited = !!waitlistEntry
    const trialExpiresAt = isInvited ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null

    // Générer un code de parrainage unique pour ce nouvel utilisateur
    const newReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase() // 8 chars hex

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
        plan_expires_at,
        trial_started_at,
        trial_ai_uses_remaining,
        invitation_token,
        invited_from_waitlist_id,
        invited_user,
        referred_by_code,
        referred_by_user_id,
        referral_code,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
      RETURNING id, email, nom, prenom, status`,
      [
        validatedData.email.toLowerCase(),
        passwordHash,
        validatedData.nom,
        validatedData.prenom,
        emailVerificationToken,
        emailVerificationExpires,
        isInvited ? 'approved' : 'pending',
        isInvited,
        'user',
        isInvited ? 'trial' : 'free',
        trialExpiresAt,
        isInvited ? new Date() : null,
        isInvited ? 30 : null,
        validatedData.invitationToken || null,
        waitlistEntry?.id || null,
        isInvited,
        validatedData.referralCode?.toUpperCase() || null,
        referrerUserId,
        newReferralCode,
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

    log.info('Nouvel utilisateur créé', { email: user.email, id: user.id, isInvited, hasReferral: !!referrerUserId })

    // 6b. Insérer données démo pour onboarding (non-bloquant)
    seedUserData(user.id).catch((err) =>
      log.warn('Seed données démo échoué (non-bloquant)', { userId: user.id, err })
    )

    // 6c. Phase 2 : Marquer la waitlist comme convertie (non-bloquant)
    if (waitlistEntry) {
      query(
        `UPDATE waitlist SET status = 'converted', converted_at = NOW(), converted_user_id = $1
         WHERE id = $2`,
        [user.id, waitlistEntry.id]
      ).catch(() => null)
    }

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

    // 8. Retourner succès
    return NextResponse.json(
      {
        success: true,
        requiresApproval: !isInvited,
        isInvited,
        emailSent: emailResult.success,
        message: isInvited
          ? 'Compte créé et activé. Votre essai de 14 jours commence maintenant !'
          : 'Compte créé avec succès. Votre demande est en attente d\'approbation.',
        user: {
          id: user.id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          status: user.status,
        },
      },
      { status: 201 }
    )
  } catch (error) {
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
    const pgCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : null
    if (pgCode === '23505') {
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
