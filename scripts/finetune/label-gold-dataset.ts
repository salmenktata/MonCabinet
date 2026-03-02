#!/usr/bin/env tsx
/**
 * Labellisation du gold dataset (163 questions) pour le fine-tuning query-classifier
 *
 * Pour chaque question, DeepSeek génère 4 dimensions de classification :
 *   - legal_branch : civil | penal | commercial | travail | famille | immobilier | fiscal | procedure | autre
 *   - intent       : definition | procedure | jurisprudence | template | consultation | hors_scope
 *   - language     : ar | fr | mixed
 *   - rag_needed   : true | false
 *
 * Sortie : data/finetune/labeled-gold.jsonl (format ChatML Unsloth)
 *
 * Usage :
 *   npx tsx scripts/finetune/label-gold-dataset.ts --dry-run   # Affiche les 5 premiers
 *   npx tsx scripts/finetune/label-gold-dataset.ts             # Traitement complet
 *
 * Prérequis : DEEPSEEK_API_KEY dans .env.local
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import fs from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import OpenAI from 'openai'

// =============================================================================
// CONFIG
// =============================================================================

const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 1000           // 1s entre requêtes (DeepSeek rate limit comfortable)
const BATCH_SIZE = 5            // Questions par batch DeepSeek
const OUTPUT_PATH = resolve(process.cwd(), 'data/finetune/labeled-gold.jsonl')
const INPUT_PATH  = resolve(process.cwd(), 'data/gold-eval-dataset.json')

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
})

// =============================================================================
// TYPES
// =============================================================================

type LegalBranch = 'civil' | 'penal' | 'commercial' | 'travail' | 'famille' | 'immobilier' | 'fiscal' | 'procedure' | 'autre'
type Intent = 'definition' | 'procedure' | 'jurisprudence' | 'template' | 'consultation' | 'hors_scope'
type Language = 'ar' | 'fr' | 'mixed'

interface ClassificationLabel {
  legal_branch: LegalBranch
  intent: Intent
  language: Language
  rag_needed: boolean
}

interface GoldQuestion {
  id: string
  domain: string
  difficulty: string
  question: string
  intentType?: string
}

interface ChatMLEntry {
  conversations: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

// =============================================================================
// MAPPING DOMAIN → LEGAL_BRANCH (déterministe, pas besoin de LLM)
// =============================================================================

const DOMAIN_TO_BRANCH: Record<string, LegalBranch> = {
  droit_civil:        'civil',
  droit_penal:        'penal',
  droit_commercial:   'commercial',
  droit_travail:      'travail',
  droit_famille:      'famille',
  droit_immobilier:   'immobilier',
  droit_fiscal:       'fiscal',
  procedure:          'procedure',
}

// =============================================================================
// DÉTECTION LANGUE (heuristique Unicode — évite un appel LLM inutile)
// =============================================================================

function detectLanguage(text: string): Language {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  const latinChars  = (text.match(/[a-zA-Z]/g) || []).length
  if (arabicChars === 0) return 'fr'
  if (latinChars === 0)  return 'ar'
  return 'mixed'
}

// =============================================================================
// PROMPT SYSTÈME (classifier)
// =============================================================================

const SYSTEM_PROMPT = `Tu es un classificateur de requêtes juridiques tunisiennes.
Analyse la question et retourne UNIQUEMENT un objet JSON valide avec ces 4 champs :

{
  "intent": "definition" | "procedure" | "jurisprudence" | "template" | "consultation",
  "rag_needed": true | false
}

Définitions des intents :
- definition   : demande de définition ou d'explication d'un concept juridique
- procedure    : demande sur les étapes, délais ou formalités d'une procédure
- jurisprudence: demande de décisions de justice, arrêts, articles de loi spécifiques
- template     : demande d'un modèle de document (contrat, requête, mise en demeure…)
- consultation : question complexe nécessitant un avis juridique raisonné (plusieurs aspects)

Règle rag_needed :
- true  si la réponse nécessite des textes de loi, jurisprudence ou procédures spécifiques à la Tunisie
- false si c'est une question générale hors droit tunisien ou une salutation

Réponds UNIQUEMENT avec le JSON, sans texte ni markdown.`

// =============================================================================
// CLASSIFICATION VIA DEEPSEEK (intent + rag_needed seulement)
// =============================================================================

async function classifyBatch(questions: GoldQuestion[]): Promise<Array<{ intent: Intent; rag_needed: boolean }>> {
  const prompt = questions.map((q, i) => `[${i + 1}] ${q.question}`).join('\n\n')

  const batchSystemPrompt = `${SYSTEM_PROMPT}

Pour plusieurs questions numérotées, retourne un tableau JSON :
[{"intent": "...", "rag_needed": true}, ...]`

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: batchSystemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 500,
  })

  const raw = response.choices[0].message.content?.trim() || '[]'

  // Extraire le JSON (parfois DeepSeek ajoute ```json ... ```)
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`JSON invalide : ${raw.slice(0, 200)}`)

  const parsed = JSON.parse(jsonMatch[0])

  // Valider que le nombre de réponses correspond
  if (parsed.length !== questions.length) {
    console.warn(`⚠️  Mismatch : ${questions.length} questions, ${parsed.length} réponses — padding avec defaults`)
    while (parsed.length < questions.length) {
      parsed.push({ intent: 'consultation', rag_needed: true })
    }
  }

  return parsed
}

// =============================================================================
// FORMAT CHATML (format Unsloth / Qwen3)
// =============================================================================

const CLASSIFIER_SYSTEM_PROMPT = `Tu es un classificateur expert de requêtes juridiques tunisiennes.
Analyse la question et retourne UNIQUEMENT un JSON avec ces 4 champs :
{
  "legal_branch": "civil|penal|commercial|travail|famille|immobilier|fiscal|procedure|autre",
  "intent": "definition|procedure|jurisprudence|template|consultation|hors_scope",
  "language": "ar|fr|mixed",
  "rag_needed": true|false
}`

function formatChatML(question: string, label: ClassificationLabel): ChatMLEntry {
  return {
    conversations: [
      { role: 'system',    content: CLASSIFIER_SYSTEM_PROMPT },
      { role: 'user',      content: question },
      { role: 'assistant', content: JSON.stringify(label) },
    ],
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🏷️  Labellisation gold dataset pour fine-tuning query-classifier')
  console.log(`   Input  : ${INPUT_PATH}`)
  console.log(`   Output : ${OUTPUT_PATH}`)
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (5 premiers)' : 'COMPLET'}`)
  console.log()

  // Charger gold dataset
  const raw = fs.readFileSync(INPUT_PATH, 'utf-8')
  const questions: GoldQuestion[] = JSON.parse(raw)
  const subset = DRY_RUN ? questions.slice(0, 5) : questions

  console.log(`📊 ${subset.length} questions à labelliser`)

  const results: ChatMLEntry[] = []
  let processed = 0

  // Traitement par batches
  for (let i = 0; i < subset.length; i += BATCH_SIZE) {
    const batch = subset.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(subset.length / BATCH_SIZE)

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} questions)... `)

    try {
      const classifications = await classifyBatch(batch)

      for (let j = 0; j < batch.length; j++) {
        const q = batch[j]
        const cls = classifications[j]

        const label: ClassificationLabel = {
          legal_branch: DOMAIN_TO_BRANCH[q.domain] ?? 'autre',
          intent:       cls.intent as Intent,
          language:     detectLanguage(q.question),
          rag_needed:   cls.rag_needed,
        }

        results.push(formatChatML(q.question, label))
        processed++
      }

      console.log(`✅`)
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`)
      // Continuer avec des labels par défaut pour ce batch
      for (const q of batch) {
        const label: ClassificationLabel = {
          legal_branch: DOMAIN_TO_BRANCH[q.domain] ?? 'autre',
          intent:       'consultation',
          language:     detectLanguage(q.question),
          rag_needed:   true,
        }
        results.push(formatChatML(q.question, label))
        processed++
      }
    }

    // Delay entre batches
    if (i + BATCH_SIZE < subset.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  // Écrire le JSONL
  if (!DRY_RUN) {
    const jsonl = results.map(r => JSON.stringify(r)).join('\n')
    fs.mkdirSync(resolve(process.cwd(), 'data/finetune'), { recursive: true })
    fs.writeFileSync(OUTPUT_PATH, jsonl, 'utf-8')
    console.log()
    console.log(`✅ ${processed} exemples écrits dans ${OUTPUT_PATH}`)
  } else {
    console.log()
    console.log('📋 Aperçu des 5 premiers exemples :')
    results.forEach((entry, i) => {
      const assistant = entry.conversations.find(c => c.role === 'assistant')
      const user = entry.conversations.find(c => c.role === 'user')
      console.log(`\n[${i + 1}] Q: ${user?.content?.slice(0, 80)}...`)
      console.log(`    L: ${assistant?.content}`)
    })
  }

  // Stats
  if (!DRY_RUN) {
    const branches: Record<string, number> = {}
    const intents: Record<string, number> = {}
    const langs: Record<string, number> = {}

    results.forEach(entry => {
      const lbl = JSON.parse(entry.conversations.find(c => c.role === 'assistant')!.content) as ClassificationLabel
      branches[lbl.legal_branch] = (branches[lbl.legal_branch] || 0) + 1
      intents[lbl.intent]        = (intents[lbl.intent]        || 0) + 1
      langs[lbl.language]        = (langs[lbl.language]        || 0) + 1
    })

    console.log('\n📊 Distribution des labels :')
    console.log('  legal_branch :', branches)
    console.log('  intent       :', intents)
    console.log('  language     :', langs)
  }
}

main().catch(err => {
  console.error('💥 Erreur :', err)
  process.exit(1)
})
