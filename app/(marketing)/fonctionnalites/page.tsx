import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { TrustBadges } from '@/components/marketing/TrustBadges'

export const dynamic = 'force-dynamic'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function FeatureSection({
  title,
  subtitle,
  description,
  features,
  reverse,
  accent,
}: {
  title: string
  subtitle: string
  description: string
  features: string[]
  reverse?: boolean
  accent: string
}) {
  return (
    <div className={`grid md:grid-cols-2 gap-12 items-center ${reverse ? 'md:[direction:rtl]' : ''}`}>
      <div className={reverse ? 'md:[direction:ltr]' : ''}>
        <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
        <p className={`text-sm font-medium ${accent} mb-4`}>{subtitle}</p>
        <p className="text-slate-300 mb-6 leading-relaxed">{description}</p>
        <ul className="space-y-3">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-3 text-slate-300">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <CheckIcon className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`glass-card rounded-2xl p-8 ${reverse ? 'md:[direction:ltr]' : ''}`}>
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${accent === 'text-blue-400' ? 'from-blue-500/20 to-blue-600/20' : accent === 'text-amber-400' ? 'from-amber-500/20 to-amber-600/20' : accent === 'text-emerald-400' ? 'from-emerald-500/20 to-emerald-600/20' : 'from-purple-500/20 to-purple-600/20'} flex items-center justify-center mb-6`}>
          <span className="text-3xl">
            {accent === 'text-blue-400' ? '📂' : accent === 'text-amber-400' ? '⏰' : accent === 'text-emerald-400' ? '💰' : accent === 'text-purple-400' ? '🤖' : accent === 'text-indigo-400' ? '📄' : '👥'}
          </span>
        </div>
        <div className="space-y-3">
          {features.slice(0, 3).map((f, i) => (
            <div key={i} className="glass rounded-lg p-3 text-sm text-slate-300">{f}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function FonctionnalitesPage() {
  const t = await getTranslations('marketing.featuresPage')
  const tM = await getTranslations('marketing')

  const sections = [
    { key: 'dossiers', accent: 'text-blue-400', reverse: false },
    { key: 'delais', accent: 'text-amber-400', reverse: true },
    { key: 'facturation', accent: 'text-emerald-400', reverse: false },
    { key: 'ia', accent: 'text-purple-400', reverse: true },
    { key: 'documents', accent: 'text-indigo-400', reverse: false },
    { key: 'clients', accent: 'text-cyan-400', reverse: true },
  ] as const

  return (
    <>
      {/* Hero */}
      <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeading badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
        </div>
      </section>

      {/* Feature Sections */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-24">
          {sections.map((section) => (
            <FeatureSection
              key={section.key}
              title={t(`${section.key}.title`)}
              subtitle={t(`${section.key}.subtitle`)}
              description={t(`${section.key}.description`)}
              features={[t(`${section.key}.f1`), t(`${section.key}.f2`), t(`${section.key}.f3`), t(`${section.key}.f4`)]}
              reverse={section.reverse}
              accent={section.accent}
            />
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge={t('security.badge')}
            title={t('security.title')}
            subtitle={t('security.subtitle')}
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {(['s1', 's2', 's3', 's4'] as const).map((s, i) => (
              <div key={s} className={`glass-card rounded-2xl p-6 animate-fade-in-up stagger-${i + 1}`}>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-white mb-2">{t(`security.${s}.title`)}</h4>
                <p className="text-sm text-slate-400">{t(`security.${s}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <TrustBadges ssl={tM('trust.ssl')} tunisia={tM('trust.tunisia')} barreau={tM('trust.barreau')} support={tM('trust.support')} />
          <div className="mt-8">
            <Link href="/tarification" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white">
              {tM('pricingTeaser.cta')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
