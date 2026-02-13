import { NextRequest, NextResponse } from 'next/server'
import { checkAndSendAlerts } from '@/lib/alerts/email-alert-service'

/**
 * GET /api/admin/alerts/check
 *
 * Vérifie les alertes KB et envoie emails si nécessaire
 *
 * Headers:
 * - X-Cron-Secret: Secret cron pour authentification
 *
 * @returns Rapport alertes (détectées, envoyées)
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier le secret cron
    const cronSecret = request.headers.get('X-Cron-Secret')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Alerts API] Démarrage vérification alertes...')

    const result = await checkAndSendAlerts()

    console.log('[Alerts API] Résultat:', JSON.stringify(result, null, 2))

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    })

  } catch (error: any) {
    console.error('[Alerts API] Erreur:', error)
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
