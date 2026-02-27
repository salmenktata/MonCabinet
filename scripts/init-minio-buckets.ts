/**
 * Script d'initialisation des buckets MinIO
 *
 * Créé automatiquement tous les buckets nécessaires au démarrage
 * Utilisation: npm run init:minio ou node --loader ts-node/esm scripts/init-minio-buckets.ts
 */

import { getMinioClient } from '../lib/storage/minio'

// Liste des buckets nécessaires pour l'application
const REQUIRED_BUCKETS = [
  {
    name: process.env.MINIO_BUCKET || 'documents',
    description: 'Documents de la knowledge base (PDFs, DOCX, etc.)',
    public: false,
  },
  {
    name: 'web-files',
    description: 'Fichiers téléchargés par le web crawler (images, PDFs externes, etc.)',
    public: false,
  },
  {
    name: 'avatars',
    description: 'Photos de profil des utilisateurs',
    public: true,
  },
  {
    name: 'uploads',
    description: 'Uploads temporaires et fichiers utilisateurs',
    public: false,
  },
  {
    name: 'dossiers',
    description: 'Documents des dossiers clients (PDFs, DOCX, etc.) — stockage VPS',
    public: false,
  },
]

async function initializeBuckets() {
  console.log('🔧 Initialisation des buckets MinIO...\n')

  const client = getMinioClient()
  let created = 0
  let existing = 0
  let errors = 0

  for (const bucket of REQUIRED_BUCKETS) {
    try {
      const exists = await client.bucketExists(bucket.name)

      if (exists) {
        console.log(`✅ Bucket existant: ${bucket.name} - ${bucket.description}`)
        existing++
      } else {
        await client.makeBucket(bucket.name, 'eu-west-1')
        console.log(`🆕 Bucket créé: ${bucket.name} - ${bucket.description}`)

        // Définir politique d'accès
        if (bucket.public) {
          const policy = {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket.name}/*`],
              },
            ],
          }
          await client.setBucketPolicy(bucket.name, JSON.stringify(policy))
          console.log(`   → Politique publique appliquée`)
        }

        created++
      }
    } catch (error) {
      console.error(`❌ Erreur bucket ${bucket.name}:`, error instanceof Error ? error.message : error)
      errors++
    }
  }

  console.log('\n📊 Résumé:')
  console.log(`   - Buckets existants: ${existing}`)
  console.log(`   - Buckets créés: ${created}`)
  console.log(`   - Erreurs: ${errors}`)

  if (errors > 0) {
    console.error('\n⚠️  Certains buckets n\'ont pas pu être initialisés')
    process.exit(1)
  }

  console.log('\n✅ Initialisation MinIO terminée avec succès')
}

// Exécution
initializeBuckets().catch((error) => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
