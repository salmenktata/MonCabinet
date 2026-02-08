/**
 * Test OCR du PDF COC Arabe (justice.gov.tn)
 * Usage: npx tsx scripts/test-ocr-coc.ts [--force-ocr] [--pages N]
 */
import fs from 'fs'
import { parsePdf, terminateOcrWorker } from '../lib/web-scraper/file-parser-service'

async function main() {
  const pdfPath = '/tmp/COCArabe.pdf'
  const forceOcr = process.argv.includes('--force-ocr')
  const pagesArg = process.argv.indexOf('--pages')
  const maxPages = pagesArg !== -1 ? parseInt(process.argv[pagesArg + 1]) || 5 : 5

  if (!fs.existsSync(pdfPath)) {
    console.error(`Fichier non trouvé: ${pdfPath}`)
    process.exit(1)
  }

  const buffer = fs.readFileSync(pdfPath)

  console.log(`\nFichier: ${pdfPath}`)
  console.log(`Taille: ${(buffer.length / 1024).toFixed(0)} Ko`)
  console.log(`Mode: ${forceOcr ? `OCR forcé (${maxPages} pages)` : 'Automatique'}\n`)

  if (forceOcr) {
    // Test OCR forcé : appeler directement extractTextWithOcr via un hack
    console.log('OCR forcé en cours...\n')

    const { cleanArabicOcrText, normalizeArabicText } = await import('../lib/web-scraper/arabic-text-utils')

    // Charger pdf-to-img et tesseract
    const { pdf } = await import('pdf-to-img')
    const Tesseract = await import('tesseract.js')
    const sharp = (await import('sharp')).default

    const startTime = Date.now()
    const textParts: string[] = []
    const confidences: number[] = []

    const doc = await pdf(buffer, { scale: 3.0 })
    let pageIndex = 0

    const worker = await Tesseract.createWorker('ara+fra', 1)

    for await (const pageImage of doc) {
      if (pageIndex >= maxPages) break

      try {
        // Prétraitement sharp
        const preprocessed = await sharp(Buffer.from(pageImage))
          .greyscale()
          .normalize()
          .sharpen({ sigma: 1.5 })
          .threshold(128)
          .png()
          .toBuffer()

        const { data } = await worker.recognize(preprocessed)
        confidences.push(data.confidence)

        let pageText = data.text
          .normalize('NFC')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        pageText = cleanArabicOcrText(pageText)

        if (pageText.length > 0) {
          textParts.push(`--- Page ${pageIndex + 1} ---\n${pageText}`)
        }

        const arabicCount = (pageText.match(/[\u0600-\u06FF]/g) || []).length
        console.log(`  Page ${pageIndex + 1}: ${pageText.length} chars, ${arabicCount} arabe, confiance: ${data.confidence.toFixed(1)}%`)
      } catch (err) {
        console.error(`  Page ${pageIndex + 1}: ERREUR -`, err)
      }

      pageIndex++
    }

    await worker.terminate()

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const fullText = textParts.join('\n\n')
    const avgConf = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0

    // Appliquer la normalisation arabe
    const normalized = normalizeArabicText(fullText)

    console.log('\n' + '='.repeat(60))
    console.log('RESULTATS OCR FORCE')
    console.log('='.repeat(60))
    console.log(`Duree: ${elapsed}s`)
    console.log(`Pages traitees: ${textParts.length}`)
    console.log(`Confiance moyenne: ${avgConf.toFixed(1)}%`)

    const arabicChars = (normalized.match(/[\u0600-\u06FF]/g) || []).length
    const latinChars = (normalized.match(/[a-zA-Z]/g) || []).length
    const digits = (normalized.match(/[0-9]/g) || []).length
    const words = normalized.split(/\s+/).filter(w => w.length > 0).length

    console.log(`Mots: ${words}`)
    console.log(`Longueur: ${normalized.length} chars`)
    console.log(`Caracteres arabes: ${arabicChars}`)
    console.log(`Caracteres latins: ${latinChars}`)
    console.log(`Chiffres: ${digits}`)
    if (arabicChars + latinChars > 0) {
      console.log(`Ratio arabe: ${(arabicChars / (arabicChars + latinChars) * 100).toFixed(1)}%`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('TEXTE OCR EXTRAIT')
    console.log('='.repeat(60))
    console.log(normalized.substring(0, 3000))

  } else {
    // Mode automatique (parsePdf standard)
    const startTime = Date.now()
    const result = await parsePdf(buffer)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('='.repeat(60))
    console.log('RESULTATS (mode auto)')
    console.log('='.repeat(60))
    console.log(`Succes: ${result.success}`)
    console.log(`Duree: ${elapsed}s`)
    console.log(`Mots: ${result.metadata.wordCount}`)
    console.log(`Pages: ${result.metadata.pageCount}`)
    console.log(`OCR applique: ${result.metadata.ocrApplied}`)
    if (result.metadata.ocrApplied) {
      console.log(`Pages OCR: ${result.metadata.ocrPagesProcessed}`)
      console.log(`Confiance OCR: ${result.metadata.ocrConfidence?.toFixed(1)}%`)
    }

    const arabicChars = (result.text.match(/[\u0600-\u06FF]/g) || []).length
    const latinChars = (result.text.match(/[a-zA-Z]/g) || []).length
    console.log(`Caracteres arabes: ${arabicChars}`)
    console.log(`Ratio arabe: ${arabicChars + latinChars > 0 ? (arabicChars / (arabicChars + latinChars) * 100).toFixed(1) : 0}%`)

    console.log('\n' + '='.repeat(60))
    console.log('EXTRAIT (premiers 2000 chars)')
    console.log('='.repeat(60))
    console.log(result.text.substring(0, 2000))
  }

  await terminateOcrWorker()
  process.exit(0)
}

main().catch(err => {
  console.error('Erreur:', err)
  process.exit(1)
})
