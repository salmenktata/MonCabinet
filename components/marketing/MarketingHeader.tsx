'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogoHorizontal } from '@/components/ui/Logo'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

export function MarketingHeader() {
  const t = useTranslations('marketing.nav')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const navLinks = [
    { href: '/fonctionnalites', label: t('features') },
    { href: '/tarification', label: t('pricing') },
    { href: '/a-propos', label: t('about') },
    { href: '/contact', label: t('contact') },
  ]

  const isActive = (href: string) => pathname === href

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        {/* Logo */}
        <Link href="/">
          <LogoHorizontal size="md" variant="juridique" showTag={false} animate={false} />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                isActive(link.href) ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            {t('login')}
          </Link>
          <Link href="/register" className="btn-premium px-4 py-2 rounded-lg text-sm font-semibold text-white">
            {t('register')}
          </Link>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden flex items-center gap-2">
          <LanguageSwitcher />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="p-2 text-slate-300 hover:text-white" aria-label={t('menu')}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-slate-950 border-slate-800 w-72">
              <div className="flex flex-col gap-6 mt-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`text-lg font-medium transition-colors ${
                      isActive(link.href) ? 'text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <hr className="border-slate-800" />
                <Link href="/login" onClick={() => setOpen(false)} className="text-lg font-medium text-slate-300 hover:text-white">
                  {t('login')}
                </Link>
                <Link href="/register" onClick={() => setOpen(false)} className="btn-premium px-6 py-3 rounded-xl text-center font-semibold text-white">
                  {t('register')}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
