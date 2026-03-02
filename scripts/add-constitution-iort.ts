#!/usr/bin/env npx tsx
/**
 * Script : Ajouter la Constitution tunisienne 2022 à la KB prod
 *
 * Récupère le PDF depuis la page IORT officielle et l'insère dans la
 * knowledge_base avec les métadonnées constitutionnelles (normLevel=constitution,
 * sourceOrigin=iort_gov_tn, boost RAG ×1.35 × ×1.20).
 *
 * Usage :
 *   # Avec tunnel prod ouvert (npm run tunnel:start) :
 *   DATABASE_URL="postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya" \
 *     npx tsx scripts/add-constitution-iort.ts
 *
 *   # Si IORT inaccessible localement, passer l'URL du PDF directement :
 *   DATABASE_URL="..." npx tsx scripts/add-constitution-iort.ts --pdf-url <url>
 *
 *   # Ou depuis un PDF local déjà téléchargé :
 *   DATABASE_URL="..." npx tsx scripts/add-constitution-iort.ts --pdf-path /tmp/constitution.pdf
 *
 *   # Dry-run (ne rien insérer) :
 *   DATABASE_URL="..." npx tsx scripts/add-constitution-iort.ts --dry-run
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const IORT_PAGE_URL =
  'http://www.iort.gov.tn/WD120AWP/WD120Awp.exe/CTX_3508-13-pOBunjkxti/Principal/SYNC_247909797'

const CONSTITUTION_METADATA = {
  title: 'دستور الجمهورية التونسية 2022',
  category: 'constitution' as const,
  language: 'ar' as const,
  description:
    'دستور الجمهورية التونسية الصادر في 27 جويلية 2022 والمنشور بالرائد الرسمي للجمهورية التونسية عدد 58',
  tags: ['دستور', '2022', 'constitution', 'droits fondamentaux', 'iort'],
  metadata: {
    sourceOrigin: 'iort_gov_tn',
    normLevel: 'constitution',
    jort_date: '2022-07-27',
    jort_number: '58',
    effective_date: '2022-07-27',
    loi_number: 'Constitution 2022',
    source_url: IORT_PAGE_URL,
  },
}

// UUID système pour les scripts automatiques
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

// ─────────────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const pdfUrlArg = args.find(a => a.startsWith('--pdf-url='))?.split('=').slice(1).join('=') ||
  (args.indexOf('--pdf-url') >= 0 ? args[args.indexOf('--pdf-url') + 1] : undefined)
const pdfPathArg = args.find(a => a.startsWith('--pdf-path='))?.split('=').slice(1).join('=') ||
  (args.indexOf('--pdf-path') >= 0 ? args[args.indexOf('--pdf-path') + 1] : undefined)

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION URL PDF DEPUIS PAGE IORT
// ─────────────────────────────────────────────────────────────────────────────

async function extractPdfUrlFromIortPage(pageUrl: string): Promise<string | null> {
  console.log(`[IORT] Fetch page: ${pageUrl}`)
  const resp = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; QadhyaBot/1.0; +https://qadhya.tn)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Erreur HTTP ${resp.status} pour ${pageUrl}`)
  }

  const html = await resp.text()

  // Chercher les liens PDF courants sur IORT
  // Pattern 1: href contenant .pdf (insensible à la casse)
  const pdfMatch = html.match(/href=["']([^"']*\.pdf[^"']*)/i)
  if (pdfMatch) {
    const href = pdfMatch[1]
    if (href.startsWith('http')) return href
    // Construire URL absolue
    const base = new URL(pageUrl)
    return new URL(href, base.origin).toString()
  }

  // Pattern 2: lien WinDev CiTM (téléchargement IORT)
  const citm = html.match(/href=["']([^"']*CiTM_[^"']+)/i)
  if (citm) {
    const href = citm[1]
    if (href.startsWith('http')) return href
    const base = new URL(pageUrl)
    return new URL(href, base.origin).toString()
  }

  // Pattern 3: lien contenant "download" ou "télécharger"
  const dlMatch = html.match(/href=["']([^"']*(?:download|telecharger|GetFile)[^"']*)/i)
  if (dlMatch) {
    const href = dlMatch[1]
    if (href.startsWith('http')) return href
    const base = new URL(pageUrl)
    return new URL(href, base.origin).toString()
  }

  console.log('[IORT] Aperçu HTML (500 premiers chars):')
  console.log(html.slice(0, 500))
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT PDF
// ─────────────────────────────────────────────────────────────────────────────

async function downloadPdf(url: string): Promise<Buffer> {
  console.log(`[PDF] Téléchargement: ${url}`)
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; QadhyaBot/1.0; +https://qadhya.tn)',
    },
    signal: AbortSignal.timeout(60_000),
  })

  if (!resp.ok) {
    throw new Error(`Erreur HTTP ${resp.status} lors du téléchargement PDF`)
  }

  const contentType = resp.headers.get('content-type') || ''
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !contentType.includes('application')) {
    console.warn(`[PDF] ⚠️ Content-Type inattendu: ${contentType}`)
  }

  const arrayBuffer = await resp.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  console.log(`[PDF] Téléchargé: ${(buffer.length / 1024).toFixed(0)} KB`)
  return buffer
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Ajout Constitution tunisienne 2022 → KB Prod ===')
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION'}`)
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '✅ définie' : '❌ ABSENTE'}`)

  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL manquante.')
    console.error('Lancer avec : DATABASE_URL="postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya" npx tsx scripts/add-constitution-iort.ts')
    process.exit(1)
  }

  // ── 1. Obtenir le Buffer PDF ──────────────────────────────────────────────
  let pdfBuffer: Buffer
  let pdfFilename = 'constitution_tunisie_2022.pdf'

  if (pdfPathArg) {
    // PDF local
    console.log(`\n[PDF] Lecture fichier local: ${pdfPathArg}`)
    if (!fs.existsSync(pdfPathArg)) {
      console.error(`❌ Fichier introuvable: ${pdfPathArg}`)
      process.exit(1)
    }
    pdfBuffer = fs.readFileSync(pdfPathArg)
    pdfFilename = path.basename(pdfPathArg)
    console.log(`[PDF] Lu: ${(pdfBuffer.length / 1024).toFixed(0)} KB`)
  } else {
    // Téléchargement depuis URL
    let pdfUrl: string | null = pdfUrlArg || null

    if (!pdfUrl) {
      // Extraire l'URL depuis la page IORT
      try {
        pdfUrl = await extractPdfUrlFromIortPage(IORT_PAGE_URL)
      } catch (err) {
        console.warn(`[IORT] Impossible d'accéder à la page: ${(err as Error).message}`)
        console.error('\n❌ IORT inaccessible depuis cette machine.')
        console.error('Solutions:')
        console.error('  1. Exécuter le script directement sur le VPS')
        console.error('  2. Télécharger le PDF manuellement puis: --pdf-path /chemin/constitution.pdf')
        console.error('  3. Passer l\'URL directe du PDF: --pdf-url <url>')
        process.exit(1)
      }
    }

    if (!pdfUrl) {
      console.error('\n❌ Impossible de trouver le lien PDF dans la page IORT.')
      console.error('Alternatives:')
      console.error('  --pdf-url <url>    Passer l\'URL directe du PDF')
      console.error('  --pdf-path <path>  Utiliser un PDF téléchargé manuellement')
      process.exit(1)
    }

    console.log(`\n[PDF] URL trouvée: ${pdfUrl}`)
    pdfBuffer = await downloadPdf(pdfUrl)
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] PDF prêt. Aucune insertion en base.')
    console.log(`  Taille: ${(pdfBuffer.length / 1024).toFixed(0)} KB`)
    console.log(`  Métadonnées:`, JSON.stringify(CONSTITUTION_METADATA, null, 2))
    return
  }

  // ── 2. Vérifier doublon en base ────────────────────────────────────────────
  const { db, closePool } = await import('../lib/db/postgres')

  const existing = await db.query(
    `SELECT id, title, is_indexed, chunk_count
     FROM knowledge_base
     WHERE category = 'constitution'
       AND (title ILIKE '%دستور%' OR title ILIKE '%constitution%')
     ORDER BY created_at DESC
     LIMIT 5`
  )

  if (existing.rows.length > 0) {
    console.log('\n[CHECK] Documents constitutionnels existants dans la KB:')
    for (const row of existing.rows) {
      console.log(`  - ${row.id} | "${row.title}" | indexed=${row.is_indexed} | chunks=${row.chunk_count}`)
    }
    console.log('\nSouhaitez-vous continuer l\'upload ? (Ctrl+C pour annuler, Enter pour continuer)')
    // En mode non-interactif (CI/VPS), continuer automatiquement
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  // ── 3. Upload + insertion DB ───────────────────────────────────────────────
  console.log('\n[KB] Upload du document...')

  const { uploadKnowledgeDocument, indexKnowledgeDocument } = await import('../lib/ai/knowledge-base-service')

  const doc = await uploadKnowledgeDocument(
    {
      category: CONSTITUTION_METADATA.category,
      language: CONSTITUTION_METADATA.language,
      title: CONSTITUTION_METADATA.title,
      description: CONSTITUTION_METADATA.description,
      metadata: CONSTITUTION_METADATA.metadata,
      tags: CONSTITUTION_METADATA.tags,
      file: {
        buffer: pdfBuffer,
        filename: pdfFilename,
        mimeType: 'application/pdf',
      },
      autoIndex: false, // On déclenche l'indexation manuellement ci-dessous
    },
    SYSTEM_USER_ID
  )

  console.log(`\n✅ Document créé:`)
  console.log(`  ID      : ${doc.id}`)
  console.log(`  Titre   : ${doc.title}`)

  // ── 4. Indexation immédiate (OpenAI + Ollama en parallèle) ────────────────
  console.log('\n[KB] Indexation en cours (OpenAI + Ollama en //)...')
  const indexResult = await indexKnowledgeDocument(doc.id, { skipQualityGate: false })

  if (!indexResult.success) {
    console.error(`\n❌ Indexation échouée: ${indexResult.error}`)
    console.error(`[INFO] Le document est créé (ID: ${doc.id}) mais non indexé.`)
    console.error(`[INFO] Relancer l'indexation via: POST /api/admin/index-kb sur le VPS`)
    process.exit(1)
  }

  console.log(`\n✅ Indexation terminée:`)
  console.log(`  Chunks créés : ${indexResult.chunksCreated}`)
  console.log(`  Stratégie    : article (catégorie=constitution)`)
  console.log(`  Embeddings   : OpenAI (1536-dim) + Ollama nomic (768-dim)`)
  console.log(`\n[INFO] Vérification: https://qadhya.tn/super-admin/knowledge-base?search=${encodeURIComponent('دستور')}`)

  await closePool()
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err.message)
  if (err.message?.includes('corruption')) {
    console.error('\n[HINT] Le PDF semble être scanné ou mal encodé.')
    console.error('Essayez un autre PDF ou vérifiez la qualité du fichier.')
  }
  process.exit(1)
})
