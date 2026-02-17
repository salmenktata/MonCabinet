/**
 * Vérifier la validité du token Google Drive
 */
import { google } from 'googleapis'
import 'dotenv/config'

async function main() {
  console.log('🔍 Vérification du token Google Drive...\n')

  const token = process.env.GOOGLE_DRIVE_TEST_ACCESS_TOKEN
  if (!token) {
    console.log('❌ GOOGLE_DRIVE_TEST_ACCESS_TOKEN non trouvé dans .env')
    process.exit(1)
  }

  console.log(`✓ Token présent (${token.substring(0, 30)}...)\n`)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({ access_token: token })
  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  try {
    // Test simple
    await drive.files.list({ pageSize: 1 })
    console.log('✅ Token valide ✓\n')

    // Test avec le dossier spécifique
    const folderId = '1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl'
    console.log(`📁 Test d'accès au dossier ${folderId}...\n`)

    try {
      const folder = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType',
      })
      console.log(`✅ Dossier accessible: ${folder.data.name}`)

      const files = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: 10,
        fields: 'files(id, name)',
      })

      console.log(`✅ ${files.data.files?.length || 0} fichier(s) découvert(s)\n`)
    } catch (error) {
      if (error.code === 404) {
        console.log('❌ Dossier non trouvé (404)')
        console.log('   Causes possibles:')
        console.log('   • Le dossier n\'existe pas')
        console.log('   • Le dossier n\'est pas partagé avec votre compte Google')
        console.log('   • L\'ID du dossier est incorrect\n')
      } else if (error.code === 403) {
        console.log('❌ Accès refusé (403)')
        console.log('   Le dossier existe mais vous n\'avez pas les permissions\n')
      } else {
        console.log(`❌ Erreur: ${getErrorMessage(error)}\n`)
      }
      process.exit(1)
    }
  } catch (error) {
    if (error.code === 401) {
      console.log('❌ Token expiré (401)')
      console.log('   → Régénérer un nouveau token avec:')
      console.log('   npx tsx scripts/generate-auth-url.ts\n')
    } else {
      console.log(`❌ Erreur: ${getErrorMessage(error)}\n`)
    }
    process.exit(1)
  }
}

main()
