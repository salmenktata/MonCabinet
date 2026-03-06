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

// Codes légaux tunisiens reconnus — pour détecter une mention explicite dans la question
const LEGAL_CODES: Array<{ keywords: string[]; label: string; titleKeyword: string }> = [
  { keywords: ['الديوانة', 'ديوانة', 'جمرك', 'جمركي'], label: 'مجلة الديوانة', titleKeyword: 'الديوانة' },
  { keywords: ['الشركات التجارية', 'الشركات'], label: 'مجلة الشركات التجارية', titleKeyword: 'الشركات' },
  { keywords: ['المرافعات', 'مجلة مرافعات'], label: 'مجلة المرافعات المدنية والتجارية', titleKeyword: 'المرافعات' },
  { keywords: ['العقوبات', 'مجلة عقوبات'], label: 'مجلة العقوبات', titleKeyword: 'العقوبات' },
  { keywords: ['الالتزامات والعقود', 'م.إ.ع'], label: 'مجلة الالتزامات والعقود', titleKeyword: 'الالتزامات' },
  { keywords: ['الأحوال الشخصية'], label: 'مجلة الأحوال الشخصية', titleKeyword: 'الأحوال الشخصية' },
  { keywords: ['الشغل', 'مجلة شغل'], label: 'مجلة الشغل', titleKeyword: 'الشغل' },
  { keywords: ['الضريبة على دخل', 'الضريبة على الشركات'], label: 'مجلة الضريبة على دخل الأشخاص الطبيعيين والضريبة على الشركات', titleKeyword: 'الضريبة' },
]

// Ordinals arabes → numéros d'articles
const ARABIC_ORDINALS: Array<[string, number]> = [
  ['الحادي عشر', 11], ['الثاني عشر', 12],
  ['الأول', 1], ['الثاني', 2], ['الثالث', 3], ['الرابع', 4], ['الخامس', 5],
  ['السادس', 6], ['السابع', 7], ['الثامن', 8], ['التاسع', 9], ['العاشر', 10],
]

function detectMentionedCode(question: string): typeof LEGAL_CODES[0] | null {
  for (const code of LEGAL_CODES) {
    if (code.keywords.some(kw => question.includes(kw))) return code
  }
  return null
}

function detectArticleNumber(question: string): number | null {
  for (const [ordinal, num] of ARABIC_ORDINALS) {
    if (question.includes(ordinal)) return num
  }
  const m = question.match(/(?:الفصل|المادة)\s+(\d+)/)
  if (m) return parseInt(m[1], 10)
  return null
}

