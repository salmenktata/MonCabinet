import { getLocale, getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'

/**
 * Async Server Component qui fournit le contexte i18n.
 * Séparé du RootLayout pour que celui-ci reste synchrone
 * et que ses métadonnées soient dans le <head> initial (pas streamées).
 */
export async function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
