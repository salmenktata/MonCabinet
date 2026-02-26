/**
 * TrialBanner — Bandeau persistant affiché en haut du dashboard pour les utilisateurs en essai
 *
 * Affiche :
 * - Utilisation IA restante (sur 30)
 * - CTA vers /upgrade
 *
 * Niveaux d'alerte :
 * - safe    : vert discret
 * - warning : jaune (≤10 req IA restantes)
 * - danger  : rouge (≤3 req restantes)
 * - expired : rouge + CTA upgrade (quand req épuisées ou plan expired_trial)
 */

import Link from 'next/link'
import { getAiQuotaStatus } from '@/lib/plans/check-ai-quota'
import { getSession } from '@/lib/auth/session'
import { getTrialAlertLevel } from '@/lib/plans/plan-config'

export async function TrialBanner() {
  const session = await getSession()
  if (!session?.user?.id) return null

  const status = await getAiQuotaStatus(session.user.id)

  // N'afficher que pour les utilisateurs en trial ou trial expiré
  if (status.plan !== 'trial' && status.plan !== 'expired_trial') return null

  const usesRemaining = status.trialUsesRemaining ?? 0
  const alertLevel = status.plan === 'expired_trial' ? 'expired' : getTrialAlertLevel(usesRemaining)
  const isExpired = alertLevel === 'expired' || status.plan === 'expired_trial'

  // Couleurs selon niveau d'alerte
  const bannerClass = {
    safe: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-100',
    warning: 'bg-yellow-900/40 border-yellow-700/50 text-yellow-100',
    danger: 'bg-orange-900/40 border-orange-700/50 text-orange-100',
    expired: 'bg-red-900/60 border-red-600/70 text-red-100',
  }[alertLevel]

  const ctaClass = {
    safe: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-500 text-white',
    danger: 'bg-orange-600 hover:bg-orange-500 text-white',
    expired: 'bg-red-600 hover:bg-red-500 text-white',
  }[alertLevel]

  if (isExpired) {
    const expiredMsg = status.plan === 'expired_trial'
      ? 'Votre accès a été suspendu.'
      : 'Vos requêtes IA sont épuisées.'
    return (
      <div className={`w-full border-b px-4 py-2 flex items-center justify-between gap-4 ${bannerClass}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{expiredMsg}</span>
          <span className="text-xs opacity-80">Passez au plan Pro pour continuer à utiliser Qadhya IA.</span>
        </div>
        <Link
          href="/upgrade"
          className={`shrink-0 text-xs font-bold px-4 py-1.5 rounded-lg transition-colors ${ctaClass}`}
        >
          Voir les plans
        </Link>
      </div>
    )
  }

  return (
    <div className={`w-full border-b px-4 py-2 flex items-center justify-between gap-4 ${bannerClass}`}>
      <div className="flex items-center gap-4 text-sm">
        {/* Utilisations IA */}
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="font-medium">{usesRemaining}/30</span>
          <span className="opacity-70">requêtes IA</span>
        </span>

        {/* Alerte contextuelle */}
        {alertLevel === 'danger' && (
          <span className="text-xs font-semibold opacity-90">
            Plus que {usesRemaining} utilisation{usesRemaining > 1 ? 's' : ''} !
          </span>
        )}
      </div>

      <Link
        href="/upgrade"
        className={`shrink-0 text-xs font-bold px-4 py-1.5 rounded-lg transition-colors ${ctaClass}`}
      >
        Passer à Pro — 89 DT/mois
      </Link>
    </div>
  )
}
