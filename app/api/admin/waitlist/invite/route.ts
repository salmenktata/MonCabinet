/**
 * POST /api/admin/waitlist/invite
 * Envoie un email d'invitation à un ou plusieurs inscrits de la waitlist.
 *
 * Body: { waitlistIds: string[] }  — ou { inviteAll: true } pour inviter tous les 'pending'
 * Protégé : super-admin session ou CRON_SECRET
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { sendEmail } from '@/lib/email/email-service'
import crypto from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

export const POST = withAdminApiAuth(async (request) => {
  const body = await request.json()
  const { waitlistIds, inviteAll } = body as {
    waitlistIds?: string[]
    inviteAll?: boolean
  }

  // Récupérer les inscrits à inviter
  let rows: Array<{ id: string; email: string; nom: string; prenom: string }>

  if (inviteAll) {
    const result = await db.query(
      `SELECT id, email, nom, prenom FROM waitlist WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100`
    )
    rows = result.rows
  } else if (waitlistIds && waitlistIds.length > 0) {
    const result = await db.query(
      `SELECT id, email, nom, prenom FROM waitlist WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
      [waitlistIds]
    )
    rows = result.rows
  } else {
    return NextResponse.json({ error: 'Fournir waitlistIds ou inviteAll=true' }, { status: 400 })
  }

  if (rows.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aucun inscrit en attente à inviter' })
  }

  let sent = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      // Générer un token unique pour cette invitation
      const token = crypto.randomBytes(32).toString('hex')

      // Stocker le token dans la waitlist
      await db.query(
        `UPDATE waitlist SET invitation_token = $1, status = 'invited', invited_at = NOW()
         WHERE id = $2`,
        [token, row.id]
      )

      // URL d'inscription pré-remplie avec le token
      const registerUrl = `${APP_URL}/register?invite=${token}&email=${encodeURIComponent(row.email)}&nom=${encodeURIComponent(row.nom)}&prenom=${encodeURIComponent(row.prenom)}`

      // Envoyer l'email d'invitation
      const emailResult = await sendEmail({
        to: row.email,
        subject: 'Votre invitation Qadhya est prête — Activez votre accès',
        html: getInvitationEmailHtml(`${row.prenom} ${row.nom}`, registerUrl),
        text: `Bonjour ${row.prenom},\n\nVotre invitation Qadhya est prête. Cliquez ici pour activer votre essai 14 jours :\n\n${registerUrl}\n\nCe lien est valable 30 jours.\n\nL'équipe Qadhya`,
      })

      if (emailResult.success) {
        sent++
      } else {
        errors.push(`${row.email}: ${emailResult.error}`)
      }
    } catch (err) {
      errors.push(`${row.email}: ${err instanceof Error ? err.message : 'erreur inconnue'}`)
    }
  }

  return NextResponse.json({ sent, total: rows.length, errors: errors.length > 0 ? errors : undefined })
})

function getInvitationEmailHtml(userName: string, registerUrl: string): string {
  const safeName = userName.replace(/[<>&"']/g, '')
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 40px;">⚖️</span>
      <h1 style="color: #1e293b; font-size: 24px; margin: 8px 0 0;">Qadhya</h1>
    </div>

    <h2 style="color: #1e293b;">Bonjour ${safeName},</h2>

    <p style="color: #475569; line-height: 1.6; font-size: 16px;">
      Votre invitation à Qadhya est prête. Vous faites partie des premiers avocats
      à accéder à notre plateforme.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="color: #1e40af; font-weight: 700; margin: 0 0 12px; font-size: 16px;">
        Votre essai gratuit de 14 jours inclut :
      </p>
      <ul style="color: #1e3a8a; padding-left: 20px; margin: 0; line-height: 2;">
        <li>30 requêtes Qadhya IA juridique</li>
        <li>Base de +6 800 documents tunisiens</li>
        <li>Gestion de dossiers et clients</li>
        <li>Calcul des délais légaux</li>
        <li>Structuration automatique par IA</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${registerUrl}"
         style="background: #2563eb; color: white; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Activer mon essai gratuit →
      </a>
    </div>

    <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
      Ce lien est valable 30 jours et vous est réservé personnellement.
      Aucune carte bancaire requise.
    </p>

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">

    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
      Qadhya — L'assistant juridique des avocats tunisiens<br>
      Questions ? <a href="mailto:contact@qadhya.tn" style="color: #2563eb;">contact@qadhya.tn</a>
    </p>
  </div>
</body></html>
  `.trim()
}
