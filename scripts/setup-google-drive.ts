/**
 * Script interactif de configuration Google Drive
 *
 * Guide l'utilisateur à travers les étapes de configuration:
 * 1. Choix: Service Account ou OAuth
 * 2. Configuration des credentials
 * 3. Test de connexion
 * 4. Stockage dans system_settings
 */

import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
import { db } from '@/lib/db/postgres'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim())
    })
  })
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     Configuration Google Drive - Qadhya                    ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  console.log('Quelle méthode d\'authentification souhaitez-vous utiliser?\n')
  console.log('1. Service Account (Recommandé pour production)')
  console.log('   - Authentification automatique')
  console.log('   - Pas de token expiration')
  console.log('   - Nécessite Google Cloud Console\n')

  console.log('2. OAuth Token (Plus simple, pour test)')
  console.log('   - Authentification interactive')
  console.log('   - Token expire (refresh auto)')
  console.log('   - Plus rapide à configurer\n')

  const choice = await question('Votre choix (1 ou 2): ')

  if (choice === '1') {
    await setupServiceAccount()
  } else if (choice === '2') {
    await setupOAuthToken()
  } else {
    console.log('❌ Choix invalide')
    rl.close()
    process.exit(1)
  }
}

async function setupServiceAccount() {
  console.log('\n📋 Configuration Service Account\n')

  console.log('Étapes à suivre:')
  console.log('1. Aller sur https://console.cloud.google.com')
  console.log('2. Créer un projet (ou utiliser un existant)')
  console.log('3. Activer Google Drive API')
  console.log('4. Créer un Service Account:')
  console.log('   - IAM & Admin → Service Accounts → Create Service Account')
  console.log('5. Créer une clé JSON:')
  console.log('   - Cliquer sur le service account')
  console.log('   - Keys → Add Key → Create new key → JSON')
  console.log('6. Télécharger le fichier JSON\n')

  const hasFile = await question('Avez-vous le fichier JSON du service account? (o/n): ')

  if (hasFile.toLowerCase() !== 'o') {
    console.log('\n📚 Suivez les étapes ci-dessus puis relancez ce script.')
    console.log('Documentation: https://cloud.google.com/iam/docs/service-accounts-create\n')
    rl.close()
    process.exit(0)
  }

  const filePath = await question('Chemin vers le fichier JSON: ')

  try {
    const serviceAccountJson = JSON.parse(readFileSync(filePath, 'utf-8'))

    // Vérifier les champs requis
    if (!serviceAccountJson.type || serviceAccountJson.type !== 'service_account') {
      throw new Error('Fichier JSON invalide (type !== service_account)')
    }

    if (!serviceAccountJson.client_email || !serviceAccountJson.private_key) {
      throw new Error('Fichier JSON invalide (client_email ou private_key manquant)')
    }

    console.log('\n✅ Fichier JSON valide')
    console.log(`📧 Email: ${serviceAccountJson.client_email}`)

    // Tester l'authentification
    console.log('\n🔐 Test d\'authentification...')

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountJson,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    })

    const drive = google.drive({ version: 'v3', auth })

    // Test simple: lister les fichiers (devrait être vide mais pas d'erreur)
    await drive.files.list({ pageSize: 1 })

    console.log('✅ Authentification réussie\n')

    // Instructions pour partager le dossier
    console.log('⚠️  IMPORTANT - Partage du dossier Google Drive:')
    console.log(`   1. Ouvrir votre dossier Google Drive`)
    console.log(`   2. Clic droit → Partager`)
    console.log(`   3. Ajouter cet email: ${serviceAccountJson.client_email}`)
    console.log(`   4. Permission: Lecteur (read-only)\n`)

    const ready = await question('Avez-vous partagé le dossier? (o/n): ')

    if (ready.toLowerCase() !== 'o') {
      console.log('\n📝 Partagez le dossier puis testez avec:')
      console.log('   npx tsx scripts/test-gdrive-connection.ts <URL_DOSSIER>\n')

      // Sauvegarder quand même
      await saveServiceAccount(serviceAccountJson)
      rl.close()
      process.exit(0)
    }

    // Test avec un dossier réel
    const folderUrl = await question('URL du dossier partagé (pour tester): ')

    const folderId = parseFolderId(folderUrl)
    if (!folderId) {
      console.log('❌ URL invalide')
      rl.close()
      process.exit(1)
    }

    try {
      const folder = await drive.files.get({ fileId: folderId, fields: 'id, name' })
      console.log(`✅ Accès au dossier: ${folder.data.name}`)

      const files = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: 10,
        fields: 'files(id, name, mimeType)',
      })

      console.log(`✅ ${files.data.files?.length || 0} fichier(s) découvert(s)\n`)
    } catch (error) {
      if (error.code === 404) {
        console.log('❌ Dossier non trouvé. Vérifiez l\'URL.')
      } else if (error.code === 403) {
        console.log('❌ Accès refusé. Avez-vous bien partagé le dossier avec le service account?')
      } else {
        console.log('❌ Erreur:', error.message)
      }
      rl.close()
      process.exit(1)
    }

    // Tout est OK, sauvegarder
    await saveServiceAccount(serviceAccountJson)

  } catch (error) {
    console.log('❌ Erreur:', error.message)
    rl.close()
    process.exit(1)
  }
}

