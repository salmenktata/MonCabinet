/**
 * Extraction du texte des PDFs de justice.gov.tn
 *
 * Les PDFs ont été téléchargés par le crawler mais extracted_text=NULL.
 * Ce script : télécharge chaque PDF depuis l'URL d'origine,
 * extrait le texte, met à jour web_pages.extracted_text,
 * puis déclenche l'indexation KB.
 *
 * Usage (tunnel SSH actif sur port 5434) :
 *   DB_PASSWORD=prod_secure_password_2026 npx tsx scripts/extract-justice-pdf-text.ts --production
 */

import 'dotenv/config'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const isProduction = args.includes('--production')

const DB_CONFIG = isProduction
  ? {
      host: '127.0.0.1',
      port: 5434,
      database: 'qadhya',
      user: 'moncabinet',
      password: process.env.DB_PASSWORD || '',
    }
  : {
      host: '127.0.0.1',
      port: 5433,
      database: process.env.POSTGRES_DB || 'qadhya',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
    }

const CRON_SECRET = process.env.CRON_SECRET || 'f65b89a33943a552b134dafeed73bac239166fd21a8819207774fb6e19031766'
const API_BASE = isProduction ? 'https://qadhya.tn' : 'http://localhost:7002'

// Source justice.gov.tn
const JUSTICE_SOURCE_ID = '72fba4e8-7e6b-4267-a585-b4d23bac9efe'

async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
    },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  // Import dynamique pour éviter les problèmes ESM
  const mod = await import('pdf-parse')
  const PDFParse = (mod as any).PDFParse || (mod as any).default

  if (PDFParse) {
    try {
      const parser = new PDFParse({ data: buffer })
      const result = await parser.renderPage(1)
      // Utiliser le mode simple
    } catch {}
  }

  // Fallback : utiliser la fonction parse directement
  const pdfParse = await import('pdf-parse')
  const parsed = await (pdfParse.default || pdfParse)(buffer)

  return {
    text: parsed.text || '',
    pages: parsed.numpages || 0,
  }
}

async function main() {
  console.log(`🏛️  Extraction texte PDFs justice.gov.tn`)
  console.log(`📊 Env: ${isProduction ? 'PRODUCTION' : 'LOCAL'} | DB: ${DB_CONFIG.host}:${DB_CONFIG.port}\n`)

  const pool = new Pool(DB_CONFIG)

  try {
    await pool.query('SELECT 1')
    console.log('✅ Connexion DB OK\n')

    // Récupérer les pages PDF sans texte extrait
    const pdfPages = await pool.query<{
      id: string
      url: string
      title: string
      linked_files: any[]
    }>(
      `SELECT id, url, title, linked_files
       FROM web_pages
       WHERE web_source_id = $1
         AND (extracted_text IS NULL OR extracted_text = '' OR word_count = 0)
         AND (url LIKE '%.pdf' OR url LIKE '%.PDF'
              OR linked_files::text LIKE '%pdf%')
       ORDER BY title`,
      [JUSTICE_SOURCE_ID]
    )

    console.log(`📋 ${pdfPages.rows.length} PDFs à traiter\n`)

    let processed = 0
    let failed = 0

    for (const page of pdfPages.rows) {
      const pdfUrl = page.url.toLowerCase().includes('.pdf')
        ? page.url
        : page.linked_files?.[0]?.url

      if (!pdfUrl) {
        console.log(`  ⏭️  Skip ${page.title || page.url} (pas d'URL PDF)`)
        continue
      }

      console.log(`📄 Traitement: ${page.title || pdfUrl}`)
      console.log(`   URL: ${pdfUrl}`)

      try {
        // Télécharger le PDF
        const buffer = await downloadPdf(pdfUrl)
        console.log(`   ✅ Téléchargé: ${Math.round(buffer.length / 1024)} KB`)

        // Extraire le texte
        let extractedText = ''
        let pageCount = 0

        try {
          const result = await extractPdfText(buffer)
          extractedText = result.text
          pageCount = result.pages
        } catch (parseErr) {
          console.log(`   ⚠️  pdf-parse échoué: ${parseErr}`)
          // Si PDF scanné, le texte sera vide - on met quand même la page en crawled
          extractedText = ''
        }

        const wordCount = extractedText.trim().split(/\s+/).filter(Boolean).length
        console.log(`   📊 ${wordCount} mots extraits, ${pageCount} pages`)

        if (wordCount < 50) {
          console.log(`   ⚠️  Trop peu de texte — PDF peut-être scanné (OCR requis)`)
          // Marquer comme crawled pour info mais pas assez pour indexer
          await pool.query(
            `UPDATE web_pages
             SET error_message = 'PDF scanné — OCR requis (< 50 mots extraits)',
                 updated_at = NOW()
             WHERE id = $1`,
            [page.id]
          )
          failed++
          continue
        }

        // Mettre à jour extracted_text dans web_pages
        await pool.query(
          `UPDATE web_pages
           SET extracted_text = $2,
               word_count = $3,
               status = 'crawled',
               error_message = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [page.id, extractedText, wordCount]
        )

        console.log(`   ✅ extracted_text mis à jour (${wordCount} mots)`)
        processed++

        // Petite pause entre les PDFs
        await new Promise(r => setTimeout(r, 500))

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`   ❌ Erreur: ${msg}`)
        await pool.query(
          `UPDATE web_pages
           SET error_message = $2, updated_at = NOW()
           WHERE id = $1`,
          [page.id, msg.slice(0, 500)]
        )
        failed++
      }
    }

    console.log(`\n✅ Extraction terminée: ${processed} succès, ${failed} échecs\n`)

    if (processed === 0) {
      console.log('ℹ️  Aucun PDF à indexer — peut-être PDFs scannés (OCR requis sur VPS)')
      return
    }

    // Déclencher l'indexation des pages mises à jour
    console.log('🔄 Déclenchement indexation KB...')
    try {
      const indexResponse = await fetch(
        `${API_BASE}/api/admin/web-sources/${JUSTICE_SOURCE_ID}/index`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CRON_SECRET}`,
          },
          body: JSON.stringify({ limit: 100, reindex: false }),
          signal: AbortSignal.timeout(300000), // 5min
        }
      )
      const indexResult = await indexResponse.json()
      console.log(`✅ Indexation: ${JSON.stringify(indexResult, null, 2)}`)
    } catch (err) {
      console.log(`⚠️  Indexation API timeout/erreur — lancer manuellement via admin UI`)
      console.log(`   curl -X POST '${API_BASE}/api/admin/web-sources/${JUSTICE_SOURCE_ID}/index' \\`)
      console.log(`     -H 'Authorization: Bearer ${CRON_SECRET}'`)
    }

  } catch (err) {
    console.error('❌ Erreur fatale:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
