#!/usr/bin/env tsx
/**
 * Script de reclassification complète de la Base de Connaissances
 *
 * Règle 4 problèmes de catégorisation en séquence :
 *   Phase 1 — Audit : état actuel (doc_type NULL, norm_level NULL, google_drive)
 *   Phase 2 — Backfill doc_type NULL (SQL pur, sans LLM)
 *   Phase 3 — Backfill norm_level NULL pour TEXTES (SQL pur, sans LLM)
 *   Phase 4 — Reclassification Google Drive via LLM (Groq → fallback DeepSeek)
 *   Phase 5 — Sync metadata vers chunks (appliquée après chaque phase)
 *
 * Prérequis :
 *   - Tunnel SSH prod actif si ciblage prod : npm run tunnel:start
 *   - GROQ_API_KEY ou DEEPSEEK_API_KEY dans .env.local
 *
 * Usage :
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --dry-run        # Preview
 *   npx tsx scripts/reclassify-kb-comprehensive.ts                  # Appliquer sur prod
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --local          # DB locale
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --phase=1        # Audit seul
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --phase=2        # Backfill doc_type
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --phase=3        # Backfill norm_level
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --phase=4        # Reclassif GDrive
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --skip-gdrive    # Phases 2+3 seulement
 *   npx tsx scripts/reclassify-kb-comprehensive.ts --limit=20       # Limite docs GDrive phase 4
 */

import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

// Charger .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

// =============================================================================
// CLI ARGS
// =============================================================================

const DRY_RUN = process.argv.includes('--dry-run')
const LOCAL = process.argv.includes('--local')
const SKIP_GDRIVE = process.argv.includes('--skip-gdrive')
const ALL_DOCS = process.argv.includes('--all-docs')  // Reclasser tous les docs, pas seulement google_drive
const PHASE_ARG = process.argv.find(arg => arg.startsWith('--phase='))
const PHASE_ONLY = PHASE_ARG ? parseInt(PHASE_ARG.split('=')[1], 10) : null
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : undefined
const OFFSET_ARG = process.argv.find(arg => arg.startsWith('--offset='))
const OFFSET = OFFSET_ARG ? parseInt(OFFSET_ARG.split('=')[1], 10) : 0

// =============================================================================
// CATÉGORIES & MAPPINGS (miroir de lib/categories/)
// =============================================================================

const CATEGORY_TO_DOC_TYPE: Record<string, string> = {
  legislation: 'TEXTES',
  codes: 'TEXTES',
  constitution: 'TEXTES',
  conventions: 'TEXTES',
  jort: 'TEXTES',
  jurisprudence: 'JURIS',
  procedures: 'PROC',
  formulaires: 'PROC',
  modeles: 'TEMPLATES',
  google_drive: 'TEMPLATES',
  doctrine: 'DOCTRINE',
  guides: 'DOCTRINE',
  lexique: 'DOCTRINE',
  actualites: 'DOCTRINE',
  autre: 'DOCTRINE',
}

const SUBCATEGORY_TO_NORM_LEVEL: Record<string, string> = {
  constitution: 'constitution',
  loi_organique: 'loi_organique',
  coc: 'loi_ordinaire',
  code_penal: 'loi_ordinaire',
  code_commerce: 'loi_ordinaire',
  code_travail: 'loi_ordinaire',
  csp: 'loi_ordinaire',
  code_fiscal: 'loi_ordinaire',
  code_article: 'loi_ordinaire',
  decret_loi: 'marsoum',
  decret: 'marsoum',
  decret_gouvernemental: 'ordre_reglementaire',
  ordre_presidentiel: 'ordre_reglementaire',
  arrete: 'arrete_ministeriel',
  circulaire: 'arrete_ministeriel',
}

const CATEGORY_TO_NORM_LEVEL: Record<string, string> = {
  constitution: 'constitution',
  conventions: 'traite_international',
  legislation: 'loi_ordinaire',
  codes: 'loi_ordinaire',
  jort: 'loi_ordinaire',
}

const VALID_CATEGORIES = [
  'legislation', 'jurisprudence', 'doctrine', 'jort', 'modeles',
  'procedures', 'formulaires', 'codes', 'constitution',
  'conventions', 'guides', 'lexique', 'autre',
] as const

type ValidCategory = typeof VALID_CATEGORIES[number]

