#!/usr/bin/env tsx
/**
 * Génération de dataset synthétique pour le fine-tuning query-classifier
 *
 * Génère ~1500 questions juridiques AR/FR avec leurs labels (4 dimensions)
 * pour compléter les 163 exemples gold avec une distribution équilibrée.
 *
 * Stratégie de génération :
 *   - 9 domaines × 5 intents = 45 combinaisons
 *   - ~25 questions par combinaison ≈ 1125 exemples "rag_needed=true"
 *   - ~200 exemples "hors_scope" (questions non-juridiques, salutations...)
 *   - ~200 exemples arabes supplémentaires (sous-représentés dans le gold)
 *
 * Sortie : data/finetune/synthetic-dataset.jsonl
 * Merge  : data/finetune/full-classifier-dataset.jsonl (gold + synthetic)
 *
 * Usage :
 *   npx tsx scripts/finetune/generate-synthetic-dataset.ts --dry-run  # 3 batches seulement
 *   npx tsx scripts/finetune/generate-synthetic-dataset.ts            # Complet (~45 min)
 *   npx tsx scripts/finetune/generate-synthetic-dataset.ts --merge    # Merge gold + synthetic
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
const MERGE   = process.argv.includes('--merge')
const DELAY_MS = 1500
const QUESTIONS_PER_BATCH = 10   // Questions générées par appel DeepSeek

const SYNTHETIC_PATH = resolve(process.cwd(), 'data/finetune/synthetic-dataset.jsonl')
const GOLD_PATH      = resolve(process.cwd(), 'data/finetune/labeled-gold.jsonl')
const FULL_PATH      = resolve(process.cwd(), 'data/finetune/full-classifier-dataset.jsonl')

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

interface ChatMLEntry {
  conversations: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

interface GenerationSpec {
  legal_branch: LegalBranch
  intent: Intent
  language: Language
  rag_needed: boolean
  count: number
  context?: string // aide DeepSeek à générer des questions ciblées
}

// =============================================================================
// PLAN DE GÉNÉRATION (distribution cible)
// =============================================================================

// Contextes juridiques par domaine pour guider DeepSeek
const BRANCH_CONTEXTS: Record<LegalBranch, string> = {
  civil:       'obligations, contrats, responsabilité civile, prescription, dommages-intérêts, COC tunisien',
  penal:       'crimes, délits, contraventions, garde à vue, flagrant délit, code pénal tunisien',
  commercial:  'sociétés commerciales, faillite, chèques impayés, fonds de commerce, registre commerce',
  travail:     'licenciement, contrat de travail, CNSS, arrêt maladie, grève, salaire, code du travail',
  famille:     'mariage, divorce, pension alimentaire, garde enfants, héritage, testament, CSP tunisien',
  immobilier:  'propriété foncière, hypothèque, cadastre, promesse de vente, bornage, bail, AFT',
  fiscal:      'TVA, IS, IR, contrôle fiscal, redressement, contentieux fiscal, code IRPP',
  procedure:   'recours, appel, cassation, exécution, huissier, délais procéduraux, CPCC',
  autre:       'droit administratif, marchés publics, droit international, droit bancaire',
}

// Plan de génération équilibré
function buildGenerationPlan(): GenerationSpec[] {
  const plan: GenerationSpec[] = []

  const branches: LegalBranch[] = ['civil', 'penal', 'commercial', 'travail', 'famille', 'immobilier', 'fiscal', 'procedure', 'autre']
  const intents: Intent[] = ['definition', 'procedure', 'jurisprudence', 'template', 'consultation']

  // Bloc principal : toutes les combinaisons domaine × intent
  for (const branch of branches) {
    for (const intent of intents) {
      // Distribution langue : 50% FR, 30% AR, 20% mixed
      plan.push({ legal_branch: branch, intent, language: 'fr', rag_needed: true, count: 13, context: BRANCH_CONTEXTS[branch] })
      plan.push({ legal_branch: branch, intent, language: 'ar', rag_needed: true, count: 8,  context: BRANCH_CONTEXTS[branch] })
      plan.push({ legal_branch: branch, intent, language: 'mixed', rag_needed: true, count: 5, context: BRANCH_CONTEXTS[branch] })
    }
  }

  // Bloc hors_scope : questions non-juridiques ou hors Tunisie (rag_needed=false)
  const horsScope: Array<{ language: Language; context: string; count: number }> = [
    { language: 'fr',    context: 'salutations, météo, recettes cuisine, sport, actualité internationale', count: 40 },
    { language: 'ar',    context: 'تحية، طقس، وصفات طبخ، رياضة، أخبار دولية', count: 40 },
    { language: 'fr',    context: 'droit étranger (France, Maroc, Algérie) — pas applicable en Tunisie', count: 30 },
    { language: 'mixed', context: 'questions ambiguës ou trop générales sans rapport au droit tunisien',  count: 30 },
    { language: 'ar',    context: 'أسئلة قانونية خارج نطاق القانون التونسي', count: 30 },
    { language: 'fr',    context: 'questions sur la vie pratique, administration, demandes non-juridiques', count: 30 },
  ]

  for (const spec of horsScope) {
    plan.push({
      legal_branch: 'autre',
      intent: 'hors_scope',
      language: spec.language,
      rag_needed: false,
      count: spec.count,
      context: spec.context,
    })
  }

  return plan
}

// =============================================================================
// PROMPT DE GÉNÉRATION
// =============================================================================

function buildGenerationPrompt(spec: GenerationSpec, count: number): string {
  const langInstruction = {
    fr:    'Génère des questions EN FRANÇAIS.',
    ar:    'اكتب الأسئلة باللغة العربية فقط.',
    mixed: 'Génère des questions mélangeant français et arabe (code-switching naturel).',
  }[spec.language]

  const intentDesc = {
    definition:   'demande de définition ou explication d\'un concept juridique',
    procedure:    'demande sur les étapes, délais ou formalités d\'une procédure',
    jurisprudence:'demande de textes de loi, articles spécifiques ou jurisprudence',
    template:     'demande d\'un modèle de document juridique (contrat, requête, attestation...)',
    consultation: 'question complexe nécessitant un avis juridique raisonné',
    hors_scope:   'question SANS rapport avec le droit tunisien (hors-sujet)',
  }[spec.intent]

  return `Tu dois générer exactement ${count} questions juridiques différentes pour un assistant IA tunisien.

Domaine : ${spec.legal_branch === 'autre' ? spec.context : spec.legal_branch + ' — ' + spec.context}
Type de question : ${intentDesc}
${langInstruction}
RAG nécessaire : ${spec.rag_needed}

Règles :
- Questions VARIÉES (angles différents, difficultés différentes, situations concrètes)
- Questions RÉALISTES (posées par un vrai justiciable ou avocat tunisien)
- PAS de répétition de questions déjà générées
- Pour hors_scope : questions vraiment sans lien avec le droit tunisien

Retourne UNIQUEMENT un tableau JSON de ${count} strings :
["Question 1", "Question 2", ...]

Aucun texte en dehors du JSON.`
}

// =============================================================================
// FORMAT CHATML
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
// GÉNÉRATION
// =============================================================================

async function generateQuestions(spec: GenerationSpec, count: number): Promise<string[]> {
  const prompt = buildGenerationPrompt(spec, count)

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,   // Température élevée pour la diversité
    max_tokens: 2000,
  })

  const raw = response.choices[0].message.content?.trim() || '[]'
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`JSON invalide : ${raw.slice(0, 200)}`)

  const questions: string[] = JSON.parse(jsonMatch[0])

  // Nettoyer les questions vides ou trop courtes
  return questions
    .filter(q => typeof q === 'string' && q.trim().length > 10)
    .map(q => q.trim())
}

// =============================================================================
// MERGE GOLD + SYNTHETIC
// =============================================================================

function mergeDatasets() {
  if (!fs.existsSync(GOLD_PATH)) {
    console.error(`❌ Gold dataset non trouvé : ${GOLD_PATH}`)
    console.error('   Lancer d\'abord : npx tsx scripts/finetune/label-gold-dataset.ts')
    process.exit(1)
  }

  if (!fs.existsSync(SYNTHETIC_PATH)) {
    console.error(`❌ Synthetic dataset non trouvé : ${SYNTHETIC_PATH}`)
    console.error('   Lancer d\'abord ce script sans --merge')
    process.exit(1)
  }

  const gold      = fs.readFileSync(GOLD_PATH, 'utf-8').trim()
  const synthetic = fs.readFileSync(SYNTHETIC_PATH, 'utf-8').trim()

  // Mélanger les lignes (shuffle pour éviter les biais d'ordre)
  const allLines = [...gold.split('\n'), ...synthetic.split('\n')]
    .filter(l => l.trim())
    .sort(() => Math.random() - 0.5)

  fs.writeFileSync(FULL_PATH, allLines.join('\n'), 'utf-8')

  console.log(`✅ Dataset complet : ${allLines.length} exemples → ${FULL_PATH}`)
  console.log(`   Gold     : ${gold.split('\n').filter(l => l.trim()).length} exemples`)
  console.log(`   Synthetic: ${synthetic.split('\n').filter(l => l.trim()).length} exemples`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  if (MERGE) {
    mergeDatasets()
    return
  }

  console.log('🤖 Génération du dataset synthétique pour fine-tuning query-classifier')
  console.log(`   Output : ${SYNTHETIC_PATH}`)
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (3 specs seulement)' : 'COMPLET'}`)
  console.log()

  const plan = buildGenerationPlan()
  const subset = DRY_RUN ? plan.slice(0, 3) : plan
  const totalTarget = subset.reduce((sum, s) => sum + s.count, 0)

  console.log(`📊 Plan : ${subset.length} specs, ~${totalTarget} questions cible`)
  console.log()

  const allEntries: ChatMLEntry[] = []
  let totalGenerated = 0
  let specsDone = 0

  // Ouvrir le fichier en mode append pour écrire au fur et à mesure
  if (!DRY_RUN) {
    fs.mkdirSync(resolve(process.cwd(), 'data/finetune'), { recursive: true })
    // Vider le fichier si il existe
    fs.writeFileSync(SYNTHETIC_PATH, '', 'utf-8')
  }

  for (const spec of subset) {
    specsDone++
    const batchesNeeded = Math.ceil(spec.count / QUESTIONS_PER_BATCH)

    process.stdout.write(`   [${specsDone}/${subset.length}] ${spec.legal_branch}/${spec.intent}/${spec.language} (${spec.count}q)... `)

    let specGenerated = 0

    for (let b = 0; b < batchesNeeded; b++) {
      const batchCount = Math.min(QUESTIONS_PER_BATCH, spec.count - specGenerated)

      try {
        const questions = await generateQuestions(spec, batchCount)

        for (const question of questions) {
          const label: ClassificationLabel = {
            legal_branch: spec.legal_branch,
            intent:       spec.intent,
            language:     spec.language,
            rag_needed:   spec.rag_needed,
          }

          const entry = formatChatML(question, label)
          allEntries.push(entry)

          if (!DRY_RUN) {
            fs.appendFileSync(SYNTHETIC_PATH, JSON.stringify(entry) + '\n', 'utf-8')
          }

          specGenerated++
          totalGenerated++
        }

        if (b < batchesNeeded - 1) {
          await new Promise(r => setTimeout(r, DELAY_MS))
        }
      } catch (err) {
        console.log(`\n   ⚠️  Batch ${b + 1} échoué : ${err instanceof Error ? err.message : err}`)
        await new Promise(r => setTimeout(r, DELAY_MS * 2))
      }
    }

    console.log(`✅ (${specGenerated} générés)`)
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log()
  console.log(`✅ ${totalGenerated} exemples synthétiques générés`)

  if (DRY_RUN) {
    console.log('\n📋 Aperçu des 3 premiers :')
    allEntries.slice(0, 3).forEach((entry, i) => {
      const user = entry.conversations.find(c => c.role === 'user')
      const ast  = entry.conversations.find(c => c.role === 'assistant')
      console.log(`\n[${i + 1}] Q: ${user?.content?.slice(0, 80)}`)
      console.log(`    L: ${ast?.content}`)
    })
  } else {
    // Stats distribution
    const stats: Record<string, Record<string, number>> = { branch: {}, intent: {}, lang: {} }
    allEntries.forEach(entry => {
      const lbl = JSON.parse(entry.conversations.find(c => c.role === 'assistant')!.content) as ClassificationLabel
      stats.branch[lbl.legal_branch] = (stats.branch[lbl.legal_branch] || 0) + 1
      stats.intent[lbl.intent]       = (stats.intent[lbl.intent]       || 0) + 1
      stats.lang[lbl.language]       = (stats.lang[lbl.language]       || 0) + 1
    })

    console.log('\n📊 Distribution :')
    console.log('  legal_branch :', stats.branch)
    console.log('  intent       :', stats.intent)
    console.log('  language     :', stats.lang)

    console.log()
    console.log('💡 Prochaine étape :')
    console.log('   npx tsx scripts/finetune/generate-synthetic-dataset.ts --merge')
    console.log(`   → Crée ${FULL_PATH}`)
  }
}

main().catch(err => {
  console.error('💥 Erreur :', err)
  process.exit(1)
})
