'use client'

import { Logo } from '@/components/ui/Logo'
import { useTranslations } from 'next-intl'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

function CheckIcon() {
  return (
    <svg
      className="w-5 h-5 text-emerald-400 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

function SecurityBadge() {
  const t = useTranslations('auth')

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <svg
        className="w-4 h-4 text-emerald-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <span>{t('secureConnection')}</span>
    </div>
  )
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('authLayout')

  const features = [
    t('feature1'),
    t('feature2'),
    t('feature3'),
    t('feature4'),
  ]

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Panneau gauche - Branding (caché sur mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        {/* Gradient de fond */}
        <div className="absolute inset-0 gradient-premium-blue" />

        {/* Pattern décoratif */}
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" className="text-white" />
          </svg>
        </div>

        {/* Cercles décoratifs */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />

        {/* Contenu */}
        <div className="relative z-10 flex flex-col justify-between w-full p-8 lg:p-12 xl:p-16">
          {/* Header avec Logo */}
          <div className="animate-fade-in-up">
            <Logo size="lg" variant="juridique" showTag={true} animate={true} />
          </div>

          {/* Section centrale */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            {/* Tagline */}
            <h2 className="text-3xl xl:text-4xl font-bold text-white mb-8 animate-fade-in-up stagger-1">
              {t('tagline')}
            </h2>

            {/* Liste des features */}
            <ul className="space-y-4 mb-12">
              {features.map((feature, index) => (
                <li
                  key={index}
                  className={`flex items-center gap-3 text-slate-300 animate-fade-in-up stagger-${index + 2}`}
                >
                  <CheckIcon />
                  <span className="text-lg">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6 animate-fade-in-up stagger-6">
              <div className="glass rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{t('stats.lawyers')}</p>
                <p className="text-sm text-slate-400">{t('stats.lawyersLabel')}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{t('stats.cases')}</p>
                <p className="text-sm text-slate-400">{t('stats.casesLabel')}</p>
              </div>
            </div>
          </div>

          {/* Footer - Témoignage */}
          <div className="animate-fade-in">
            <blockquote className="glass rounded-xl p-6">
              <p className="text-slate-300 italic mb-4">
                &ldquo;{t('testimonial.quote')}&rdquo;
              </p>
              <footer className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold">
                  S
                </div>
                <div>
                  <p className="text-white font-medium">{t('testimonial.author')}</p>
                  <p className="text-sm text-slate-400">{t('testimonial.role')}</p>
                </div>
              </footer>
            </blockquote>
          </div>
        </div>
      </div>

      {/* Panneau droit - Formulaire */}
      <div className="flex-1 flex flex-col min-h-screen bg-slate-900 lg:bg-slate-900/50">
        {/* Header mobile avec logo */}
        <div className="lg:hidden p-6 flex justify-center">
          <Logo size="md" variant="juridique" showTag={true} animate={false} />
        </div>

        {/* Contrôles en haut à droite */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Zone du formulaire */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-md animate-scale-in">
            {/* Card glassmorphism */}
            <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-2xl">
              {children}
            </div>

            {/* Badge sécurité */}
            <div className="mt-6 flex justify-center">
              <SecurityBadge />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 text-center">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} MonCabinet. Tous droits réservés. Developed by{' '}
            <a
              href="https://quelyos.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              quelyos.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
