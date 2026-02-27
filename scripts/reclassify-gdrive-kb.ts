#!/usr/bin/env tsx
/**
 * Script de re-catégorisation des documents KB Google Drive
 *
 * Classifie les docs KB en catégorie 'google_drive' vers des catégories
 * juridiques pertinentes en utilisant Gemini 2.0 Flash (15 RPM gratuit).
 *
 * Prérequis :
 *   - Tunnel SSH prod actif : npm run tunnel:start
 *   - GOOGLE_API_KEY configuré
 *
 * Usage :
 *   npx tsx scripts/reclassify-gdrive-kb.ts --dry-run          # Preview
 *   npx tsx scripts/reclassify-gdrive-kb.ts                     # Appliquer sur prod
 *   npx tsx scripts/reclassify-gdrive-kb.ts --limit=10          # Tester sur 10 docs
 *   npx tsx scripts/reclassify-gdrive-kb.ts --local             # DB locale
 *   npx tsx scripts/reclassify-gdrive-kb.ts --offset=100        # Reprendre à partir du doc 100
 */

import { Pool } from 'pg'
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

// =============================================================================
// CONFIGURATION
// =============================================================================

const DRY_RUN = process.argv.includes('--dry-run')
const LOCAL = process.argv.includes('--local')
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : undefined
const OFFSET_ARG = process.argv.find(arg => arg.startsWith('--offset='))
const OFFSET = OFFSET_ARG ? parseInt(OFFSET_ARG.split('=')[1], 10) : 0

// Gemini 15 RPM free tier → traiter 1 doc à la fois avec 4.5s entre chaque
const GEMINI_DELAY_MS = 4500
const MAX_CONTENT_LENGTH = 2000 // Garder court pour vitesse

const VALID_CATEGORIES = [
  'legislation', 'jurisprudence', 'doctrine', 'jort', 'modeles',
  'procedures', 'formulaires', 'codes', 'constitution',
  'conventions', 'guides', 'lexique', 'autre',
] as const

type ValidCategory = typeof VALID_CATEGORIES[number]

// =============================================================================
// CONNEXION DB
// =============================================================================

function createPool(): Pool {
  if (LOCAL) {
    console.log('📍 Connexion : DB locale (port 5433)')
    return new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  }

  const prodUrl = process.env.PROD_DATABASE_URL
    || `postgresql://moncabinet:${process.env.PROD_DB_PASSWORD || process.env.DB_PASSWORD}@localhost:5434/qadhya`

  console.log('📍 Connexion : DB prod via tunnel SSH (port 5434)')
  return new Pool({ connectionString: prodUrl, max: 5, connectionTimeoutMillis: 10000 })
}

// =============================================================================
// CLIENT GEMINI
// =============================================================================

function createGeminiModel() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY non configuré')
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
}

// =============================================================================
// CLASSIFICATION
// =============================================================================

const CLASSIFICATION_PROMPT = `Tu es un expert en droit tunisien. Classifie ce document dans UNE SEULE catégorie parmi :
legislation, jurisprudence, doctrine, jort, codes, constitution, conventions, modeles, procedures, formulaires, guides, lexique, autre

Définitions :
- legislation : Lois, décrets, arrêtés, textes réglementaires
- jurisprudence : Arrêts, décisions judiciaires, cassation
- doctrine : Articles académiques, thèses, mémoires, études, commentaires d'arrêts, cours universitaires, recherche juridique
- jort : Journal Officiel de la République Tunisienne
- codes : Codes juridiques (pénal, civil, commerce, etc.)
- constitution : Textes constitutionnels
- conventions : Conventions et traités internationaux
- modeles : Modèles de contrats, requêtes, actes
- procedures : Guides de procédures judiciaires/administratives
- formulaires : Formulaires administratifs/judiciaires
- guides : Guides pratiques juridiques
- lexique : Dictionnaires, glossaires juridiques
- autre : Si aucune catégorie ne convient

Réponds UNIQUEMENT avec le nom de la catégorie. Un seul mot.

Titre : {TITLE}

Contenu :
{CONTENT}`

