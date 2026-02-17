/**
 * API Route - Envoi des notifications quotidiennes par email
 * Remplace Supabase Edge Function send-notifications
 *
 * @module app/api/notifications/send
 * @see Phase 4.3 - Notification API (remplacer Supabase)
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import { sendEmail } from '@/lib/email/brevo'
import { getErrorMessage } from '@/lib/utils/error-utils'

const log = createLogger('API:Notifications:Send')

/**
 * Structure notification preferences
 */
interface NotificationPreferences {
  enabled: boolean
  send_time: string
  notify_echeances: {
    j15: boolean
    j7: boolean
    j3: boolean
    j1: boolean
  }
  notify_actions_urgentes: boolean
  notify_audiences: boolean
  notify_factures_impayees: boolean
  factures_seuil_jours: number
  langue_email: 'fr' | 'ar'
  format_email: 'html' | 'text'
}

/**
 * Structure utilisateur avec préférences
 */
interface UserWithPreferences {
  id: string
  email: string
  nom: string
  prenom: string
  notification_preferences: NotificationPreferences
}

/**
 * Données pour l'email de notification
 */
interface NotificationData {
  echeances: Array<{
    titre: string
    date_echeance: Date
    jours_restants: number
    urgence: 'j1' | 'j3' | 'j7' | 'j15'
  }>
  actions_urgentes: Array<{
    titre: string
    description: string
    date_limite?: Date
  }>
  audiences: Array<{
    titre: string
    date_audience: Date
    tribunal: string
  }>
  factures_impayees: Array<{
    numero: string
    client: string
    montant: number
    jours_retard: number
  }>
}

/**
 * POST /api/notifications/send
 * Envoie les notifications quotidiennes à tous les utilisateurs éligibles
 *
 * Auth: X-Cron-Secret (sécurise l'accès au cron uniquement)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Vérifier authentification cron
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      log.error('CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Configuration manquante' },
        { status: 500 }
      )
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log.warn('Unauthorized: Missing or invalid Authorization header')
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    if (token !== cronSecret) {
      log.warn('Unauthorized: Invalid CRON_SECRET')
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    // Récupérer l'heure actuelle (format HH:MM)
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

    log.info('Starting daily notifications', {
      currentTime,
      timestamp: now.toISOString(),
    })

    // Récupérer tous les utilisateurs avec notifications activées
    const usersResult = await query<UserWithPreferences>(
      `
      SELECT
        id,
        email,
        nom,
        prenom,
        notification_preferences
      FROM profiles
      WHERE
        notification_preferences->>'enabled' = 'true'
        AND notification_preferences->>'send_time' = $1
        AND email IS NOT NULL
      `,
      [currentTime]
    )

    const users = usersResult.rows

    if (users.length === 0) {
      log.info('No users to notify at this time', { currentTime })
      return NextResponse.json({
        success: true,
        message: 'Aucun utilisateur à notifier à cette heure',
        sent: 0,
        currentTime,
      })
    }

    log.info(`Found ${users.length} users to notify`)

    // Compteurs
    let sent = 0
    let failed = 0
    const errors: string[] = []

    // Envoyer les notifications pour chaque utilisateur
    for (const user of users) {
      try {
        // Récupérer les données de notification pour cet utilisateur
        const notificationData = await fetchNotificationData(
          user.id,
          user.notification_preferences
        )

        // Vérifier s'il y a du contenu à envoyer
        const hasContent =
          notificationData.echeances.length > 0 ||
          notificationData.actions_urgentes.length > 0 ||
          notificationData.audiences.length > 0 ||
          notificationData.factures_impayees.length > 0

        if (!hasContent) {
          log.info(`No notification content for user ${user.id}`)
          continue
        }

        // Générer le contenu de l'email
        const emailContent = generateEmailContent(
          user,
          notificationData
        )

        // Envoyer l'email via Brevo
        await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          htmlContent: emailContent.html,
          textContent: emailContent.text,
        })

        sent++
        log.info(`Notification sent successfully to ${user.email}`)
      } catch (error) {
        failed++
        const errorMsg = `User ${user.email}: ${getErrorMessage(error)}`
        errors.push(errorMsg)
        log.error(`Failed to send notification to ${user.email}`, {
          error,
          userId: user.id,
        })
      }
    }

    const duration = Date.now() - startTime

    log.info('Daily notifications completed', {
      total: users.length,
      sent,
      failed,
      duration,
    })

    return NextResponse.json({
      success: true,
      message: `Notifications envoyées avec succès`,
      stats: {
        total: users.length,
        sent,
        failed,
        duration,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    log.error('Failed to send daily notifications', { error })
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur lors de l\'envoi des notifications',
        details: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Récupère les données de notification pour un utilisateur
 */
