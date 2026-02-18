import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LogoHorizontal } from '@/components/ui/Logo'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

export async function MarketingFooter() {
  const t = await getTranslations('marketing.footer')

  return (
    <footer className="relative z-10 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <LogoHorizontal size="sm" variant="juridique" showTag={false} animate={false} />
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">
              {t('tagline')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">{t('product')}</h3>
            <ul className="space-y-3">
              <li><Link href="/fonctionnalites" className="text-sm text-slate-400 hover:text-white transition-colors">{t('features')}</Link></li>
              <li><Link href="/tarification" className="text-sm text-slate-400 hover:text-white transition-colors">{t('pricing')}</Link></li>
              <li><Link href="/register" className="text-sm text-slate-400 hover:text-white transition-colors">{t('createAccount')}</Link></li>
              <li><Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">{t('login')}</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">{t('company')}</h3>
            <ul className="space-y-3">
              <li><Link href="/a-propos" className="text-sm text-slate-400 hover:text-white transition-colors">{t('about')}</Link></li>
              <li><Link href="/contact" className="text-sm text-slate-400 hover:text-white transition-colors">{t('contact')}</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">{t('legal')}</h3>
            <ul className="space-y-3">
              <li><Link href="/conditions" className="text-sm text-slate-400 hover:text-white transition-colors">{t('terms')}</Link></li>
              <li><Link href="/confidentialite" className="text-sm text-slate-400 hover:text-white transition-colors">{t('privacy')}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-400">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-400">
              {t('developedBy')}{' '}
              <a href="https://quelyos.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">
                quelyos.com
              </a>
            </p>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  )
}
