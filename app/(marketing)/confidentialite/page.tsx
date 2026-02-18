import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

export default async function ConfidentialitePage() {
  const t = await getTranslations('marketing.privacy')

  const sections = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{t('title')}</h1>
        <p className="text-sm text-slate-400 mb-12">{t('lastUpdated')}</p>

        <div className="prose prose-invert max-w-none space-y-8">
          {sections.map((s) => (
            <div key={s}>
              <h2 className="text-xl font-semibold text-white mb-3">{t(`sections.${s}.title`)}</h2>
              <p className="text-slate-300 leading-relaxed">{t(`sections.${s}.content`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
