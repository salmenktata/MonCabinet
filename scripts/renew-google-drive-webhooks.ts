/**
 * Script: Renouvellement webhooks Google Drive
 * Usage: node --loader ts-node/esm scripts/renew-google-drive-webhooks.ts
 * Cron: 0 2 * * * (tous les jours à 2h00)
 *
 * NOTE: Ce script nécessite une implémentation complète du GoogleDriveProvider
 * avec les méthodes watchFolder et stopFileWatch. Actuellement désactivé.
 */

import { Pool } from 'pg'

interface WebhookChannel {
  id: string
  user_id: string
  provider: string
  channel_id: string
  resource_id: string
  folder_id: string
  folder_name: string | null
  expires_at: string
  hours_until_expiration: number
  has_valid_config: boolean
}

async function renewGoogleDriveWebhooks() {
  console.log('[Webhook Renewal] Démarrage...')
  console.log('[Webhook Renewal] Date:', new Date().toISOString())

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    // 1. Récupérer webhooks expirant dans moins de 24h
    const expiringResult = await pool.query<WebhookChannel>(`
      SELECT wc.*,
             EXTRACT(EPOCH FROM (wc.expires_at - NOW())) / 3600 as hours_until_expiration,
             EXISTS(SELECT 1 FROM cloud_providers_config cpc
                    WHERE cpc.user_id = wc.user_id AND cpc.provider = 'google_drive') as has_valid_config
      FROM webhook_channels wc
      WHERE wc.provider = 'google_drive'
        AND wc.expires_at < NOW() + INTERVAL '24 hours'
        AND wc.expires_at > NOW()
    `)

    const expiring = expiringResult.rows

    if (expiring.length === 0) {
      console.log('[Webhook Renewal] Aucun webhook à renouveler')
      return
    }

    console.log(`[Webhook Renewal] ${expiring.length} webhook(s) à renouveler`)
    console.log('[Webhook Renewal] ATTENTION: Renouvellement automatique non implémenté')
    console.log('[Webhook Renewal] Les webhooks doivent être renouvelés manuellement')

    // TODO: Implémenter le renouvellement automatique quand l'API Google Drive sera complète

  } catch (error: any) {
    console.error('[Webhook Renewal] Erreur globale:', error)
  } finally {
    await pool.end()
  }
}

// Exécution
renewGoogleDriveWebhooks()
  .then(() => {
    console.log('[Webhook Renewal] Script terminé')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[Webhook Renewal] Erreur fatale:', error)
    process.exit(1)
  })
