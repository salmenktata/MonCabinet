/**
 * Script d'organisation du dossier Google Drive par catégorie juridique
 *
 * Classe les fichiers du dossier Drive en sous-dossiers thématiques :
 *   01 - Codes et Législation
 *   02 - Jurisprudence
 *   03 - Doctrine et Articles
 *   04 - Procédures
 *   05 - Templates et Modèles
 *   06 - Divers
 *
 * Usage:
 *   npx tsx scripts/organize-drive-folder.ts                          # dry-run (défaut)
 *   npx tsx scripts/organize-drive-folder.ts --dry-run               # dry-run explicite
 *   npx tsx scripts/organize-drive-folder.ts --execute               # applique les déplacements
 *   npx tsx scripts/organize-drive-folder.ts --folder-id=XXXX        # override folder ID
 *   npx tsx scripts/organize-drive-folder.ts --execute --folder-id=XXXX
 */

import { google } from 'googleapis'
import { db } from '@/lib/db/postgres'
import { config } from 'dotenv'

config()

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_FOLDER_ID = '1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

// Sous-dossiers cibles (ordre = priorité dans le nom)
const TARGET_FOLDERS = [
  { name: '01 - Codes et Législation', category: 'Codes et Législation' },
  { name: '02 - Jurisprudence', category: 'Jurisprudence' },
  { name: '03 - Doctrine et Articles', category: 'Doctrine et Articles' },
  { name: '04 - Procédures', category: 'Procédures' },
  { name: '05 - Templates et Modèles', category: 'Templates et Modèles' },
  { name: '06 - Divers', category: 'Divers' },
] as const

type CategoryName = typeof TARGET_FOLDERS[number]['category']

// Mots-clés de catégorisation (AR + FR, minuscules sans accents)
// Ordre important : les catégories spécialisées doivent être listées AVANT Doctrine
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Codes et Législation': [
    // FR
    'code', 'loi', 'decret', 'arrete', 'ordonnance', 'reglementation', 'legislation',
    'texte', 'journal', 'officiel', 'jort',
    // AR
    'قانون', 'مجلة', 'مرسوم', 'قرار', 'تشريع', 'دستور', 'أمر', 'امر',
    'نص', 'رائد', 'جريدة',
  ],
  'Jurisprudence': [
    // FR (termes spécifiques à la jurisprudence, éviter "cour" seul = faux positif "cours")
    'arret', 'jugement', 'cassation', 'tribunal', 'juridiction',
    'cour d appel', 'cour de cassation', 'cour de premiere instance',
    'decisions judiciaires', 'jurisprudence',
    // AR
    'حكم', 'قضاء', 'محكمة', 'تعقيب', 'استئناف', 'قرار قضائي', 'مناظرة القضاء',
    'كتاب مناظرة',
  ],
  'Doctrine et Articles': [
    // FR
    'doctrine', 'article', 'etude', 'commentaire', 'analyse', 'these',
    'memoire', 'recherche', 'revue', 'cours', 'cours droit',
    // AR
    'فقه', 'مقال', 'دراسات', 'تعليق', 'تحليل', 'نظرية', 'بحث',
    // Matières substantielles (cours/ouvrages doctrinaux)
    'درس', 'دروس', 'محاضرات', 'وجيز', 'موجز', 'مدخل', 'شرح', 'مخططات',
    'مسؤولية', 'التزام', 'التزامات', 'عقود', 'مرافعات',
    'مواريث', 'ميراث', 'إرث', 'ارث', 'احوال شخصية', 'زواج', 'طلاق', 'محضون',
    'ملكية', 'عقاري', 'تسجيل', 'تنفيذ', 'طرق التنفيذ',
    'شركات', 'تجاري', 'تجارية', 'تجارة', 'اصل تجاري', 'اوراق تجارية',
    'مالية', 'جبائي', 'جبائية', 'ضريبة', 'صعوبات',
    'إداري', 'إدارية', 'ضبط', 'صفقات',
    'جزائي', 'جزائية', 'جنائي', 'جنائية', 'عقوبة',
    'تامين', 'تأمين', 'تأمينات', 'كفالة', 'رهن', 'شفعة', 'حبس',
    'إثبات', 'اثبات', 'حقوق', 'حريات', 'دفاع', 'تحكيم', 'دعوى',
    'إنقاذ', 'افلاس', 'تفليس', 'مسماة', 'بحري', 'بحرية',
  ],
  'Procédures': [
    // FR
    'procedure', 'formulaire', 'guide', 'manuel', 'instruction',
    // AR
    'إجراء', 'استمارة', 'دليل', 'تعليمات', 'نموذج إداري', 'اجراء',
  ],
  'Templates et Modèles': [
    // FR
    'template', 'modele', 'contrat', 'convention', 'accord', 'acte',
    // AR — uniquement termes de modèles/formulaires (pas "عقود خاصة" car c'est un cours)
    'نموذج', 'اتفاقية', 'وثيقة نموذجية', 'مسودة',
    'عقد الشغل', 'عقد ايجار', 'عقد بيع', 'وكالة',
  ],
}

