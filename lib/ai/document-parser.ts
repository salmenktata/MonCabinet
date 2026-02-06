/**
 * Service d'extraction de texte depuis PDF et DOCX
 * Utilise pdf-parse pour les PDF, mammoth pour les DOCX
 * et Tesseract (binaire natif) pour l'OCR des documents scannés
 */

import tesseract from 'node-tesseract-ocr'
import { fromBuffer } from 'pdf2pic'
import { writeFile, unlink, mkdir, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// Import dynamique pour éviter les erreurs SSR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParse: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mammoth: any = null

async function loadPdfParse() {
  if (!pdfParse) {
    const module = await import('pdf-parse')
    pdfParse = module.default || module
  }
  return pdfParse
}

async function loadMammoth() {
  if (!mammoth) {
    const module = await import('mammoth')
    mammoth = module.default || module
  }
  return mammoth
}

// Configuration Tesseract pour arabe + français
const tesseractConfig = {
  lang: 'ara+fra',
  oem: 1, // LSTM OCR Engine
  psm: 3, // Fully automatic page segmentation
}

/**
 * Fonction utilitaire pour exécuter l'OCR sur une image
 */
async function runOCR(imagePath: string): Promise<string> {
  try {
    const text = await tesseract.recognize(imagePath, tesseractConfig)
    return text
  } catch (error) {
    console.error('Erreur OCR:', error)
    throw error
  }
}

/**
 * Placeholder pour compatibilité (non nécessaire avec binaire natif)
 */
export async function terminateTesseract(): Promise<void> {
  // Rien à faire - le binaire natif ne nécessite pas de cleanup
}

// =============================================================================
// TYPES
// =============================================================================

export interface ParseResult {
  text: string
  metadata: {
    pageCount?: number
    wordCount: number
    charCount: number
    title?: string
    author?: string
    creationDate?: Date
    ocrUsed?: boolean // Indique si l'OCR a été utilisé
  }
}

export interface ExtractOptions {
  useOcr?: boolean // Forcer l'utilisation de l'OCR
  ocrFallback?: boolean // Utiliser OCR si le texte extrait est insuffisant (défaut: true)
  minTextLength?: number // Longueur minimale avant fallback OCR (défaut: 100)
}

export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'text/plain'
  | 'text/html'
  | 'text/markdown'

// =============================================================================
// EXTRACTION PDF
// =============================================================================

/**
 * Extrait le texte d'un fichier PDF avec support OCR
 * @param buffer - Contenu du PDF
 * @param options - Options d'extraction (OCR, fallback, etc.)
 */
export async function extractTextFromPDF(
  buffer: Buffer,
  options: ExtractOptions = {}
): Promise<ParseResult> {
  const { useOcr = false, ocrFallback = true, minTextLength = 100 } = options

  // Si OCR forcé, aller directement à l'OCR
  if (useOcr) {
    console.log('📷 OCR forcé pour ce PDF')
    return extractTextFromPDFWithOCR(buffer)
  }

  try {
    const parser = await loadPdfParse()

    // Options pour contourner les bugs de pdf-parse avec certains PDFs
    const parseOptions = {
      // Éviter le bug "Object.defineProperty called on non-object"
      pagerender: function(pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
        return pageData.getTextContent()
          .then(function(textContent: { items: Array<{ str: string }> }) {
            let text = ''
            for (const item of textContent.items) {
              text += item.str + ' '
            }
            return text
          })
      }
    }

    const data = await parser(buffer, parseOptions)
    const text = cleanText(data.text)

    // Si le texte est trop court, c'est probablement un scan -> fallback OCR
    if (ocrFallback && text.length < minTextLength) {
      console.log(`📷 Texte insuffisant (${text.length} chars), fallback OCR...`)
      return extractTextFromPDFWithOCR(buffer)
    }

    return {
      text,
      metadata: {
        pageCount: data.numpages,
        wordCount: countWords(text),
        charCount: text.length,
        title: data.info?.Title,
        author: data.info?.Author,
        creationDate: data.info?.CreationDate
          ? parseDate(data.info.CreationDate)
          : undefined,
        ocrUsed: false,
      },
    }
  } catch (error) {
    // En cas d'erreur de parsing, tenter l'OCR si autorisé
    if (ocrFallback) {
      console.log('📷 Erreur parsing PDF, tentative OCR...')
      return extractTextFromPDFWithOCR(buffer)
    }
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('Erreur PDF détaillée:', error)
    throw new Error(`Erreur extraction PDF: ${message}`)
  }
}

// =============================================================================
// OCR - EXTRACTION DEPUIS IMAGES (utilise binaire Tesseract natif)
// =============================================================================

/**
 * Extrait le texte d'un PDF scanné via OCR
 * Convertit chaque page en image (via Ghostscript/pdf2pic) puis applique Tesseract
 */
export async function extractTextFromPDFWithOCR(buffer: Buffer): Promise<ParseResult> {
  const tempDir = join(tmpdir(), 'ocr-' + randomUUID())
  const tempFiles: string[] = []

  try {
    await mkdir(tempDir, { recursive: true })

    console.log('📷 Conversion PDF en images (Ghostscript)...')

    // Configurer pdf2pic pour convertir le PDF en images
    const converter = fromBuffer(buffer, {
      density: 200, // DPI pour qualité OCR
      savePath: tempDir,
      saveFilename: 'page',
      format: 'png',
      width: 2000,
      height: 2800,
    })

    // Convertir toutes les pages (-1 = toutes)
    const results = await converter.bulk(-1, { responseType: 'image' })

    const pages: string[] = []
    let pageCount = 0

    for (const result of results) {
      if (result.path) {
        pageCount++
        console.log(`📷 OCR page ${pageCount}...`)
        tempFiles.push(result.path)

        // Appliquer l'OCR via binaire natif
        const text = await runOCR(result.path)
        pages.push(text)
      }
    }

    const text = cleanText(pages.join('\n\n'))
    console.log(`📷 OCR terminé: ${pageCount} pages, ${text.length} caractères`)

    return {
      text,
      metadata: {
        pageCount,
        wordCount: countWords(text),
        charCount: text.length,
        ocrUsed: true,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('Erreur OCR PDF:', error)
    throw new Error(`Erreur OCR PDF: ${message}`)
  } finally {
    // Nettoyer les fichiers temporaires
    for (const file of tempFiles) {
      try {
        await unlink(file)
      } catch {
        // Ignorer les erreurs de suppression
      }
    }
  }
}

/**
 * Extrait le texte d'une image via OCR
 * Supporte PNG, JPG, TIFF, BMP
 */
export async function extractTextFromImage(buffer: Buffer): Promise<ParseResult> {
  const tempPath = join(tmpdir(), `ocr-${randomUUID()}.png`)

  try {
    console.log('📷 OCR image...')

    // Sauvegarder l'image temporairement
    await writeFile(tempPath, buffer)

    // Appliquer l'OCR via binaire natif
    const extractedText = await runOCR(tempPath)
    const text = cleanText(extractedText)

    console.log(`📷 OCR terminé: ${text.length} caractères`)

    return {
      text,
      metadata: {
        wordCount: countWords(text),
        charCount: text.length,
        ocrUsed: true,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('Erreur OCR image:', error)
    throw new Error(`Erreur OCR image: ${message}`)
  } finally {
    // Nettoyer le fichier temporaire
    try {
      await unlink(tempPath)
    } catch {
      // Ignorer les erreurs de suppression
    }
  }
}

// =============================================================================
// EXTRACTION DOCX
// =============================================================================

/**
 * Extrait le texte d'un fichier DOCX
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const m = await loadMammoth()
    const result = await m.extractRawText({ buffer })

    const text = cleanText(result.value)

    return {
      text,
      metadata: {
        wordCount: countWords(text),
        charCount: text.length,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    throw new Error(`Erreur extraction DOCX: ${message}`)
  }
}

/**
 * Extrait le HTML d'un fichier DOCX (conserve la structure)
 */
export async function extractHtmlFromDocx(buffer: Buffer): Promise<string> {
  const m = await loadMammoth()
  const result = await m.convertToHtml({ buffer })
  return result.value
}

// =============================================================================
// EXTRACTION TEXTE BRUT
// =============================================================================

/**
 * Extrait le texte d'un fichier texte brut
 */
export function extractTextFromPlainText(
  buffer: Buffer,
  encoding: BufferEncoding = 'utf-8'
): ParseResult {
  const text = cleanText(buffer.toString(encoding))

  return {
    text,
    metadata: {
      wordCount: countWords(text),
      charCount: text.length,
    },
  }
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Extrait le texte d'un document selon son type MIME
 * @param buffer - Contenu du fichier
 * @param mimeType - Type MIME du fichier
 * @param options - Options d'extraction (OCR, etc.)
 * @returns Texte extrait et métadonnées
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  options: ExtractOptions = {}
): Promise<ParseResult> {
  // Normaliser le type MIME
  const normalizedMime = mimeType.toLowerCase().trim()

  // PDF
  if (normalizedMime === 'application/pdf') {
    return extractTextFromPDF(buffer, options)
  }

  // Images (OCR)
  if (normalizedMime.startsWith('image/')) {
    return extractTextFromImage(buffer)
  }

  // DOCX
  if (
    normalizedMime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalizedMime.includes('wordprocessingml')
  ) {
    return extractTextFromDocx(buffer)
  }

  // DOC (ancien format Word) - pas supporté nativement, essayer comme DOCX
  if (normalizedMime === 'application/msword') {
    try {
      return await extractTextFromDocx(buffer)
    } catch {
      throw new Error(
        'Format DOC non supporté - Veuillez convertir en DOCX ou PDF'
      )
    }
  }

  // Texte brut
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime === 'application/json'
  ) {
    return extractTextFromPlainText(buffer)
  }

  throw new Error(`Type MIME non supporté: ${mimeType}`)
}

/**
 * Vérifie si un type MIME est supporté pour l'extraction
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const supported = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/html',
    'text/markdown',
    'text/csv',
    'application/json',
    // Images (OCR)
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/tiff',
    'image/bmp',
    'image/webp',
  ]

  const normalizedMime = mimeType.toLowerCase().trim()
  return (
    supported.includes(normalizedMime) ||
    normalizedMime.startsWith('text/') ||
    normalizedMime.startsWith('image/')
  )
}

/**
 * Retourne l'extension de fichier correspondant à un type MIME
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  const mapping: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'application/msword': 'doc',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/markdown': 'md',
    'text/csv': 'csv',
    'application/json': 'json',
    // Images
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/tiff': 'tiff',
    'image/bmp': 'bmp',
    'image/webp': 'webp',
  }

  return mapping[mimeType.toLowerCase()] || null
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Nettoie le texte extrait
 * - Supprime les caractères de contrôle
 * - Normalise les espaces
 * - Supprime les lignes vides multiples
 */
function cleanText(text: string): string {
  return (
    text
      // Supprimer les caractères de contrôle sauf newlines et tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normaliser les espaces (remplacer tabs, espaces multiples par un seul espace)
      .replace(/[ \t]+/g, ' ')
      // Normaliser les sauts de ligne
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Supprimer les lignes vides multiples (garder max 2 newlines)
      .replace(/\n{3,}/g, '\n\n')
      // Trim
      .trim()
  )
}

/**
 * Compte les mots dans un texte
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0).length
}

/**
 * Parse une date depuis les métadonnées PDF
 * Format typique: D:20240115120000+01'00'
 */
function parseDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined

  // Format PDF: D:YYYYMMDDHHmmSS
  const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/)
  if (!match) return undefined

  const [, year, month, day, hour = '00', min = '00', sec = '00'] = match

  try {
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    )
  } catch {
    return undefined
  }
}