async function classifyDocument(
  model: any,
  title: string,
  content: string,
): Promise<{ category: ValidCategory; raw: string }> {
  const prompt = CLASSIFICATION_PROMPT
    .replace('{TITLE}', title || 'Sans titre')
    .replace('{CONTENT}', content.substring(0, MAX_CONTENT_LENGTH))

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 20 },
  })

  const raw = (result.response.text() || '').trim().toLowerCase()
  const cleaned = raw.replace(/[^a-z_]/g, '')
  const category = VALID_CATEGORIES.includes(cleaned as ValidCategory)
    ? (cleaned as ValidCategory)
    : 'autre'

  return { category, raw }
}

// =============================================================================
// TYPES
// =============================================================================

interface KBDoc {
  kb_id: string
  title: string
  content: string
}

interface Stats {
  total: number
  classified: number
  errors: number
  noContent: number
  byCategory: Record<string, number>
  startTime: number
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n🔄 RE-CATÉGORISATION KB GOOGLE DRIVE → Catégories Juridiques')
  console.log(`   Provider : Gemini 2.0 Flash (15 RPM free tier)\n`)
  console.log(`Mode     : ${DRY_RUN ? '🔍 DRY RUN (aucune modification)' : '✍️  ÉCRITURE (modifications sur prod)'}`)
  console.log(`Target   : DB ${LOCAL ? 'locale' : 'prod (tunnel SSH)'}`)
  if (LIMIT) console.log(`Limite   : ${LIMIT} documents`)
  if (OFFSET) console.log(`Offset   : à partir du doc ${OFFSET}`)
  console.log('')

  const pool = createPool()
  const model = createGeminiModel()

  // Test connexion
  try {
    const testResult = await pool.query(
      'SELECT COUNT(*) FROM knowledge_base WHERE category = $1 AND is_active = true',
      ['google_drive']
    )
    console.log(`✅ Connexion DB OK - ${testResult.rows[0].count} docs google_drive à traiter\n`)
  } catch (err) {
    console.error('❌ Connexion DB échouée. Tunnel SSH actif ? (npm run tunnel:start)')
    console.error(err)
    process.exit(1)
  }

  // 1. Récupérer les docs avec contenu (premiers chunks concaténés)
  console.log('📊 Récupération des documents KB google_drive + contenu...')

  const docsQuery = `
    SELECT
      kb.id as kb_id,
      kb.title,
      COALESCE(
        (SELECT string_agg(sub.content, ' ')
         FROM (
           SELECT kbc.content
           FROM knowledge_base_chunks kbc
           WHERE kbc.knowledge_base_id = kb.id
           ORDER BY kbc.chunk_index
           LIMIT 3
         ) sub),
        ''
      ) as content
    FROM knowledge_base kb
    WHERE kb.category = 'google_drive'
      AND kb.is_active = true
    ORDER BY kb.created_at DESC
    ${OFFSET ? `OFFSET ${OFFSET}` : ''}
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `

  const docsResult = await pool.query(docsQuery)
  const docs = docsResult.rows as KBDoc[]
  console.log(`✅ ${docs.length} documents à classifier\n`)

  if (docs.length === 0) {
    console.log('Aucun document à classifier. Terminé.')
    await pool.end()
    process.exit(0)
  }

  // Estimation temps
  const estimatedMinutes = Math.ceil((docs.length * GEMINI_DELAY_MS) / 60000)
  console.log(`⏱️  Estimation : ~${estimatedMinutes} min (${GEMINI_DELAY_MS}ms entre chaque appel)\n`)

  const stats: Stats = {
    total: docs.length,
    classified: 0,
    errors: 0,
    noContent: 0,
    byCategory: {},
    startTime: Date.now(),
  }

  // 2. Classifier séquentiellement (respect 15 RPM)
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const shortTitle = (doc.title || 'Sans titre').substring(0, 50)

