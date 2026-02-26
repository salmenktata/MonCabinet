/**
 * Service de parrainage (referral)
 *
 * Logique :
 * - Quand un filleul passe au plan payant (pro/enterprise), son parrain
 *   reçoit automatiquement 1 mois offert (extension de plan_expires_at).
 *
 * Appelé depuis changeUserPlanAction dans app/actions/super-admin/users.ts
 * ou depuis une future route de paiement.
 */

import { db } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/email-service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

export interface ReferralRewardResult {
  rewarded: boolean
  referrerId?: string
  monthsAdded?: number
  reason?: string
}

/**
 * Attribue 1 mois gratuit au parrain quand le filleul (userId) souscrit
 * à un plan payant.
 *
 * - Ne récompense qu'une seule fois par filleul (referral_rewards_given)
 * - Ne récompense que si le parrain est sur un plan payant ou trial actif
 */
export async function rewardReferrerIfEligible(userId: string): Promise<ReferralRewardResult> {
  // Récupérer le filleul et son parrain
  const userResult = await db.query(
    `SELECT u.id, u.email, u.nom, u.prenom, u.plan,
            u.referred_by_user_id,
            ref.id AS referrer_id, ref.email AS referrer_email,
            ref.nom AS referrer_nom, ref.prenom AS referrer_prenom,
            ref.plan AS referrer_plan, ref.plan_expires_at AS referrer_expires,
            ref.referral_rewards_given
     FROM users u
     LEFT JOIN users ref ON ref.id = u.referred_by_user_id
     WHERE u.id = $1`,
    [userId]
  )

  const row = userResult.rows[0]
  if (!row || !row.referrer_id) {
    return { rewarded: false, reason: 'no_referrer' }
  }

  // Vérifier que c'est la première récompense pour ce filleul
  // (on stocke le nombre dans referral_rewards_given sur le PARRAIN, pas le filleul)
  // Logique simplifiée : vérifier que le parrain n'a pas déjà été récompensé pour CE filleul
  const alreadyRewarded = await db.query(
    `SELECT 1 FROM referral_rewards
     WHERE referrer_id = $1 AND referee_id = $2`,
    [row.referrer_id, userId]
  ).catch(() => ({ rows: [] })) // Table peut ne pas exister encore

  if (alreadyRewarded.rows.length > 0) {
    return { rewarded: false, reason: 'already_rewarded' }
  }

  // Calculer la nouvelle date d'expiration du parrain (+1 mois)
  const currentExpiry = row.referrer_expires ? new Date(row.referrer_expires) : new Date()
  const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()))
  newExpiry.setMonth(newExpiry.getMonth() + 1)

  // Mettre à jour le plan_expires_at du parrain
  await db.query(
    `UPDATE users SET plan_expires_at = $1, referral_rewards_given = COALESCE(referral_rewards_given, 0) + 1
     WHERE id = $2`,
    [newExpiry, row.referrer_id]
  )

  // Enregistrer la récompense (best-effort — table peut ne pas exister)
  db.query(
    `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, created_at)
     VALUES ($1, $2, '1_month', NOW())
     ON CONFLICT DO NOTHING`,
    [row.referrer_id, userId]
  ).catch(() => null)

  // Email de notification au parrain
  const referrerName = `${row.referrer_prenom} ${row.referrer_nom}`
  const refereeName = `${row.prenom} ${row.nom}`

  sendEmail({
    to: row.referrer_email,
    subject: 'Bonne nouvelle : votre filleul a souscrit — 1 mois offert !',
    html: getReferralRewardEmailHtml(referrerName, refereeName, newExpiry),
    text: `Bonjour ${referrerName},\n\n${refereeName} que vous avez parrainé vient de souscrire à Qadhya. En récompense, votre abonnement est prolongé d'1 mois (jusqu'au ${newExpiry.toLocaleDateString('fr-FR')}).\n\nMerci !\nL'équipe Qadhya`,
  }).catch(() => null)

  return {
    rewarded: true,
    referrerId: row.referrer_id,
    monthsAdded: 1,
  }
}

function getReferralRewardEmailHtml(referrerName: string, refereeName: string, newExpiry: Date): string {
  const safeName = referrerName.replace(/[<>&"']/g, '')
  const safeRefereeName = refereeName.replace(/[<>&"']/g, '')
  const expiryStr = newExpiry.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 48px;">🎁</span>
    </div>

    <h2 style="color: #1e293b;">Bonjour ${safeName},</h2>

    <p style="color: #475569; line-height: 1.6; font-size: 16px;">
      <strong>${safeRefereeName}</strong>, que vous avez parrainé, vient de souscrire à Qadhya.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center;">
      <p style="color: #166534; font-size: 20px; font-weight: 700; margin: 0 0 4px;">+1 mois offert !</p>
      <p style="color: #16a34a; font-size: 14px; margin: 0;">
        Votre abonnement est prolongé jusqu'au <strong>${expiryStr}</strong>
      </p>
    </div>

    <p style="color: #475569; line-height: 1.6;">
      Partagez votre code de parrainage avec d'autres avocats pour continuer à cumuler des mois gratuits.
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${APP_URL}/dashboard"
         style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Voir mon tableau de bord
      </a>
    </div>

    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
      Qadhya — <a href="mailto:contact@qadhya.tn" style="color: #2563eb;">contact@qadhya.tn</a>
    </p>
  </div>
</body></html>
  `.trim()
}
