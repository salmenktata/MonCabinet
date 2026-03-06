/**
 * Script de simulation RAG Qadhya
 * Usage: npx tsx scripts/ask-qadhya.ts "السؤال هنا"
 *
 * Simule exactement ce que ferait l'API /api/chat en production :
 * 1. Génère l'embedding de la question
 * 2. Recherche les chunks similaires dans la KB
 * 3. Appelle le LLM avec le contexte récupéré
 * 4. Affiche la réponse + sources + qualité
 */

// IMPORTANT: dotenv doit être le premier import pour que process.env soit chargé
// avant l'initialisation des modules IA (qui lisent process.env au chargement)
import 'dotenv/config'

import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import { query } from '@/lib/db/postgres'
import { callLLM } from '@/lib/ai/llm-fallback-service'
import { SYSTEM_PROMPTS } from '@/lib/ai/config'

async function main() {
  const question = process.argv[2]
  if (!question) {
    console.error('Usage: npx tsx scripts/ask-qadhya.ts "السؤال هنا"')
    process.exit(1)
  }

  console.log(`\n🔍 Question: ${question}\n`)
  console.log('━'.repeat(60))

  // ── 1. Génération de l'embedding ──────────────────────────────
  console.log('⚙️  Génération de l\'embedding...')
  const embResult = await generateEmbedding(question)
  console.log(`   Provider: ${embResult.provider} | Dimensions: ${embResult.embedding.length}`)

  const embStr = formatEmbeddingForPostgres(embResult.embedding)
  const col = embResult.provider === 'openai' ? 'embedding_openai' : 'embedding'

  // ── 2. Recherche RAG dans la KB ───────────────────────────────
  console.log('🗄️  Recherche dans la base de connaissances...')
  const r = await query<{
    title: string
    chunk_index: number
    content: string
    similarity: string
  }>(`
    SELECT kb.title,
           kbc.chunk_index,
           kbc.content,
           (1 - (kbc.${col} <=> $1::vector)) AS similarity
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.${col} IS NOT NULL
      AND (1 - (kbc.${col} <=> $1::vector)) > 0.45
    ORDER BY kbc.${col} <=> $1::vector
    LIMIT 5
  `, [embStr])

  if (r.rows.length === 0) {
    console.log('\n❌ Aucun chunk pertinent trouvé (similarity < 0.45)')
    console.log('   → La KB ne contient pas de contenu pertinent pour cette question.')
    process.exit(0)
  }

  const avgSim = r.rows.reduce((acc, row) => acc + parseFloat(row.similarity), 0) / r.rows.length
  const quality = avgSim >= 0.65 ? 'high' : avgSim >= 0.55 ? 'medium' : 'low'

  console.log(`   ${r.rows.length} chunks trouvés | Similarité moyenne: ${avgSim.toFixed(3)} | Qualité: ${quality}`)

  // ── 3. Construction du contexte ───────────────────────────────
  const contextParts = r.rows.map((row, i) => {
    const sim = parseFloat(row.similarity).toFixed(3)
    return `[KB-${i + 1}] ${row.title} (chunk #${row.chunk_index}, sim: ${sim})\n${row.content}`
  })

  const contextText = contextParts.join('\n\n---\n\n')

  const userMessage = `السياق القانوني:

${contextText}

---

السؤال: ${question}`

  // ── 4. Appel LLM ──────────────────────────────────────────────
  console.log('\n🤖 Appel au LLM...')

  const response = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPTS.qadhya },
      { role: 'user', content: userMessage },
    ],
    {
      temperature: 0.1,
      maxTokens: 1024,
    }
  )

  // ── 5. Affichage de la réponse ────────────────────────────────
  console.log('\n' + '━'.repeat(60))
  console.log(`📊 Qualité: ${quality.toUpperCase()} | Sim. moyenne: ${avgSim.toFixed(3)} | Modèle: ${response.modelUsed} (${response.provider})`)
  console.log(`🔢 Tokens: input=${response.tokensUsed.input} | output=${response.tokensUsed.output}`)
  console.log('━'.repeat(60))
  console.log('\n📝 RÉPONSE:\n')
  console.log(response.answer)
  console.log('\n' + '━'.repeat(60))
  console.log('\n📚 SOURCES CONSULTÉES:')
  r.rows.forEach((row, i) => {
    const sim = parseFloat(row.similarity).toFixed(3)
    const preview = row.content.substring(0, 80).replace(/\n/g, ' ')
    console.log(`  [KB-${i + 1}] ${row.title} #${row.chunk_index} (sim: ${sim})`)
    console.log(`       "${preview}..."`)
  })
  console.log()

  process.exit(0)
}

main().catch(err => {
  console.error('Erreur:', err.message || err)
  process.exit(1)
})