    // Skip docs sans contenu
    if (!doc.content || doc.content.trim().length < 50) {
      stats.noContent++
      stats.byCategory['autre'] = (stats.byCategory['autre'] || 0) + 1

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE knowledge_base
           SET category = 'autre',
               metadata = jsonb_set(
                 jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{old_category}', '"google_drive"'
                 ),
                 '{reclassified_at}', $1::jsonb
               ),
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(new Date().toISOString()), doc.kb_id]
        )
      }

      stats.classified++
      logProgress(i + 1, docs.length, shortTitle, 'autre', '(no content)', stats)
      continue
    }

    // Classifier via Gemini
    try {
      const { category, raw } = await classifyDocument(model, doc.title, doc.content)

      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE knowledge_base
           SET category = $1,
               metadata = jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       COALESCE(metadata, '{}'::jsonb),
                       '{old_category}', '"google_drive"'
                     ),
                     '{classification_source}', '"gemini_reclassify"'
                   ),
                   '{reclassified_at}', $2::jsonb
                 ),
                 '{classification_raw}', $3::jsonb
               ),
               updated_at = NOW()
           WHERE id = $4`,
          [
            category,
            JSON.stringify(new Date().toISOString()),
            JSON.stringify(raw),
            doc.kb_id,
          ]
        )
      }

      stats.classified++
      logProgress(i + 1, docs.length, shortTitle, category, raw, stats)
    } catch (err: any) {
      const errMsg = err?.message || String(err)

      // Rate limit 429 → attendre et réessayer
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        console.log(`   ⏳ Rate limit atteint, pause 60s...`)
        await sleep(60000)

        try {
          const { category, raw } = await classifyDocument(model, doc.title, doc.content)
          stats.byCategory[category] = (stats.byCategory[category] || 0) + 1

          if (!DRY_RUN) {
            await pool.query(
              `UPDATE knowledge_base
               SET category = $1,
                   metadata = jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(
                           COALESCE(metadata, '{}'::jsonb),
                           '{old_category}', '"google_drive"'
                         ),
                         '{classification_source}', '"gemini_reclassify"'
                       ),
                       '{reclassified_at}', $2::jsonb
                     ),
                     '{classification_raw}', $3::jsonb
                   ),
                   updated_at = NOW()
               WHERE id = $4`,
              [category, JSON.stringify(new Date().toISOString()), JSON.stringify(raw), doc.kb_id]
            )
          }

          stats.classified++
          logProgress(i + 1, docs.length, shortTitle, category, raw, stats)
        } catch (retryErr: any) {
          console.error(`   ❌ Retry failed: ${retryErr?.message?.substring(0, 80)}`)
          stats.errors++
        }
      } else {
        console.error(`   ❌ ${shortTitle}: ${errMsg.substring(0, 100)}`)
        stats.errors++
      }
    }

    // Délai entre les appels (respect 15 RPM)
    if (i < docs.length - 1) {
      await sleep(GEMINI_DELAY_MS)
    }
  }

  // 3. Rapport final
  printReport(stats)

  await pool.end()
  process.exit(0)
}

// =============================================================================
// HELPERS
// =============================================================================

function logProgress(
  current: number,
  total: number,
  title: string,
  category: string,
  raw: string,
  stats: Stats,
) {
  const pct = ((current / total) * 100).toFixed(1)
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0)
  const remaining = Math.ceil(((total - current) * GEMINI_DELAY_MS) / 1000)

  // Afficher toutes les 10 docs ou les 5 premiers
  if (current <= 5 || current % 10 === 0 || current === total) {
    const topCats = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c, n]) => `${c}:${n}`)
      .join(' ')

    console.log(
      `[${current}/${total}] ${pct}% | ${elapsed}s elapsed, ~${remaining}s left | ${topCats}`
    )
  }
}

function printReport(stats: Stats) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)

  console.log('\n' + '='.repeat(60))
  console.log('📊 RAPPORT RE-CATÉGORISATION KB GOOGLE DRIVE')
  console.log('='.repeat(60) + '\n')

  console.log(`Total documents     : ${stats.total}`)
  console.log(`Classifiés          : ${stats.classified}`)
  console.log(`Sans contenu        : ${stats.noContent} (→ autre)`)
  console.log(`Erreurs             : ${stats.errors}`)
  console.log(`Durée               : ${elapsed}s`)
  console.log(`Provider            : Gemini 2.0 Flash`)
  console.log('')

  console.log('📈 Distribution par catégorie :')
  const sorted = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sorted) {
    const bar = '█'.repeat(Math.max(1, Math.ceil((count / stats.total) * 40)))
    const p = ((count / stats.total) * 100).toFixed(1)
    console.log(`   ${cat.padEnd(18)} : ${String(count).padStart(4)} (${p.padStart(5)}%) ${bar}`)
  }

  if (DRY_RUN) {
    console.log('\n💡 Relancez sans --dry-run pour appliquer les changements')
  } else {
    console.log('\n✅ Changements appliqués sur la base de données')
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err)
  process.exit(1)
})
