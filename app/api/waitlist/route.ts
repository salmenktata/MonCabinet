/**
 * POST /api/waitlist
 * Inscription à la liste d'attente (public, sans auth)
 *
 * Rate limited : 5 inscriptions / heure par IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db/postgres'
import { RateLimiter } from '@/lib/rate-limiter'
import { sendEmail } from '@/lib/email/email-service'

export const dynamic = 'force-dynamic'

const waitlistLimiter = new RateLimiter({ windowMs: 60_000 * 60, maxRequests: 5, name: 'waitlist' })

const schema = z.object({
  email: z.string().email('Email invalide'),
  nom: z.string().min(2, 'Nom requis').max(100),
  prenom: z.string().min(2, 'Prénom requis').max(100),
  source: z.string().max(50).optional().default('landing_page'),
})

export async function POST(request: NextRequest) {
  // Rate limiting par IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const rateResult = waitlistLimiter.check(ip)
  if (!rateResult.allowed) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const data = schema.parse(body)

    // Vérifier si déjà inscrit (email en double = silencieux côté UX)
    const existing = await query('SELECT id, status FROM waitlist WHERE email = $1', [data.email.toLowerCase()])
    if (existing.rows.length > 0) {
      // Ne pas révéler si l'email existe déjà (anti-enumeration)
      return NextResponse.json({ success: true, alreadyRegistered: true })
    }

    // Insérer dans la waitlist
    const result = await query(
      `INSERT INTO waitlist (email, nom, prenom, source)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [data.email.toLowerCase(), data.nom, data.prenom, data.source]
    )
    const waitlistId = result.rows[0].id

    // Email de confirmation automatique (non-bloquant)
    sendEmail({
      to: data.email,
      subject: 'Votre place est réservée sur Qadhya',
      html: getWaitlistConfirmationHtml(`${data.prenom} ${data.nom}`),
      text: `Bonjour ${data.prenom},\n\nVotre inscription à la liste d'attente Qadhya est confirmée. Vous serez parmi les premiers à recevoir votre invitation.\n\nL'équipe Qadhya`,
    }).catch(() => null)

    // Notifier le super admin (non-bloquant)
    const adminEmail = process.env.SUPER_ADMIN_EMAIL
    if (adminEmail) {
      sendEmail({
        to: adminEmail,
        subject: `[Waitlist] Nouvelle inscription : ${data.prenom} ${data.nom}`,
        html: `<p>Nouvelle inscription waitlist :</p><ul><li>Email : ${data.email}</li><li>Nom : ${data.prenom} ${data.nom}</li><li>Source : ${data.source}</li></ul><p><a href="https://qadhya.tn/super-admin/waitlist">Gérer la waitlist →</a></p>`,
        text: `Waitlist: ${data.email} (${data.source})`,
      }).catch(() => null)
    }

    return NextResponse.json({ success: true, id: waitlistId }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('[waitlist] Erreur:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'inscription' }, { status: 500 })
  }
}

function getWaitlistConfirmationHtml(userName: string): string {
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

    <p style="color: #475569; line-height: 1.6;">
      Votre place est bien <strong>réservée</strong> sur la liste d'attente Qadhya.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #166534; margin: 0; font-weight: 600;">Ce qui vous attend :</p>
      <ul style="color: #166534; padding-left: 20px; margin: 8px 0 0;">
        <li>Accès gratuit complet — sans carte bancaire</li>
        <li>30 requêtes Qadhya IA juridique</li>
        <li>Base de +6 800 documents de droit tunisien</li>
        <li>Structuration automatique de dossiers par IA</li>
      </ul>
    </div>

    <p style="color: #475569; line-height: 1.6;">
      Nous vous enverrons votre lien d'accès dès que votre invitation est prête.
      <strong>Les 100 premières places sont prioritaires.</strong>
    </p>

    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 32px;">
      Qadhya — Assistant juridique pour les avocats tunisiens
    </p>
  </div>
</body></html>
  `.trim()
}