// =============================================================================
// DB
// =============================================================================

function createPool(): Pool {
  // Prod : DATABASE_URL doit pointer sur 127.0.0.1:5434 (tunnel SSH actif)
  //        ex: DATABASE_URL=postgresql://moncabinet:<pwd>@127.0.0.1:5434/qadhya npx tsx ...
  // Local : DATABASE_URL pointe sur 127.0.0.1:5433 (PostgreSQL local)
  const dbUrl = process.env.DATABASE_URL

  if (!dbUrl) {
    throw new Error('DATABASE_URL non configuré. Passez-le en variable d\'env.')
  }

  const isLocal = LOCAL || dbUrl.includes(':5433') || !dbUrl.includes(':5434')

  if (isLocal) {
    console.log('📍 Connexion : DB locale (port 5433)')
  } else {
    console.log('📍 Connexion : DB prod via tunnel SSH (port 5434)')
  }

  return new Pool({ connectionString: dbUrl, max: 5, connectionTimeoutMillis: 10000 })
}

// =============================================================================
// LLM (Groq via OpenAI-compatible API, fallback DeepSeek)
// =============================================================================

// État global Groq — une fois rate-limité, on bascule directement sur DeepSeek
let groqRateLimited = false

async function callLLM(prompt: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  // Si Groq déjà rate-limité, aller directement sur DeepSeek
  if (groqKey && !groqRateLimited) {
    try {
      return await callOpenAICompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        groqKey,
        'llama-3.1-8b-instant',
        prompt,
      )
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('RESOURCE_EXHAUSTED')) {
        groqRateLimited = true
        // Fallback immédiat sur DeepSeek si disponible
        if (deepseekKey) {
          return callOpenAICompatible(
            'https://api.deepseek.com/v1/chat/completions',
            deepseekKey,
            'deepseek-chat',
            prompt,
          )
        }
      }
      throw err
    }
  }

  if (deepseekKey) {
    return callOpenAICompatible(
      'https://api.deepseek.com/v1/chat/completions',
      deepseekKey,
      'deepseek-chat',
      prompt,
    )
  }

  throw new Error('Aucun provider LLM configuré. Configurer GROQ_API_KEY ou DEEPSEEK_API_KEY dans .env.local')
}

async function callOpenAICompatible(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 20,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body.substring(0, 200)}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return (data.choices?.[0]?.message?.content || '').trim()
}

const CLASSIFICATION_PROMPT = `Tu es un expert en droit tunisien. Classifie ce document dans UNE SEULE catégorie parmi :
legislation, jurisprudence, doctrine, jort, codes, constitution, conventions, modeles, procedures, formulaires, guides, lexique, autre

Définitions :
- legislation : Lois, décrets, arrêtés, textes réglementaires
- jurisprudence : Arrêts, décisions judiciaires, cassation
- doctrine : Articles académiques, thèses, mémoires, études, commentaires d'arrêts, cours universitaires
- jort : Journal Officiel de la République Tunisienne
- codes : Codes juridiques (pénal, civil, commerce, travail, etc.)
- constitution : Textes constitutionnels
- conventions : Conventions et traités internationaux
- modeles : Modèles de contrats, requêtes, actes notariaux
- procedures : Guides de procédures judiciaires/administratives
- formulaires : Formulaires administratifs/judiciaires
- guides : Guides pratiques juridiques
- lexique : Dictionnaires, glossaires juridiques
- autre : Si aucune catégorie ne convient

Réponds UNIQUEMENT avec le nom de la catégorie. Un seul mot.

Titre : {TITLE}

Contenu :
{CONTENT}`

async function classifyGDriveDoc(
  title: string,
  content: string,
): Promise<ValidCategory> {
  const prompt = CLASSIFICATION_PROMPT
    .replace('{TITLE}', title || 'Sans titre')
    .replace('{CONTENT}', content.substring(0, 2000))

  const raw = await callLLM(prompt, 0) // commence par llama-3.1-8b-instant
  const cleaned = raw.toLowerCase().replace(/[^a-z_]/g, '')
  return VALID_CATEGORIES.includes(cleaned as ValidCategory)
    ? (cleaned as ValidCategory)
    : 'autre'
}

// =============================================================================
// PHASE 1 — AUDIT
// =============================================================================

