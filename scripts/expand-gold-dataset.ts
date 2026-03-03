#!/usr/bin/env npx tsx
/**
 * Script d'expansion du Gold Dataset — 163 → 1000 questions
 *
 * Stratégie :
 *   1. Sélectionne des chunks KB représentatifs par domaine
 *   2. Appelle Groq llama-3.3-70b pour générer 2 questions par chunk (AR + FR)
 *   3. Insère directement dans rag_gold_dataset avec gold_chunk_ids
 *
 * Cibles par domaine (total +837 questions) :
 *   droit_civil +150, droit_commercial +125, droit_penal +117, droit_travail +96,
 *   procedure +96, droit_famille +100, droit_immobilier +92, droit_fiscal +51,
 *   droit_administratif +10
 *
 * Usage (via tunnel SSH prod port 5434) :
 *   DATABASE_URL="postgres://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya" \
 *   GROQ_API_KEY="..." \
 *   npx tsx scripts/expand-gold-dataset.ts [--domain droit_civil] [--dry-run] [--limit 20]
 *
 * @module scripts/expand-gold-dataset
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { Pool } from 'pg'
import crypto from 'crypto'

// =============================================================================
// CONFIGURATION
// =============================================================================

const DB_URL = process.env.DATABASE_URL
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_RPM = 25 // Stay under 30 RPM limit

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const DOMAIN_FILTER = args.find(a => a.startsWith('--domain='))?.split('=')[1] ||
  (args.includes('--domain') ? args[args.indexOf('--domain') + 1] : null)
const LIMIT_PER_DOMAIN = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ||
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '200'), 10)

if (!DB_URL) {
  console.error('DATABASE_URL requis. Utiliser le tunnel SSH (port 5434) :')
  console.error('  DATABASE_URL="postgres://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya" ...')
  process.exit(1)
}
if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY requis')
  process.exit(1)
}

// =============================================================================
// MAPPING DOMAINE → TITRES KB
// =============================================================================

interface DomainConfig {
  titles: string[]          // Titres KB correspondants (ILIKE match)
  targetAdd: number         // Nb questions à ajouter
  languages: ('ar' | 'fr')[] // Langues cibles
  legalBodies: string[]     // Labels pour le prompt (aide le LLM)
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  droit_civil: {
    titles: ['مجلة الالتزامات والعقود', 'code des obligations', 'COC'],
    targetAdd: 150,
    languages: ['ar', 'fr', 'ar', 'fr', 'ar'],  // Mix 60% AR
    legalBodies: ['مجلة الالتزامات والعقود (COC)', 'Code des Obligations et des Contrats'],
  },
  droit_commercial: {
    titles: ['المجلة التجارية', 'مجلة الشركات التجارية', 'commerce'],
    targetAdd: 125,
    languages: ['ar', 'ar', 'fr', 'ar'],
    legalBodies: ['المجلة التجارية', 'مجلة الشركات التجارية'],
  },
  droit_penal: {
    titles: ['المجلة الجزائية', 'مجلة الإجراءات الجزائية', 'code pénal'],
    targetAdd: 117,
    languages: ['ar', 'ar', 'fr', 'ar'],
    legalBodies: ['المجلة الجزائية', 'مجلة الإجراءات الجزائية (CPP)'],
  },
  droit_travail: {
    titles: ['مجلة الشغل', 'code du travail'],
    targetAdd: 96,
    languages: ['ar', 'fr', 'ar'],
    legalBodies: ['مجلة الشغل', 'Code du Travail'],
  },
  procedure: {
    titles: ['مجلة المرافعات المدنية والتجارية', 'مجلة الإجراءات الجزائية', 'procédure'],
    targetAdd: 96,
    languages: ['ar', 'ar', 'fr'],
    legalBodies: ['مجلة المرافعات المدنية والتجارية', 'مجلة الإجراءات الجزائية'],
  },
  droit_famille: {
    titles: ['مجلة الأحوال الشخصية', 'statut personnel', 'CSP'],
    targetAdd: 100,
    languages: ['ar', 'fr', 'ar'],
    legalBodies: ['مجلة الأحوال الشخصية (م.أ.ش)', 'Code du Statut Personnel'],
  },
  droit_immobilier: {
    titles: ['مجلة الحقوق العينية', 'droits réels', 'immatriculation'],
    targetAdd: 92,
    languages: ['ar', 'ar', 'fr'],
    legalBodies: ['مجلة الحقوق العينية', 'Code des Droits Réels'],
  },
  droit_fiscal: {
    titles: ['مجلة المحاسبة العمومية', 'loi de finances', 'code fiscal', 'TVA', 'impôt'],
    targetAdd: 51,
    languages: ['fr', 'ar', 'fr'],
    legalBodies: ['مجلة المحاسبة العمومية', 'Code Fiscal Tunisien'],
  },
  droit_administratif: {
    titles: ['مجلة الجماعات المحلية', 'الجماعات', 'collectivités'],
    targetAdd: 10,
    languages: ['ar', 'fr'],
    legalBodies: ['مجلة الجماعات المحلية', 'Code des Collectivités Locales'],
  },
}

// =============================================================================
// TEMPLATES DE PROMPT
// =============================================================================

const QUESTION_TYPES = ['factual', 'procedural', 'lookup', 'comparative', 'reasoning'] as const
type QuestionType = typeof QUESTION_TYPES[number]

function buildGenerationPrompt(
  chunkContent: string,
  domain: string,
  language: 'ar' | 'fr',
  legalBodies: string[],
  questionType: QuestionType
): string {
  const langInstr = language === 'ar'
    ? 'La question et les key_points doivent être en arabe (لغة قانونية رسمية تونسية).'
    : 'La question et les key_points doivent être en français juridique tunisien formel.'

  const typeGuide: Record<QuestionType, string> = {
    factual: language === 'ar'
      ? 'Question factuelle : "ما هي...", "ما هو...", "ما المقصود بـ..." (demande une définition ou un contenu)'
      : 'Question factuelle : "Quelles sont...", "Quel est...", "Qu\'est-ce que..." (demande définition/contenu)',
    procedural: language === 'ar'
      ? 'Question procédurale : "كيف يتم...", "ما هي إجراءات...", "ما الخطوات..." (demande une procédure)'
      : 'Question procédurale : "Comment...", "Quelle est la procédure...", "Quelles sont les étapes..." ',
    lookup: language === 'ar'
      ? 'Question de consultation directe : "ما نص الفصل X من...", "ماذا ينص الفصل X على..." (demande le texte d\'un article)'
      : 'Question de consultation : "Que prévoit l\'article X de...", "Quel est le texte de l\'article X..."',
    comparative: language === 'ar'
      ? 'Question comparative : "ما الفرق بين... و...", "قارن بين..." (demande une comparaison)'
      : 'Question comparative : "Quelle est la différence entre... et...", "Comparez..." ',
    reasoning: language === 'ar'
      ? 'Question de raisonnement : "لماذا يشترط القانون...", "ما الحكمة من..." (demande une explication du ratio legis)'
      : 'Question de raisonnement : "Pourquoi le droit tunisien exige-t-il...", "Quel est le fondement de..."',
  }

  return `Tu es un juriste expert en droit tunisien. À partir du fragment de texte juridique ci-dessous, génère EXACTEMENT 1 question de type "${questionType}" dans le domaine "${domain}".

${langInstr}

TYPE DE QUESTION : ${typeGuide[questionType]}

TEXTE JURIDIQUE SOURCE :
---
${chunkContent.slice(0, 1200)}
---

INSTRUCTIONS :
- La question doit pouvoir être répondue UNIQUEMENT à partir du texte source
- La question doit être précise et juridiquement correcte
- Les key_points doivent lister 3-5 éléments essentiels que doit contenir une bonne réponse
- Les expected_articles doivent lister les références d'articles mentionnées dans le texte (format: "الفصل X" ou "Article X")
- La difficulté : "easy" si question simple/directe, "medium" si nécessite analyse, "hard" si synthèse complexe, "expert" si technicité élevée

RÉPONDS UNIQUEMENT EN JSON VALIDE (sans markdown, sans backticks) :
{
  "question": "...",
  "key_points": ["point1", "point2", "point3"],
  "mandatory_citations": ["Fsl X مجلة YY" | "Article X Code YY"],
  "expected_articles": ["الفصل X" | "Article X"],
  "difficulty": "easy" | "medium" | "hard" | "expert",
  "intent_type": "${questionType}"
}`
}

// =============================================================================
// APPEL GROQ
// =============================================================================

interface GeneratedQuestion {
  question: string
  key_points: string[]
  mandatory_citations: string[]
  expected_articles: string[]
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  intent_type: QuestionType
}

async function callGroq(prompt: string): Promise<GeneratedQuestion | null> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      if (res.status === 429) {
        console.warn('  ⚠ Rate limit Groq — attente 60s...')
        await sleep(60_000)
        return null
      }
      console.error(`  ✗ Groq ${res.status}: ${err.slice(0, 100)}`)
      return null
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content?.trim() || ''

    // Parser le JSON généré
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('  ⚠ JSON introuvable dans la réponse Groq')
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeneratedQuestion
    if (!parsed.question || !parsed.key_points?.length) return null

    return parsed
  } catch (err) {
    console.error('  ✗ Erreur Groq:', err instanceof Error ? err.message : err)
    return null
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateId(domain: string, difficulty: string, index: number): string {
  const prefix = domain.replace('droit_', '').slice(0, 6)
  return `${prefix}_${difficulty.slice(0, 3)}_gen_${String(index).padStart(4, '0')}`
}

// =============================================================================
// SÉLECTION CHUNKS KB
// =============================================================================

interface KBChunk {
  id: string
  content: string
  kb_title: string
  category: string
}

async function selectChunksForDomain(
  db: Pool,
  domain: string,
  config: DomainConfig,
  targetCount: number,
  existingGoldChunkIds: Set<string>
): Promise<KBChunk[]> {
  const titleConditions = config.titles.map((_, i) => `kb.title ILIKE $${i + 2}`).join(' OR ')
  const params: (string | number)[] = [Math.ceil(targetCount * 2), ...config.titles.map(t => `%${t}%`)]

  const result = await db.query<KBChunk & { kb_title: string }>(
    `SELECT kc.id, kc.content, kb.title AS kb_title, kb.category
     FROM knowledge_base_chunks kc
     JOIN knowledge_base kb ON kc.knowledge_base_id = kb.id
     WHERE kc.embedding IS NOT NULL
       AND length(kc.content) BETWEEN 200 AND 2000
       AND (${titleConditions})
       AND kc.id::text NOT IN (
         SELECT UNNEST(gold_chunk_ids)::text FROM rag_gold_dataset
       )
     ORDER BY RANDOM()
     LIMIT $1`,
    params
  )

  return result.rows.filter(c => !existingGoldChunkIds.has(c.id)).slice(0, targetCount)
}

// =============================================================================
// GÉNÉRER ET INSÉRER
// =============================================================================

async function generateForDomain(
  db: Pool,
  domain: string,
  config: DomainConfig,
  existingGoldChunkIds: Set<string>,
  startIndex: number
): Promise<number> {
  const chunksNeeded = Math.ceil(config.targetAdd / 1.5) // ~1.5 questions valides par chunk
  console.log(`\n📚 [${domain}] Sélection de ${chunksNeeded} chunks KB...`)

  const chunks = await selectChunksForDomain(db, domain, config, chunksNeeded, existingGoldChunkIds)
  console.log(`   → ${chunks.length} chunks sélectionnés`)

  if (chunks.length === 0) {
    console.warn(`   ⚠ Aucun chunk trouvé pour ${domain}`)
    return 0
  }

  let inserted = 0
  let chunkIdx = 0
  const langCycle = config.languages
  const typeCycle: QuestionType[] = ['factual', 'procedural', 'factual', 'lookup', 'comparative', 'reasoning', 'factual', 'procedural']

  for (const chunk of chunks) {
    if (inserted >= config.targetAdd) break

    const lang = langCycle[chunkIdx % langCycle.length] as 'ar' | 'fr'
    const qType = typeCycle[chunkIdx % typeCycle.length]
    const prompt = buildGenerationPrompt(chunk.content, domain, lang, config.legalBodies, qType)

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] chunk ${chunk.id.slice(0, 8)} → question ${lang}/${qType}`)
      inserted++
      chunkIdx++
      continue
    }

    const generated = await callGroq(prompt)
    if (!generated) {
      chunkIdx++
      await sleep(2_000) // Anti-rate-limit
      continue
    }

    const id = generateId(domain, generated.difficulty, startIndex + inserted)

    try {
      await db.query(
        `INSERT INTO rag_gold_dataset (
          id, domain, difficulty, question, intent_type,
          key_points, mandatory_citations, expected_articles,
          gold_chunk_ids, gold_document_ids,
          min_recall_at_5, notes, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          id,
          domain,
          generated.difficulty,
          generated.question,
          generated.intent_type,
          generated.key_points,
          generated.mandatory_citations,
          generated.expected_articles,
          [chunk.id],  // gold_chunk_ids
          [],          // gold_document_ids (sera peuplé par populate-gold-chunks si besoin)
          0.5,         // min_recall_at_5
          `auto-generated from chunk ${chunk.id.slice(0, 8)} (${chunk.kb_title})`,
        ]
      )
      inserted++
      console.log(`  ✓ ${id} [${lang}/${qType}] : ${generated.question.slice(0, 60)}...`)
    } catch (err) {
      console.error(`  ✗ INSERT échoué pour ${id}:`, err instanceof Error ? err.message : err)
    }

    chunkIdx++
    // Rate limiting : 25 RPM = 2.4s entre appels
    await sleep(Math.ceil(60_000 / GROQ_RPM))
  }

  return inserted
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('=== Expansion Gold Dataset 163 → 1000 questions ===')
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY-RUN (pas d\'insertion)' : '✏️ WRITE (insertion en DB)'}`)
  if (DOMAIN_FILTER) console.log(`Filtre domaine: ${DOMAIN_FILTER}`)
  console.log(`Limite par domaine: ${LIMIT_PER_DOMAIN} questions max`)

  const db = new Pool({ connectionString: DB_URL, max: 5 })

  // Récupérer les IDs gold chunks déjà utilisés
  const existingResult = await db.query<{ chunk_id: string }>(
    `SELECT UNNEST(gold_chunk_ids) AS chunk_id FROM rag_gold_dataset`
  )
  const existingGoldChunkIds = new Set(existingResult.rows.map(r => r.chunk_id))
  console.log(`\n📊 ${existingGoldChunkIds.size} chunks déjà utilisés dans le gold dataset`)

  // Compte actuel par domaine
  const countResult = await db.query<{ domain: string; count: string }>(
    `SELECT domain, COUNT(*) FROM rag_gold_dataset GROUP BY domain`
  )
  const currentCounts: Record<string, number> = {}
  for (const r of countResult.rows) {
    currentCounts[r.domain] = parseInt(r.count)
  }
  console.log('\n📈 Distribution actuelle :')
  for (const [d, n] of Object.entries(currentCounts)) {
    console.log(`  ${d}: ${n}`)
  }

  // Sélectionner les domaines à traiter
  const domainsToProcess = DOMAIN_FILTER
    ? [[DOMAIN_FILTER, DOMAIN_CONFIGS[DOMAIN_FILTER]] as [string, DomainConfig]]
    : Object.entries(DOMAIN_CONFIGS)

  let totalInserted = 0
  let globalIndex = Object.values(currentCounts).reduce((a, b) => a + b, 163) // Après 163 existantes

  for (const [domain, config] of domainsToProcess) {
    if (!config) {
      console.warn(`Domaine inconnu: ${domain}`)
      continue
    }

    const alreadyHave = currentCounts[domain] || 0
    const stillNeeded = Math.min(config.targetAdd - alreadyHave, LIMIT_PER_DOMAIN)

    if (stillNeeded <= 0) {
      console.log(`\n✅ [${domain}] Cible déjà atteinte (${alreadyHave}/${config.targetAdd})`)
      continue
    }

    console.log(`\n🎯 [${domain}] Besoin: +${stillNeeded} (actuel: ${alreadyHave}, cible: ${config.targetAdd})`)

    const n = await generateForDomain(db, domain, { ...config, targetAdd: stillNeeded }, existingGoldChunkIds, globalIndex)
    totalInserted += n
    globalIndex += n
    console.log(`  → ${n} questions insérées pour ${domain}`)
  }

  // Résumé final
  const finalCount = await db.query<{ count: string }>('SELECT COUNT(*) FROM rag_gold_dataset')
  console.log('\n=== RÉSUMÉ ===')
  console.log(`Questions insérées: +${totalInserted}`)
  console.log(`Total gold dataset: ${finalCount.rows[0].count}`)

  await db.end()
}

main().catch(err => {
  console.error('ERREUR:', err)
  process.exit(1)
})
