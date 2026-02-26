import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Logo } from '@/components/ui/Logo'
import { BackgroundBlobs } from '@/components/marketing/BackgroundBlobs'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { StatItem } from '@/components/marketing/StatItem'
import { TestimonialCard } from '@/components/marketing/TestimonialCard'
import { TrustBadges } from '@/components/marketing/TrustBadges'

export const dynamic = 'force-dynamic'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CurrencyIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

export default async function HomePage() {
  const t = await getTranslations('marketing')

  return (
    <div className="dark min-h-screen bg-slate-950 text-white overflow-hidden">
      <BackgroundBlobs />
      <MarketingHeader />

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6 animate-fade-in-up">
            {t('hero.badge')}
          </div>

          {/* Logo */}
          <div className="mb-8 animate-fade-in-up stagger-1">
            <Logo size="xl" variant="juridique" showTag={true} animate={true} />
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 animate-fade-in-up stagger-2">
            {t('hero.title')}
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-slate-300 max-w-3xl mx-auto mb-8 animate-fade-in-up stagger-3">
            {t('hero.subtitle')}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6 animate-fade-in-up stagger-4">
            <Link href="/acces-anticipe" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white animate-glow">
              {t('hero.cta')}
            </Link>
            <Link href="/fonctionnalites" className="glass px-8 py-4 rounded-xl text-lg font-semibold text-white hover:bg-white/10 transition-all">
              {t('hero.ctaSecondary')}
            </Link>
          </div>

          {/* Trust line */}
          <p className="text-sm text-slate-400 mb-4 animate-fade-in-up stagger-5">
            {t('hero.trustLine')}
          </p>
          <p className="text-sm text-emerald-400 font-medium animate-fade-in-up stagger-5">
            {t('hero.socialProof')}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto mt-16">
            <StatItem value={t('stats.lawyers')} label={t('stats.lawyersLabel')} delay="stagger-4" />
            <StatItem value={t('stats.cases')} label={t('stats.casesLabel')} delay="stagger-5" />
            <StatItem value={t('stats.uptime')} label={t('stats.uptimeLabel')} delay="stagger-6" />
            <StatItem value={t('stats.support')} label={t('stats.supportLabel')} delay="stagger-6" />
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge={t('problem.badge')}
            title={t('problem.title')}
            subtitle={t('problem.subtitle')}
          />
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {(['pain1', 'pain2', 'pain3'] as const).map((pain, i) => (
              <div key={pain} className={`glass-card rounded-2xl p-6 border-red-500/20 animate-fade-in-up stagger-${i + 1}`}>
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 mb-4">
                  <AlertIcon />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{t(`problem.${pain}.title`)}</h3>
                <p className="text-sm text-slate-400">{t(`problem.${pain}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge={t('features.badge')}
            title={t('features.title')}
            subtitle={t('features.subtitle')}
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            <FeatureCard icon={<FolderIcon />} title={t('features.dossiers.title')} description={t('features.dossiers.description')} delay="stagger-1" />
            <FeatureCard icon={<ClockIcon />} title={t('features.delais.title')} description={t('features.delais.description')} delay="stagger-2" accent="amber" />
            <FeatureCard icon={<CurrencyIcon />} title={t('features.facturation.title')} description={t('features.facturation.description')} delay="stagger-3" accent="emerald" />
            <FeatureCard icon={<SparkleIcon />} title={t('features.ia.title')} description={t('features.ia.description')} delay="stagger-4" accent="purple" />
          </div>
          <div className="text-center mt-8">
            <Link href="/fonctionnalites" className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
              {t('features.viewAll')} &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* AI Highlight */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12 border-blue-500/20">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-4">
                  {t('aiHighlight.badge')}
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">{t('aiHighlight.title')}</h2>
                <p className="text-slate-300 mb-6">{t('aiHighlight.subtitle')}</p>
                <ul className="space-y-3">
                  {(['feature1', 'feature2', 'feature3', 'feature4'] as const).map((f) => (
                    <li key={f} className="flex items-center gap-3 text-slate-300">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-4 h-4 text-purple-400" />
                      </div>
                      <span>{t(`aiHighlight.${f}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Chat mockup */}
              <div className="glass rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                    <SparkleIcon />
                  </div>
                  <span className="font-semibold text-white">Qadhya IA</span>
                </div>
                <div className="glass rounded-xl p-3 text-sm text-slate-300">
                  ما هي شروط الطعن بالاستئناف في القانون التونسي؟
                </div>
                <div className="glass rounded-xl p-3 text-sm text-slate-300 border-l-2 border-purple-500">
                  وفقاً للفصل 130 من مجلة المرافعات المدنية والتجارية، أجل الاستئناف هو 20 يوماً من تاريخ الإعلام بالحكم...
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits + Trust */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <SectionHeading badge={t('benefits.badge')} title={t('benefits.title')} center={false} />
                <ul className="space-y-4 mt-6">
                  {(['benefit1', 'benefit2', 'benefit3', 'benefit4', 'benefit5', 'benefit6'] as const).map((b) => (
                    <li key={b} className="flex items-center gap-3 text-slate-300">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span>{t(`benefits.${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Testimonial */}
              <TestimonialCard
                quote={t('testimonials.t1.quote')}
                author={t('testimonials.t1.author')}
                role={t('testimonials.t1.role')}
                initial="S"
              />
            </div>
          </div>
          <div className="mt-12">
            <TrustBadges ssl={t('trust.ssl')} tunisia={t('trust.tunisia')} barreau={t('trust.barreau')} support={t('trust.support')} />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge={t('testimonials.badge')}
            title={t('testimonials.title')}
            subtitle={t('testimonials.subtitle')}
          />
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <TestimonialCard quote={t('testimonials.t1.quote')} author={t('testimonials.t1.author')} role={t('testimonials.t1.role')} initial="S" delay="stagger-1" />
            <TestimonialCard quote={t('testimonials.t2.quote')} author={t('testimonials.t2.author')} role={t('testimonials.t2.role')} initial="K" delay="stagger-2" />
            <TestimonialCard quote={t('testimonials.t3.quote')} author={t('testimonials.t3.author')} role={t('testimonials.t3.role')} initial="L" delay="stagger-3" />
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeading
            badge={t('pricingTeaser.badge')}
            title={t('pricingTeaser.title')}
            subtitle={t('pricingTeaser.subtitle')}
          />
          <div className="mt-8">
            <Link href="/tarification" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white">
              {t('pricingTeaser.cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            {t('ctaFinal.title')}
          </h2>
          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">
            {t('ctaFinal.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/acces-anticipe" className="btn-premium px-8 py-4 rounded-xl text-lg font-semibold text-white">
              {t('ctaFinal.cta')}
            </Link>
            <Link href="/contact" className="glass px-8 py-4 rounded-xl text-lg font-semibold text-white border border-white/30 hover:bg-white/10 transition-all">
              {t('ctaFinal.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
