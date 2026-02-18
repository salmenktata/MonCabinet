import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { StatItem } from '@/components/marketing/StatItem'

export const dynamic = 'force-dynamic'

export default async function AProposPage() {
  const t = await getTranslations('marketing.about')
  const tM = await getTranslations('marketing')

  const values = [
    { key: 'v1', icon: '🤝', color: 'from-blue-500/20 to-blue-600/20' },
    { key: 'v2', icon: '🔒', color: 'from-emerald-500/20 to-emerald-600/20' },
    { key: 'v3', icon: '💡', color: 'from-purple-500/20 to-purple-600/20' },
    { key: 'v4', icon: '🇹🇳', color: 'from-red-500/20 to-red-600/20' },
  ] as const

  return (
    <>
      {/* Hero */}
      <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeading badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
        </div>
      </section>

      {/* Mission */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12">
            <h3 className="text-2xl font-bold text-white mb-4">{t('mission.title')}</h3>
            <p className="text-slate-300 leading-relaxed text-lg">{t('mission.description')}</p>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12">
            <h3 className="text-2xl font-bold text-white mb-4">{t('story.title')}</h3>
            <p className="text-slate-300 leading-relaxed text-lg">{t('story.description')}</p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-12">{t('values.title')}</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((v, i) => (
              <div key={v.key} className={`glass-card rounded-2xl p-6 animate-fade-in-up stagger-${i + 1}`}>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${v.color} flex items-center justify-center text-2xl mb-4`}>
                  {v.icon}
                </div>
                <h4 className="font-semibold text-white mb-2">{t(`values.${v.key}.title`)}</h4>
                <p className="text-sm text-slate-400">{t(`values.${v.key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatItem value={tM('stats.lawyers')} label={tM('stats.lawyersLabel')} />
            <StatItem value={tM('stats.cases')} label={tM('stats.casesLabel')} />
            <StatItem value={tM('stats.uptime')} label={tM('stats.uptimeLabel')} />
            <StatItem value={tM('stats.support')} label={tM('stats.supportLabel')} />
          </div>
        </div>
      </section>

      {/* Developed by */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-400">
            {tM('footer.developedBy')}{' '}
            <a href="https://quelyos.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Quelyos
            </a>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-2xl font-bold text-white mb-4">{t('cta.title')}</h3>
          <p className="text-slate-300 mb-8">{t('cta.subtitle')}</p>
          <Link href="/register" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white">
            {t('cta.button')}
          </Link>
        </div>
      </section>
    </>
  )
}
