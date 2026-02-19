import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/brevo-client'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * POST /api/admin/alerts/check-impersonations
 * Vérifie les impersonnalisations actives et alerte si durée > 1h
 * Auth: session super_admin OU CRON_SECRET
 */
export const POST = withAdminApiAuth(async (_request: NextRequest, _ctx, _session) => {
  try {
    const ONE_HOUR = 60 * 60 * 1000 // 1 heure en millisecondes

    // Récupérer toutes les sessions actives > 1h
    const result = await query(`
      SELECT
        ai.id,
        ai.admin_id,
        ai.target_user_id,
        ai.reason,
        ai.started_at,
        ai.expires_at,
        ai.ip_address,
        u1.email as admin_email,
        u1.nom || ' ' || u1.prenom as admin_name,
        u2.email as target_email,
        u2.nom || ' ' || u2.prenom as target_name
      FROM active_impersonations ai
      JOIN users u1 ON ai.admin_id = u1.id
      JOIN users u2 ON ai.target_user_id = u2.id
      WHERE ai.is_active = true
        AND ai.started_at < NOW() - INTERVAL '1 hour'
      ORDER BY ai.started_at ASC
    `)

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        checked: 0,
        alerts: 0,
        message: 'Aucune impersonnalisation longue détectée',
      })
    }

    // Récupérer tous les super-admins pour notification
    const adminsResult = await query(`
      SELECT email, nom, prenom
      FROM users
      WHERE role = 'super_admin'
        AND status = 'approved'
    `)

    const adminEmails = adminsResult.rows.map((admin) => admin.email)

    // Envoyer une alerte groupée
    const impersonationsList = result.rows
      .map((imp) => {
        const elapsedMinutes = Math.floor(
          (Date.now() - new Date(imp.started_at).getTime()) / 60000
        )
        const elapsedHours = Math.floor(elapsedMinutes / 60)
        const remainingMinutes = elapsedMinutes % 60

        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #374151;">${imp.admin_name} (${imp.admin_email})</td>
          <td style="padding: 12px; border-bottom: 1px solid #374151;">${imp.target_name} (${imp.target_email})</td>
          <td style="padding: 12px; border-bottom: 1px solid #374151; font-weight: bold; color: #f97316;">${elapsedHours}h ${remainingMinutes}m</td>
          <td style="padding: 12px; border-bottom: 1px solid #374151; font-family: monospace; font-size: 12px;">${imp.ip_address}</td>
          <td style="padding: 12px; border-bottom: 1px solid #374151; font-size: 13px;">${imp.reason}</td>
        </tr>
      `
      })
      .join('')

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 20px;">
        <div style="max-width: 800px; margin: 0 auto; background-color: #1e293b; border-radius: 8px; padding: 24px; border: 1px solid #334155;">
          <h1 style="color: #f97316; margin-top: 0; display: flex; align-items: center; gap: 8px;">
            Impersonnalisations Actives Longues
          </h1>

          <p style="color: #cbd5e1; font-size: 16px;">
            <strong>${result.rows.length}</strong> session${result.rows.length > 1 ? 's' : ''} d'impersonnalisation active${result.rows.length > 1 ? 's' : ''} depuis plus d'1 heure.
          </p>

          <table style="width: 100%; border-collapse: collapse; background-color: #0f172a; border-radius: 6px; overflow: hidden; margin: 24px 0;">
            <thead>
              <tr style="background-color: #1e293b;">
                <th style="padding: 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #374151;">Admin</th>
                <th style="padding: 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #374151;">Utilisateur</th>
                <th style="padding: 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #374151;">Durée</th>
                <th style="padding: 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #374151;">IP</th>
                <th style="padding: 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 2px solid #374151;">Raison</th>
              </tr>
            </thead>
            <tbody style="color: #cbd5e1;">
              ${impersonationsList}
            </tbody>
          </table>

          <div style="background-color: #422006; border: 1px solid #ea580c; border-radius: 6px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; color: #fed7aa;">
              <strong>Rappel :</strong> Les impersonnalisations ont une durée maximale de 2 heures et sont automatiquement arrêtées à l'expiration.
            </p>
          </div>

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #334155;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/super-admin/monitoring?tab=impersonations"
               style="display: inline-block; background-color: #f97316; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Voir le Dashboard
            </a>
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
            Alerte automatique générée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' })} (heure Tunisie)
          </p>
        </div>
      </body>
      </html>
    `

    // Envoyer l'email à tous les super-admins
    for (const email of adminEmails) {
      await sendEmail({
        to: email,
        subject: `${result.rows.length} Impersonnalisation${result.rows.length > 1 ? 's' : ''} Active${result.rows.length > 1 ? 's' : ''} Longue${result.rows.length > 1 ? 's' : ''}`,
        htmlContent: htmlContent,
      })
    }

    return NextResponse.json({
      success: true,
      checked: result.rows.length,
      alerts: adminEmails.length,
      message: `${result.rows.length} impersonnalisation(s) longue(s) détectée(s), alertes envoyées à ${adminEmails.length} admin(s)`,
    })
  } catch (error) {
    console.error('[Check Impersonations] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