// =============================================================================
// TYPES
// =============================================================================

interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  size?: string
}

interface ClassifiedFile {
  file: DriveFile
  category: CategoryName
  reason: string
}

// =============================================================================
// AUTH : CLIENT DRIVE AVEC SCOPE WRITE COMPLET
// =============================================================================

async function getDriveClientWithWriteScope() {
  const saResult = await db.query(
    `SELECT value FROM system_settings WHERE key = 'google_drive_service_account'`
  )

  if (saResult.rows.length === 0) {
    throw new Error(
      'Service account Google Drive non configuré.\n' +
      'Configurer google_drive_service_account dans system_settings.'
    )
  }

  const serviceAccountJson = saResult.rows[0].value
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountJson,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return google.drive({ version: 'v3', auth })
}

// =============================================================================
// LISTING RÉCURSIF DES FICHIERS
// =============================================================================

async function listAllFiles(drive: any, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  console.log(`\n📂 Listing des fichiers dans le dossier ${folderId}...`)

  do {
    const response: any = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, parents)',
      pageSize: 100,
      pageToken,
    })

    const batch: DriveFile[] = (response.data.files || []).filter(
      (f: DriveFile) => f.mimeType !== FOLDER_MIME_TYPE
    )

    files.push(...batch)
    pageToken = response.data.nextPageToken
  } while (pageToken)

  console.log(`   → ${files.length} fichier(s) trouvé(s) (dossiers exclus)`)
  return files
}

// =============================================================================
// CATÉGORISATION PAR MOTS-CLÉS
// =============================================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprimer accents latins
    .replace(/\u0640/g, '')           // supprimer kashida/tatweel arabe (ـ)
    .replace(/[\u064b-\u065f]/g, '') // supprimer harakat arabes (تشكيل)
    .replace(/[_\-\.]/g, ' ')         // tirets/underscores/points → espace
}

function categorizeFile(file: DriveFile): { category: CategoryName; reason: string } {
  const normalized = normalizeText(file.name)

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const normalizedKw = normalizeText(kw)
      if (normalized.includes(normalizedKw)) {
        return { category: cat as CategoryName, reason: `mot-clé "${kw}"` }
      }
    }
  }

  return { category: 'Divers', reason: 'aucun mot-clé correspondant' }
}

// =============================================================================
// AFFICHAGE DU RAPPORT DRY-RUN
// =============================================================================

function printReport(classified: ClassifiedFile[]): void {
  console.log('\n' + '═'.repeat(70))
  console.log('  RAPPORT DE CLASSIFICATION (DRY-RUN)')
  console.log('═'.repeat(70))

  const byCategory: Record<string, ClassifiedFile[]> = {}

  for (const item of classified) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }

  for (const folder of TARGET_FOLDERS) {
    const items = byCategory[folder.category] || []
    console.log(`\n📁 ${folder.name}  (${items.length} fichier(s))`)
    if (items.length === 0) {
      console.log('   (aucun)')
    } else {
      for (const item of items) {
        const size = item.file.size
          ? `${Math.round(parseInt(item.file.size) / 1024)} Ko`
          : '?'
        console.log(`   • ${item.file.name} [${size}] — ${item.reason}`)
      }
    }
  }

  console.log('\n' + '─'.repeat(70))
  console.log(`  Total : ${classified.length} fichier(s)`)
  console.log('─'.repeat(70))
  console.log('\n💡 Pour appliquer : npx tsx scripts/organize-drive-folder.ts --execute')
}

// =============================================================================
// CRÉATION DES SOUS-DOSSIERS
// =============================================================================

