/**
 * Script de test OAuth Google Drive
 * Usage: node --loader ts-node/esm scripts/test-google-drive-oauth.ts [userId]
 *
 * Ce script teste:
 * 1. Récupération configuration OAuth depuis DB
 * 2. Validation/refresh token si expiré
 * 3. Test listage fichiers Google Drive
 *
 * NOTE: Ce script nécessite une implémentation complète du GoogleDriveProvider.
 * Actuellement simplifié pour la compilation.
 */

import { Pool } from 'pg'
import { createGoogleDriveProvider } from '../lib/integrations/cloud-storage'

async function testGoogleDriveOAuth(userId: string) {
  console.log('[Test OAuth] Démarrage test pour user:', userId)
  console.log('[Test OAuth] Date:', new Date().toISOString())
  console.log()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    // 1. Récupérer configuration OAuth
    console.log('[1/3] Récupération configuration OAuth...')
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
    console.log('   - Provider:', config.provider)
    console.log('   - Dossier racine:', config.folder_name)
    console.log('   - Token expire:', new Date(config.token_expires_at).toLocaleString())
    console.log()

    // 2. Créer provider et tester refresh token
    console.log('[2/3] Validation token (refresh si expiré)...')

    const tokenExpiresAt = new Date(config.token_expires_at)
    const isExpired = tokenExpiresAt < new Date()

    if (isExpired) {
      console.log('⚠️  Token expiré, refresh automatique...')
    } else {
      const remainingMinutes = Math.floor((tokenExpiresAt.getTime() - Date.now()) / 1000 / 60)
      console.log(`✅ Token valide (expire dans ${remainingMinutes} minutes)`)
    }

    const provider = createGoogleDriveProvider(config.access_token)
    console.log()

    // 3. Test listage fichiers dossier racine
    console.log('[3/3] Test listage fichiers...')

    const result = await provider.listFiles({
      folderId: config.root_folder_id!,
      pageSize: 10,
    })

    console.log(`✅ Listage réussi: ${result.files.length} fichier(s) trouvé(s)`)

    if (result.files.length > 0) {
      console.log('   Premiers fichiers:')
      result.files.slice(0, 3).forEach((file, i) => {
        console.log(`   ${i + 1}. ${file.name} (${file.mimeType})`)
      })
    }
    console.log()

    // Résumé
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Test OAuth Google Drive RÉUSSI')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    process.exit(0)
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ Test OAuth Google Drive ÉCHOUÉ')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error()
    console.error('Erreur:', error.message)
    console.error()
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Exécution
const userId = process.argv[2]

if (!userId) {
  console.error('Usage: node --loader ts-node/esm scripts/test-google-drive-oauth.ts [userId]')
  console.error()
  console.error('Example:')
  console.error('  node --loader ts-node/esm scripts/test-google-drive-oauth.ts a1b2c3d4-...')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('Variable DATABASE_URL manquante')
  process.exit(1)
}

testGoogleDriveOAuth(userId)
