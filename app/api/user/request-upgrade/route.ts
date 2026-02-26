import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('UpgradeRequest')

const PLAN_LABELS: Record<string, string> = {
  solo: 'Pro — 89 DT/mois',
  cabinet: 'Expert — 229 DT/mois',
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { plan, note, promoCode } = await req.json()
  if (!plan || !['solo', 'cabinet'].includes(plan)) {
    return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
  }

  const userId = session.user.id

  // Récupérer infos utilisateur
  const userRow = await query(
    'SELECT email, nom, prenom, plan AS current_plan FROM users WHERE id = $1',
    [userId]
  )
  const user = userRow.rows[0]
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  const userName = `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email

  // Valider le code promo si fourni
  let validatedPromoCode: string | null = null
  if (promoCode) {
    const planForPromo = plan === 'solo' ? 'pro' : 'expert'
    const promoResult = await query(
      `SELECT code FROM promo_codes
       WHERE code = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)
         AND (applies_to = 'all' OR applies_to = $2)`,
      [promoCode.toUpperCase().trim(), planForPromo]
    )
    if (promoResult.rows.length > 0) {
      validatedPromoCode = promoResult.rows[0].code
    }
  }

  // Enregistrer la demande
  await query(
    `UPDATE users
     SET upgrade_requested_plan = $1,
         upgrade_requested_at   = NOW(),
         upgrade_request_note   = $2,
         upgrade_promo_code     = $3
     WHERE id = $4`,
    [plan, note || null, validatedPromoCode, userId]
  )

  const planLabel = PLAN_LABELS[plan]
  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL}/super-admin/users?plan=upgrade_requested`

  // Email admin
  const adminEmails = (process.env.ADMIN_EMAIL || 'contact@qadhya.tn').split(',')
  await sendEmail({
    to: adminEmails[0].trim(),
    subject: `🚀 Demande d'upgrade — ${userName} → ${planLabel}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1e293b;">Nouvelle demande d'upgrade</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#64748b;font-weight:600;">Utilisateur</td><td style="padding:8px;">${userName}</td></tr>
          <tr><td style="padding:8px;color:#64748b;font-weight:600;">Email</td><td style="padding:8px;">${user.email}</td></tr>
          <tr><td style="padding:8px;color:#64748b;font-weight:600;">Plan actuel</td><td style="padding:8px;">${user.current_plan}</td></tr>
          <tr><td style="padding:8px;color:#64748b;font-weight:600;">Plan demandé</td><td style="padding:8px;font-weight:bold;color:#2563eb;">${planLabel}</td></tr>
          ${note ? `<tr><td style="padding:8px;color:#64748b;font-weight:600;">Note</td><td style="padding:8px;">${note}</td></tr>` : ''}
        </table>
        <a href="${adminUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Gérer dans le super-admin →
        </a>
      </div>
    `,
    text: `Demande d'upgrade\n\nUtilisateur: ${userName} (${user.email})\nPlan demandé: ${planLabel}\n\nGérer: ${adminUrl}`,
  }).catch((e) => log.warn('Email admin échoué (non-bloquant)', { error: e }))

  // Email de confirmation à l'utilisateur
  await sendEmail({
    to: user.email,
    subject: 'Votre demande d\'upgrade Qadhya a bien été reçue',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;">
        <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color:#1e293b;">Bonjour ${userName},</h2>
          <p style="color:#475569;line-height:1.6;">
            Nous avons bien reçu votre demande de passage au plan <strong>${planLabel}</strong>.
          </p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:20px 0;">
            <p style="color:#0369a1;margin:0;font-size:14px;">
              ✅ Notre équipe va vous contacter sous <strong>24h</strong> pour finaliser votre abonnement et vous communiquer les modalités de paiement.
            </p>
          </div>
          <p style="color:#475569;font-size:14px;">
            En attendant, vous continuez à accéder à toutes vos données dans Qadhya.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
            Qadhya — <a href="mailto:contact@qadhya.tn" style="color:#2563eb;">contact@qadhya.tn</a>
          </p>
        </div>
      </div>
    `,
    text: `Bonjour ${userName},\n\nVotre demande de passage au plan ${planLabel} a bien été reçue.\nNotre équipe vous contactera sous 24h.\n\nL'équipe Qadhya`,
  }).catch((e) => log.warn('Email confirmation user échoué (non-bloquant)', { error: e }))

  log.info('Demande upgrade enregistrée', { userId, plan, email: user.email })

  return NextResponse.json({ success: true })
}