async function runAudit(pool: Pool): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('📊 PHASE 1 — AUDIT ÉTAT ACTUEL KB')
  console.log('='.repeat(60) + '\n')

  const queries = [
    {
      label: 'Docs ACTIFS sans doc_type (NULL)',
      sql: "SELECT COUNT(*) FROM knowledge_base WHERE doc_type IS NULL AND is_active = true",
    },
    {
      label: 'Docs TEXTES sans norm_level',
      sql: "SELECT COUNT(*) FROM knowledge_base WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true",
    },
    {
      label: 'Docs category=google_drive non reclassés',
      sql: "SELECT COUNT(*) FROM knowledge_base WHERE category = 'google_drive' AND is_active = true",
    },
    {
      label: 'Total docs actifs indexés',
      sql: "SELECT COUNT(*) FROM knowledge_base WHERE is_active = true AND is_indexed = true",
    },
    {
      label: 'Chunks sans doc_type en metadata',
      sql: "SELECT COUNT(*) FROM knowledge_base_chunks WHERE metadata->>'doc_type' IS NULL",
    },
    {
      label: 'Chunks sans norm_level en metadata (avec doc TEXTES)',
      sql: `SELECT COUNT(*) FROM knowledge_base_chunks kbc
            JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
            WHERE kb.doc_type = 'TEXTES' AND kbc.metadata->>'norm_level' IS NULL AND kb.is_active = true`,
    },
  ]

  for (const q of queries) {
    const res = await pool.query(q.sql)
    console.log(`  ${q.label.padEnd(46)} : ${res.rows[0].count}`)
  }

  // Distribution doc_type NULL par catégorie
  const distRes = await pool.query(`
    SELECT category, COUNT(*) as cnt
    FROM knowledge_base
    WHERE doc_type IS NULL AND is_active = true
    GROUP BY category
    ORDER BY cnt DESC
    LIMIT 10
  `)

  if (distRes.rows.length > 0) {
    console.log('\n  Répartition doc_type NULL par catégorie :')
    for (const row of distRes.rows) {
      console.log(`    ${(row.category || 'NULL').padEnd(20)} : ${row.cnt}`)
    }
  }

  // Distribution doc_type actuel
  const dtRes = await pool.query(`
    SELECT doc_type, COUNT(*) as cnt
    FROM knowledge_base
    WHERE is_active = true
    GROUP BY doc_type
    ORDER BY cnt DESC
  `)

  console.log('\n  Distribution doc_type actuelle :')
  for (const row of dtRes.rows) {
    console.log(`    ${(row.doc_type || 'NULL').padEnd(20)} : ${row.cnt}`)
  }

  // Distribution norm_level actuel (TEXTES seulement)
  const nlRes = await pool.query(`
    SELECT norm_level, COUNT(*) as cnt
    FROM knowledge_base
    WHERE is_active = true AND doc_type = 'TEXTES'
    GROUP BY norm_level
    ORDER BY cnt DESC
  `)

  if (nlRes.rows.length > 0) {
    console.log('\n  Distribution norm_level (TEXTES) :')
    for (const row of nlRes.rows) {
      console.log(`    ${(row.norm_level || 'NULL').padEnd(25)} : ${row.cnt}`)
    }
  }

  console.log('')
}

// =============================================================================
// PHASE 2 — BACKFILL doc_type NULL
// =============================================================================

