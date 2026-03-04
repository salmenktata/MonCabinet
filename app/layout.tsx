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
  metadataBase: new URL('https://qadhya.tn'),
  title: 'Qadhya - Gestion de Cabinet Juridique',
  description: 'Qadhya - Plateforme SaaS pour la gestion de cabinet juridique en Tunisie',
  openGraph: {
    type: 'website',
    locale: 'fr_TN',
    siteName: 'Qadhya',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@qadhya_tn',
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png?v=2', sizes: '48x48', type: 'image/png' },
      { url: '/android-chrome-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'manifest', url: '/manifest.json' },
      { rel: 'msapplication-config', url: '/browserconfig.xml' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      <head />
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
