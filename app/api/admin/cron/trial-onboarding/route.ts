/**
 * Cron : Séquence onboarding email pour les utilisateurs en trial
 * POST /api/admin/cron/trial-onboarding
 *
 * Horaire : 9h CET chaque matin (après expire-trials à 2h)
 *
 * Étapes envoyées selon le jour du trial :
 *   J0  : bienvenue + guide 3 étapes (déclenché à l'approbation, pas ici)
 *   J3  : nudge IA si 0 utilisation
 *   J7  : mi-parcours, récap utilisations
 *   J12 : 2 jours avant expiration, offre lancement
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'
import {
  getJ3NudgeEmailHtml, getJ3NudgeEmailText,
  getJ7MidwayEmailHtml, getJ7MidwayEmailText,
  getJ12ExpiryWarningEmailHtml, getJ12ExpiryWarningEmailText,
} from '@/lib/email/templates/trial-onboarding-emails'
import { createLogger } from '@/lib/logger'

const log = createLogger('Cron:TrialOnboarding')

export const maxDuration = 120

export const POST = withAdminApiAuth(async () => {
  const startedAt = Date.now()

  // Récupérer tous les utilisateurs en trial actif
  const trialsResult = await db.query(
    `SELECT
       id, email, nom, prenom, plan,
       trial_started_at, trial_ai_uses_remaining,
       referral_code,
       COALESCE(trial_emails_sent, '[]'::jsonb) AS trial_emails_sent
     FROM users
     WHERE plan = 'trial'
       AND trial_started_at IS NOT NULL
     ORDER BY trial_started_at ASC`,
    []
  )

  const stats = { j3: 0, j7: 0, j12: 0, skipped: 0, errors: 0 }

  for (const user of trialsResult.rows) {
    try {
      const daysSinceStart = Math.floor(
        (Date.now() - new Date(user.trial_started_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      const emailsSent: string[] = Array.isArray(user.trial_emails_sent) ? user.trial_emails_sent : []
      const userName = `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email
      const usesRemaining = user.trial_ai_uses_remaining ?? 30
      const usesUsed = 30 - usesRemaining

      let step: string | null = null
      let subject = ''
      let html = ''
      let text = ''

      // Déterminer l'email à envoyer selon le jour
      if (daysSinceStart >= 3 && daysSinceStart < 4 && !emailsSent.includes('j3_nudge')) {
        // J3 seulement si l'utilisateur n'a pas encore utilisé l'IA
        if (usesUsed === 0) {
          step = 'j3_nudge'
          subject = 'Avez-vous testé le Chat IA ? — Qadhya'
          html = getJ3NudgeEmailHtml(userName, usesRemaining)
          text = getJ3NudgeEmailText(userName, usesRemaining)
        } else {
          // A utilisé l'IA → skiper l'email nudge, marquer quand même pour ne plus retenter
          step = 'j3_nudge'
          stats.skipped++
          await db.query(
            `UPDATE users SET trial_emails_sent = COALESCE(trial_emails_sent, '[]'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify([step]), user.id]
          )
          continue
        }
      } else if (daysSinceStart >= 7 && daysSinceStart < 8 && !emailsSent.includes('j7_midway')) {
        step = 'j7_midway'
        subject = 'Mi-parcours de votre essai Qadhya 📊'
        html = getJ7MidwayEmailHtml(userName, usesRemaining, usesUsed)
        text = getJ7MidwayEmailText(userName, usesRemaining)
      } else if (daysSinceStart >= 12 && daysSinceStart < 13 && !emailsSent.includes('j12_expiry_warning')) {
        step = 'j12_expiry_warning'
        subject = '⏰ Votre essai Qadhya expire dans 2 jours'
        html = getJ12ExpiryWarningEmailHtml(userName, usesRemaining)
        text = getJ12ExpiryWarningEmailText(userName, usesRemaining)
      }

      if (!step) {
        stats.skipped++
        continue
      }

      // Envoyer l'email
      const result = await sendEmail({ to: user.email, subject, html, text })

      if (result.success) {
        // Marquer l'étape comme envoyée
        await db.query(
          `UPDATE users
           SET trial_emails_sent = COALESCE(trial_emails_sent, '[]'::jsonb) || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify([step]), user.id]
        )
        if (step === 'j3_nudge') stats.j3++
        else if (step === 'j7_midway') stats.j7++
        else if (step === 'j12_expiry_warning') stats.j12++
        log.info(`Email ${step} envoyé`, { userId: user.id, email: user.email })
      } else {
        stats.errors++
        log.warn(`Email ${step} échoué`, { userId: user.id, error: result.error })
      }
    } catch (err) {
      stats.errors++
      log.error('Erreur onboarding user', { userId: user.id, err })
    }
  }

  const duration = Date.now() - startedAt
  const output = `Onboarding: j3=${stats.j3}, j7=${stats.j7}, j12=${stats.j12}, skipped=${stats.skipped}, errors=${stats.errors} (${duration}ms)`
  log.info(output)

  // Logger dans cron_executions
  db.query(
    `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
     VALUES ('trial-onboarding', 'success', NOW() - ($1 || ' milliseconds')::interval, NOW(), $1, $2, 'cron')`,
    [duration, output]
  ).catch(() => null)

  return NextResponse.json({ success: true, stats, duration })
})