async function runDocTypeBackfill(pool: Pool): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('🔧 PHASE 2 — BACKFILL doc_type NULL (SQL pur)')
  console.log('='.repeat(60) + '\n')

  // Compter d'abord
  const countRes = await pool.query(
    "SELECT COUNT(*) FROM knowledge_base WHERE doc_type IS NULL AND is_active = true"
  )
  const total = parseInt(countRes.rows[0].count, 10)
  console.log(`  Docs à corriger : ${total}`)

  if (total === 0) {
    console.log('  ✅ Aucun doc avec doc_type NULL — phase ignorée\n')
    return
  }

  if (DRY_RUN) {
    // Prévisualiser la distribution
    const previewRes = await pool.query(`
      SELECT category, COUNT(*) as cnt,
        CASE category
          WHEN 'legislation'   THEN 'TEXTES'
          WHEN 'codes'         THEN 'TEXTES'
          WHEN 'constitution'  THEN 'TEXTES'
          WHEN 'conventions'   THEN 'TEXTES'
          WHEN 'jort'          THEN 'TEXTES'
          WHEN 'jurisprudence' THEN 'JURIS'
          WHEN 'procedures'    THEN 'PROC'
          WHEN 'formulaires'   THEN 'PROC'
          WHEN 'modeles'       THEN 'TEMPLATES'
          WHEN 'google_drive'  THEN 'TEMPLATES'
          ELSE 'DOCTRINE'
        END as new_doc_type
      FROM knowledge_base
      WHERE doc_type IS NULL AND is_active = true
      GROUP BY category
      ORDER BY cnt DESC
    `)

    console.log('  [DRY RUN] Changements prévus :')
    for (const row of previewRes.rows) {
      console.log(`    ${(row.category || 'NULL').padEnd(20)} → ${row.new_doc_type.padEnd(10)} (${row.cnt} docs)`)
    }
    console.log('')
    return
  }

  // Appliquer le backfill
  const updateRes = await pool.query(`
    UPDATE knowledge_base
    SET doc_type = CASE category
      WHEN 'legislation'   THEN 'TEXTES'::document_type
      WHEN 'codes'         THEN 'TEXTES'::document_type
      WHEN 'constitution'  THEN 'TEXTES'::document_type
      WHEN 'conventions'   THEN 'TEXTES'::document_type
      WHEN 'jort'          THEN 'TEXTES'::document_type
      WHEN 'jurisprudence' THEN 'JURIS'::document_type
      WHEN 'procedures'    THEN 'PROC'::document_type
      WHEN 'formulaires'   THEN 'PROC'::document_type
      WHEN 'modeles'       THEN 'TEMPLATES'::document_type
      WHEN 'google_drive'  THEN 'TEMPLATES'::document_type
      ELSE 'DOCTRINE'::document_type
    END,
    updated_at = NOW()
    WHERE doc_type IS NULL AND is_active = true
  `)

  console.log(`  ✅ ${updateRes.rowCount} docs mis à jour (doc_type)\n`)

  // Sync metadata.doc_type sur la table KB
  await syncKBMetadataDocType(pool)
}

// =============================================================================
// PHASE 3 — BACKFILL norm_level NULL pour TEXTES
// =============================================================================