async function main() {
  const question = process.argv[2]
  if (!question) {
    console.error('Usage: npx tsx scripts/ask-qadhya.ts "السؤال هنا"')
    process.exit(1)
  }

  console.log(`\n🔍 Question: ${question}\n`)
  console.log('━'.repeat(60))

  const detectedCode = detectMentionedCode(question)
  const articleNumber = detectArticleNumber(question)
  if (detectedCode) {
    console.log(`📌 Code légal détecté : ${detectedCode.label}`)
  }
  if (articleNumber !== null) {
    console.log(`🔢 Article détecté : الفصل ${articleNumber}`)
  }

  // ── 1. Génération de l'embedding ──────────────────────────────
  console.log('⚙️  Génération de l\'embedding...')
  const embResult = await generateEmbedding(question)
  console.log(`   Provider: ${embResult.provider} | Dimensions: ${embResult.embedding.length}`)

  const embStr = formatEmbeddingForPostgres(embResult.embedding)
  const col = embResult.provider === 'openai' ? 'embedding_openai' : 'embedding'

  // ── 2. Recherche RAG dans la KB ───────────────────────────────
  console.log('🗄️  Recherche dans la base de connaissances...')

  type ChunkRow = {
    title: string
    chunk_index: number
    content: string
    similarity: string
    doc_type: string | null
    norm_level: string | null
    category: string | null
  }

  // A. Recherche par mot-clé si code légal + numéro d'article détectés
  let keyword: ChunkRow[] = []
  if (detectedCode && articleNumber !== null) {
    const articleRegex = `الفصل ${articleNumber}[^0-9]`
    const kw = await query<ChunkRow>(`
      SELECT kb.title,
             kbc.chunk_index,
             kbc.content,
             0.92 AS similarity,
             kb.doc_type,
             kb.norm_level,
             kb.category
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.title ILIKE $1
        AND kbc.content ~ $2
        AND kbc.chunk_index > 0
      ORDER BY kbc.chunk_index ASC
      LIMIT 2
    `, [`%${detectedCode.titleKeyword}%`, articleRegex])
    keyword = kw.rows
    if (keyword.length > 0) {
      console.log(`   → ${keyword.length} chunk(s) 🔑 keyword "الفصل ${articleNumber}" dans "${detectedCode.label}"`)
    }
  }

  // B. Recherche vectorielle ciblée sur le code légal mentionné
  let targeted: ChunkRow[] = []
  if (detectedCode) {
    const tr = await query<ChunkRow>(`
      SELECT kb.title,
             kbc.chunk_index,
             kbc.content,
             (1 - (kbc.${col} <=> $1::vector)) AS similarity,
             kb.doc_type,
             kb.norm_level,
             kb.category
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.${col} IS NOT NULL
        AND kb.title ILIKE $2
        AND (1 - (kbc.${col} <=> $1::vector)) > 0.40
      ORDER BY kbc.${col} <=> $1::vector
      LIMIT 3
    `, [embStr, `%${detectedCode.titleKeyword}%`])
    targeted = tr.rows
    if (targeted.length > 0) {
      console.log(`   → ${targeted.length} chunk(s) 🎯 vectoriel depuis "${detectedCode.label}"`)
    }
  }

  // C. Recherche vectorielle générale (5 chunks)
  const r = await query<ChunkRow>(`
    SELECT kb.title,
           kbc.chunk_index,
           kbc.content,
           (1 - (kbc.${col} <=> $1::vector)) AS similarity,
           kb.doc_type,
           kb.norm_level,
           kb.category
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.${col} IS NOT NULL
      AND (1 - (kbc.${col} <=> $1::vector)) > 0.45
    ORDER BY kbc.${col} <=> $1::vector
    LIMIT 5
  `, [embStr])

  // Fusionner : keyword > ciblé > général (sans doublons)
  const seen = new Set<string>()
  const dedup = (arr: ChunkRow[]) => arr.filter(row => {
    const key = `${row.title}#${row.chunk_index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const keywordNew = dedup(keyword)
  const targetedNew = dedup(targeted)
  const generalNew = dedup(r.rows)
  const rows: ChunkRow[] = [...keywordNew, ...targetedNew, ...generalNew].slice(0, 5)

  if (rows.length === 0) {
    console.log('\n❌ Aucun chunk pertinent trouvé (similarity < 0.45)')
    console.log('   → La KB ne contient pas de contenu pertinent pour cette question.')
    process.exit(0)
  }

  const avgSim = rows.reduce((acc, row) => acc + parseFloat(row.similarity), 0) / rows.length
  const quality = avgSim >= 0.65 ? 'high' : avgSim >= 0.55 ? 'medium' : 'low'

  console.log(`   ${rows.length} chunks trouvés | Similarité moyenne: ${avgSim.toFixed(3)} | Qualité: ${quality}`)

  // ── Avertissement hors-sujet ──────────────────────────────────
  if (detectedCode) {
    const hasRelevantSource = rows.some(row => row.title.includes(detectedCode.titleKeyword))
    if (!hasRelevantSource) {
      console.log(`\n⚠️  ATTENTION: Aucune source de "${detectedCode.label}" dans le top-5`)
      console.log(`   Les chunks retournés sont d'autres documents — réponse probablement incorrecte.`)
    }
  }

  // ── 3. Construction du contexte ───────────────────────────────
  const contextParts = rows.map((row, i) => {
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
  rows.forEach((row, i) => {
    const sim = parseFloat(row.similarity).toFixed(3)
    const preview = row.content.substring(0, 80).replace(/\n/g, ' ')
    const meta = [row.doc_type, row.norm_level, row.category].filter(Boolean).join(' | ')
    const tag = i < keywordNew.length ? ' 🔑' : i < keywordNew.length + targetedNew.length ? ' 🎯' : ''
    console.log(`  [KB-${i + 1}]${tag} ${row.title} #${row.chunk_index} (sim: ${sim})`)
    if (meta) console.log(`       📋 ${meta}`)
    console.log(`       "${preview}..."`)
  })
  console.log()

  process.exit(0)
}

main().catch(err => {
  console.error('Erreur:', err.message || err)
  process.exit(1)
})
