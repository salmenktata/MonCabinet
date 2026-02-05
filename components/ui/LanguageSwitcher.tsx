'use client'

import { useTransition } from 'react'
import { useLocale } from 'next-intl'
import { locales, localeNames, type Locale } from '@/i18n.config'
import { setUserLocale } from '@/lib/i18n/locale'

export default function LanguageSwitcher() {
  const locale = useLocale() as Locale
  const [isPending, startTransition] = useTransition()

  const handleChange = (newLocale: Locale) => {
    startTransition(() => {
      setUserLocale(newLocale)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleChange(loc)}
          disabled={isPending || loc === locale}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            loc === locale
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={localeNames[loc]}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