async function runNormLevelBackfill(pool: Pool): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('📐 PHASE 3 — BACKFILL norm_level NULL (TEXTES)')
  console.log('='.repeat(60) + '\n')

  const countRes = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true
  `)
  const total = parseInt(countRes.rows[0].count, 10)
  console.log(`  Docs TEXTES sans norm_level : ${total}`)

  if (total === 0) {
    console.log('  ✅ Aucun doc TEXTES sans norm_level — phase ignorée\n')
    return
  }

  if (DRY_RUN) {
    const previewRes = await pool.query(`
      SELECT category, subcategory, COUNT(*) as cnt,
        CASE
          WHEN subcategory = 'constitution'                            THEN 'constitution'
          WHEN category    = 'constitution'                            THEN 'constitution'
          WHEN category    = 'conventions'                             THEN 'traite_international'
          WHEN subcategory = 'loi_organique'                          THEN 'loi_organique'
          WHEN subcategory IN ('coc','code_penal','code_commerce',
            'code_travail','csp','code_fiscal','code_article')         THEN 'loi_ordinaire'
          WHEN category    IN ('codes','legislation')                  THEN 'loi_ordinaire'
          WHEN subcategory IN ('decret_loi','decret',
            'decret_gouvernemental','ordre_presidentiel')               THEN 'decret_presidentiel'
          WHEN subcategory IN ('arrete','circulaire')                  THEN 'arrete_ministeriel'
          WHEN category    = 'jort'                                    THEN 'loi_ordinaire'
          ELSE NULL
        END as new_norm_level
      FROM knowledge_base
      WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true
      GROUP BY category, subcategory
      ORDER BY cnt DESC
      LIMIT 20
    `)

    console.log('  [DRY RUN] Changements prévus (top 20) :')
    for (const row of previewRes.rows) {
      const cat = (row.category || 'NULL').padEnd(15)
      const sub = (row.subcategory || '-').padEnd(20)
      const nl = row.new_norm_level || 'NULL (restera NULL)'
      console.log(`    ${cat} / ${sub} → ${nl} (${row.cnt} docs)`)
    }
    console.log('')
    return
  }

  // Note : ENUM prod = constitution, traite_international, loi_organique, loi_ordinaire,
  //        decret_presidentiel, arrete_ministeriel, acte_local
  //        (marsoum et ordre_reglementaire pas encore migrés en prod)
  const updateRes = await pool.query(`
    UPDATE knowledge_base
    SET norm_level = CASE
      WHEN subcategory = 'constitution'                            THEN 'constitution'::norm_level
      WHEN category    = 'constitution'                            THEN 'constitution'::norm_level
      WHEN category    = 'conventions'                             THEN 'traite_international'::norm_level
      WHEN subcategory = 'loi_organique'                          THEN 'loi_organique'::norm_level
      WHEN subcategory IN ('coc','code_penal','code_commerce',
        'code_travail','csp','code_fiscal','code_article')         THEN 'loi_ordinaire'::norm_level
      WHEN category    IN ('codes','legislation')                  THEN 'loi_ordinaire'::norm_level
      WHEN subcategory IN ('decret_loi','decret',
        'decret_gouvernemental','ordre_presidentiel')              THEN 'decret_presidentiel'::norm_level
      WHEN subcategory IN ('arrete','circulaire')                  THEN 'arrete_ministeriel'::norm_level
      WHEN category    = 'jort'                                    THEN 'loi_ordinaire'::norm_level
      ELSE NULL
    END,
    updated_at = NOW()
    WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true
  `)

  console.log(`  ✅ ${updateRes.rowCount} docs mis à jour (norm_level)\n`)

  // Sync metadata.norm_level sur KB
  await syncKBMetadataNormLevel(pool)
}

// =============================================================================
// PHASE 4 — RECLASSIFICATION GOOGLE DRIVE VIA LLM
// =============================================================================

async function runLLMReclassification(pool: Pool): Promise<void> {
  const modeLabel = ALL_DOCS ? 'TOUS LES DOCS (LLM)' : 'GOOGLE DRIVE (LLM)'
  console.log('\n' + '='.repeat(60))
  console.log(`🤖 PHASE 4 — RECLASSIFICATION ${modeLabel}`)
  console.log('='.repeat(60) + '\n')

  if (ALL_DOCS) {
    console.log('  ⚠️  Mode --all-docs : TOUS les documents actifs seront reclassés via LLM.')
    console.log('  Les docs officiels (iort, cassation, 9anoun) seront aussi traités.\n')
  }

  // Détecter provider disponible
  const provider = process.env.GROQ_API_KEY ? 'Groq llama-3.1-8b-instant (→ DeepSeek fallback)'
    : process.env.DEEPSEEK_API_KEY ? 'DeepSeek deepseek-chat'
    : null

  if (!provider) {
    console.log('  ⚠️  Aucun provider LLM (GROQ_API_KEY / DEEPSEEK_API_KEY). Phase ignorée.\n')
    return
  }
  console.log(`  Provider : ${provider}`)

  // Construire la clause WHERE selon le mode
  const whereClause = ALL_DOCS
    ? 'kb.is_active = true'
    : "kb.category = 'google_drive' AND kb.is_active = true"

  const countRes = await pool.query(`SELECT COUNT(*) FROM knowledge_base kb WHERE ${whereClause}`)
  const total = parseInt(countRes.rows[0].count, 10)
  console.log(`  Docs à reclasser : ${total}`)

  if (total === 0) {
    console.log('  ✅ Aucun doc — phase ignorée\n')
    return
  }

  // Récupérer docs avec contenu (premiers chunks)
  const docsRes = await pool.query(`
    SELECT
      kb.id as kb_id,
      kb.title,
      kb.category as old_category,
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
    WHERE ${whereClause}
    ORDER BY kb.created_at DESC
    ${OFFSET ? `OFFSET ${OFFSET}` : ''}
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `)

  const docs = docsRes.rows
  console.log(`  Docs à traiter : ${docs.length}${OFFSET ? ` (offset: ${OFFSET})` : ''}\n`)

  // Estimation temps (DeepSeek ~1s/doc, Groq ~0.5s/doc)
  const estimMin = Math.ceil(docs.length / 60)
  if (docs.length > 50) console.log(`  ⏱️  Estimation : ~${estimMin} min\n`)

  const stats = { classified: 0, noContent: 0, errors: 0, byCategory: {} as Record<string, number> }
  const DELAY_MS = groqRateLimited ? 1000 : 500 // DeepSeek peut aller plus vite

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const shortTitle = (doc.title || 'Sans titre').substring(0, 50)

    // Pas de contenu → autre (sauf si le doc a un titre informative)
    if (!doc.content || doc.content.trim().length < 50) {
      const fallbackCat: ValidCategory = 'autre'
      stats.noContent++
      stats.byCategory[fallbackCat] = (stats.byCategory[fallbackCat] || 0) + 1

      if (!DRY_RUN) {
        await applyReclassification(pool, doc.kb_id, fallbackCat, doc.old_category, 'no_content')
      }

      stats.classified++
      logGDriveProgress(i + 1, docs.length, shortTitle, fallbackCat, stats)
      continue
    }

    try {
      const category = await classifyGDriveDoc(doc.title, doc.content)
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1

      if (!DRY_RUN) {
        const src = groqRateLimited ? 'deepseek_reclassify' : 'groq_reclassify'
        await applyReclassification(pool, doc.kb_id, category, doc.old_category, src)
      }

      stats.classified++
      logGDriveProgress(i + 1, docs.length, shortTitle, category, stats)
    } catch (err: any) {
      const msg = err?.message || String(err)

      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate_limit')) {
        // Groq rate limité → DeepSeek prend le relais, pause courte
        groqRateLimited = true
        await sleep(5000)
        try {
          const category = await classifyGDriveDoc(doc.title, doc.content)
          stats.byCategory[category] = (stats.byCategory[category] || 0) + 1
          if (!DRY_RUN) {
            await applyReclassification(pool, doc.kb_id, category, doc.old_category, 'deepseek_reclassify')
          }
          stats.classified++
          logGDriveProgress(i + 1, docs.length, shortTitle, category, stats)
        } catch (retryErr: any) {
          console.error(`   ❌ Retry failed: ${retryErr?.message?.substring(0, 80)}`)
          stats.errors++
        }
      } else {
        console.error(`   ❌ ${shortTitle}: ${msg.substring(0, 100)}`)
        stats.errors++
      }
    }

    if (i < docs.length - 1) {
      await sleep(groqRateLimited ? 1000 : DELAY_MS)
    }
  }

  // Rapport phase 4
  console.log('\n  Distribution par catégorie :')
  const sorted = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sorted) {
    const pct = ((count / docs.length) * 100).toFixed(1)
    console.log(`    ${cat.padEnd(18)} : ${String(count).padStart(4)} (${pct}%)`)
  }
  console.log(`\n  Total classifiés: ${stats.classified} | Sans contenu: ${stats.noContent} | Erreurs: ${stats.errors}\n`)
}

async function applyReclassification(
  pool: Pool,
  docId: string,
  category: ValidCategory,
  oldCategory: string,
  source: string,
): Promise<void> {
  const docType = CATEGORY_TO_DOC_TYPE[category] || 'DOCTRINE'
  const normLevel = CATEGORY_TO_NORM_LEVEL[category] || null

  const metaUpdate: Record<string, string> = {
    old_category: oldCategory,
    classification_source: source,
    reclassified_at: new Date().toISOString(),
    doc_type: docType,
  }
  if (normLevel) metaUpdate.norm_level = normLevel

  await pool.query(`
    UPDATE knowledge_base
    SET
      category = $1::text,
      doc_type = $2::document_type,
      norm_level = CASE WHEN $3::text IS NOT NULL THEN ($3::text)::norm_level ELSE NULL::norm_level END,
      metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
      updated_at = NOW()
    WHERE id = $5::uuid
  `, [category, docType, normLevel, JSON.stringify(metaUpdate), docId])
}

function logGDriveProgress(current: number, total: number, title: string, category: string, stats: { byCategory: Record<string, number> }) {
  if (current <= 5 || current % 10 === 0 || current === total) {
    const pct = ((current / total) * 100).toFixed(1)
    const topCats = Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c, n]) => `${c}:${n}`)
      .join(' ')
    console.log(`  [${current}/${total}] ${pct}% | "${title}" → ${category} | ${topCats}`)
  }
}

// =============================================================================
// PHASE 5 — SYNC METADATA VERS CHUNKS
// =============================================================================

async function syncChunksMetadata(pool: Pool): Promise<void> {
  console.log('\n  🔄 Sync metadata → chunks...')

  const res = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata
      || jsonb_strip_nulls(jsonb_build_object(
        'doc_type', kb.doc_type::text,
        'norm_level', kb.norm_level::text
      ))
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND (
        kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
        OR kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text
      )
  `)

  console.log(`  ✅ ${res.rowCount} chunks mis à jour (metadata)\n`)
}

