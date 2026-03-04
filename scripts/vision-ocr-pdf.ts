/**
 * Script OCR Vision GPT-4o-mini pour PDFs justice.gov.tn garbled
 *
 * Utilise GPT-4o-mini Vision pour extraire le texte arabe propre
 * depuis des PDFs avec police encodée custom (caractères tatweel séparés).
 *
 * Usage :
 *   Dry run (extraction seulement, aperçu texte) :
 *     DATABASE_URL=... OPENAI_API_KEY=... npx tsx scripts/vision-ocr-pdf.ts <URL>
 *
 *   Indexation complète :
 *     DATABASE_URL=... OPENAI_API_KEY=... API_HOST=http://localhost:3000 CRON_SECRET=... \
 *     npx tsx scripts/vision-ocr-pdf.ts <URL> --index
 *
 *   Options :
 *     --index              Sauvegarder en DB + déclencher indexation KB
 *     --pages-per-batch N  Pages par appel GPT (défaut: 5)
 *     --max-pages N        Limiter le nombre de pages (défaut: toutes)
 *     --dry-run            Traiter seulement les 10 premières pages
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import OpenAI from 'openai'

// =============================================================================
// CONFIG
// =============================================================================

const PDF_URL = process.argv.find(a => a.startsWith('http'))
if (!PDF_URL) {
  console.error('[VisionOCR] Usage: npx tsx scripts/vision-ocr-pdf.ts <URL_PDF> [--index]')
  process.exit(1)
}

const isIndex = process.argv.includes('--index')
const isDryRun = process.argv.includes('--dry-run')

const PAGES_PER_BATCH = (() => {
  const arg = process.argv.find(a => a.startsWith('--pages-per-batch='))
  return arg ? parseInt(arg.split('=')[1], 10) : 5
})()

const MAX_PAGES = (() => {
  if (isDryRun) return 10
  const arg = process.argv.find(a => a.startsWith('--max-pages='))
  return arg ? parseInt(arg.split('=')[1], 10) : 9999
})()

const SOURCE_ID = '83adb798-b5ca-45e1-acb6-f04b5e50f5de' // justice.gov.tn source
const API_HOST = process.env.API_HOST ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// =============================================================================
// UTILITAIRES
// =============================================================================

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex')
}

function deriveTitleFromUrl(url: string): string {
  const filename = url.split('/').pop() ?? url
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/manuel_proced[-_]?/i, 'Manuel de procédure — ')
    .replace(/cour_appel/, 'Cour d\'Appel')
    .replace(/cour_cass/, 'Cour de Cassation')
    .replace(/trib_1instance/, 'Tribunal de Première Instance')
    .replace(/trib_immo/, 'Tribunal Immobilier')
    .replace(/juge_rapp/, 'Juge Rapporteur')
    .replace(/enregis_deci/, 'Enregistrement des Décisions')
    .replace(/just_canto/, 'Justice Cantonale')
    .replace(/_/g, ' ')
    .trim()
    + ' — Ministère de la Justice'
}

// =============================================================================
// CONVERSION PDF → IMAGES (via pdf-to-img, déjà installé)
// =============================================================================

async function convertPdfToImageBuffers(pdfBuffer: Buffer, maxPages: number): Promise<Buffer[]> {
  // pdf-to-img retourne un AsyncIterable<Buffer> (PNG par page)
  const { pdf } = await import('pdf-to-img')
  const images: Buffer[] = []
  let pageNum = 0

  const doc = await pdf(pdfBuffer, { scale: 2.0 })
  for await (const page of doc) {
    images.push(page as Buffer)
    pageNum++
    if (pageNum >= maxPages) break
  }

  return images
}

// =============================================================================
// EXTRACTION TEXTE VIA GPT-4o-mini VISION
// =============================================================================

const EXTRACTION_PROMPT = `Extrais le texte arabe de ces pages de document PDF tunisien.
Retourne UNIQUEMENT le texte extrait, page par page, avec ce format exact :
--- Page N ---
[texte de la page]

Règles :
- Conserve la mise en forme originale (listes, tirets, numérotation)
- Ne traduis pas, ne reformule pas
- Si une page est vide ou ne contient que des images, écris "[page vide]"
- Les chiffres et numéros d'articles sont importants, conserve-les
- Le texte est en arabe tunisien juridique`

async function extractTextFromImages(
  imageBuffers: Buffer[],
  startPage: number,
): Promise<string> {
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: EXTRACTION_PROMPT,
    },
  ]

  for (const imageBuffer of imageBuffers) {
    const base64 = imageBuffer.toString('base64')
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${base64}`,
        detail: 'low', // Économique pour l'OCR
      },
    })
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content }],
    max_tokens: 4096,
    temperature: 0,
  })

  const rawText = response.choices[0]?.message?.content ?? ''

  // Normaliser les marqueurs de page pour correspondre au format attendu
  // GPT peut retourner "--- Page 1 ---" mais on veut "--- Page N ---" avec N absolu
  const lines = rawText.split('\n')
  const normalizedLines: string[] = []
  let localPageIdx = 0

  for (const line of lines) {
    if (/^---\s*page\s*\d+\s*---/i.test(line.trim())) {
      localPageIdx++
      const absolutePage = startPage + localPageIdx - 1
      normalizedLines.push(`--- Page ${absolutePage} ---`)
    } else {
      normalizedLines.push(line)
    }
  }

  // Si GPT n'a pas mis de marqueurs, ajouter les marqueurs manuellement
  if (localPageIdx === 0) {
    normalizedLines.unshift(`--- Page ${startPage} ---`)
  }

  return normalizedLines.join('\n')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n[VisionOCR] ===== OCR Vision GPT-4o-mini =====')
  console.log(`[VisionOCR] URL   : ${PDF_URL}`)
  console.log(`[VisionOCR] Mode  : ${isIndex ? '⚠️  INDEXATION' : '🔍 DRY RUN'}${isDryRun ? ' (10 pages seulement)' : ''}`)
  console.log(`[VisionOCR] Batch : ${PAGES_PER_BATCH} pages/appel GPT\n`)

  const startTime = Date.now()

  // ─── 1. Télécharger le PDF ─────────────────────────────────────────────────
  console.log('[VisionOCR] 1/5 Téléchargement du PDF...')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  const response = await fetch(PDF_URL!, {
    signal: controller.signal,
    headers: { 'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn)' },
  })
  clearTimeout(timeout)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const pdfBuffer = Buffer.from(arrayBuffer)
  console.log(`[VisionOCR] PDF téléchargé: ${Math.round(pdfBuffer.length / 1024)} KB`)

  // ─── 2. Convertir pages en images ──────────────────────────────────────────
  console.log('[VisionOCR] 2/5 Conversion PDF → PNG (via pdf-to-img)...')
  let imageBuffers: Buffer[]
  try {
    imageBuffers = await convertPdfToImageBuffers(pdfBuffer, MAX_PAGES)
  } catch (err) {
    throw new Error(`Conversion PDF→images échouée: ${err instanceof Error ? err.message : err}`)
  }

  const totalPages = imageBuffers.length
  const pagesToProcess = imageBuffers.length
  console.log(`[VisionOCR] Pages converties : ${totalPages}`)

  // ─── 3. Extraction texte via GPT-4o-mini ───────────────────────────────────
  console.log(`[VisionOCR] 3/5 Extraction via GPT-4o-mini (${Math.ceil(pagesToProcess / PAGES_PER_BATCH)} batches)...`)

  const textParts: string[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let i = 0; i < pagesToProcess; i += PAGES_PER_BATCH) {
    const batchEnd = Math.min(i + PAGES_PER_BATCH, pagesToProcess)
    const batchImages = imageBuffers.slice(i, batchEnd)
    const batchNum = Math.floor(i / PAGES_PER_BATCH) + 1
    const totalBatches = Math.ceil(pagesToProcess / PAGES_PER_BATCH)

    process.stdout.write(`[VisionOCR]   Batch ${batchNum}/${totalBatches} (pages ${i + 1}-${batchEnd})... `)

    try {
      const batchText = await extractTextFromImages(batchImages, i + 1)
      textParts.push(batchText)

      // Estimation tokens (approximative)
      const estimatedInputTokens = batchImages.length * 2000 // ~2000 tokens/image low-res
      const estimatedOutputTokens = batchText.length / 4
      totalInputTokens += estimatedInputTokens
      totalOutputTokens += estimatedOutputTokens

      console.log(`OK (${Math.round(batchText.length / 1000)}K chars)`)
    } catch (err) {
      console.error(`\n[VisionOCR]   Batch ${batchNum} ERREUR: ${err instanceof Error ? err.message : err}`)
      textParts.push(`--- Page ${i + 1} ---\n[Erreur extraction]\n`)
    }

    // Libérer les images de ce batch
    imageBuffers.splice(i, batchEnd - i, ...new Array(batchEnd - i).fill(Buffer.alloc(0)))

    // Pause courte entre batches (rate limit)
    if (i + PAGES_PER_BATCH < pagesToProcess) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  const fullText = textParts.join('\n\n')
  const wordCount = fullText.split(/\s+/).filter(Boolean).length

  console.log(`\n[VisionOCR] Texte extrait  : ${fullText.length} chars / ${wordCount} mots`)
  console.log(`[VisionOCR] Pages traitées : ${pagesToProcess}/${totalPages}`)
  console.log(`[VisionOCR] Tokens estimés : ~${Math.round(totalInputTokens / 1000)}K input + ~${Math.round(totalOutputTokens / 1000)}K output`)
  console.log(`[VisionOCR] Coût estimé    : ~$${((totalInputTokens * 0.15 + totalOutputTokens * 0.60) / 1_000_000).toFixed(4)}`)

  // Aperçu
  console.log(`\n[VisionOCR] Aperçu (300 premiers chars):\n${fullText.slice(0, 300)}\n`)

  if (!isIndex) {
    console.log('[VisionOCR] Mode dry run — arrêt avant sauvegarde DB.')
    console.log(`[VisionOCR] Durée: ${Math.round((Date.now() - startTime) / 1000)}s`)
    console.log('[VisionOCR] Relancer avec --index pour sauvegarder et indexer.')
    return
  }

  // ─── 4. Sauvegarder en DB ──────────────────────────────────────────────────
  console.log('[VisionOCR] 4/5 Sauvegarde en DB...')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const docTitle = deriveTitleFromUrl(PDF_URL!)
  const urlHash = hashUrl(PDF_URL!)
  const contentHash = crypto.createHash('sha256').update(fullText).digest('hex')

  try {
    // Supprimer l'ancienne KB (et ses chunks en cascade)
    const deleteResult = await pool.query(
      `DELETE FROM knowledge_base WHERE source_file = $1 RETURNING id, title`,
      [PDF_URL!],
    )
    if (deleteResult.rows.length > 0) {
      console.log(`[VisionOCR] Ancienne KB supprimée: "${deleteResult.rows[0].title}" (${deleteResult.rows[0].id})`)
    }

    // Upsert web_page avec le texte propre extrait par GPT
    const existingPage = await pool.query(
      'SELECT id FROM web_pages WHERE url_hash = $1',
      [urlHash],
    )

    let pageId: string
    if (existingPage.rows.length > 0) {
      pageId = existingPage.rows[0].id as string
      await pool.query(
        `UPDATE web_pages SET
          title = $2, extracted_text = $3, content_hash = $4, word_count = $5,
          is_indexed = false, status = 'crawled', updated_at = NOW()
        WHERE id = $1`,
        [pageId, docTitle, fullText, contentHash, wordCount],
      )
      console.log(`[VisionOCR] Web page mise à jour (id=${pageId})`)
    } else {
      const insertPage = await pool.query(
        `INSERT INTO web_pages (
          web_source_id, url, url_hash, canonical_url, title,
          extracted_text, content_hash, word_count, language_detected,
          status, structured_data, linked_files,
          last_crawled_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$2,$4,$5,$6,$7,'ar','crawled',$8,$9,NOW(),NOW(),NOW())
        RETURNING id`,
        [
          SOURCE_ID, PDF_URL!, urlHash, docTitle,
          fullText, contentHash, wordCount,
          JSON.stringify({
            source: 'justice_gov_tn',
            category: 'procedures',
            sourceOrigin: 'justice_gov_tn',
            ocr_method: 'gpt-4o-mini-vision',
            page_count: totalPages,
            pages_processed: pagesToProcess,
          }),
          JSON.stringify([{
            url: PDF_URL!,
            type: 'pdf',
            filename: (PDF_URL!.split('/').pop() ?? 'document.pdf'),
            contentType: 'application/pdf',
            size: pdfBuffer.length,
          }]),
        ],
      )
      pageId = insertPage.rows[0].id as string
      console.log(`[VisionOCR] Web page créée (id=${pageId})`)
    }

    // ─── 5. Déclencher indexation KB ──────────────────────────────────────────
    console.log('[VisionOCR] 5/5 Déclenchement indexation KB...')

    const indexResponse = await fetch(`${API_HOST}/api/admin/web-sources/${SOURCE_ID}/index`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: 5, reindex: false }),
    })

    if (!indexResponse.ok) {
      throw new Error(`API indexation: ${indexResponse.status} ${await indexResponse.text()}`)
    }

    const indexResult = (await indexResponse.json()) as { message?: string; succeeded?: number; chunksCreated?: number }
    const elapsed = Math.round((Date.now() - startTime) / 1000)

    console.log(`\n[VisionOCR] ✅ Terminé en ${elapsed}s`)
    console.log(`[VisionOCR]    ${indexResult.message ?? JSON.stringify(indexResult)}`)
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('[VisionOCR] Erreur fatale:', err instanceof Error ? err.message : err)
  process.exit(1)
})
