import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UpgradeRequestButton } from '@/components/plans/UpgradeRequestButton'
import { PromoCodeSection } from '@/components/plans/PromoCodeSection'

export const dynamic = 'force-dynamic'

interface PlanCardProps {
  name: string
  price: string
  priceNote: string
  description: string
  features: { text: string; included: boolean }[]
  plan: 'solo' | 'cabinet'
  highlighted?: boolean
  badge?: string
  alreadyRequested?: boolean
}

function PlanCard({ name, price, priceNote, description, features, plan, highlighted, badge, alreadyRequested }: PlanCardProps) {
  return (
    <div className={`relative rounded-2xl p-8 flex flex-col border ${
      highlighted
        ? 'bg-blue-900/20 border-blue-500/50 ring-2 ring-blue-500'
        : 'bg-slate-800/50 border-slate-700'
    }`}>
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
          {badge}
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-white">{price}</span>
          <span className="text-slate-400 text-sm">{priceNote}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className={`flex items-start gap-2 text-sm ${f.included ? 'text-slate-200' : 'text-slate-500'}`}>
            {f.included ? (
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{f.text}</span>
          </li>
        ))}
      </ul>

      <UpgradeRequestButton plan={plan} highlighted={highlighted} alreadyRequested={alreadyRequested} />
    </div>
  )
}

export default async function UpgradePage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const t = await getTranslations('upgrade')

  const result = await query(
    `SELECT plan, trial_ai_uses_remaining, upgrade_requested_plan FROM users WHERE id = $1`,
    [session.user.id]
  )
  const user = result.rows[0]
  const plan = user?.plan || 'free'
  const trialUsesLeft = user?.trial_ai_uses_remaining ?? 0
  const isExpired = plan === 'expired_trial' || (plan === 'trial' && trialUsesLeft === 0)
  const isPaid = plan === 'pro' || plan === 'enterprise'
  const requestedPlan = user?.upgrade_requested_plan as string | null

  if (isPaid) redirect('/dashboard')

  const soloFeatures = [
    { text: t('features.unlimitedDossiers'), included: true },
    { text: t('features.unlimitedClients'), included: true },
    { text: t('features.ai200'), included: true },
    { text: t('features.legalChat'), included: true },
    { text: t('features.autoStructure'), included: true },
    { text: t('features.docTemplates'), included: true },
    { text: t('features.fullBilling'), included: true },
    { text: t('features.storage10'), included: true },
    { text: t('features.supportEmailChat'), included: true },
    { text: t('features.upTo10Users'), included: false },
    { text: t('features.slaGuaranteed'), included: false },
  ]

  const cabinetFeatures = [
    { text: t('features.unlimitedDossiers'), included: true },
    { text: t('features.unlimitedClients'), included: true },
    { text: t('features.unlimitedAI'), included: true },
    { text: t('features.upTo10Users'), included: true },
    { text: t('features.rolesPermissions'), included: true },
    { text: t('features.unlimitedStorage'), included: true },
    { text: t('features.prioritySupport'), included: true },
    { text: t('features.slaGuaranteed'), included: true },
    { text: t('features.trainingIncluded'), included: true },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="text-center">
        {isExpired ? (
          <>
            <Badge className="bg-red-500/20 text-red-400 mb-4">{t('trialExpiredBadge')}</Badge>
            <h1 className="text-3xl font-bold text-white mb-3">
              {t('trialExpiredTitle')}
            </h1>
            <p className="text-slate-400 max-w-lg mx-auto">
              {t('trialExpiredSubtitle')}
            </p>
          </>
        ) : (
          <>
            <Badge className="bg-emerald-500/20 text-emerald-400 mb-4">
              {t('trialActiveBadge', { remaining: trialUsesLeft })}
            </Badge>
            <h1 className="text-3xl font-bold text-white mb-3">
              {t('trialActiveTitle')}
            </h1>
            <p className="text-slate-400 max-w-lg mx-auto">
              {t('trialActiveSubtitle')}
            </p>
          </>
        )}

        {requestedPlan && (
          <div className="mt-4 inline-flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-sm px-4 py-2 rounded-full">
            ✅ {t('requestedPlanNotice', { plan: requestedPlan === 'solo' ? 'Pro' : 'Expert' })}
          </div>
        )}
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <PlanCard
          name="Pro"
          price="89 DT"
          priceNote={t('proPriceNote')}
          description={t('proDescription')}
          features={soloFeatures}
          plan="solo"
          highlighted
          badge={t('mostPopular')}
          alreadyRequested={requestedPlan === 'solo'}
        />
        <PlanCard
          name="Expert"
          price="229 DT"
          priceNote={t('expertPriceNote')}
          description={t('expertDescription')}
          features={cabinetFeatures}
          plan="cabinet"
          alreadyRequested={requestedPlan === 'cabinet'}
        />
      </div>

      {/* Code promo */}
      {!requestedPlan && (
        <PromoCodeSection />
      )}

      {/* Garanties */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: '🔒', label: t('guaranteeData'), sub: t('guaranteeDataSub') },
              { icon: '⚡', label: t('guaranteeActivation'), sub: t('guaranteeActivationSub') },
              { icon: '❌', label: t('guaranteeNoCommit'), sub: t('guaranteeNoCommitSub') },
              { icon: '🏛️', label: t('guaranteeBarreau'), sub: t('guaranteeBarreauSub') },
            ].map((g, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl mb-1">{g.icon}</div>
                <p className="text-white text-sm font-medium">{g.label}</p>
                <p className="text-slate-400 text-xs">{g.sub}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">{t('faqTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { q: t('faqQ1'), a: t('faqA1') },
            { q: t('faqQ2'), a: t('faqA2') },
            { q: t('faqQ3'), a: t('faqA3') },
          ].map((faq, i) => (
            <div key={i} className="border-b border-slate-700 pb-4 last:border-0 last:pb-0">
              <p className="text-white text-sm font-medium mb-1">{faq.q}</p>
              <p className="text-slate-400 text-sm">{faq.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
