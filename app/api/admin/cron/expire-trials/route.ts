/**
 * POST /api/admin/cron/expire-trials
 *
 * Expire automatiquement les trials de 14 jours dépassés.
 * Passe plan='trial' → plan='expired_trial' pour les comptes dont
 * trial_started_at + 14j < NOW().
 *
 * Planifier : 0 2 * * * (tous les jours à 2h CET)
 * Protégé par CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { sendEmail } from '@/lib/email/email-service'

export const POST = withAdminApiAuth(async () => {
  const startedAt = Date.now()

  // 1. Trouver les trials expirés (trial_started_at + 14j < maintenant)
  const expiredResult = await db.query(`
    SELECT id, email, nom, prenom, trial_ai_uses_remaining
    FROM users
    WHERE plan = 'trial'
      AND trial_started_at + INTERVAL '14 days' < NOW()
    ORDER BY trial_started_at ASC
  `)

  const expired = expiredResult.rows
  let expiredCount = 0
  let emailsSent = 0

  if (expired.length > 0) {
    // 2. Mettre à jour en batch
    const ids = expired.map((u: { id: string }) => u.id)
    await db.query(
      `UPDATE users
       SET plan = 'expired_trial', plan_expires_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    )
    expiredCount = expired.length

    // 3. Envoyer un email de notification à chaque utilisateur expiré
    for (const user of expired) {
      try {
        const userName = user.prenom && user.nom ? `${user.prenom} ${user.nom}` : user.email
        const usesUsed = 30 - (user.trial_ai_uses_remaining || 0)

        await sendEmail({
          to: user.email,
          subject: 'Votre essai Qadhya a expiré — Continuez avec Solo',
          html: getExpiryEmailHtml(userName, usesUsed),
          text: `Bonjour ${userName},\n\nVotre essai gratuit de 14 jours sur Qadhya est terminé. Vous avez utilisé ${usesUsed} requêtes IA pendant votre essai.\n\nPassez au plan Solo (89 DT/mois) pour continuer à utiliser Qadhya sans interruption.\n\nContactez-nous : contact@qadhya.tn`,
        })
        emailsSent++
      } catch (err) {
        console.error(`[expire-trials] Email échec pour ${user.email}:`, err)
      }
    }
  }

  // 4. Logger dans cron_executions
  const duration = Date.now() - startedAt
  await db.query(
    `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
     VALUES ('expire-trials', 'success', NOW() - $1::interval, NOW(), $2, $3, 'cron')`,
    [`${duration} milliseconds`, duration, JSON.stringify({ expiredCount, emailsSent })]
  ).catch(() => null) // Silencieux si table inexistante

  return NextResponse.json({
    success: true,
    expiredCount,
    emailsSent,
    durationMs: duration,
  })
})

function getExpiryEmailHtml(userName: string, usesUsed: number): string {
  const safeUserName = userName.replace(/[<>&"']/g, '')
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <h2 style="color: #1e293b; margin-top: 0;">Bonjour ${safeUserName},</h2>

    <p style="color: #475569;">
      Votre essai gratuit de 14 jours sur <strong>Qadhya</strong> est maintenant terminé.
      ${usesUsed > 0 ? `Vous avez utilisé <strong>${usesUsed} requêtes IA</strong> pendant votre essai.` : ''}
    </p>

    <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="color: #1e293b; margin-top: 0; font-size: 16px;">Plan Solo — 89 DT/mois</h3>
      <ul style="color: #475569; padding-left: 20px; margin: 8px 0;">
        <li>Dossiers et clients illimités</li>
        <li>200 requêtes IA par mois</li>
        <li>Accès complet à Qadhya IA juridique</li>
        <li>Templates et facturation</li>
        <li>Support Email + Chat</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="https://qadhya.tn/upgrade"
         style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Activer mon plan Solo
      </a>
    </div>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-bottom: 0;">
      Questions ? Contactez-nous à <a href="mailto:contact@qadhya.tn" style="color: #2563eb;">contact@qadhya.tn</a>
    </p>
  </div>
</body>
</html>
  `.trim()
}
