/**
 * Setup Google Drive Ultra-Rapide (sans gcloud)
 *
 * Ce script génère un token OAuth temporaire pour tester Google Drive
 * sans avoir besoin d'installer gcloud CLI.
 */

import { google } from 'googleapis'
import * as readline from 'readline'
import { writeFileSync, readFileSync } from 'fs'

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
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║  Google Drive - Setup Test Rapide (Option 1)              ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  // Vérifier si les credentials existent déjà
  const envContent = readFileSync('.env', 'utf-8')
  const clientIdMatch = envContent.match(/GOOGLE_CLIENT_ID=(.+)/)
  const clientSecretMatch = envContent.match(/GOOGLE_CLIENT_SECRET=(.+)/)

  let clientId = clientIdMatch?.[1]?.trim()
  let clientSecret = clientSecretMatch?.[1]?.trim()

  // Si pas de credentials, demander à l'utilisateur
  if (!clientId || !clientSecret || clientId === '' || clientSecret === '') {
    console.log('⚠️  Credentials Google non configurés dans .env\n')
    console.log('📋 Étapes rapides:')
    console.log('1. Ouvrir: https://console.cloud.google.com/apis/credentials')
    console.log('2. Créer un projet (si pas déjà fait)')
    console.log('3. Activer Google Drive API')
    console.log('4. Créer credentials → OAuth client ID → Application de bureau')
    console.log('5. Copier CLIENT_ID et CLIENT_SECRET\n')

    const hasCredentials = await question('Avez-vous ces credentials? (o/n): ')

    if (hasCredentials.toLowerCase() !== 'o') {
      console.log('\n📚 Guide complet: GDRIVE_QUICKSTART.md')
      console.log('   Ou lancez: npx tsx scripts/setup-google-drive.ts\n')
      rl.close()
      process.exit(0)
    }

    clientId = await question('GOOGLE_CLIENT_ID: ')
    clientSecret = await question('GOOGLE_CLIENT_SECRET: ')

    if (!clientId || !clientSecret) {
      console.log('❌ CLIENT_ID et CLIENT_SECRET requis')
      rl.close()
      process.exit(1)
    }

    // Mettre à jour .env
    updateEnvFile('GOOGLE_CLIENT_ID', clientId)
    updateEnvFile('GOOGLE_CLIENT_SECRET', clientSecret)
    console.log('\n✅ .env mis à jour\n')
  } else {
    console.log('✅ Credentials trouvés dans .env\n')
  }

  // Activer Google Drive
  updateEnvFile('GOOGLE_DRIVE_ENABLED', 'true')

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

  console.log('🔐 Autorisation Google Drive requise:\n')
  console.log('1️⃣  Ouvrez cette URL dans votre navigateur:\n')
  console.log(`   ${authUrl}\n`)
  console.log('2️⃣  Autorisez l\'application Qadhya')
  console.log('3️⃣  Copiez le code qui apparaît (commence par "4/")\n')

  const code = await question('📋 Collez le code ici: ')

  if (!code) {
    console.log('❌ Code requis')
    rl.close()
    process.exit(1)
  }

  try {
    console.log('\n🔄 Échange du code contre un token...')
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token) {
      throw new Error('Token manquant')
    }

    console.log('✅ Token obtenu!\n')

    // Sauvegarder le token dans .env (pour test rapide)
    updateEnvFile('GOOGLE_DRIVE_TEST_ACCESS_TOKEN', tokens.access_token)

    // Tester le token
    oauth2Client.setCredentials(tokens)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    console.log('🧪 Test du token...')
    const testResponse = await drive.files.list({ pageSize: 1 })
    console.log('✅ Token valide!\n')

    // Test avec le dossier de l'utilisateur
    console.log('📁 Test du dossier partagé...')
    const folderUrl = 'https://drive.google.com/drive/folders/1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl'
    const folderId = '1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl'

    try {
      const folder = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType',
      })

      console.log(`✅ Accès au dossier: ${folder.data.name || 'Sans nom'}`)

      const files = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: 10,
        fields: 'files(id, name, mimeType, size)',
      })

      const fileCount = files.data.files?.length || 0
      console.log(`✅ ${fileCount} fichier(s) découvert(s)`)

      if (fileCount > 0) {
        console.log('\n📄 Fichiers trouvés:')
        files.data.files?.forEach((file, i) => {
          const size = file.size ? ` (${formatSize(parseInt(file.size))})` : ''
          console.log(`   ${i + 1}. ${file.name}${size}`)
        })
      }

    } catch (error) {
      if (error.code === 404) {
        console.log('⚠️  Dossier non trouvé (normal si pas partagé avec votre compte)')
        console.log('   Pour tester avec votre propre dossier:')
        console.log('   npx tsx scripts/test-gdrive-connection.ts <URL_DE_VOTRE_DOSSIER>')
      } else if (error.code === 403) {
        console.log('⚠️  Accès refusé au dossier')
        console.log('   Partagez le dossier avec votre compte Google')
      } else {
        console.log('⚠️  Erreur:', error.message)
      }
    }

    console.log('\n✨ Configuration terminée!\n')
    console.log('⚠️  Note: Ce token expire dans ~1 heure (mode test)')
    console.log('    Pour une config permanente: npx tsx scripts/setup-google-drive.ts\n')
    console.log('📝 Prochaines étapes:')
    console.log('   • Tester: npx tsx scripts/test-gdrive-connection.ts <URL_DOSSIER>')
    console.log('   • Créer une source: http://localhost:3000/super-admin/web-sources/new')
    console.log('   • Ou attendre le déploiement en production\n')

  } catch (error) {
    console.log('\n❌ Erreur:', error.message)
    console.log('\n💡 Assurez-vous:')
    console.log('   • D\'avoir activé Google Drive API')
    console.log('   • D\'avoir copié le bon code d\'autorisation')
    console.log('   • Que le CLIENT_ID et CLIENT_SECRET sont corrects\n')
    rl.close()
    process.exit(1)
  }

  rl.close()
  process.exit(0)
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
    console.log(`⚠️  Ajoutez manuellement à .env: ${key}=${value}`)
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

main().catch((error) => {
  console.error('\n❌ Erreur fatale:', error.message)
  rl.close()
  process.exit(1)
})
