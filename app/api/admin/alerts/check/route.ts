import { NextRequest, NextResponse } from 'next/server'
import { checkAndSendAlerts } from '@/lib/alerts/email-alert-service'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/alerts/check
 *
 * Vérifie les alertes KB et envoie emails si nécessaire
 *
 * Auth: session super_admin OU CRON_SECRET
 *
 * @returns Rapport alertes (détectées, envoyées)
 */
export const GET = withAdminApiAuth(async (_request: NextRequest, _ctx, _session) => {
  try {
    console.log('[Alerts API] Démarrage vérification alertes...')

    const result = await checkAndSendAlerts()

    console.log('[Alerts API] Résultat:', JSON.stringify(result, null, 2))

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    })

  } catch (error) {
    console.error('[Alerts API] Erreur:', error)
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
