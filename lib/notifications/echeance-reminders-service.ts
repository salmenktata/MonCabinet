/**
 * Service — Rappels Automatiques d'Échéances
 * Envoyé chaque matin (6h CET) pour les échéances J-15, J-7, J-3, J-1
 *
 * Logique :
 *  1. Récupère toutes les échéances dont la date correspond à aujourd'hui + N jours
 *     ET rappel_jN = true sur l'échéance
 *     ET alerte_jN_enabled = true dans les préférences utilisateur
 *  2. Groupe par utilisateur (1 seul email agrégé par user/jour)
 *  3. Vérifie dans notification_logs qu'on n'a pas déjà envoyé aujourd'hui
 *  4. Envoie et logue
 */

import { db } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'
import {
  type EcheanceReminderData,
  type EcheanceReminderItem,
  getEcheanceReminderHtml,
  getEcheanceReminderText,
  getEcheanceReminderSubject,
} from '@/lib/email/templates/echeance-reminder-email'
import { createLogger } from '@/lib/logger'

const log = createLogger('EcheanceReminders')

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReminderRow {
  user_id: string
  email: string
  nom: string
  prenom: string | null
  langue: string
  email_format: string
  echeance_id: string
  titre: string
  date_echeance: string
  jours_restants: number
  type_echeance: string
  dossier_id: string
  dossier_numero: string
  dossier_objet: string | null
}

export interface ReminderStats {
  totalUsers: number
  emailsSent: number
  emailsFailed: number
  skipped: number
  echeancesFound: number
  errors: string[]
  duration: number
}

// ─── Query ────────────────────────────────────────────────────────────────────

async function getPendingReminders(): Promise<ReminderRow[]> {
  const res = await db.query(
    `SELECT
       u.id             AS user_id,
       u.email,
       COALESCE(u.nom, u.email)         AS nom,
       u.prenom,
       COALESCE(np.langue_email, 'fr')  AS langue,
       COALESCE(np.email_format, 'html') AS email_format,
       e.id             AS echeance_id,
       e.titre,
       TO_CHAR(e.date_echeance, 'DD/MM/YYYY') AS date_echeance,
       (e.date_echeance::date - CURRENT_DATE)::int AS jours_restants,
       e.type_echeance,
       d.id             AS dossier_id,
       d.numero         AS dossier_numero,
       d.objet          AS dossier_objet
     FROM echeances e
     JOIN dossiers d ON e.dossier_id = d.id
     JOIN users u    ON d.user_id = u.id
     LEFT JOIN notification_preferences np ON u.id = np.user_id
     WHERE e.statut = 'actif'
       AND e.terminee = false
       AND u.email IS NOT NULL
       AND u.email != ''
       AND COALESCE(np.enabled, true) = true
       AND (
         (e.date_echeance = CURRENT_DATE + INTERVAL '15 days'
           AND e.rappel_j15 = true
           AND COALESCE(np.alerte_j15_enabled, false) = true)
         OR
         (e.date_echeance = CURRENT_DATE + INTERVAL '7 days'
           AND e.rappel_j7 = true
           AND COALESCE(np.alerte_j7_enabled, true) = true)
         OR
         (e.date_echeance = CURRENT_DATE + INTERVAL '3 days'
           AND e.rappel_j3 = true
           AND COALESCE(np.alerte_j3_enabled, true) = true)
         OR
         (e.date_echeance = CURRENT_DATE + INTERVAL '1 day'
           AND e.rappel_j1 = true
           AND COALESCE(np.alerte_j1_enabled, true) = true)
       )
     ORDER BY u.id, e.date_echeance ASC`,
    []
  )
  return res.rows as ReminderRow[]
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

async function alreadySentToday(userId: string): Promise<boolean> {
  const res = await db.query(
    `SELECT id FROM notification_logs
     WHERE user_id = $1
       AND type = 'echeance_reminder'
       AND status = 'success'
       AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [userId]
  )
  return res.rows.length > 0
}

// ─── Log ─────────────────────────────────────────────────────────────────────

async function logNotification(
  userId: string,
  status: 'success' | 'error' | 'skipped',
  emailId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO notification_logs (user_id, type, status, email_id, error_message)
       VALUES ($1, 'echeance_reminder', $2, $3, $4)`,
      [userId, status, emailId ?? null, errorMessage ?? null]
    )
  } catch {
    // Non-fatal
  }
}

