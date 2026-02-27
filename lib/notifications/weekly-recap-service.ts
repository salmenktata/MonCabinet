/**
 * Service — Récapitulatif Hebdomadaire
 * Envoi chaque lundi matin à 8h CET
 */

import { db } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'
import {
  type WeeklyRecapData,
  getWeeklyRecapHtml,
  getWeeklyRecapText,
} from '@/lib/email/templates/weekly-recap-email'
import { createLogger } from '@/lib/logger'

const log = createLogger('WeeklyRecap')

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

export interface RecapStats {
  totalUsers: number
  emailsSent: number
  emailsFailed: number
  skipped: number
  errors: string[]
  duration: number
}

// ─── Data fetching ────────────────────────────────────────────────────────────

export async function getWeeklyRecapData(userId: string): Promise<WeeklyRecapData | null> {
  const [echeancesRes, facturesRes, dossiersRes, resumeRes] = await Promise.all([
    // 1. Échéances semaine prochaine
    db.query(
      `SELECT e.titre, TO_CHAR(e.date_echeance, 'DD/MM/YYYY') as date_echeance, d.numero as dossier
       FROM echeances e
       LEFT JOIN dossiers d ON e.dossier_id = d.id
       WHERE e.user_id = $1
         AND e.statut = 'actif'
         AND e.terminee = false
         AND e.date_echeance BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       ORDER BY e.date_echeance ASC`,
      [userId]
    ),
    // 2. Factures à relancer (émises > 14 jours, non payées)
    db.query(
      `SELECT f.numero,
              f.montant_ttc::float AS montant_ttc,
              TO_CHAR(f.date_emission, 'DD/MM/YYYY') AS date_emission,
              COALESCE(
                NULLIF(TRIM(COALESCE(c.prenom, '') || ' ' || COALESCE(c.nom, '')), ''),
                c.denomination,
                'Client'
              ) AS client
       FROM factures f
       LEFT JOIN clients c ON f.client_id = c.id
       WHERE f.user_id = $1
         AND f.statut IN ('envoyee', 'brouillon')
         AND f.date_emission < CURRENT_DATE - INTERVAL '14 days'
       ORDER BY f.date_emission ASC
       LIMIT 10`,
      [userId]
    ),
    // 3. Dossiers en retard (≥1 échéance dépassée non terminée)
    db.query(
      `SELECT d.numero, d.objet, COUNT(e.id)::int AS nb_echeances_depassees
       FROM dossiers d
       JOIN echeances e ON e.dossier_id = d.id
       WHERE d.user_id = $1
         AND d.statut = 'en_cours'
         AND e.statut = 'actif'
         AND e.terminee = false
         AND e.date_echeance < CURRENT_DATE
       GROUP BY d.id, d.numero, d.objet
       HAVING COUNT(e.id) > 0
       ORDER BY nb_echeances_depassees DESC
       LIMIT 10`,
      [userId]
    ),
    // 4. Résumé semaine écoulée (7 derniers jours)
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM clients  WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS nouveaux_clients,
         (SELECT COUNT(*)::int FROM dossiers WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS dossiers_ouverts,
         (SELECT COUNT(*)::int FROM factures WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS factures_emises,
         (SELECT COUNT(*)::int FROM echeances WHERE user_id = $1 AND terminee = true AND updated_at > NOW() - INTERVAL '7 days') AS echeances_terminees`,
      [userId]
    ),
  ])

  const resume = resumeRes.rows[0] ?? { nouveaux_clients: 0, dossiers_ouverts: 0, factures_emises: 0, echeances_terminees: 0 }
  const hasContent = (
    echeancesRes.rows.length > 0 ||
    facturesRes.rows.length > 0 ||
    dossiersRes.rows.length > 0 ||
    resume.nouveaux_clients > 0 ||
    resume.dossiers_ouverts > 0 ||
    resume.factures_emises > 0 ||
    resume.echeances_terminees > 0
  )

  if (!hasContent) return null

  // Calculer dates semaine
  const now = new Date()
  const lundi = new Date(now)
  lundi.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // lundi précédent
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)

  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return {
    avocatNom: '',    // rempli par l'appelant
    avocatPrenom: '', // rempli par l'appelant
    langue: 'fr',     // rempli par l'appelant
    baseUrl: APP_URL,
    dateDebut: fmt(lundi),
    dateFin: fmt(dimanche),
    echeancesSemaine: echeancesRes.rows as WeeklyRecapData['echeancesSemaine'],
    facturesARelancer: facturesRes.rows as WeeklyRecapData['facturesARelancer'],
    dossiersEnRetard: dossiersRes.rows as WeeklyRecapData['dossiersEnRetard'],
    resumeSemaine: {
      nouveauxClients: resume.nouveaux_clients,
      dossiersOuverts: resume.dossiers_ouverts,
      factures_emises: resume.factures_emises,
      echeancesTerminees: resume.echeances_terminees,
    },
  }
}

// ─── Send all ─────────────────────────────────────────────────────────────────

export async function sendWeeklyRecapNotifications(): Promise<RecapStats> {
  const startedAt = Date.now()
  const stats: RecapStats = {
    totalUsers: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  }

  // Fetch users with recap enabled (réutilise daily_digest_enabled comme gate)
  const usersRes = await db.query(
    `SELECT u.id, u.email,
            COALESCE(u.nom, '') AS nom,
            COALESCE(u.prenom, '') AS prenom,
            COALESCE(np.langue_email, 'fr') AS langue_email,
            COALESCE(np.email_format, 'html') AS email_format
     FROM users u
     JOIN notification_preferences np ON np.user_id = u.id
     WHERE np.enabled = true
       AND np.daily_digest_enabled = true
       AND u.email IS NOT NULL
       AND u.email != ''
     ORDER BY u.created_at ASC`,
    []
  )

  stats.totalUsers = usersRes.rows.length
  log.info(`Envoi recap hebdo à ${stats.totalUsers} utilisateurs`)

  for (const user of usersRes.rows) {
    try {
      const rawData = await getWeeklyRecapData(user.id)
      if (!rawData) {
        stats.skipped++
        continue
      }

      const data: WeeklyRecapData = {
        ...rawData,
        avocatNom: user.nom || user.email,
        avocatPrenom: user.prenom || undefined,
        langue: (user.langue_email === 'ar' ? 'ar' : 'fr') as 'fr' | 'ar',
      }

      const isAr = data.langue === 'ar'
      const subject = isAr
        ? `ملخص أسبوعك على Qadhya — ${data.dateDebut}`
        : `Votre récapitulatif hebdomadaire Qadhya — ${data.dateDebut}`

      const html = getWeeklyRecapHtml(data)
      const text = getWeeklyRecapText(data)

      const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
        tags: ['weekly-recap', 'notifications'],
      })

      if (result.success) {
        stats.emailsSent++
        log.info(`Recap envoyé`, { userId: user.id })
      } else {
        stats.emailsFailed++
        const errMsg = `userId=${user.id}: ${result.error ?? 'unknown'}`
        stats.errors.push(errMsg)
        log.warn(`Recap échoué`, { userId: user.id, error: result.error })
      }
    } catch (err) {
      stats.emailsFailed++
      const errMsg = `userId=${user.id}: ${err instanceof Error ? err.message : String(err)}`
      stats.errors.push(errMsg)
      log.error('Erreur recap user', { userId: user.id, err })
    }

    // Anti rate-limit
    await new Promise(r => setTimeout(r, 100))
  }

  stats.duration = Date.now() - startedAt
  return stats
}