async function ensureSubFolders(
  drive: any,
  parentFolderId: string
): Promise<Map<CategoryName, string>> {
  const folderIds = new Map<CategoryName, string>()

  console.log('\n📁 Vérification / création des sous-dossiers...')

  // Lister les dossiers existants dans le parent
  const listResponse: any = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 50,
  })

  const existingFolders: Map<string, string> = new Map(
    (listResponse.data.files || []).map((f: { name: string; id: string }) => [f.name, f.id])
  )

  for (const target of TARGET_FOLDERS) {
    if (existingFolders.has(target.name)) {
      const existingId = existingFolders.get(target.name)!
      console.log(`   ✅ "${target.name}" — déjà existant (${existingId})`)
      folderIds.set(target.category, existingId)
    } else {
      const createResponse: any = await drive.files.create({
        requestBody: {
          name: target.name,
          mimeType: FOLDER_MIME_TYPE,
          parents: [parentFolderId],
        },
        fields: 'id',
      })
      const newId = createResponse.data.id
      console.log(`   ✨ "${target.name}" — créé (${newId})`)
      folderIds.set(target.category, newId)
    }
  }

  return folderIds
}

// =============================================================================
// DÉPLACEMENT DES FICHIERS
// =============================================================================

async function moveFiles(
  drive: any,
  classified: ClassifiedFile[],
  folderIds: Map<CategoryName, string>
): Promise<void> {
  console.log(`\n🚀 Déplacement de ${classified.length} fichier(s)...\n`)

  let success = 0
  let errors = 0

  for (const item of classified) {
    const targetFolderId = folderIds.get(item.category)
    if (!targetFolderId) {
      console.error(`   ❌ ${item.file.name} — dossier cible introuvable pour "${item.category}"`)
      errors++
      continue
    }

    // Ne pas déplacer si déjà dans le bon dossier
    if (item.file.parents.includes(targetFolderId)) {
      console.log(`   ⏭️  ${item.file.name} — déjà dans le bon dossier`)
      success++
      continue
    }

    try {
      await drive.files.update({
        fileId: item.file.id,
        addParents: targetFolderId,
        removeParents: item.file.parents.join(','),
        fields: 'id, parents',
      })
      console.log(`   ✅ ${item.file.name} → ${item.category}`)
      success++
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`   ❌ ${item.file.name} — ERREUR: ${msg}`)
      errors++
    }
  }

  console.log('\n' + '─'.repeat(70))
  console.log(`  Résultat : ${success} succès, ${errors} erreur(s)`)
  console.log('─'.repeat(70))
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = !args.includes('--execute')
  const folderArg = args.find((a) => a.startsWith('--folder-id='))
  const folderId = folderArg ? folderArg.split('=')[1] : DEFAULT_FOLDER_ID

  console.log('📂 Organisateur de dossier Google Drive')
  console.log('========================================')
  console.log(`Mode     : ${isDryRun ? '🔍 DRY-RUN (aucune modification)' : '⚡ EXÉCUTION (modification réelle)'}`)
  console.log(`Dossier  : ${folderId}`)
  console.log(`Drive URL: https://drive.google.com/drive/folders/${folderId}`)

  // Authentification avec scope write
  console.log('\n🔐 Authentification Google Drive (scope write)...')
  const drive = await getDriveClientWithWriteScope()
  console.log('   ✅ Authentifié')

  // Vérifier accès au dossier
  try {
    const meta: any = await drive.files.get({
      fileId: folderId,
      fields: 'id, name',
    })
    console.log(`   ✅ Dossier accessible : "${meta.data.name}"`)
  } catch {
    console.error(`\n❌ Impossible d'accéder au dossier ${folderId}`)
    console.error('   Vérifiez que le dossier est partagé avec le service account.')
    process.exit(1)
  }

  // Listing récursif
  const files = await listAllFiles(drive, folderId)

  if (files.length === 0) {
    console.log('\n⚠️  Aucun fichier trouvé dans ce dossier.')
    process.exit(0)
  }

  // Classification
  const classified: ClassifiedFile[] = files.map((file) => {
    const { category, reason } = categorizeFile(file)
    return { file, category, reason }
  })

  // Dry-run → afficher rapport et sortir
  printReport(classified)

  if (isDryRun) {
    console.log('\n✋ Mode dry-run — aucune modification effectuée.')
    process.exit(0)
  }

  // Exécution réelle
  console.log('\n⚠️  Mode EXÉCUTION — les fichiers vont être déplacés.')
  const folderIds = await ensureSubFolders(drive, folderId)
  await moveFiles(drive, classified, folderIds)

  console.log('\n✨ Organisation terminée!')
  console.log(`   Vérifier: https://drive.google.com/drive/folders/${folderId}`)

  await db.closePool()
}

main().catch((error) => {
  console.error('\n❌ Erreur fatale:', error instanceof Error ? error.message : error)
  process.exit(1)
})
