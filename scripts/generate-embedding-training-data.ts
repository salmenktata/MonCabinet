/**
 * Génération du dataset d'entraînement pour fine-tuning des embeddings juridiques
 *
 * Objectif : Créer des paires (query, positive_passage, negative_passage) alignées
 * sur la similarité juridique tunisienne AR+FR (et non généraliste).
 *
 * Usage :
 *   npx tsx scripts/generate-embedding-training-data.ts
 *   npx tsx scripts/generate-embedding-training-data.ts --sample 500 --output data/embedding-pairs.jsonl
 *   npx tsx scripts/generate-embedding-training-data.ts --lang ar --category codes
 *
 * Options :
 *   --sample N      Nombre de chunks à échantillonner (défaut: 1000)
 *   --output PATH   Fichier de sortie JSONL (défaut: data/embedding-training-data.jsonl)
 *   --lang          Langue cible : 'ar' | 'fr' | 'both' (défaut: both)
 *   --category      Filtrer par catégorie KB : codes | legislation | juris | etc.
 *   --questions N   Nombre de questions par chunk (défaut: 3)
 *   --dry-run       Afficher un exemple sans écrire le fichier
 */

import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { callLLM } from '../lib/ai/llm-fallback-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const args = process.argv.slice(2)
const getArg = (name: string, defaultVal: string) => {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal
}

const SAMPLE_SIZE = parseInt(getArg('sample', '1000'))
const OUTPUT_FILE = getArg('output', 'data/embedding-training-data.jsonl')
const LANG_FILTER = getArg('lang', 'both') as 'ar' | 'fr' | 'both'
const CATEGORY_FILTER = getArg('category', '') || null
const QUESTIONS_PER_CHUNK = parseInt(getArg('questions', '3'))
const DRY_RUN = args.includes('--dry-run')

// Minimum de tokens dans un chunk pour être utilisable
const MIN_CHUNK_LENGTH = 200
// Pause entre appels DeepSeek (rate limit)
const DEEPSEEK_DELAY_MS = 300

// =============================================================================
// TYPES
// =============================================================================

interface TrainingPair {
  query: string
  positive: string
  negative?: string
  metadata: {
    chunk_id: string
    category: string
    lang: 'ar' | 'fr'
    doc_title: string
  }
}

interface KBChunk {
  id: string
  content: string
  knowledge_base_id: string
  category: string
  title: string
  metadata: Record<string, unknown>
}

// =============================================================================
// DB CONNECTION
// =============================================================================

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
})

// =============================================================================
// LANGUAGE DETECTION
// =============================================================================

function detectLanguage(text: string): 'ar' | 'fr' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length
  return arabicChars > latinChars ? 'ar' : 'fr'
}

// =============================================================================
// SAMPLE CHUNKS FROM KB
// =============================================================================

async function sampleChunks(): Promise<KBChunk[]> {
  const categoryClause = CATEGORY_FILTER
    ? `AND kb.category = '${CATEGORY_FILTER}'`
    : ''

  // Stratified sampling : équilibrer par catégorie
  const result = await db.query<KBChunk>(`
    SELECT
      kbc.id,
      kbc.content,
      kbc.knowledge_base_id,
      kb.category,
      kb.title,
      kbc.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.is_indexed = true
      AND kb.is_active = true
      AND kb.rag_enabled = true
      AND length(kbc.content) >= $1
      ${categoryClause}
    ORDER BY random()
    LIMIT $2
  `, [MIN_CHUNK_LENGTH, SAMPLE_SIZE])

  console.log(`✅ ${result.rows.length} chunks échantillonnés depuis la KB`)
  return result.rows
}

// =============================================================================
// FETCH HARD NEGATIVES (même catégorie, doc différent)
// =============================================================================

async function getHardNegative(chunk: KBChunk): Promise<string | null> {
  const result = await db.query(`
    SELECT kbc.content
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.category = $1
      AND kbc.knowledge_base_id != $2
      AND kb.is_indexed = true
      AND length(kbc.content) >= $3
    ORDER BY random()
    LIMIT 1
  `, [chunk.category, chunk.knowledge_base_id, MIN_CHUNK_LENGTH])

  return result.rows[0]?.content || null
}

// =============================================================================
// GENERATE QUESTIONS VIA DEEPSEEK
// =============================================================================

