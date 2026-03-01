#!/usr/bin/env tsx
/**
 * Classification IA des branches juridiques pour les docs KB Google Drive
 * sans branche détectée (branch='autre').
 *
 * Architecture 2 phases pour éviter les timeouts tunnel SSH :
 *   Phase 1 — Fetch : lecture DB unique au démarrage (connexion courte)
 *   Phase 2 — Gemini : toutes les classifications en mémoire, sans DB (~9 min)
 *   Phase 3 — Write : écriture bulk DB unique à la fin (connexion courte)
 *
 * Utilise Gemini 2.0-Flash (PAS 2.5-flash — les thinking tokens tronquent la sortie).
 * Free tier : 15 RPM → 4s entre requêtes → ~136 requêtes → ~9 min pour 680 docs.
 *
 * Usage :
 *   npx tsx scripts/classify-gdrive-branches.ts --dry-run   # Preview
 *   npx tsx scripts/classify-gdrive-branches.ts             # Appliquer
 *   npx tsx scripts/classify-gdrive-branches.ts --limit=50  # Test sur 50 docs
 *
 * Prérequis :
 *   - Tunnel SSH prod actif (npm run tunnel:start)
 *   - DATABASE_URL=postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { db } from '@/lib/db/postgres'
import { GoogleGenerativeAI } from '@google/generative-ai'

const GDRIVE_BASE_URL = 'gdrive://1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS'
const BATCH_SIZE = 5           // docs par requête Gemini
const DELAY_MS = 4200          // ~14 RPM (sous le seuil free tier 15 RPM)
const MAX_CONTENT_CHARS = 800  // premiers chars du full_text par doc

const VALID_BRANCHES = [
  'pénal', 'civil', 'commercial', 'administratif', 'travail',
  'fiscal', 'procédure', 'marchés_publics', 'bancaire', 'immobilier',
  'famille', 'autre',
] as const
type Branch = typeof VALID_BRANCHES[number]

// Descriptions courtes pour le prompt
const BRANCH_DESCRIPTIONS: Record<Branch, string> = {
  pénal:           'droit pénal, infractions, crimes, délits, peines, parquet',
  civil:           'droit civil, obligations, contrats, responsabilité civile, dommages',
  commercial:      'droit commercial, sociétés, faillite, chèques, effets de commerce',
  administratif:   'droit administratif, contentieux administratif, service public',
  travail:         'droit du travail, licenciement, contrats de travail, salaires',
  fiscal:          'droit fiscal, impôts, taxes, douanes, fraude fiscale',
  procédure:       'procédure civile ou pénale, voies de recours, exécution',
  marchés_publics: 'marchés publics, appels d\'offres, commande publique',
  bancaire:        'droit bancaire, opérations de banque, crédit',
  immobilier:      'droit immobilier, propriété foncière, cadastre, hypothèques',
  famille:         'droit de la famille, statut personnel, mariage, divorce, héritage',
  autre:           'domaine transversal ou ne correspondant à aucune catégorie',
}

interface KBDoc {
  id: string
  title: string
  content: string
}

function buildPrompt(docs: KBDoc[]): string {
  const branchList = VALID_BRANCHES
    .map(b => `- ${b} : ${BRANCH_DESCRIPTIONS[b]}`)
    .join('\n')

  const docsText = docs
    .map((d, i) => `[DOC ${i + 1}]\nTitre: ${d.title}\nExtrait: ${d.content.substring(0, MAX_CONTENT_CHARS)}`)
    .join('\n\n')

  return `Tu es un expert en droit tunisien. Pour chaque document juridique ci-dessous, détermine la branche du droit la plus pertinente.

Branches disponibles :
${branchList}

Réponds UNIQUEMENT avec un JSON de ce format exact (pas de markdown, pas d'explication) :
{"results": ["branche1", "branche2", ...]}
Le tableau doit contenir exactement ${docs.length} éléments dans le même ordre que les documents.

Documents à classifier :

${docsText}`
}

async function classifyBatch(
  model: any,
  docs: KBDoc[],
): Promise<Branch[]> {
  const prompt = buildPrompt(docs)

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  })

  const raw = (result.response.text() || '').trim()

  // Parser le JSON de réponse
  try {
    // Nettoyer les éventuels backticks markdown
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const results: Branch[] = parsed.results || []

    return results.map((r: string) => {
      const normalized = r.trim().toLowerCase().replace(/[^a-zéèêàâùûîïô_]/g, '')
      return VALID_BRANCHES.includes(normalized as Branch)
        ? (normalized as Branch)
        : 'autre'
    })
  } catch {
    // Si parsing JSON échoue, extraire les branches manuellement
    const found: Branch[] = []
    for (let i = 0; i < docs.length; i++) {
      const lineMatch = raw.split('\n').find(l => l.includes(`${i + 1}`))
      if (lineMatch) {
        const branch = VALID_BRANCHES.find(b => lineMatch.toLowerCase().includes(b))
        found.push(branch || 'autre')
      } else {
        found.push('autre')
      }
    }
    return found.length === docs.length ? found : docs.map(() => 'autre' as Branch)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

  console.log('\n🤖 Classification IA des branches juridiques — KB Google Drive')
  console.log(`   Mode   : ${dryRun ? 'DRY RUN (simulation)' : 'PRODUCTION'}`)
  console.log(`   Modèle : Gemini 2.0-Flash (batch ${BATCH_SIZE} docs / requête)`)
  if (limit) console.log(`   Limite : ${limit} docs`)
  console.log()

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY non configuré dans .env.local')
    process.exit(1)
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Fetch : lecture DB (connexion courte, tunnel stable)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('📥 Phase 1/3 — Lecture DB...')
  const docsResult = await db.query(`
    SELECT
      kb.id,
      kb.title,
      COALESCE(
        SUBSTRING(kb.full_text, 1, ${MAX_CONTENT_CHARS * BATCH_SIZE}),
        ''
      ) as content
    FROM knowledge_base kb
    INNER JOIN web_pages wp ON wp.knowledge_base_id = kb.id
    INNER JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE ws.base_url = $1
      AND kb.branch = 'autre'
    ORDER BY kb.created_at DESC
    ${limit ? `LIMIT ${limit}` : ''}
  `, [GDRIVE_BASE_URL])

  const docs: KBDoc[] = docsResult.rows.map((r: any) => ({
    id: r.id,
    title: r.title || '',
    content: r.content || '',
  }))

  // Fermer la connexion DB immédiatement après le fetch
  // (le tunnel peut tomber pendant la phase Gemini ~9 min)
  await db.closePool()

  console.log(`   ✅ ${docs.length} documents récupérés. Connexion DB fermée.\n`)

  if (docs.length === 0) {
    console.log('✅ Aucun document à classifier.')
    return
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Classification Gemini : tout en mémoire, sans DB
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`🧠 Phase 2/3 — Classification Gemini (${Math.ceil(docs.length / BATCH_SIZE)} batches)...`)

  // Map id → branch : accumulation en mémoire
  const results = new Map<string, Branch>()
  const totalBatches = Math.ceil(docs.length / BATCH_SIZE)
  let errors = 0

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = docs.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE)
    const batchNum = batchIdx + 1

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} docs)... `)

    try {
      const branches = await classifyBatch(model, batch)
      process.stdout.write(branches.join(', ') + '\n')

      // Stocker en mémoire uniquement
      for (let i = 0; i < batch.length; i++) {
        results.set(batch[i].id, branches[i] ?? 'autre')
      }
    } catch (err: any) {
      console.error(`  ❌ Erreur batch ${batchNum}: ${err.message}`)
      errors += batch.length
      batch.forEach(d => results.set(d.id, 'autre'))
    }

    // Délai rate limit (sauf dernier batch)
    if (batchIdx < totalBatches - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n   ✅ Classification terminée. ${results.size} docs traités, ${errors} erreurs.\n`)

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Write : écriture bulk DB (nouvelle connexion, tunnel réactivé)
  // ─────────────────────────────────────────────────────────────────────────

  // Calculer les stats pour le rapport
  const stats: Record<string, number> = {}
  for (const branch of results.values()) {
    stats[branch] = (stats[branch] || 0) + 1
  }

  // Afficher le rapport (même en dry-run)
  console.log('='.repeat(60))
  console.log(`📊 RÉSUMÉ${dryRun ? ' [DRY RUN]' : ''}`)
  console.log('='.repeat(60))
  console.log(`  Traités  : ${results.size}`)
  console.log(`  Erreurs  : ${errors}`)
  console.log('\n  Distribution des branches :')
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([b, c]) => console.log(`    ${b.padEnd(20)} : ${c}`))

  const nonAutre = Object.entries(stats)
    .filter(([b]) => b !== 'autre')
    .reduce((sum, [, c]) => sum + c, 0)
  console.log(`\n  ✅ Branches précises assignées : ${nonAutre}/${results.size}`)
  console.log('='.repeat(60) + '\n')

  if (dryRun) {
    console.log('⏭️  DRY RUN — aucune écriture en base.')
    return
  }

  // Écriture bulk : ne mettre à jour que les docs avec une branche précise (pas 'autre')
  const toUpdate = Array.from(results.entries()).filter(([, b]) => b !== 'autre')
  console.log(`💾 Phase 3/3 — Écriture bulk DB (${toUpdate.length} docs à mettre à jour)...`)

  // db.closePool() a mis pool=null → db.query() recrée automatiquement un nouveau pool
  let written = 0
  let writeErrors = 0
  for (const [id, branch] of toUpdate) {
    try {
      await db.query(
        'UPDATE knowledge_base SET branch = $1, updated_at = NOW() WHERE id = $2',
        [branch, id]
      )
      written++
    } catch (err: any) {
      console.error(`  ❌ Erreur écriture doc ${id}: ${err.message}`)
      writeErrors++
    }
  }

  console.log(`   ✅ ${written} docs mis à jour, ${writeErrors} erreurs d'écriture.\n`)

  await db.closePool()
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
