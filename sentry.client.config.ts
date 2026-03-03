import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Capture 10% des transactions en prod pour les performances
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Replay sessions uniquement sur les erreurs
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Ne pas capturer les erreurs de navigation normales
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      /ChunkLoadError/,
    ],
    beforeSend(event) {
      // Ne pas envoyer les erreurs 401/403 (normales pour non-authentifiés)
      if (event.request?.url?.includes('/api/') && event.tags?.status) {
        const status = Number(event.tags.status)
        if (status === 401 || status === 403) return null
      }
      return event
    },
  })
}
