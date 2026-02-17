import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Route: OCR des PDFs scannés Google Drive sans texte extrait
 * Traite les PDFs un par un (concurrency=1) pour éviter OOM
 * Protégé par CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { parsePdf, terminateOcrWorker } from '@/lib/web-scraper/file-parser-service'
import { downloadGoogleDriveFileForIndexing } from '@/lib/web-scraper/storage-adapter'
import { safeParseInt } from '@/lib/utils/safe-number'

export const dynamic = 'force-dynamic'
export const maxDuration = 3600 // 1h

const GDRIVE_SOURCE_ID = '546d11c8-b3fd-4559-977b-c3572aede0e4'

interface OcrResult {
  title: string
  words: number
  confidence: number | null
  pages: number
  status: 'success' | 'failed' | 'download_failed'
  error?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

  try {
    // Récupérer les PDFs sans texte extrait
    const result = await db.query(
      `SELECT id, title, url
       FROM web_pages
       WHERE web_source_id = $1
         AND extracted_text IS NULL
         AND LOWER(title) LIKE '%.pdf'
       ORDER BY created_at ASC
       LIMIT $2`,
      [GDRIVE_SOURCE_ID, limit]
    )

    const pages = result.rows
    const totalMissing = pages.length

    console.log(`[OCR-Missing] ${totalMissing} PDFs sans texte à traiter (limit=${limit})`)

    if (totalMissing === 0) {
      return NextResponse.json({
        success: true,
        total: 0,
        processed: 0,
        ocrSuccess: 0,
        ocrFailed: 0,
        avgConfidence: 0,
        avgWordsPerDoc: 0,
        details: [],
      })
    }

    const details: OcrResult[] = []
    let ocrSuccess = 0
    let ocrFailed = 0
    let totalConfidence = 0
    let totalWords = 0
    let confidenceCount = 0

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const pageTitle = page.title || 'unknown.pdf'

      console.log(`[OCR-Missing] [${i + 1}/${totalMissing}] Traitement: ${pageTitle}`)

      // Extraire le file_id Google Drive depuis l'URL
      const fileIdMatch = page.url?.match(/\/file\/d\/([^/]+)/)
      if (!fileIdMatch) {
        console.warn(`[OCR-Missing] URL invalide pour ${pageTitle}: ${page.url}`)
        details.push({
          title: pageTitle,
          words: 0,
          confidence: null,
          pages: 0,
          status: 'failed',
          error: 'URL Google Drive invalide',
        })
        ocrFailed++
        continue
      }

      const fileId = fileIdMatch[1]

      try {
        // Télécharger le PDF depuis Google Drive
        const downloadResult = await downloadGoogleDriveFileForIndexing(fileId, 'application/pdf')

        if (!downloadResult.success || !downloadResult.buffer) {
          console.warn(`[OCR-Missing] Échec téléchargement ${pageTitle}: ${downloadResult.error}`)
          details.push({
            title: pageTitle,
            words: 0,
            confidence: null,
            pages: 0,
            status: 'download_failed',
            error: downloadResult.error || 'Téléchargement échoué',
          })
          ocrFailed++
          continue
        }

        // Parser le PDF (OCR automatique si scanned)
        const parsed = await parsePdf(downloadResult.buffer)

        if (parsed.success && parsed.text && parsed.metadata.wordCount > 10) {
          // Mettre à jour la page avec le texte extrait
          await db.query(
            `UPDATE web_pages
             SET extracted_text = $1, status = 'crawled', updated_at = NOW()
             WHERE id = $2`,
            [parsed.text, page.id]
          )

          ocrSuccess++
          totalWords += parsed.metadata.wordCount
          if (parsed.metadata.ocrConfidence) {
            totalConfidence += parsed.metadata.ocrConfidence
            confidenceCount++
          }

          details.push({
            title: pageTitle,
            words: parsed.metadata.wordCount,
            confidence: parsed.metadata.ocrConfidence || null,
            pages: parsed.metadata.pageCount || 0,
            status: 'success',
          })

          console.log(
            `[OCR-Missing] ✅ ${pageTitle}: ${parsed.metadata.wordCount} mots, ` +
            `${parsed.metadata.pageCount || '?'} pages, ` +
            `confiance: ${parsed.metadata.ocrConfidence || 'N/A'}%` +
            `${parsed.metadata.ocrApplied ? ' (OCR)' : ' (texte natif)'}`
          )
        } else {
          ocrFailed++
          details.push({
            title: pageTitle,
            words: parsed.metadata.wordCount,
            confidence: parsed.metadata.ocrConfidence || null,
            pages: parsed.metadata.pageCount || 0,
            status: 'failed',
            error: parsed.error || 'Texte insuffisant',
          })

          console.warn(
            `[OCR-Missing] ❌ ${pageTitle}: ${parsed.error || 'texte insuffisant'} ` +
            `(${parsed.metadata.wordCount} mots)`
          )
        }
      } catch (error) {
        ocrFailed++
        const errorMsg = getErrorMessage(error) || 'Erreur inconnue'
        details.push({
          title: pageTitle,
          words: 0,
          confidence: null,
          pages: 0,
          status: 'failed',
          error: errorMsg,
        })
        console.error(`[OCR-Missing] ❌ ${pageTitle}: ${errorMsg}`)
      }
    }

    // Libérer le worker OCR Tesseract
    try {
      await terminateOcrWorker()
    } catch {
      // Ignorer les erreurs de nettoyage
    }

    const avgConfidence = confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 10) / 10 : 0
    const avgWordsPerDoc = ocrSuccess > 0 ? Math.round(totalWords / ocrSuccess) : 0

    console.log(
      `[OCR-Missing] Terminé: ${ocrSuccess}/${totalMissing} succès, ` +
      `${ocrFailed} échecs, confiance moy: ${avgConfidence}%`
    )

    return NextResponse.json({
      success: true,
      total: totalMissing,
      processed: ocrSuccess + ocrFailed,
      ocrSuccess,
      ocrFailed,
      avgConfidence,
      avgWordsPerDoc,
      details,
    })
  } catch (error) {
    console.error('[OCR-Missing] Erreur:', error)
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Erreur interne' },
      { status: 500 }
    )
  }
}
