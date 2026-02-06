/**
 * Service de notifications quotidiennes (Daily Digest)
 * Récupère les données de chaque utilisateur et envoie l'email récapitulatif via Brevo
 */

import { db } from '@/lib/db/postgres'
import { sendEmail, isBrevoConfigured } from '@/lib/email/brevo-client'
import { render } from '@react-email/render'
import {
  DailyDigestEmailTemplate,
  DailyDigestEmailText,
} from '@/lib/email/templates/daily-digest'

// =============================================================================
// TYPES
// =============================================================================

interface UserNotificationSettings {
  user_id: string
  email: string
  nom: string
  prenom: string | null
  daily_digest_enabled: boolean
  alerte_j15_enabled: boolean
  alerte_j7_enabled: boolean
  alerte_j3_enabled: boolean
  alerte_j1_enabled: boolean
  alerte_actions_urgentes: boolean
  alerte_actions_priorite_haute: boolean
  alerte_audiences_semaine: boolean
  alerte_audiences_veille: boolean
  alerte_factures_impayees: boolean
  alerte_factures_impayees_delai_jours: number
  email_format: 'html' | 'text'
  langue_email: 'fr' | 'ar'
}

interface Echeance {
  id: string
  date: string
  type: string
  dossier_numero: string
  dossier_objet: string
  jours_restants: number
}

interface ActionUrgente {
  id: string
  titre: string
  priorite: string
  dossier_numero: string
  date_limite: string
}

interface Audience {
  id: string
  date: string
  heure: string
  tribunal: string
  dossier_numero: string
  dossier_objet: string
}

interface FactureImpayee {
  id: string
  numero: string
  client_nom: string
  montant_ttc: string
  jours_retard: number
}

interface SendResult {
  userId: string
  email: string
  success: boolean
  error?: string
}

interface DigestStats {
  totalUsers: number
  emailsSent: number
  emailsFailed: number
  errors: string[]
  duration: number
}

// =============================================================================
// RÉCUPÉRATION DES DONNÉES
// =============================================================================

/**
 * Récupère tous les utilisateurs avec notifications quotidiennes activées
 */
async function getUsersWithDailyDigest(): Promise<UserNotificationSettings[]> {
  const result = await db.query(`
    SELECT
      u.id as user_id,
      u.email,
      u.nom,
      u.prenom,
      COALESCE(np.daily_digest_enabled, true) as daily_digest_enabled,
      COALESCE(np.alerte_j15_enabled, true) as alerte_j15_enabled,
      COALESCE(np.alerte_j7_enabled, true) as alerte_j7_enabled,
      COALESCE(np.alerte_j3_enabled, true) as alerte_j3_enabled,
      COALESCE(np.alerte_j1_enabled, true) as alerte_j1_enabled,
      COALESCE(np.alerte_actions_urgentes, true) as alerte_actions_urgentes,
      COALESCE(np.alerte_actions_priorite_haute, true) as alerte_actions_priorite_haute,
      COALESCE(np.alerte_audiences_semaine, true) as alerte_audiences_semaine,
      COALESCE(np.alerte_audiences_veille, true) as alerte_audiences_veille,
      COALESCE(np.alerte_factures_impayees, true) as alerte_factures_impayees,
      COALESCE(np.alerte_factures_impayees_delai_jours, 30) as alerte_factures_impayees_delai_jours,
      COALESCE(np.email_format, 'html') as email_format,
      COALESCE(np.langue_email, 'fr') as langue_email
    FROM users u
    LEFT JOIN notification_preferences np ON u.id = np.user_id
    WHERE u.email IS NOT NULL
      AND u.status = 'approved'
      AND COALESCE(np.daily_digest_enabled, true) = true
      AND COALESCE(np.enabled, true) = true
  `)

  return result.rows as UserNotificationSettings[]
}

/**
 * Récupère les échéances pour un utilisateur selon ses préférences
 */