async function fetchNotificationData(
  userId: string,
  preferences: NotificationPreferences
): Promise<NotificationData> {
  const data: NotificationData = {
    echeances: [],
    actions_urgentes: [],
    audiences: [],
    factures_impayees: [],
  }

  // Récupérer les échéances selon les préférences
  if (Object.values(preferences.notify_echeances).some((v) => v)) {
    const echeancesResult = await query(
      `
      SELECT
        titre,
        date_echeance,
        EXTRACT(DAY FROM (date_echeance - NOW())) as jours_restants
      FROM echeances
      WHERE
        user_id = $1
        AND date_echeance > NOW()
        AND date_echeance <= NOW() + INTERVAL '15 days'
        AND (statut IS NULL OR statut != 'terminee')
      ORDER BY date_echeance ASC
      `,
      [userId]
    )

    for (const row of echeancesResult.rows) {
      const jours = Math.ceil(row.jours_restants)
      let urgence: NotificationData['echeances'][0]['urgence'] | null = null

      if (jours <= 1 && preferences.notify_echeances.j1) urgence = 'j1'
      else if (jours <= 3 && preferences.notify_echeances.j3) urgence = 'j3'
      else if (jours <= 7 && preferences.notify_echeances.j7) urgence = 'j7'
      else if (jours <= 15 && preferences.notify_echeances.j15) urgence = 'j15'

      if (urgence) {
        data.echeances.push({
          titre: row.titre,
          date_echeance: row.date_echeance,
          jours_restants: jours,
          urgence,
        })
      }
    }
  }

  // Récupérer les actions urgentes
  if (preferences.notify_actions_urgentes) {
    const actionsResult = await query(
      `
      SELECT
        titre,
        description,
        date_limite
      FROM actions
      WHERE
        user_id = $1
        AND priorite = 'urgente'
        AND (statut IS NULL OR statut != 'terminee')
        AND (date_limite IS NULL OR date_limite >= NOW())
      ORDER BY date_limite ASC NULLS LAST
      LIMIT 10
      `,
      [userId]
    )

    data.actions_urgentes = actionsResult.rows
  }

  // Récupérer les audiences
  if (preferences.notify_audiences) {
    const audiencesResult = await query(
      `
      SELECT
        titre,
        date_audience,
        tribunal
      FROM audiences
      WHERE
        user_id = $1
        AND date_audience >= NOW()
        AND date_audience <= NOW() + INTERVAL '7 days'
      ORDER BY date_audience ASC
      LIMIT 10
      `,
      [userId]
    )

    data.audiences = audiencesResult.rows
  }

  // Récupérer les factures impayées
  if (preferences.notify_factures_impayees) {
    const facturesResult = await query(
      `
      SELECT
        numero,
        client_nom as client,
        montant,
        EXTRACT(DAY FROM (NOW() - date_emission)) as jours_retard
      FROM factures
      WHERE
        user_id = $1
        AND statut = 'impayee'
        AND date_emission <= NOW() - INTERVAL '${preferences.factures_seuil_jours} days'
      ORDER BY date_emission ASC
      LIMIT 20
      `,
      [userId]
    )

    data.factures_impayees = facturesResult.rows.map((row) => ({
      numero: row.numero,
      client: row.client,
      montant: row.montant,
      jours_retard: Math.ceil(row.jours_retard),
    }))
  }

  return data
}

/**
 * Génère le contenu HTML et texte de l'email
 */
