import { getTranslations } from 'next-intl/server'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { ContactForm } from '@/components/marketing/ContactForm'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const t = await getTranslations('marketing.contact')

  return (
    <>
      {/* Hero */}
      <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeading badge={t('badge')} title={t('title')} subtitle={t('subtitle')} />
        </div>
      </section>

      {/* Form + Info */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Form */}
          <div className="glass-card rounded-2xl p-8">
            <ContactForm />
          </div>

          {/* Info */}
          <div className="space-y-6">
            {(['responseTime', 'availability', 'support'] as const).map((key) => (
              <div key={key} className="glass-card rounded-2xl p-6">
                <h4 className="font-semibold text-white mb-1">{t(`info.${key}`)}</h4>
                <p className="text-sm text-slate-400">{t(`info.${key}Value`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
