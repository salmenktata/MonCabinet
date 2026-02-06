/**
 * Script d'indexation batch de tous les documents existants
 *
 * Usage: npx tsx scripts/index-all-documents.ts [--user-id <uuid>] [--batch-size <n>]
 *
 * Ce script:
 * 1. Récupère tous les documents non indexés
 * 2. Les traite en batch avec rate limiting
 * 3. Génère les embeddings et les stocke dans document_embeddings
 */

import { Pool } from 'pg'
import OpenAI from 'openai'
import * as Minio from 'minio'

// Import dynamique pour pdf-parse et mammoth (ESM compatibility)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParse: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mammoth: any = null

async function loadPdfParse() {
  if (!pdfParse) {
    const module = await import('pdf-parse') as any
    pdfParse = module.default || module
  }
  return pdfParse
}

async function loadMammoth() {
  if (!mammoth) {
    const module = await import('mammoth') as any
    mammoth = module.default || module
  }
  return mammoth
}

// Configuration
const config = {
  batchSize: parseInt(process.env.BATCH_SIZE || '10'),
  delayBetweenBatches: 2000, // 2 secondes entre chaque batch
  chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '512'),
  chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '50'),
}

// Clients
let pool: Pool
let openai: OpenAI
let minio: Minio.Client

function initClients() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  minio = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  })
}

// Types
interface Document {
  id: string
  user_id: string
  nom: string
  chemin_fichier: string
  type: string
}

interface Chunk {
  content: string
  index: number
}

// Utilitaires
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}

function isSupportedType(mimeType: string): boolean {
  const supported = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]
  return supported.includes(mimeType) || mimeType.startsWith('text/')
}

async function downloadFromMinio(path: string): Promise<Buffer> {
  const bucket = process.env.MINIO_BUCKET || 'documents'
  const stream = await minio.getObject(bucket, path)

  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const parser = await loadPdfParse()
    const data = await parser(buffer)
    return data.text
  }

  if (mimeType.includes('wordprocessingml') || mimeType.includes('docx')) {
    const mammothLib = await loadMammoth()
    const result = await mammothLib.extractRawText({ buffer })
    return result.value
  }

  if (mimeType.startsWith('text/')) {
    return buffer.toString('utf-8')
  }

  throw new Error(`Type non supporté: ${mimeType}`)
}

function chunkText(text: string): Chunk[] {
  const words = text.split(/\s+/)
  const chunks: Chunk[] = []
  const step = config.chunkSize - config.chunkOverlap

  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + config.chunkSize)
    const content = chunkWords.join(' ').trim()

    if (content) {
      chunks.push({ content, index: chunks.length })
    }
  }

  return chunks
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

  const response = await openai.embeddings.create({
    model,
    input: texts.map((t) => t.substring(0, 30000)),
    encoding_format: 'float',
  })

  return response.data.map((d) => d.embedding)
}

function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// Fonction principale
async function indexDocument(doc: Document): Promise<{ success: boolean; chunks: number; error?: string }> {
  const mimeType = getMimeType(doc.chemin_fichier)

  if (!isSupportedType(mimeType)) {
    return { success: false, chunks: 0, error: `Type non supporté: ${mimeType}` }
  }

  try {
    // Télécharger le fichier
    const buffer = await downloadFromMinio(doc.chemin_fichier)

    // Extraire le texte
    const text = await extractText(buffer, mimeType)

    if (!text || text.trim().length < 50) {
      return { success: false, chunks: 0, error: 'Texte extrait trop court' }
    }

    // Découper en chunks
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      return { success: false, chunks: 0, error: 'Aucun chunk généré' }
    }

    // Générer les embeddings en batch
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content))

    // Supprimer les anciens embeddings
    await pool.query(`DELETE FROM document_embeddings WHERE document_id = $1`, [doc.id])

    // Insérer les nouveaux embeddings
    for (let i = 0; i < chunks.length; i++) {
      await pool.query(
        `INSERT INTO document_embeddings
         (document_id, user_id, content_chunk, chunk_index, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        [
          doc.id,
          doc.user_id,
          chunks[i].content,
          chunks[i].index,
          formatEmbedding(embeddings[i]),
          JSON.stringify({ documentName: doc.nom }),
        ]
      )
    }

    return { success: true, chunks: chunks.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return { success: false, chunks: 0, error: message }
  }
}

async function getDocumentsToIndex(userId?: string): Promise<Document[]> {
  let sql = `
    SELECT d.id, d.user_id, d.nom, d.chemin_fichier, d.type
    FROM documents d
    LEFT JOIN (
      SELECT document_id, COUNT(*) as chunk_count
      FROM document_embeddings
      GROUP BY document_id
    ) de ON d.id = de.document_id
    WHERE de.chunk_count IS NULL
  `

  const params: string[] = []

  if (userId) {
    sql += ` AND d.user_id = $1`
    params.push(userId)
  }

  sql += ` ORDER BY d.created_at DESC`

  const result = await pool.query(sql, params)
  return result.rows
}

async function main() {
  console.log('🚀 Démarrage indexation batch des documents...\n')

  // Parse arguments
  const args = process.argv.slice(2)
  let userId: string | undefined
  let batchSize = config.batchSize

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id' && args[i + 1]) {
      userId = args[i + 1]
      i++
    }
    if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1])
      i++
    }
  }

  // Initialiser les clients
  initClients()

  // Vérifier la configuration
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY non configuré')
    process.exit(1)
  }

  // Récupérer les documents à indexer
  const documents = await getDocumentsToIndex(userId)

  console.log(`📄 ${documents.length} documents à indexer`)
  if (userId) {
    console.log(`👤 Filtré pour l'utilisateur: ${userId}`)
  }
  console.log(`📦 Taille batch: ${batchSize}`)
  console.log('')

  if (documents.length === 0) {
    console.log('✅ Tous les documents sont déjà indexés!')
    process.exit(0)
  }

  // Statistiques
  let indexed = 0
  let failed = 0
  let totalChunks = 0

  // Traiter par batch
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize)

    console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`)

    for (const doc of batch) {
      process.stdout.write(`  📄 ${doc.nom.substring(0, 40).padEnd(40)} ... `)

      const result = await indexDocument(doc)

      if (result.success) {
        indexed++
        totalChunks += result.chunks
        console.log(`✅ ${result.chunks} chunks`)
      } else {
        failed++
        console.log(`❌ ${result.error}`)
      }
    }

    // Pause entre les batches pour éviter rate limiting
    if (i + batchSize < documents.length) {
      console.log(`\n⏳ Pause ${config.delayBetweenBatches / 1000}s...`)
      await new Promise((resolve) => setTimeout(resolve, config.delayBetweenBatches))
    }
  }

  // Résumé
  console.log('\n' + '='.repeat(50))
  console.log('📊 RÉSUMÉ')
  console.log('='.repeat(50))
  console.log(`✅ Documents indexés: ${indexed}`)
  console.log(`❌ Documents échoués: ${failed}`)
  console.log(`📝 Total chunks créés: ${totalChunks}`)
  console.log('')

  await pool.end()
}

main().catch((error) => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
