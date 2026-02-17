/**
 * Script de test webhook Google Drive
 * Usage: node --loader ts-node/esm scripts/test-google-drive-webhook.ts [userId]
 *
 * Ce script teste:
 * 1. Création webhook Google Drive (push notifications)
 * 2. Vérification enregistrement dans DB
 * 3. Calcul temps restant avant expiration
 *
 * NOTE: Ce script nécessite une implémentation complète du GoogleDriveProvider
 * avec les méthodes watchFolder et stopFileWatch. Actuellement simplifié.
 */

import { Pool } from 'pg'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/google-drive'
const WEBHOOK_TOKEN = process.env.GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN

async function testGoogleDriveWebhook(userId: string) {
  console.log('[Test Webhook] Démarrage test pour user:', userId)
  console.log('[Test Webhook] Date:', new Date().toISOString())
  console.log('[Test Webhook] Webhook URL:', WEBHOOK_URL)
  console.log()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    // 1. Récupérer configuration
    console.log('[1/3] Récupération configuration...')
    const configResult = await pool.query(`
      SELECT * FROM cloud_providers_config
      WHERE user_id = $1 AND provider = 'google_drive'
    `, [userId])

    const config = configResult.rows[0]

    if (!config) {
      console.error('❌ Configuration non trouvée')
      process.exit(1)
    }

    console.log('✅ Configuration trouvée')
    console.log('   - Dossier racine:', config.folder_name)
    console.log('   - Dossier ID:', config.root_folder_id)
    console.log()

    // 2. Vérifier webhooks existants
    console.log('[2/3] Vérification webhooks existants...')

    const webhooksResult = await pool.query(`
      SELECT * FROM webhook_channels
      WHERE user_id = $1 AND provider = 'google_drive'
      ORDER BY created_at DESC LIMIT 5
    `, [userId])

    if (webhooksResult.rows.length > 0) {
      console.log(`✅ ${webhooksResult.rows.length} webhook(s) trouvé(s)`)
      for (const w of webhooksResult.rows) {
        const expiresAt = new Date(w.expires_at)
        const hoursLeft = Math.floor((expiresAt.getTime() - Date.now()) / 1000 / 60 / 60)
        console.log(`   - Channel ${w.channel_id}: expire dans ${hoursLeft}h`)
      }
    } else {
      console.log('⚠️  Aucun webhook trouvé')
    }
    console.log()

    // 3. Afficher info de test
    console.log('[3/3] Information de test...')
    console.log()
    console.log('   Pour créer un webhook manuellement:')
    console.log('   1. Aller sur Google Cloud Console')
    console.log('   2. Configurer les notifications Drive API')
    console.log('   3. Utiliser l\'URL:', WEBHOOK_URL)
    console.log()

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Test Webhook Google Drive terminé')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Exécution
const userId = process.argv[2]

if (!userId) {
  console.error('Usage: node --loader ts-node/esm scripts/test-google-drive-webhook.ts [userId]')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('Variable DATABASE_URL manquante')
  process.exit(1)
}

testGoogleDriveWebhook(userId)
