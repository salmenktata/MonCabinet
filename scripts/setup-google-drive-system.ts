/**
 * Script de configuration Google Drive pour le système de scraping
 *
 * Usage:
 * 1. Configurer GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local
 * 2. Exécuter: npx tsx scripts/setup-google-drive-system.ts
 * 3. Suivre le lien pour autoriser
 * 4. Le refresh token sera stocké dans la base de données
 */

import { google } from 'googleapis'
import { createInterface } from 'readline'
import { db } from '../lib/db/postgres'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║     CONFIGURATION GOOGLE DRIVE POUR WEB SCRAPER              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret || clientId.includes('your-')) {
    console.error('❌ GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être configurés')
    console.log('')
    console.log('Instructions :')
    console.log('1. Aller sur https://console.cloud.google.com')
    console.log('2. Créer un projet et activer Google Drive API')
    console.log('3. Créer des credentials OAuth 2.0')
    console.log('4. Configurer dans .env.local')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // Mode console
  )

  // Générer l'URL d'autorisation
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('1. Ouvrez ce lien dans votre navigateur :')
  console.log('')
  console.log(authUrl)
  console.log('')
  console.log('2. Connectez-vous avec salmen.ktata@gmail.com')
  console.log('3. Autorisez l\'application')
  console.log('4. Copiez le code d\'autorisation')
  console.log('')

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const code = await new Promise<string>((resolve) => {
    rl.question('Entrez le code d\'autorisation : ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })

  try {
    // Échanger le code contre les tokens
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      console.error('❌ Pas de refresh_token obtenu. Réessayez avec prompt=consent.')
      process.exit(1)
    }

    console.log('')
    console.log('✅ Tokens obtenus avec succès')

    // Obtenir les infos utilisateur
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    console.log(`   Email: ${userInfo.data.email}`)
    console.log(`   Nom: ${userInfo.data.name}`)

    // Stocker dans la base de données
    await db.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('google_drive_system_token', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      email: userInfo.data.email,
      name: userInfo.data.name,
    })])

    console.log('')
    console.log('✅ Token stocké dans la base de données')
    console.log('')
    console.log('Le système de scraping peut maintenant utiliser Google Drive')
    console.log('pour stocker les fichiers PDF téléchargés.')

  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  }

  process.exit(0)
}

main()
