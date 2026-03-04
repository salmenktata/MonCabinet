/**
 * Script d'indexation d'un PDF direct depuis justice.gov.tn
 *
 * Télécharge, parse (avec OCR si nécessaire) et indexe le document dans la KB.
 *
 * Usage :
 *   Dry run (parse seulement) :
 *     npx tsx scripts/index-justice-pdf.ts
 *   Indexation prod (via tunnel 5434) :
 *     DATABASE_URL=postgres://moncabinet:...@127.0.0.1:5434/qadhya npx tsx scripts/index-justice-pdf.ts --index
 */

import { Pool } from 'pg'
import crypto from 'crypto'

// =============================================================================
// CONFIG
// =============================================================================

const PDF_URL = 'https://www.justice.gov.tn/fileadmin/medias/manuels_de_procedure/manuel_proced_cour_appel.pdf'
const DOC_TITLE = 'Manuel de procédure de la Cour d\'Appel - Ministère de la Justice'
const DOC_CATEGORY = 'procedure'
const SOURCE_BASE_URL = 'https://www.justice.gov.tn'
const SOURCE_ORIGIN = 'justice_gov_tn'
const NORM_LEVEL = 'loi_ordinaire' // Manuel procédural officiel

const isIndex = process.argv.includes('--index')

// =============================================================================
// UTILITAIRES
// =============================================================================

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex')
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n[JusticePDF] ===== Indexation Manuel Cour d\'Appel =====')
  console.log(`[JusticePDF] Mode : ${isIndex ? '⚠️  INDEXATION RÉELLE' : '🔍 DRY RUN (parse seulement)'}`)
  console.log(`[JusticePDF] URL  : ${PDF_URL}\n`)

  const startTime = Date.now()

  // ─── 1. Télécharger le PDF ─────────────────────────────────────────────────
  console.log('[JusticePDF] 1/4 Téléchargement du PDF...')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000) // 2 min

  const response = await fetch(PDF_URL, {
    signal: controller.signal,
    headers: { 'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn)' },
  })
  clearTimeout(timeout)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    console.warn(`[JusticePDF] Content-Type inattendu: ${contentType}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  console.log(`[JusticePDF] PDF téléchargé: ${Math.round(buffer.length / 1024)} KB`)

  // ─── 2. Parser le PDF ──────────────────────────────────────────────────────
  console.log('[JusticePDF] 2/4 Extraction texte (OCR si nécessaire)...')

  // Import dynamique des modules Next.js (nécessite tsconfig paths)
  // On appelle file-parser-service via un wrapper car il utilise des alias @/
  const { parsePdf } = await import('../lib/web-scraper/file-parser-service')

  const parsed = await parsePdf(buffer, { forceOcr: false })

  // Détecter le texte garbled (lettres arabes séparées par des espaces — encodage police custom)
  // Ex: "د ـــ ل" au lieu de "دليل". Symptôme : ratio espaces/chars anormalement élevé.
  const isGarbled = parsed.text
    ? (() => {
        const words = parsed.text!.split(/\s+/).filter(Boolean)
        const avgWordLen = words.length > 0
          ? parsed.text!.replace(/\s/g, '').length / words.length
          : 0
        // Mot moyen < 2 chars = lettres séparées → garbled
        return avgWordLen < 2.5
      })()
    : false

  if (!parsed.success || !parsed.text || parsed.text.length < 100 || isGarbled) {
    if (isGarbled) {
      console.log('[JusticePDF] Texte garbled détecté (lettres séparées) — OCR forcé...')
    } else {
      console.log('[JusticePDF] Texte insuffisant — tentative avec OCR forcé...')
    }
    const parsedOcr = await parsePdf(buffer, { forceOcr: true })
    if (!parsedOcr.success || !parsedOcr.text) {
      throw new Error(`Échec extraction texte: ${parsedOcr.error ?? 'texte vide'}`)
    }
    Object.assign(parsed, parsedOcr)
  }

  console.log(`[JusticePDF] Texte extrait : ${parsed.text!.length} chars`)
  console.log(`[JusticePDF] Pages         : ${parsed.metadata.pageCount}`)
  console.log(`[JusticePDF] OCR appliqué  : ${parsed.metadata.ocrApplied ? 'oui' : 'non'}`)
  if (parsed.metadata.ocrConfidence !== undefined) {
    console.log(`[JusticePDF] Confiance OCR : ${parsed.metadata.ocrConfidence}%`)
  }

  // Aperçu du début du texte
  console.log(`\n[JusticePDF] Aperçu (300 premiers chars):\n${parsed.text!.slice(0, 300)}\n`)

  if (!isIndex) {
    console.log('[JusticePDF] Mode dry run — arrêt avant indexation.')
    console.log(`[JusticePDF] Durée: ${Math.round((Date.now() - startTime) / 1000)}s`)
    console.log('[JusticePDF] Relancer avec --index pour indexer en DB.')
    return
  }

  // ─── 3. Upsert web_source + web_pages ─────────────────────────────────────
  console.log('[JusticePDF] 3/4 Sauvegarde en DB...')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let sourceId: string
  let pageId: string

  try {
    // Trouver ou créer la web_source justice.gov.tn
    const srcResult = await pool.query(
      "SELECT id FROM web_sources WHERE base_url ILIKE $1",
      ['%justice.gov.tn%'],
    )

    if (srcResult.rows.length > 0) {
      sourceId = srcResult.rows[0].id as string
      console.log(`[JusticePDF] Source existante: ${sourceId}`)
    } else {
      // Récupérer un admin pour created_by
      const adminResult = await pool.query(
        "SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1",
      )
      const adminId = adminResult.rows[0]?.id ?? null

      const insertSrc = await pool.query(
        `INSERT INTO web_sources (
          name, base_url, description, categories, language,
          priority, is_active, requires_javascript, respect_robots_txt,
          download_files, auto_index_files, rate_limit_ms, crawl_frequency,
          max_depth, max_pages, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'fr',
          7, true, false, true,
          true, true, 3000, '30 days',
          2, 500, $5, NOW(), NOW()
        ) RETURNING id`,
        [
          'Ministère de la Justice - Tunisie',
          SOURCE_BASE_URL,
          'Site officiel du Ministère de la Justice tunisien — manuels de procédure et ressources juridiques.',
          JSON.stringify(['procedure']),
          adminId,
        ],
      )
      sourceId = insertSrc.rows[0].id as string
      console.log(`[JusticePDF] Source créée: ${sourceId}`)
    }

    // Upsert web_pages
    const urlHash = hashUrl(PDF_URL)
    const contentHash = hashContent(parsed.text!)
    const wordCount = countWords(parsed.text!)

    const existingPage = await pool.query(
      'SELECT id FROM web_pages WHERE url_hash = $1',
      [urlHash],
    )

    if (existingPage.rows.length > 0) {
      pageId = existingPage.rows[0].id as string
      await pool.query(
        `UPDATE web_pages SET
          title = $2, extracted_text = $3, content_hash = $4, word_count = $5,
          is_indexed = false, last_crawled_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
        [pageId, DOC_TITLE, parsed.text!, contentHash, wordCount],
      )
      console.log(`[JusticePDF] Page mise à jour (id=${pageId})`)
    } else {
      const insertPage = await pool.query(
        `INSERT INTO web_pages (
          web_source_id, url, url_hash, canonical_url, title,
          extracted_text, content_hash, word_count, language_detected,
          status, structured_data, linked_files,
          last_crawled_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$2,$4,$5,$6,$7,'fr','crawled',$8,$9,NOW(),NOW(),NOW())
        RETURNING id`,
        [
          sourceId, PDF_URL, urlHash, DOC_TITLE,
          parsed.text!, contentHash, wordCount,
          JSON.stringify({
            source: 'justice_gov_tn',
            category: DOC_CATEGORY,
            norm_level: NORM_LEVEL,
            sourceOrigin: SOURCE_ORIGIN,
            ocr_applied: parsed.metadata.ocrApplied,
            page_count: parsed.metadata.pageCount,
          }),
          JSON.stringify([{
            url: PDF_URL,
            type: 'pdf',
            filename: 'manuel_proced_cour_appel.pdf',
            contentType: 'application/pdf',
            size: buffer.length,
          }]),
        ],
      )
      pageId = insertPage.rows[0].id as string
      console.log(`[JusticePDF] Page créée (id=${pageId})`)
    }

    // ─── 4. Indexation KB ──────────────────────────────────────────────────────
    console.log('[JusticePDF] 4/4 Indexation dans la Knowledge Base...')

    // L'indexation utilise l'infrastructure Next.js — appeler via API interne
    // Pour un script local, on importe directement indexWebPage
    const { indexWebPage } = await import('../lib/web-scraper/web-indexer-service')
    const result = await indexWebPage(pageId)

    const elapsed = Math.round((Date.now() - startTime) / 1000)

    if (result.success) {
      console.log(`\n[JusticePDF] ✅ Indexation réussie !`)
      console.log(`[JusticePDF]    KB ID        : ${result.knowledgeBaseId}`)
      console.log(`[JusticePDF]    Chunks créés : ${result.chunksCreated}`)
      console.log(`[JusticePDF]    Durée totale : ${elapsed}s`)
    } else {
      console.error(`\n[JusticePDF] ❌ Erreur indexation: ${result.error}`)
      process.exit(1)
    }
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('[JusticePDF] Erreur fatale:', err instanceof Error ? err.message : err)
  process.exit(1)
})
