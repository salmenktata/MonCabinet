import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Arabic } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { StorageCleanupProvider } from '@/components/providers/StorageCleanupProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { WebVitalsReporter } from '@/components/monitoring/WebVitalsReporter'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { Toaster } from 'sonner'
import './globals.css'

// Optimisation font: preload, swap display, subset minimal
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'arial'],
})

// Police arabe chargée on-demand (ne bloque pas LCP)
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-arabic',
})

export const metadata: Metadata = {
  title: 'Qadhya - Gestion de Cabinet Juridique',
  description: 'Qadhya - Plateforme SaaS pour la gestion de cabinet juridique en Tunisie',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

// Optimisation: générer les pages statiques quand possible
export const dynamic = 'auto'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        {/* Preconnect pour accélérer le chargement des fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} ${notoSansArabic.variable}${locale === 'ar' ? ' font-arabic' : ''}`}>
        <SessionProvider>
          <ThemeProvider>
            <QueryProvider>
              <StorageCleanupProvider>
                <NextIntlClientProvider messages={messages}>
                  <ImpersonationBanner />
                  {children}
                </NextIntlClientProvider>
              </StorageCleanupProvider>
            </QueryProvider>
          </ThemeProvider>
        </SessionProvider>
        <Toaster richColors position="top-right" />
        <WebVitalsReporter />
      </body>
    </html>
  )
}