async function syncKBMetadataDocType(pool: Pool): Promise<void> {
  const res = await pool.query(`
    UPDATE knowledge_base
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('doc_type', doc_type::text)
    WHERE doc_type IS NOT NULL
      AND (metadata->>'doc_type' IS DISTINCT FROM doc_type::text)
  `)
  console.log(`  ✅ ${res.rowCount} docs KB — metadata.doc_type syncé`)
}

async function syncKBMetadataNormLevel(pool: Pool): Promise<void> {
  const res = await pool.query(`
    UPDATE knowledge_base
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('norm_level', norm_level::text)
    WHERE norm_level IS NOT NULL
      AND (metadata->>'norm_level' IS DISTINCT FROM norm_level::text)
  `)
  console.log(`  ✅ ${res.rowCount} docs KB — metadata.norm_level syncé`)
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n🗂️  RECLASSIFICATION KB COMPLÈTE — Qadhya')
  console.log(`   Mode     : ${DRY_RUN ? '🔍 DRY RUN (aucune modification)' : '✍️  ÉCRITURE'}`)
  console.log(`   Target   : DB ${LOCAL ? 'locale' : 'prod (tunnel SSH)'}`)
  if (PHASE_ONLY) console.log(`   Phase    : ${PHASE_ONLY} seulement`)
  if (LIMIT) console.log(`   Limite   : ${LIMIT} docs (phase 4)`)
  if (SKIP_GDRIVE) console.log(`   Option   : --skip-gdrive (phase 4 ignorée)`)

  const pool = createPool()

  // Test connexion
  try {
    await pool.query('SELECT 1')
    console.log('   ✅ Connexion DB OK\n')
  } catch (err) {
    console.error('❌ Connexion DB échouée. Tunnel SSH actif ? (npm run tunnel:start)')
    console.error(err)
    process.exit(1)
  }

  const startTime = Date.now()

  try {
    // Phase 1 — Audit (toujours exécutée sauf si phase spécifique ≠ 1)
    if (!PHASE_ONLY || PHASE_ONLY === 1) {
      await runAudit(pool)
    }

    if (PHASE_ONLY === 1) {
      console.log('📋 Audit terminé. Relancez sans --phase pour appliquer les corrections.\n')
      return
    }

    // Phase 2 — Backfill doc_type
    if (!PHASE_ONLY || PHASE_ONLY === 2) {
      await runDocTypeBackfill(pool)
      if (!DRY_RUN) await syncChunksMetadata(pool)
    }

    // Phase 3 — Backfill norm_level
    if (!PHASE_ONLY || PHASE_ONLY === 3) {
      await runNormLevelBackfill(pool)
      if (!DRY_RUN) await syncChunksMetadata(pool)
    }

    // Phase 4 — Reclassification LLM (google_drive ou tous les docs)
    if (!SKIP_GDRIVE && (!PHASE_ONLY || PHASE_ONLY === 4)) {
      await runLLMReclassification(pool)
      if (!DRY_RUN) await syncChunksMetadata(pool)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log('\n' + '='.repeat(60))
    if (DRY_RUN) {
      console.log('🔍 DRY RUN terminé en ' + elapsed + 's')
      console.log('   Relancez sans --dry-run pour appliquer les changements')
    } else {
      console.log('✅ RECLASSIFICATION TERMINÉE en ' + elapsed + 's')
      console.log('   Vérifier dans /super-admin/knowledge-base :')
      console.log('   → DocTypeStatsPanel : plus de widget orange (docs non classés)')
      console.log('   → Docs google_drive ont une vraie catégorie juridique')
      console.log('   → TEXTES ont un norm_level assigné')
    }
    console.log('='.repeat(60) + '\n')
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err)
  process.exit(1)
})
