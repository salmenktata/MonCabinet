/**
 * API Route - Test d'envoi de notification pour un utilisateur
 * Permet de tester l'envoi d'email sans attendre le cron quotidien
 *
 * @module app/api/notifications/test
 * @see Phase 4.3 - Notification API (remplacer Supabase)
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import { sendEmail } from '@/lib/email/brevo'
import { getSession } from '@/lib/auth/session'
import { getErrorMessage } from '@/lib/utils/error-utils'

const log = createLogger('API:Notifications:Test')

/**
 * POST /api/notifications/test
 * Envoie un email de test de notification à l'utilisateur authentifié
 *
 * Auth: Session utilisateur (pas de CRON_SECRET requis)
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier authentification
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    log.info('Sending test notification', { userId })

    // Récupérer les informations utilisateur
    const userResult = await query(
      `
      SELECT
        id,
        email,
        nom,
        prenom,
        notification_preferences
      FROM profiles
      WHERE id = $1
      `,
      [userId]
    )

    const user = userResult.rows[0]

    if (!user) {
      return NextResponse.json(
        { error: 'Profil utilisateur non trouvé' },
        { status: 404 }
      )
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'Aucun email configuré pour ce profil' },
        { status: 400 }
      )
    }

    // Langue de l'email
    const langue =
      user.notification_preferences?.langue_email || 'fr'

    // Nom complet
    const nom = user.prenom ? `${user.prenom} ${user.nom}` : user.nom

    // Générer le contenu de test
    const subject =
      langue === 'ar'
        ? `🧪 بريد اختبار - إشعارات يومية`
        : `🧪 Email de test - Notifications quotidiennes`

    const greeting =
      langue === 'ar' ? `السلام عليكم ${nom}،` : `Bonjour ${nom},`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${langue === 'ar' ? 'قضية - اختبار الإشعارات' : 'Qadhya - Test Notifications'}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">🧪 ${langue === 'ar' ? 'بريد إلكتروني تجريبي' : 'Email de test'}</p>
        </div>

        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
          <p style="font-size: 16px; margin-top: 0;">${greeting}</p>

          <p>
            ${langue === 'ar' ? 'هذا بريد إلكتروني تجريبي لتأكيد أن إشعاراتك اليومية تعمل بشكل صحيح.' : 'Ceci est un email de test pour confirmer que vos notifications quotidiennes fonctionnent correctement.'}
          </p>

          <div style="background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #15803d;">
              ✅ ${langue === 'ar' ? 'التكوين الصحيح' : 'Configuration correcte'}
            </p>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #166534;">
              ${langue === 'ar' ? 'تم استلام هذا البريد الإلكتروني بنجاح. ستتلقى إشعاراتك اليومية على هذا العنوان.' : 'Vous avez bien reçu cet email. Vous recevrez vos notifications quotidiennes à cette adresse.'}
            </p>
          </div>

          <h2 style="color: #667eea; font-size: 18px; margin-top: 30px;">
            ${langue === 'ar' ? 'إعداداتك الحالية:' : 'Vos paramètres actuels :'}
          </h2>

          <ul style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
            <li style="margin-bottom: 8px;">
              📧 ${langue === 'ar' ? 'البريد الإلكتروني:' : 'Email :'} <strong>${user.email}</strong>
            </li>
            <li style="margin-bottom: 8px;">
              ⏰ ${langue === 'ar' ? 'وقت الإرسال:' : 'Heure d\'envoi :'} <strong>${user.notification_preferences?.send_time || '06:00'}</strong>
            </li>
            <li style="margin-bottom: 8px;">
              🌐 ${langue === 'ar' ? 'اللغة:' : 'Langue :'} <strong>${langue === 'ar' ? 'العربية' : 'Français'}</strong>
            </li>
            <li style="margin-bottom: 8px;">
              📊 ${langue === 'ar' ? 'الحالة:' : 'Statut :'} <strong style="color: #16a34a;">
                ${user.notification_preferences?.enabled ? (langue === 'ar' ? 'مفعل ✓' : 'Activé ✓') : (langue === 'ar' ? 'معطل ✗' : 'Désactivé ✗')}
              </strong>
            </li>
          </ul>

          <h2 style="color: #667eea; font-size: 18px; margin-top: 30px;">
            ${langue === 'ar' ? 'ماذا ستتلقى في رسائلك اليومية؟' : 'Que recevrez-vous dans vos emails quotidiens ?'}
          </h2>

          <ul style="line-height: 1.8;">
            <li>
              📅 ${langue === 'ar' ? 'المواعيد النهائية القادمة (حسب تفضيلاتك: 15، 7، 3، 1 يوم)' : 'Échéances à venir (selon vos préférences : J-15, J-7, J-3, J-1)'}
            </li>
            <li>
              ⚠️ ${langue === 'ar' ? 'الإجراءات العاجلة' : 'Actions urgentes'}
            </li>
            <li>
              🏛️ ${langue === 'ar' ? 'الجلسات القادمة خلال 7 أيام' : 'Audiences dans les 7 jours'}
            </li>
            <li>
              💰 ${langue === 'ar' ? 'الفواتير غير المدفوعة (حسب عتبة التأخير)' : 'Factures impayées (selon seuil de retard)'}
            </li>
          </ul>

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
          <p style="margin: 10px 0 0 0; font-size: 11px;">
            ${new Date().toLocaleString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}
          </p>
        </div>
      </body>
      </html>
    `

    const text = `
${greeting}

🧪 ${langue === 'ar' ? 'بريد إلكتروني تجريبي' : 'Email de test'}

${langue === 'ar' ? 'هذا بريد إلكتروني تجريبي لتأكيد أن إشعاراتك اليومية تعمل بشكل صحيح.' : 'Ceci est un email de test pour confirmer que vos notifications quotidiennes fonctionnent correctement.'}

✅ ${langue === 'ar' ? 'التكوين الصحيح' : 'Configuration correcte'}
${langue === 'ar' ? 'تم استلام هذا البريد الإلكتروني بنجاح.' : 'Vous avez bien reçu cet email.'}

${langue === 'ar' ? 'إعداداتك:' : 'Vos paramètres :'}
- ${langue === 'ar' ? 'البريد الإلكتروني:' : 'Email :'} ${user.email}
- ${langue === 'ar' ? 'وقت الإرسال:' : 'Heure :'} ${user.notification_preferences?.send_time || '06:00'}
- ${langue === 'ar' ? 'اللغة:' : 'Langue :'} ${langue === 'ar' ? 'العربية' : 'Français'}
- ${langue === 'ar' ? 'الحالة:' : 'Statut :'} ${user.notification_preferences?.enabled ? (langue === 'ar' ? 'مفعل' : 'Activé') : (langue === 'ar' ? 'معطل' : 'Désactivé')}

---

${langue === 'ar' ? 'لتعديل الإعدادات:' : 'Modifier les paramètres :'}
${process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'}/parametres/notifications

🤖 ${langue === 'ar' ? 'تم الإنشاء بواسطة قضية' : 'Généré avec Qadhya'}
${new Date().toLocaleString(langue === 'ar' ? 'ar-TN' : 'fr-FR')}
    `.trim()

    // Envoyer l'email via Brevo
    await sendEmail({
      to: user.email,
      subject,
      htmlContent: html,
      textContent: text,
    })

    log.info('Test notification sent successfully', {
      userId,
      email: user.email,
    })

    return NextResponse.json({
      success: true,
      message:
        langue === 'ar'
          ? 'تم إرسال البريد الإلكتروني التجريبي بنجاح!'
          : 'Email de test envoyé avec succès !',
      email: user.email,
    })
  } catch (error) {
    log.error('Failed to send test notification', { error })
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email de test',
        details: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}