async function setupOAuthToken() {
  console.log('\n📋 Configuration OAuth Token\n')

  console.log('Étapes à suivre:')
  console.log('1. Aller sur https://console.cloud.google.com')
  console.log('2. Créer un projet (ou utiliser un existant)')
  console.log('3. Activer Google Drive API')
  console.log('4. Créer des credentials OAuth 2.0:')
  console.log('   - Credentials → Create Credentials → OAuth client ID')
  console.log('   - Application type: Desktop app (ou Web application)')
  console.log('5. Télécharger le JSON des credentials\n')

  const hasCredentials = await question('Avez-vous GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET? (o/n): ')

  if (hasCredentials.toLowerCase() !== 'o') {
    console.log('\n📚 Suivez les étapes ci-dessus.')
    console.log('Documentation: https://developers.google.com/drive/api/quickstart/nodejs\n')
    rl.close()
    process.exit(0)
  }

  const clientId = await question('GOOGLE_CLIENT_ID: ')
  const clientSecret = await question('GOOGLE_CLIENT_SECRET: ')

  if (!clientId || !clientSecret) {
    console.log('❌ CLIENT_ID et CLIENT_SECRET requis')
    rl.close()
    process.exit(1)
  }

  // Mettre à jour .env
  console.log('\n📝 Mise à jour du fichier .env...')
  updateEnvFile('GOOGLE_CLIENT_ID', clientId)
  updateEnvFile('GOOGLE_CLIENT_SECRET', clientSecret)
  console.log('✅ .env mis à jour\n')

  // Générer URL d'autorisation
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/api/auth/google/callback'
  )

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    prompt: 'consent',
  })

  console.log('🔐 Authentification requise:\n')
  console.log('1. Ouvrez cette URL dans votre navigateur:')
  console.log(`   ${authUrl}\n`)
  console.log('2. Autorisez l\'application')
  console.log('3. Copiez le code d\'autorisation\n')

  const code = await question('Code d\'autorisation: ')

  if (!code) {
    console.log('❌ Code requis')
    rl.close()
    process.exit(1)
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Tokens incomplets')
    }

    console.log('✅ Token obtenu avec succès\n')

    // Tester le token
    oauth2Client.setCredentials(tokens)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    await drive.files.list({ pageSize: 1 })
    console.log('✅ Token valide\n')

    // Sauvegarder
    await saveOAuthToken({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + 3600000,
      scope: tokens.scope || 'https://www.googleapis.com/auth/drive.readonly',
      token_type: tokens.token_type || 'Bearer',
    })

  } catch (error) {
    console.log('❌ Erreur:', error.message)
    rl.close()
    process.exit(1)
  }
}

async function saveServiceAccount(serviceAccountJson: any) {
  console.log('\n💾 Sauvegarde dans la base de données...')

  try {
    await db.query(`
      INSERT INTO system_settings (key, value, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `, [
      'google_drive_service_account',
      JSON.stringify(serviceAccountJson),
      'Google Drive service account credentials for web crawling'
    ])

    console.log('✅ Service account sauvegardé\n')
    console.log('✨ Configuration terminée!\n')
    console.log('📝 Prochaines étapes:')
    console.log('   1. Tester: npx tsx scripts/test-gdrive-connection.ts <URL_DOSSIER>')
    console.log('   2. Créer une source: /super-admin/web-sources/new\n')

    rl.close()
    await db.closePool()
    process.exit(0)
  } catch (error) {
    console.log('❌ Erreur sauvegarde:', error.message)
    rl.close()
    process.exit(1)
  }
}

async function saveOAuthToken(tokenData: any) {
  console.log('\n💾 Sauvegarde dans la base de données...')

  try {
    await db.query(`
      INSERT INTO system_settings (key, value, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `, [
      'google_drive_system_token',
      JSON.stringify(tokenData),
      'Google Drive OAuth token for system-wide access'
    ])

    console.log('✅ Token OAuth sauvegardé\n')
    console.log('✨ Configuration terminée!\n')
    console.log('📝 Prochaines étapes:')
    console.log('   1. Tester: npx tsx scripts/test-gdrive-connection.ts <URL_DOSSIER>')
    console.log('   2. Créer une source: /super-admin/web-sources/new\n')

    rl.close()
    await db.closePool()
    process.exit(0)
  } catch (error) {
    console.log('❌ Erreur sauvegarde:', error.message)
    rl.close()
    process.exit(1)
  }
}

function parseFolderId(input: string): string | null {
  if (!input) return null

  // Format gdrive://
  if (input.startsWith('gdrive://')) {
    return input.substring(9)
  }

  // Format URL Google Drive
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) {
    return match[1]
  }

  // Retourner l'input tel quel (folderId direct)
  return input
}

function updateEnvFile(key: string, value: string) {
  try {
    let envContent = readFileSync('.env', 'utf-8')
    const regex = new RegExp(`^${key}=.*$`, 'm')

    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }

    writeFileSync('.env', envContent)
  } catch (error) {
    console.log('⚠️  Impossible de mettre à jour .env automatiquement')
    console.log(`   Ajoutez manuellement: ${key}=${value}`)
  }
}

main().catch((error) => {
  console.error('Erreur fatale:', error)
  rl.close()
  process.exit(1)
})