// ─── Main service ─────────────────────────────────────────────────────────────

export async function sendEcheanceReminders(): Promise<ReminderStats> {
  const startedAt = Date.now()
  const stats: ReminderStats = {
    totalUsers: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skipped: 0,
    echeancesFound: 0,
    errors: [],
    duration: 0,
  }

  // 1. Récupérer toutes les échéances du jour à rappeler
  const rows = await getPendingReminders()
  stats.echeancesFound = rows.length

  if (rows.length === 0) {
    log.info('Aucune échéance à rappeler aujourd\'hui')
    stats.duration = Date.now() - startedAt
    return stats
  }

  // 2. Grouper par utilisateur
  const byUser = new Map<string, { meta: Pick<ReminderRow, 'user_id' | 'email' | 'nom' | 'prenom' | 'langue' | 'email_format'>; items: EcheanceReminderItem[] }>()

  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        meta: {
          user_id: row.user_id,
          email: row.email,
          nom: row.nom,
          prenom: row.prenom,
          langue: row.langue,
          email_format: row.email_format,
        },
        items: [],
      })
    }
    byUser.get(row.user_id)!.items.push({
      titre: row.titre,
      date_echeance: row.date_echeance,
      jours_restants: row.jours_restants,
      type_echeance: row.type_echeance as EcheanceReminderItem['type_echeance'],
      dossier_numero: row.dossier_numero,
      dossier_objet: row.dossier_objet ?? undefined,
      dossier_id: row.dossier_id,
    })
  }

  stats.totalUsers = byUser.size
  log.info(`Rappels à envoyer : ${rows.length} échéances pour ${stats.totalUsers} utilisateurs`)

  // 3. Envoyer 1 email par utilisateur
  for (const [userId, { meta, items }] of byUser) {
    try {
      // Dédup : déjà envoyé aujourd'hui ?
      if (await alreadySentToday(userId)) {
        stats.skipped++
        log.info(`Skipped (déjà envoyé aujourd'hui)`, { userId })
        continue
      }

      const data: EcheanceReminderData = {
        avocatNom: meta.nom,
        avocatPrenom: meta.prenom ?? undefined,
        langue: (meta.langue === 'ar' ? 'ar' : 'fr') as 'fr' | 'ar',
        echeances: items,
      }

      const subject = getEcheanceReminderSubject(data)
      const html = getEcheanceReminderHtml(data)
      const text = getEcheanceReminderText(data)

      const result = await sendEmail({
        to: meta.email,
        subject,
        html,
        text,
        tags: ['echeance-reminder', 'notifications'],
      })

      if (result.success) {
        stats.emailsSent++
        await logNotification(userId, 'success', result.messageId)
        log.info(`Rappel envoyé (${items.length} échéances)`, { userId })
      } else {
        stats.emailsFailed++
        const errMsg = `userId=${userId}: ${result.error ?? 'unknown'}`
        stats.errors.push(errMsg)
        await logNotification(userId, 'error', undefined, result.error ?? 'unknown')
        log.warn(`Rappel échoué`, { userId, error: result.error })
      }
    } catch (err) {
      stats.emailsFailed++
      const errMsg = `userId=${userId}: ${err instanceof Error ? err.message : String(err)}`
      stats.errors.push(errMsg)
      await logNotification(userId, 'error', undefined, errMsg)
      log.error('Erreur rappel user', { userId, err })
    }

    // Anti rate-limit Brevo
    await new Promise(r => setTimeout(r, 100))
  }

  stats.duration = Date.now() - startedAt
  return stats
}