async function generateQuestions(chunk: KBChunk): Promise<string[]> {
  const lang = detectLanguage(chunk.content)

  if (LANG_FILTER !== 'both' && lang !== LANG_FILTER) {
    return []
  }

  const truncated = chunk.content.slice(0, 1200)

  const systemPrompt = lang === 'ar'
    ? `أنت خبير قانوني متخصص في القانون التونسي. مهمتك توليد أسئلة قانونية طبيعية بالعربية التونسية يمكن أن يطرحها محامٍ أو مواطن حول النص القانوني المقدم. الأسئلة يجب أن تكون متنوعة (تعريفية، إجرائية، عملية) وألا تتضمن الإجابة صراحةً.`
    : `Tu es un expert juridique spécialisé en droit tunisien. Ta mission est de générer des questions juridiques naturelles en français qu'un avocat ou un citoyen pourrait poser sur le texte juridique fourni. Les questions doivent être variées (définitionnelles, procédurales, pratiques) et ne pas contenir explicitement la réponse.`

  const userPrompt = lang === 'ar'
    ? `اقرأ النص القانوني التالي وأنشئ ${QUESTIONS_PER_CHUNK} أسئلة قانونية طبيعية باللغة العربية. النص:\n\n${truncated}\n\nأعطِ فقط قائمة الأسئلة، سؤال واحد في كل سطر، بدون ترقيم أو شرح.`
    : `Lis le texte juridique suivant et génère ${QUESTIONS_PER_CHUNK} questions juridiques naturelles en français. Texte :\n\n${truncated}\n\nDonne uniquement la liste des questions, une par ligne, sans numérotation ni explication.`

  try {
    const response = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.7,
        maxTokens: 400,
        operationName: 'indexation', // → DeepSeek en prod, Ollama en dev
      }
    )

    const questions = (response.answer || '')
      .split('\n')
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 15 && !q.startsWith('#'))
      .slice(0, QUESTIONS_PER_CHUNK)

    return questions
  } catch (err) {
    console.error(`  ⚠️  DeepSeek error pour chunk ${chunk.id}:`, err)
    return []
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n🏛️  Qadhya — Générateur de dataset d\'entraînement embeddings juridiques')
  console.log('='.repeat(65))
  console.log(`📊 Chunks à traiter : ${SAMPLE_SIZE}`)
  console.log(`🌍 Langue : ${LANG_FILTER}`)
  console.log(`❓ Questions/chunk : ${QUESTIONS_PER_CHUNK}`)
  console.log(`📁 Sortie : ${OUTPUT_FILE}`)
  if (CATEGORY_FILTER) console.log(`🏷️  Catégorie : ${CATEGORY_FILTER}`)
  if (DRY_RUN) console.log('🧪 Mode dry-run activé\n')

  // 1. Échantillonner les chunks
  const chunks = await sampleChunks()

  if (DRY_RUN) {
    const sample = chunks[0]
    console.log('\n📝 Exemple de chunk :')
    console.log(sample.content.slice(0, 300))
    console.log('\n🔧 Génération des questions (dry-run sur 1 chunk)...')
    const questions = await generateQuestions(sample)
    console.log('Questions générées :')
    questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`))
    await db.end()
    return
  }

  // 2. Préparer le fichier de sortie
  const outputDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf-8' })

  let totalPairs = 0
  let skipped = 0

  console.log('\n⚙️  Génération en cours...\n')

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const progress = `[${i + 1}/${chunks.length}]`

    // Générer les questions
    const questions = await generateQuestions(chunk)

    if (questions.length === 0) {
      skipped++
      process.stdout.write(`${progress} ⏭️  ${chunk.id.slice(0, 8)} — skip (langue filtrée ou erreur)\r`)
      continue
    }

    // Récupérer un négatif dur
    const negative = await getHardNegative(chunk)

    // Créer une paire par question
    for (const query of questions) {
      const pair: TrainingPair = {
        query,
        positive: chunk.content,
        ...(negative ? { negative } : {}),
        metadata: {
          chunk_id: chunk.id,
          category: chunk.category,
          lang: detectLanguage(chunk.content),
          doc_title: chunk.title,
        },
      }

      writeStream.write(JSON.stringify(pair) + '\n')
      totalPairs++
    }

    process.stdout.write(`${progress} ✅ ${chunk.id.slice(0, 8)} — ${questions.length} paires (total: ${totalPairs})\r`)

    // Rate limiting DeepSeek
    await new Promise(resolve => setTimeout(resolve, DEEPSEEK_DELAY_MS))
  }

  writeStream.end()
  await db.end()

  console.log('\n\n' + '='.repeat(65))
  console.log(`✅ Dataset généré : ${OUTPUT_FILE}`)
  console.log(`📊 Total paires : ${totalPairs}`)
  console.log(`⏭️  Chunks ignorés : ${skipped}`)
  console.log(`💰 Coût estimé DeepSeek : ~$${((chunks.length - skipped) * QUESTIONS_PER_CHUNK * 0.001).toFixed(2)}`)
  console.log('\n📌 Prochaines étapes :')
  console.log('  1. Uploader sur Hugging Face : huggingface-cli upload <repo> data/embedding-training-data.jsonl')
  console.log('  2. Fine-tuner via Colab Unsloth (EmbeddingGemma-300M ou BGE-M3)')
  console.log('  3. Exporter GGUF → ollama create qadhya-embed-legal:v1 -f Modelfile')
  console.log('  4. Mettre à jour OLLAMA_EMBEDDING_MODEL=qadhya-embed-legal:v1')
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