function generateEmailContent(
  user: UserWithPreferences,
  data: NotificationData
): { subject: string; html: string; text: string } {
  const langue = user.notification_preferences.langue_email
  const nom = user.prenom ? `${user.prenom} ${user.nom}` : user.nom

  // Sujet de l'email
  const subject =
    langue === 'ar'
      ? `إشعار يومي - ${new Date().toLocaleDateString('ar-TN')}`
      : `Notification quotidienne - ${new Date().toLocaleDateString('fr-FR')}`

  // Salutation
  const greeting =
    langue === 'ar' ? `السلام عليكم ${nom}،` : `Bonjour ${nom},`

  // Construire le HTML
  const htmlSections: string[] = []
  const textSections: string[] = []

  // Échéances
  if (data.echeances.length > 0) {
    const title = langue === 'ar' ? 'المواعيد النهائية القادمة' : 'Échéances à venir'
    htmlSections.push(`
      <h2 style="color: #d97706; margin-top: 20px;">${title} (${data.echeances.length})</h2>
      <ul>
        ${data.echeances
          .map(
            (e) => `
          <li style="margin-bottom: 8px;">
            <strong>${e.titre}</strong><br/>
            📅 ${e.date_echeance.toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}<br/>
            <span style="color: ${e.jours_restants <= 3 ? '#dc2626' : '#d97706'};">
              ⏱️ ${langue === 'ar' ? `${e.jours_restants} يوم متبقي` : `${e.jours_restants} jour(s) restant(s)`}
            </span>
          </li>
        `
          )
          .join('')}
      </ul>
    `)

    textSections.push(
      `\n${title}:\n` +
        data.echeances
          .map(
            (e) =>
              `- ${e.titre} (${e.date_echeance.toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}) - ${e.jours_restants} jour(s)`
          )
          .join('\n')
    )
  }

  // Actions urgentes
  if (data.actions_urgentes.length > 0) {
    const title = langue === 'ar' ? 'الإجراءات العاجلة' : 'Actions urgentes'
    htmlSections.push(`
      <h2 style="color: #dc2626; margin-top: 20px;">${title} (${data.actions_urgentes.length})</h2>
      <ul>
        ${data.actions_urgentes
          .map(
            (a) => `
          <li style="margin-bottom: 8px;">
            <strong>${a.titre}</strong><br/>
            ${a.description}<br/>
            ${a.date_limite ? `⏰ ${langue === 'ar' ? 'الموعد النهائي' : 'Limite'}: ${a.date_limite.toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}` : ''}
          </li>
        `
          )
          .join('')}
      </ul>
    `)

    textSections.push(
      `\n${title}:\n` +
        data.actions_urgentes
          .map((a) => `- ${a.titre}: ${a.description}`)
          .join('\n')
    )
  }

  // Audiences
  if (data.audiences.length > 0) {
    const title = langue === 'ar' ? 'الجلسات القادمة' : 'Audiences à venir'
    htmlSections.push(`
      <h2 style="color: #2563eb; margin-top: 20px;">${title} (${data.audiences.length})</h2>
      <ul>
        ${data.audiences
          .map(
            (a) => `
          <li style="margin-bottom: 8px;">
            <strong>${a.titre}</strong><br/>
            📅 ${a.date_audience.toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}<br/>
            🏛️ ${a.tribunal}
          </li>
        `
          )
          .join('')}
      </ul>
    `)

    textSections.push(
      `\n${title}:\n` +
        data.audiences
          .map(
            (a) =>
              `- ${a.titre} (${a.date_audience.toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}) - ${a.tribunal}`
          )
          .join('\n')
    )
  }

  // Factures impayées
  if (data.factures_impayees.length > 0) {
    const title = langue === 'ar' ? 'الفواتير غير المدفوعة' : 'Factures impayées'
    htmlSections.push(`
      <h2 style="color: #dc2626; margin-top: 20px;">${title} (${data.factures_impayees.length})</h2>
      <ul>
        ${data.factures_impayees
          .map(
            (f) => `
          <li style="margin-bottom: 8px;">
            <strong>${f.numero}</strong> - ${f.client}<br/>
            💰 ${f.montant.toFixed(2)} TND<br/>
            <span style="color: #dc2626;">
              ⚠️ ${langue === 'ar' ? `${f.jours_retard} يوم تأخير` : `${f.jours_retard} jour(s) de retard`}
            </span>
          </li>
        `
          )
          .join('')}
      </ul>
    `)

    textSections.push(
      `\n${title}:\n` +
        data.factures_impayees
          .map(
            (f) =>
              `- ${f.numero} (${f.client}): ${f.montant.toFixed(2)} TND - ${f.jours_retard} jour(s) de retard`
          )
          .join('\n')
    )
  }

  // HTML complet
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">${langue === 'ar' ? 'قضية - نظام إدارة المحاماة' : 'Qadhya - Gestion Cabinet d\'Avocat'}</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">${new Date().toLocaleDateString(langue === 'ar' ? 'ar-TN' : 'fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; margin-top: 0;">${greeting}</p>
        <p>${langue === 'ar' ? 'إليك ملخص يومك:' : 'Voici votre résumé quotidien :'}</p>

        ${htmlSections.join('')}

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

        <p style="font-size: 14px; color: #6b7280;">
          ${langue === 'ar' ? 'لتعديل تفضيلات الإشعارات، قم بزيارة' : 'Pour modifier vos préférences de notifications, visitez'}
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'}/parametres/notifications" style="color: #667eea;">
            ${langue === 'ar' ? 'الإعدادات' : 'Paramètres'}
          </a>
        </p>
      </div>

      <div style="background: #f3f4f6; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px; color: #6b7280;">
        <p style="margin: 0;">
          🤖 ${langue === 'ar' ? 'تم الإنشاء بواسطة' : 'Généré avec'} <a href="https://qadhya.tn" style="color: #667eea; text-decoration: none;">Qadhya</a>
        </p>
      </div>
    </body>
    </html>
  `

  // Texte brut
  const text = `
${greeting}

${langue === 'ar' ? 'إليك ملخص يومك:' : 'Voici votre résumé quotidien :'}

${textSections.join('\n')}

---

${langue === 'ar' ? 'لتعديل تفضيلات الإشعارات:' : 'Pour modifier vos préférences de notifications :'}
${process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'}/parametres/notifications

🤖 ${langue === 'ar' ? 'تم الإنشاء بواسطة قضية' : 'Généré avec Qadhya'}
  `.trim()

  return { subject, html, text }
}
