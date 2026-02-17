/**
 * Échange le code OAuth contre un token
 *
 * Usage: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx tsx scripts/exchange-code-for-token.ts <CODE>
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
  console.error('   Usage: tsx scripts/exchange-code-for-token.ts <CODE>')
  process.exit(1)
}

async function main() {
  console.log('🔄 Échange du code contre un token...\n')

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  )

  try {
    const { tokens } = await oauth2Client.getToken(CODE)

    if (!tokens.access_token) {
      throw new Error('Token manquant')
    }

    console.log('✅ Token obtenu!\n')
    console.log(`Access Token: ${tokens.access_token?.substring(0, 30)}...`)
    console.log(`Refresh Token: ${tokens.refresh_token ? 'Oui ✅' : 'Non ❌'}`)
    console.log(`Expire: ${tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'Inconnu'}\n`)

    // Sauvegarder dans .env
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

    // Tester le token
    console.log('🧪 Test du token...')
    oauth2Client.setCredentials(tokens)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const testResponse = await drive.files.list({ pageSize: 1 })
    console.log('✅ Token valide!\n')

    // Test avec le dossier partagé
    console.log('📁 Test du dossier partagé...')
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

      console.log('\n✨ Configuration terminée!\n')
      console.log('⚠️  Note: Ce token expire dans ~1 heure (mode test)')
      console.log('    Pour une config permanente: npx tsx scripts/setup-google-drive.ts\n')
      console.log('📝 Prochaines étapes:')
      console.log('   • Tester: npx tsx scripts/test-gdrive-connection.ts <URL_DOSSIER>')
      console.log('   • Créer une source: http://localhost:3000/super-admin/web-sources/new\n')

    } catch (error) {
      if (error.code === 404) {
        console.log('⚠️  Dossier non trouvé (vérifiez que le dossier est partagé avec votre compte)')
      } else if (error.code === 403) {
        console.log('⚠️  Accès refusé (partagez le dossier avec salmen.ktata@gmail.com)')
      } else {
        console.log('⚠️  Erreur:', error.message)
      }
      console.log('\n💡 Vous pouvez quand même tester avec vos propres dossiers!')
    }

  } catch (error) {
    console.log('\n❌ Erreur:', error.message)
    console.log('\n💡 Le code a peut-être expiré. Réessayez avec un nouveau code.')
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

main()
