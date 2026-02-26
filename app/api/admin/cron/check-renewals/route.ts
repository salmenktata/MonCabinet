/**
 * Cron : Vérification renouvellements abonnements payants
 * POST /api/admin/cron/check-renewals
 *
 * Horaire : 0 8 * * * (8h CET chaque matin)
 *
 * Phase 1 : Plans expirés → plan = 'expired_trial' (accès limité)
 * Phase 2 : Rappels 7 jours avant expiration
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { query } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('Cron:CheckRenewals')

export const maxDuration = 60

export const POST = withAdminApiAuth(async () => {
  const startedAt = Date.now()
  const stats = { expired: 0, reminders: 0, errors: 0 }

  // -----------------------------------------------------------
  // Phase 1 : Expirer les plans dont plan_expires_at < NOW()
  // -----------------------------------------------------------
  const expiredResult = await query(
    `UPDATE users
     SET plan = 'expired_trial'
     WHERE plan IN ('pro', 'enterprise')
       AND plan_expires_at IS NOT NULL
       AND plan_expires_at < NOW()
     RETURNING id, email, nom, prenom, plan AS old_plan`,
    []
  )

  for (const user of expiredResult.rows) {
    stats.expired++
    const userName = `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email
    const planLabel = user.old_plan === 'pro' ? 'Pro' : 'Expert'

    try {
      await sendEmail({
        to: user.email,
        subject: 'Votre abonnement Qadhya a expiré',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#1e293b;">Votre abonnement ${planLabel} a expiré</h2>
            <p style="color:#475569;line-height:1.6;">Bonjour ${userName},</p>
            <p style="color:#475569;line-height:1.6;">
              Votre abonnement <strong>${planLabel}</strong> est arrivé à échéance.
              Pour continuer à profiter de toutes les fonctionnalités, renouvelez votre abonnement.
            </p>
            <div style="margin:24px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/upgrade"
                 style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
                Renouveler mon abonnement →
              </a>
            </div>
            <p style="color:#94a3b8;font-size:13px;">
              L'équipe Qadhya
            </p>
          </div>`,
        text: `Votre abonnement ${planLabel} a expiré. Renouvelez sur ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/upgrade`,
      })
    } catch (err) {
      log.error('Erreur email expiration', { userId: user.id, error: err })
      stats.errors++
    }
  }

  // -----------------------------------------------------------
  // Phase 2 : Rappels 7 jours avant expiration
  // -----------------------------------------------------------
  const reminderResult = await query(
    `SELECT id, email, nom, prenom, plan, plan_expires_at
     FROM users
     WHERE plan IN ('pro', 'enterprise')
       AND plan_expires_at BETWEEN NOW() + INTERVAL '6 days' AND NOW() + INTERVAL '8 days'`,
    []
  )

  for (const user of reminderResult.rows) {
    const userName = `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email
    const planLabel = user.plan === 'pro' ? 'Pro' : 'Expert'
    const expiresDate = new Date(user.plan_expires_at).toLocaleDateString('fr-FR')

    try {
      await sendEmail({
        to: user.email,
        subject: `Rappel : votre abonnement Qadhya expire le ${expiresDate}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#1e293b;">Votre abonnement expire dans 7 jours</h2>
            <p style="color:#475569;line-height:1.6;">Bonjour ${userName},</p>
            <p style="color:#475569;line-height:1.6;">
              Votre abonnement <strong>${planLabel}</strong> expire le <strong>${expiresDate}</strong>.
              Pour maintenir votre accès sans interruption, contactez-nous pour renouveler.
            </p>
            <div style="margin:24px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/abonnement"
                 style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
                Gérer mon abonnement →
              </a>
            </div>
            <p style="color:#94a3b8;font-size:13px;">
              L'équipe Qadhya
            </p>
          </div>`,
        text: `Votre abonnement ${planLabel} expire le ${expiresDate}. Gérez-le sur ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/abonnement`,
      })
      stats.reminders++
    } catch (err) {
      log.error('Erreur email rappel', { userId: user.id, error: err })
      stats.errors++
    }
  }

  const durationMs = Date.now() - startedAt

  // Log dans cron_executions
  await query(
    `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
     VALUES ($1, $2, NOW() - ($3 || ' milliseconds')::interval, NOW(), $3, $4, 'cron')`,
    [
      'check-renewals',
      stats.errors > 0 && stats.expired + stats.reminders === 0 ? 'error' : 'success',
      durationMs,
      JSON.stringify(stats),
    ]
  )

  log.info('check-renewals terminé', stats)

  return NextResponse.json({
    success: true,
    ...stats,
    durationMs,
  })
})
