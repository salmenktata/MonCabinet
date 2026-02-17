/**
 * Échange rapide du code OAuth contre un token
 *
 * Usage: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx tsx scripts/exchange-token-quick.ts <CODE>
 *
 * Prérequis: Variables d'environnement
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URI (optionnel)
 */
import { google } from 'googleapis'
import { writeFileSync, readFileSync } from 'fs'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
const CODE = process.argv[2] || process.env.GOOGLE_AUTH_CODE || ''

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ ERREUR: Variables d\'environnement manquantes')
  console.error('   Requis: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET')
  process.exit(1)
}

if (!CODE) {
  console.error('❌ ERREUR: Code OAuth manquant')
  console.error('   Usage: tsx scripts/exchange-token-quick.ts <CODE>')
  process.exit(1)
}

async function main() {
  console.log('🔄 Échange du code contre un token...\n')

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

  try {
    const { tokens } = await oauth2Client.getToken(CODE)

    if (!tokens.access_token) {
      throw new Error('Token manquant')
    }

    console.log('✅ Token obtenu!\n')

    // Mettre à jour .env
    console.log('💾 Mise à jour du .env...')
    let envContent = readFileSync('.env', 'utf-8')

    const tokenLine = `GOOGLE_DRIVE_TEST_ACCESS_TOKEN=${tokens.access_token}`

    if (envContent.includes('GOOGLE_DRIVE_TEST_ACCESS_TOKEN=')) {
      envContent = envContent.replace(/^GOOGLE_DRIVE_TEST_ACCESS_TOKEN=.*/m, tokenLine)
    } else {
      envContent += `\n${tokenLine}\n`
    }

    writeFileSync('.env', envContent)
    console.log('✅ Token sauvegardé dans .env\n')

    // Tester
    console.log('🧪 Test du token...')
    oauth2Client.setCredentials(tokens)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    await drive.files.list({ pageSize: 1 })
    console.log('✅ Token valide!\n')

    const folderId = '1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl'
    const folder = await drive.files.get({ fileId: folderId, fields: 'id, name' })
    console.log(`✅ Accès au dossier: ${folder.data.name}`)

    const files = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 10,
      fields: 'files(id, name)',
    })

    console.log(`✅ ${files.data.files?.length || 0} fichier(s) découvert(s)\n`)
    console.log('✨ Prêt! Vous pouvez créer la source maintenant.\n')
  } catch (error) {
    console.log('❌ Erreur:', error.message)
  }
}

main()
