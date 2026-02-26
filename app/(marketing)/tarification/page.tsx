'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { PricingCard } from '@/components/marketing/PricingCard'
import { FaqAccordion } from '@/components/marketing/FaqAccordion'
import { TrustBadges } from '@/components/marketing/TrustBadges'

export default function TarificationPage() {
  const t = useTranslations('marketing')
  const [annual, setAnnual] = useState(true)

  const faqItems = Array.from({ length: 8 }, (_, i) => ({
    question: t(`faq.q${i + 1}.question`),
    answer: t(`faq.q${i + 1}.answer`),
  }))

  const trialFeatures: string[] = [
    t('pricing.trial.features.0'),
    t('pricing.trial.features.1'),
    t('pricing.trial.features.2'),
    t('pricing.trial.features.3'),
    t('pricing.trial.features.4'),
    t('pricing.trial.features.5'),
  ]
  const proFeatures: string[] = [
    t('pricing.pro.features.0'),
    t('pricing.pro.features.1'),
    t('pricing.pro.features.2'),
    t('pricing.pro.features.3'),
    t('pricing.pro.features.4'),
    t('pricing.pro.features.5'),
  ]
  const cabinetFeatures: string[] = [
    t('pricing.cabinet.features.0'),
    t('pricing.cabinet.features.1'),
    t('pricing.cabinet.features.2'),
    t('pricing.cabinet.features.3'),
    t('pricing.cabinet.features.4'),
    t('pricing.cabinet.features.5'),
    t('pricing.cabinet.features.6'),
  ]

  return (
    <>
      {/* Hero */}
      <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeading
            badge={t('pricing.badge')}
            title={t('pricing.title')}
            subtitle={t('pricing.subtitle')}
          />

          {/* Toggle mensuel / annuel */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-medium ${!annual ? 'text-white' : 'text-slate-400'}`}>
              {t('pricing.monthly')}
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${annual ? 'bg-blue-600' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${annual ? 'translate-x-7' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-white' : 'text-slate-400'}`}>
              {t('pricing.annual')}
            </span>
            {annual && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                {t('pricing.annualSave')}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 items-start">
          {/* Essai gratuit */}
          <PricingCard
            name={t('pricing.trial.name')}
            description={t('pricing.trial.description')}
            price={t('pricing.free')}
            currency=""
            perMonth=""
            features={trialFeatures}
            cta={t('pricing.ctaTrial')}
            ctaHref="/acces-anticipe"
            free
            badge={t('pricing.trial.badge')}
          />

          {/* Solo (Pro) */}
          <PricingCard
            name={t('pricing.pro.name')}
            description={t('pricing.pro.description')}
            price={annual ? t('pricing.pro.priceAnnual') : t('pricing.pro.priceMonthly')}
            currency={t('pricing.currency')}
            perMonth={t('pricing.perMonth')}
            features={proFeatures}
            cta={t('pricing.ctaPro')}
            ctaHref="/acces-anticipe"
            popular
          />

          {/* Cabinet */}
          <PricingCard
            name={t('pricing.cabinet.name')}
            description={t('pricing.cabinet.description')}
            price={annual ? t('pricing.cabinet.priceAnnual') : t('pricing.cabinet.priceMonthly')}
            currency={t('pricing.currency')}
            perMonth={t('pricing.perMonth')}
            features={cabinetFeatures}
            cta={t('pricing.ctaCabinet')}
            ctaHref="/contact"
          />
        </div>

        {/* Note sous les cartes */}
        <p className="text-center text-sm text-slate-400 mt-6">
          {t('pricing.trialNote')}
        </p>
      </section>

      {/* Comparison Table */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">{t('pricing.comparison.title')}</h3>
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-slate-400 font-medium">{t('pricing.comparison.feature')}</th>
                  <th className="p-4 text-white font-medium text-center">{t('pricing.trial.name')}</th>
                  <th className="p-4 text-blue-400 font-medium text-center">{t('pricing.pro.name')}</th>
                  <th className="p-4 text-purple-400 font-medium text-center">{t('pricing.cabinet.name')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    key: 'dossiers',
                    trial: t('pricing.comparison.limited10'),
                    pro: t('pricing.comparison.unlimited'),
                    cabinet: t('pricing.comparison.unlimited'),
                  },
                  {
                    key: 'clients',
                    trial: t('pricing.comparison.limited20'),
                    pro: t('pricing.comparison.unlimited'),
                    cabinet: t('pricing.comparison.unlimited'),
                  },
                  {
                    key: 'users',
                    trial: t('pricing.comparison.limited1'),
                    pro: t('pricing.comparison.limited1'),
                    cabinet: t('pricing.comparison.upTo10'),
                  },
                  { key: 'delais', trial: '✓', pro: '✓', cabinet: '✓' },
                  {
                    key: 'facturation',
                    trial: t('pricing.comparison.basic'),
                    pro: t('pricing.comparison.full'),
                    cabinet: t('pricing.comparison.full'),
                  },
                  { key: 'templates', trial: '—', pro: '✓', cabinet: '✓' },
                  { key: 'ia', trial: '✓', pro: '✓', cabinet: '✓' },
                  {
                    key: 'aiQuota',
                    trial: t('pricing.comparison.req30'),
                    pro: t('pricing.comparison.req200'),
                    cabinet: t('pricing.comparison.unlimited'),
                  },
                  {
                    key: 'stockage',
                    trial: t('pricing.comparison.mb500'),
                    pro: t('pricing.comparison.gb10'),
                    cabinet: t('pricing.comparison.unlimited'),
                  },
                  {
                    key: 'support',
                    trial: t('pricing.comparison.email'),
                    pro: t('pricing.comparison.emailChat'),
                    cabinet: t('pricing.comparison.dedicated'),
                  },
                  { key: 'sla', trial: '—', pro: '—', cabinet: '✓' },
                  {
                    key: 'formation',
                    trial: '—',
                    pro: '—',
                    cabinet: t('pricing.comparison.included'),
                  },
                ].map((row) => (
                  <tr key={row.key} className="border-b border-white/5">
                    <td className="p-4 text-slate-300">{t(`pricing.comparison.${row.key}`)}</td>
                    <td className="p-4 text-center text-slate-400">{row.trial}</td>
                    <td className="p-4 text-center text-white">{row.pro}</td>
                    <td className="p-4 text-center text-slate-300">{row.cabinet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <SectionHeading title={t('faq.title')} />
          <div className="mt-8">
            <FaqAccordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Guarantee + CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card rounded-2xl p-8 mb-8">
            <p className="text-emerald-400 font-medium">{t('pricing.guarantee')}</p>
          </div>
          <TrustBadges ssl={t('trust.ssl')} tunisia={t('trust.tunisia')} barreau={t('trust.barreau')} support={t('trust.support')} />
          <div className="mt-12">
            <Link href="/acces-anticipe" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white">
              {t('pricing.ctaTrial')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
