/**
 * Configuration centralisée des plans et limites Qadhya
 *
 * Plans :
 *   trial        → Essai gratuit (30 requêtes IA totales, sans limite de temps)
 *   pro          → Solo (affiché "Solo" en UI) — 200 req IA/mois
 *   enterprise   → Cabinet — IA illimitée
 *   free         → Ancien plan gratuit (héritage, no IA)
 *   expired_trial→ Essai expiré manuellement (accès en lecture seule, pas d'IA)
 */

export type PlanType = 'free' | 'trial' | 'pro' | 'enterprise' | 'expired_trial'

export interface PlanLimits {
  /** Nombre max de dossiers (Infinity = illimité) */
  maxDossiers: number
  /** Nombre max de clients (Infinity = illimité) */
  maxClients: number
  /** Stockage max en Mo (Infinity = illimité) */
  storageMb: number
  /** Accès à l'IA */
  hasAi: boolean
  /** Requêtes IA par mois (pour pro/enterprise). null = non applicable */
  aiUsesPerMonth: number | null
  /** Requêtes IA totales sur la période d'essai (pour trial). null = non applicable */
  aiUsesTotal: number | null
  /** Durée de la période d'essai en jours (null si pas de trial) */
  trialDays: number | null
  /** Affichage du nom du plan en UI */
  displayName: string
  /** Nombre max d'utilisateurs par cabinet */
  maxUsers: number
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    maxDossiers: 10,
    maxClients: 20,
    storageMb: 500,
    hasAi: true,
    aiUsesPerMonth: null,
    aiUsesTotal: 30,
    trialDays: null,
    displayName: 'Essai gratuit',
    maxUsers: 1,
  },
  pro: {
    maxDossiers: Infinity,
    maxClients: Infinity,
    storageMb: 10_000,
    hasAi: true,
    aiUsesPerMonth: 200,
    aiUsesTotal: null,
    trialDays: null,
    displayName: 'Pro',
    maxUsers: 1,
  },
  enterprise: {
    maxDossiers: Infinity,
    maxClients: Infinity,
    storageMb: Infinity,
    hasAi: true,
    aiUsesPerMonth: Infinity,
    aiUsesTotal: null,
    trialDays: null,
    displayName: 'Expert',
    maxUsers: 10,
  },
  free: {
    maxDossiers: 5,
    maxClients: 10,
    storageMb: 100,
    hasAi: true,
    aiUsesPerMonth: 5,
    aiUsesTotal: null,
    trialDays: null,
    displayName: 'Gratuit',
    maxUsers: 1,
  },
  expired_trial: {
    maxDossiers: 0,
    maxClients: 0,
    storageMb: 0,
    hasAi: false,
    aiUsesPerMonth: 0,
    aiUsesTotal: null,
    trialDays: null,
    displayName: 'Essai expiré',
    maxUsers: 0,
  },
}

/** Prix mensuels en DT */
export const PLAN_PRICES = {
  trial: { monthly: 0, annual: 0 },
  pro: { monthly: 89, annual: 71 },    // 71 = 89 * 0.80 (arrondi)
  enterprise: { monthly: 229, annual: 183 }, // 183 = 229 * 0.80 (arrondi)
  free: { monthly: 0, annual: 0 },
  expired_trial: { monthly: 0, annual: 0 },
}

/**
 * Vérifie si un plan est actif (pas expiré, pas free sans IA)
 */
export function isPlanActive(plan: PlanType): boolean {
  return plan !== 'expired_trial'
}

/**
 * Vérifie si l'utilisateur peut accéder à l'IA selon son plan
 */
export function canUseAi(plan: PlanType): boolean {
  return PLAN_LIMITS[plan]?.hasAi === true
}

/**
 * Retourne le nombre de jours restants pour un trial.
 * Toujours null — le trial n'a plus de limite temporelle.
 * @deprecated La limite de jours a été supprimée. Fonction conservée pour compatibilité.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTrialDaysRemaining(_trialStartedAt: Date | null): number | null {
  return null
}

/**
 * Retourne le niveau d'alerte pour l'essai
 * - 'safe'    : > 10 utilisations restantes
 * - 'warning' : 4-10 utilisations restantes
 * - 'danger'  : 1-3 utilisations restantes
 * - 'expired' : 0 utilisations restantes
 */
export function getTrialAlertLevel(
  usesRemaining: number
): 'safe' | 'warning' | 'danger' | 'expired' {
  if (usesRemaining <= 0) return 'expired'
  if (usesRemaining <= 3) return 'danger'
  if (usesRemaining <= 10) return 'warning'
  return 'safe'
}
