/**
 * Service de parsing des fichiers (PDF, DOCX, etc.)
 * Extrait le texte des documents pour l'indexation RAG
 */

import mammoth from 'mammoth'

// Import dynamique pour éviter les problèmes avec pdf-parse en RSC
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParseModule: any = null

async function getPdfParse() {
  if (!pdfParseModule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('pdf-parse') as any
    pdfParseModule = mod.default || mod
  }
  return pdfParseModule
}

// =============================================================================
// TYPES
// =============================================================================

export interface ParsedFile {
  success: boolean
  text: string
  metadata: {
    title?: string
    author?: string
    creationDate?: Date
    pageCount?: number
    wordCount: number
  }
  error?: string
}

export type SupportedFileType = 'pdf' | 'docx' | 'doc' | 'txt'

// =============================================================================
// PARSING PDF
// =============================================================================

/**
 * Extrait le texte d'un fichier PDF
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedFile> {
  try {
    const pdfParse = await getPdfParse()
    const data = await pdfParse(buffer)

    const text = cleanText(data.text)
    const wordCount = countWords(text)

    return {
      success: true,
      text,
      metadata: {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        creationDate: data.info?.CreationDate
          ? parsePdfDate(data.info.CreationDate)
          : undefined,
        pageCount: data.numpages,
        wordCount,
      },
    }
  } catch (error) {
    console.error('[FileParser] Erreur parsing PDF:', error)
    return {
      success: false,
      text: '',
      metadata: { wordCount: 0 },
      error: error instanceof Error ? error.message : 'Erreur parsing PDF',
    }
  }
}

/**
 * Parse une date au format PDF (D:YYYYMMDDHHmmss)
 */
function parsePdfDate(dateStr: string): Date | undefined {
  try {
    // Format: D:YYYYMMDDHHmmss ou D:YYYYMMDDHHmmssZ
    const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/)
    if (match) {
      const [, year, month, day, hour = '0', min = '0', sec = '0'] = match
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec)
      )
    }
  } catch {
    // Ignorer les erreurs de parsing de date
  }
  return undefined
}

// =============================================================================
// PARSING DOCX
// =============================================================================

/**
 * Extrait le texte d'un fichier DOCX
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedFile> {
  try {
    const result = await mammoth.extractRawText({ buffer })

    const text = cleanText(result.value)
    const wordCount = countWords(text)

    return {
      success: true,
      text,
      metadata: {
        wordCount,
      },
    }
  } catch (error) {
    console.error('[FileParser] Erreur parsing DOCX:', error)
    return {
      success: false,
      text: '',
      metadata: { wordCount: 0 },
      error: error instanceof Error ? error.message : 'Erreur parsing DOCX',
    }
  }
}

// =============================================================================
// PARSING TXT
// =============================================================================

/**
 * Parse un fichier texte brut
 */
export function parseTxt(buffer: Buffer): ParsedFile {
  try {
    const text = cleanText(buffer.toString('utf-8'))
    const wordCount = countWords(text)

    return {
      success: true,
      text,
      metadata: { wordCount },
    }
  } catch (error) {
    return {
      success: false,
      text: '',
      metadata: { wordCount: 0 },
      error: error instanceof Error ? error.message : 'Erreur parsing TXT',
    }
  }
}

// =============================================================================
// DISPATCH
// =============================================================================

/**
 * Parse un fichier selon son type
 */
export async function parseFile(
  buffer: Buffer,
  fileType: SupportedFileType | string
): Promise<ParsedFile> {
  const type = fileType.toLowerCase().replace('.', '') as SupportedFileType

  switch (type) {
    case 'pdf':
      return parsePdf(buffer)
    case 'docx':
    case 'doc':
      return parseDocx(buffer)
    case 'txt':
      return parseTxt(buffer)
    default:
      return {
        success: false,
        text: '',
        metadata: { wordCount: 0 },
        error: `Type de fichier non supporté: ${fileType}`,
      }
  }
}

/**
 * Vérifie si un type de fichier est supporté pour l'extraction de texte
 */
export function isTextExtractable(fileType: string): boolean {
  const supported = ['pdf', 'docx', 'doc', 'txt']
  return supported.includes(fileType.toLowerCase().replace('.', ''))
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Nettoie le texte extrait
 */
function cleanText(text: string): string {
  return text
    // Normaliser les caractères unicode
    .normalize('NFC')
    // Supprimer les caractères de contrôle (sauf newlines et tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normaliser les espaces multiples
    .replace(/[ \t]+/g, ' ')
    // Normaliser les sauts de ligne multiples
    .replace(/\n{3,}/g, '\n\n')
    // Supprimer les espaces en début/fin de ligne
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim()
}

/**
 * Compte les mots dans un texte
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}