async function getEcheancesForUser(
  userId: string,
  prefs: UserNotificationSettings
): Promise<Echeance[]> {
  // Construire les jours à inclure selon les préférences
  const joursFilter: number[] = []
  if (prefs.alerte_j1_enabled) joursFilter.push(1)
  if (prefs.alerte_j3_enabled) joursFilter.push(2, 3)
  if (prefs.alerte_j7_enabled) joursFilter.push(4, 5, 6, 7)
  if (prefs.alerte_j15_enabled) joursFilter.push(8, 9, 10, 11, 12, 13, 14, 15)

  if (joursFilter.length === 0) return []

  const result = await db.query(
    `
    SELECT
      d.id,
      TO_CHAR(e.date_echeance, 'DD/MM/YYYY') as date,
      e.type,
      d.numero as dossier_numero,
      d.objet as dossier_objet,
      (e.date_echeance::date - CURRENT_DATE) as jours_restants
    FROM echeances e
    JOIN dossiers d ON e.dossier_id = d.id
    WHERE d.user_id = $1
      AND e.date_echeance >= CURRENT_DATE
      AND e.date_echeance <= CURRENT_DATE + INTERVAL '15 days'
      AND e.statut != 'termine'
      AND (e.date_echeance::date - CURRENT_DATE) = ANY($2::int[])
    ORDER BY e.date_echeance ASC
    LIMIT 10
  `,
    [userId, joursFilter]
  )

  return result.rows as Echeance[]
}

/**
 * Récupère les actions urgentes pour un utilisateur
 */
async function getActionsUrgentesForUser(
  userId: string,
  prefs: UserNotificationSettings
): Promise<ActionUrgente[]> {
  if (!prefs.alerte_actions_urgentes && !prefs.alerte_actions_priorite_haute) {
    return []
  }

  const priorites = []
  if (prefs.alerte_actions_urgentes) priorites.push('urgente')
  if (prefs.alerte_actions_priorite_haute) priorites.push('haute')

  const result = await db.query(
    `
    SELECT
      d.id,
      a.titre,
      a.priorite,
      d.numero as dossier_numero,
      TO_CHAR(a.date_limite, 'DD/MM/YYYY') as date_limite
    FROM actions a
    JOIN dossiers d ON a.dossier_id = d.id
    WHERE d.user_id = $1
      AND a.statut = 'a_faire'
      AND a.priorite = ANY($2::text[])
      AND (a.date_limite IS NULL OR a.date_limite >= CURRENT_DATE)
    ORDER BY
      CASE a.priorite
        WHEN 'urgente' THEN 1
        WHEN 'haute' THEN 2
        ELSE 3
      END,
      a.date_limite ASC NULLS LAST
    LIMIT 5
  `,
    [userId, priorites]
  )

  return result.rows as ActionUrgente[]
}

/**
 * Récupère les audiences de la semaine pour un utilisateur
 */
async function getAudiencesForUser(
  userId: string,
  prefs: UserNotificationSettings
): Promise<Audience[]> {
  if (!prefs.alerte_audiences_semaine && !prefs.alerte_audiences_veille) {
    return []
  }

  // Si seulement veille, limiter à demain
  const interval = prefs.alerte_audiences_semaine ? '7 days' : '1 day'

  const result = await db.query(
    `
    SELECT
      d.id,
      TO_CHAR(a.date_audience, 'DD/MM/YYYY') as date,
      TO_CHAR(a.date_audience, 'HH24:MI') as heure,
      COALESCE(a.tribunal, d.juridiction, 'Non spécifié') as tribunal,
      d.numero as dossier_numero,
      d.objet as dossier_objet
    FROM audiences a
    JOIN dossiers d ON a.dossier_id = d.id
    WHERE d.user_id = $1
      AND a.date_audience >= CURRENT_DATE
      AND a.date_audience <= CURRENT_DATE + INTERVAL '${interval}'
      AND a.statut != 'annulee'
    ORDER BY a.date_audience ASC
    LIMIT 10
  `,
    [userId]
  )

  return result.rows as Audience[]
}

/**
 * Récupère les factures impayées pour un utilisateur
 */
async function getFacturesImpayeesForUser(
  userId: string,
  prefs: UserNotificationSettings
): Promise<FactureImpayee[]> {
  if (!prefs.alerte_factures_impayees) return []

  const result = await db.query(
    `
    SELECT
      f.id,
      f.numero,
      c.nom as client_nom,
      f.montant_ttc::text || ' TND' as montant_ttc,
      (CURRENT_DATE - f.date_echeance::date) as jours_retard
    FROM factures f
    JOIN clients c ON f.client_id = c.id
    WHERE f.user_id = $1
      AND f.statut IN ('envoyee', 'en_attente')
      AND f.date_echeance < CURRENT_DATE
      AND (CURRENT_DATE - f.date_echeance::date) >= $2
    ORDER BY f.date_echeance ASC
    LIMIT 10
  `,
    [userId, prefs.alerte_factures_impayees_delai_jours]
  )

  return result.rows as FactureImpayee[]
}

