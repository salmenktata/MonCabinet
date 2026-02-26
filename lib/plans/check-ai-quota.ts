/**
 * Vérification et enforcement du quota IA par plan
 *
 * Logique :
 *   trial        → décrémente trial_ai_uses_remaining sur users (global 30 requêtes, sans limite de temps)
 *   pro          → monthly_ai_queries_used via feature_flags (reset mensuel)
 *   enterprise   → toujours autorisé (illimité)
 *   free         → jamais autorisé (no AI)
 *   expired_trial→ jamais autorisé
 */

import { db } from '@/lib/db/postgres'
import type { PlanType } from '@/lib/plans/plan-config'
import { PLAN_LIMITS } from '@/lib/plans/plan-config'

export interface QuotaCheckResult {
  allowed: boolean
  /** Utilisations consommées (total pour trial, mensuel pour pro) */
  used: number
  /** Limite totale */
  limit: number
  /** Utilisations restantes */
  remaining: number
  /** Pour trial : utilisations restantes totales */
  trialUsesRemaining?: number
  /** Date de reset (pro/enterprise) */
  resetDate?: string
  /** Raison du refus */
  reason?: 'no_ai' | 'trial_exhausted' | 'monthly_quota' | 'expired'
}

/**
 * Vérifie le quota IA de l'utilisateur et l'incrémente si autorisé.
 * Appelé en début de chaque requête /api/chat.
 */
export async function checkAndConsumeAiQuota(userId: string): Promise<QuotaCheckResult> {
  // Récupérer le plan et les infos trial de l'utilisateur
  const userResult = await db.query(
    `SELECT plan, trial_ai_uses_remaining, trial_started_at
     FROM users WHERE id = $1`,
    [userId]
  )

  const user = userResult.rows[0]
  if (!user) {
    return { allowed: false, used: 0, limit: 0, remaining: 0, reason: 'expired' }
  }

  const plan: PlanType = user.plan || 'free'
  const limits = PLAN_LIMITS[plan]

  // ─── Plan enterprise : illimité ─────────────────────────────────────────
  if (plan === 'enterprise') {
    return { allowed: true, used: 0, limit: Infinity, remaining: Infinity }
  }

  // ─── Plans sans IA ──────────────────────────────────────────────────────
  if (!limits.hasAi) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
      reason: plan === 'expired_trial' ? 'expired' : 'no_ai',
    }
  }

  // ─── Plan trial : quota global 30 utilisations ──────────────────────────
  if (plan === 'trial') {
    const remaining: number = user.trial_ai_uses_remaining ?? limits.aiUsesTotal!
    const total = limits.aiUsesTotal!

    if (remaining <= 0) {
      return {
        allowed: false,
        used: total,
        limit: total,
        remaining: 0,
        trialUsesRemaining: 0,
        reason: 'trial_exhausted',
      }
    }

    // Décrémenter atomiquement
    await db.query(
      `UPDATE users SET trial_ai_uses_remaining = GREATEST(trial_ai_uses_remaining - 1, 0)
       WHERE id = $1`,
      [userId]
    )

    return {
      allowed: true,
      used: total - remaining + 1,
      limit: total,
      remaining: remaining - 1,
      trialUsesRemaining: remaining - 1,
    }
  }

  // ─── Plan pro (Solo) : quota mensuel via feature_flags ──────────────────
  const monthlyLimit = limits.aiUsesPerMonth!
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const result = await db.query(
    `INSERT INTO feature_flags (user_id, monthly_ai_queries_used, monthly_ai_queries_limit, quota_reset_date)
     VALUES ($1, 1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       monthly_ai_queries_used = CASE
         WHEN feature_flags.quota_reset_date < $3 THEN 1
         ELSE feature_flags.monthly_ai_queries_used + 1
       END,
       monthly_ai_queries_limit = $2,
       quota_reset_date = CASE
         WHEN feature_flags.quota_reset_date < $3 THEN $3
         ELSE feature_flags.quota_reset_date
       END
     RETURNING monthly_ai_queries_limit, monthly_ai_queries_used, quota_reset_date`,
    [userId, monthlyLimit, currentMonthStart.toISOString()]
  )

  const flags = result.rows[0]
  const used: number = flags.monthly_ai_queries_used
  const limit: number = flags.monthly_ai_queries_limit
  const resetDate = new Date(flags.quota_reset_date)
  const next = new Date(resetDate)
  next.setMonth(next.getMonth() + 1)
  const resetDateStr = next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

  if (used > limit) {
    return {
      allowed: false,
      used: used - 1,
      limit,
      remaining: 0,
      resetDate: resetDateStr,
      reason: 'monthly_quota',
    }
  }

  return {
    allowed: true,
    used,
    limit,
    remaining: limit - used,
    resetDate: resetDateStr,
  }
}

/**
 * Retourne les infos de quota actuelles SANS incrémenter.
 * Utilisé pour afficher le compteur dans le bandeau trial.
 */
export async function getAiQuotaStatus(userId: string): Promise<{
  plan: PlanType
  trialUsesRemaining: number | null
  trialDaysRemaining: number | null
  monthlyUsed: number | null
  monthlyLimit: number | null
}> {
  const result = await db.query(
    `SELECT
       u.plan,
       u.trial_ai_uses_remaining,
       u.trial_started_at,
       ff.monthly_ai_queries_used,
       ff.monthly_ai_queries_limit,
       ff.quota_reset_date
     FROM users u
     LEFT JOIN feature_flags ff ON ff.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  )

  const row = result.rows[0]
  if (!row) {
    return { plan: 'free', trialUsesRemaining: null, trialDaysRemaining: null, monthlyUsed: null, monthlyLimit: null }
  }

  const plan: PlanType = row.plan || 'free'

  return {
    plan,
    trialUsesRemaining: plan === 'trial' ? (row.trial_ai_uses_remaining ?? 30) : null,
    trialDaysRemaining: null, // Le trial n'a plus de limite temporelle
    monthlyUsed: (plan === 'pro' || plan === 'free') ? (row.monthly_ai_queries_used ?? 0) : null,
    monthlyLimit: (plan === 'pro' || plan === 'free') ? (row.monthly_ai_queries_limit ?? PLAN_LIMITS[plan]?.aiUsesPerMonth ?? 0) : null,
  }
}