// =============================================================================
// GÉNÉRATION ET ENVOI
// =============================================================================

/**
 * Génère et envoie le digest pour un utilisateur
 */
async function sendDigestToUser(
  user: UserNotificationSettings
): Promise<SendResult> {
  try {
    // Récupérer toutes les données
    const [echeances, actionsUrgentes, audiences, facturesImpayees] =
      await Promise.all([
        getEcheancesForUser(user.user_id, user),
        getActionsUrgentesForUser(user.user_id, user),
        getAudiencesForUser(user.user_id, user),
        getFacturesImpayeesForUser(user.user_id, user),
      ])

    // Si aucune donnée à envoyer, skip
    if (
      echeances.length === 0 &&
      actionsUrgentes.length === 0 &&
      audiences.length === 0 &&
      facturesImpayees.length === 0
    ) {
      console.log(`[DailyDigest] Aucune notification pour ${user.email}`)
      return { userId: user.user_id, email: user.email, success: true }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.moncabinet.tn'
    const dateAujourdhui = new Date().toLocaleDateString(
      user.langue_email === 'ar' ? 'ar-TN' : 'fr-TN',
      {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Africa/Tunis',
      }
    )

    const templateProps = {
      avocatNom: user.nom,
      avocatPrenom: user.prenom || undefined,
      dateAujourdhui,
      echeances,
      actionsUrgentes,
      audiences,
      facturesImpayees,
      langue: user.langue_email,
      baseUrl,
    }

    // Générer HTML et texte
    const htmlContent = await render(DailyDigestEmailTemplate(templateProps as any))
    const textContent = DailyDigestEmailText(templateProps as any)

    // Envoyer via Brevo
    const subject =
      user.langue_email === 'ar'
        ? `ملخصك اليومي - ${dateAujourdhui}`
        : `Votre récapitulatif quotidien - ${dateAujourdhui}`

    const result = await sendEmail({
      to: user.email,
      subject,
      htmlContent: user.email_format === 'html' ? htmlContent : textContent,
      textContent,
      tags: ['daily-digest', 'notifications'],
    })

    if (result.success) {
      // Logger le succès
      await logNotification(user.user_id, 'daily_digest', 'success', result.messageId)
      console.log(`[DailyDigest] Email envoyé à ${user.email}`)
      return { userId: user.user_id, email: user.email, success: true }
    } else {
      await logNotification(user.user_id, 'daily_digest', 'error', undefined, result.error)
      return {
        userId: user.user_id,
        email: user.email,
        success: false,
        error: result.error,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
    await logNotification(user.user_id, 'daily_digest', 'error', undefined, errorMessage)
    return {
      userId: user.user_id,
      email: user.email,
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Log une notification dans la base de données
 */
async function logNotification(
  userId: string,
  type: string,
  status: 'success' | 'error' | 'skipped',
  emailId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO notification_logs (user_id, type, status, email_id, error_message)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [userId, type, status, emailId || null, errorMessage || null]
    )
  } catch (error) {
    console.error('[DailyDigest] Erreur log notification:', error)
  }
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Envoie les notifications quotidiennes à tous les utilisateurs éligibles
 */
export async function sendDailyDigestNotifications(): Promise<DigestStats> {
  const startTime = Date.now()
  const errors: string[] = []

  // Vérifier la configuration Brevo
  if (!isBrevoConfigured()) {
    throw new Error('BREVO_API_KEY non configuré')
  }

  console.log('[DailyDigest] Démarrage envoi notifications quotidiennes...')

  // Récupérer tous les utilisateurs éligibles
  const users = await getUsersWithDailyDigest()
  console.log(`[DailyDigest] ${users.length} utilisateurs éligibles`)

  let emailsSent = 0
  let emailsFailed = 0

  // Traiter chaque utilisateur
  for (const user of users) {
    const result = await sendDigestToUser(user)
    if (result.success) {
      emailsSent++
    } else {
      emailsFailed++
      if (result.error) {
        errors.push(`${result.email}: ${result.error}`)
      }
    }

    // Petit délai entre les envois pour éviter le rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const duration = Date.now() - startTime

  console.log('[DailyDigest] Terminé:', {
    totalUsers: users.length,
    emailsSent,
    emailsFailed,
    duration: `${duration}ms`,
  })

  return {
    totalUsers: users.length,
    emailsSent,
    emailsFailed,
    errors,
    duration,
  }
}
