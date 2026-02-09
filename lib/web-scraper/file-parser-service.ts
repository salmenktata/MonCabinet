/**
 * Service de parsing des fichiers (PDF, DOCX, etc.)
 * Extrait le texte des documents pour l'indexation RAG
 * Supporte l'OCR pour les PDFs scannés (images) via Tesseract.js
 *
 * IMPORTANT: Tous les imports de modules natifs sont dynamiques
 * pour éviter les erreurs de build Next.js (File is not defined)
 */

// Tous les modules sont chargés dynamiquement pour éviter les erreurs de build
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mammothModule: typeof import('mammoth') | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PDFParseClass: any = null

async function getMammoth(): Promise<typeof import('mammoth')> {
  if (!mammothModule) {
    mammothModule = await import('mammoth')
  }
  return mammothModule
}

async function getPDFParse() {
  if (!PDFParseClass) {
    const mod = await import('pdf-parse')
    PDFParseClass = mod.PDFParse
  }
  return PDFParseClass
}

// =============================================================================
// CONFIGURATION OCR
// =============================================================================

const OCR_CONFIG = {
  // Seuil minimum de caractères pour considérer qu'un PDF a du texte extractible
  MIN_TEXT_THRESHOLD: 50,
  // Seuil minimum de caractères par page (détecte les PDFs avec peu de texte réparti)
  MIN_CHARS_PER_PAGE: 100,
  // Nombre maximum de pages à traiter avec OCR
  // 250 permet de couvrir les gros codes juridiques (COC = 218 pages)
  MAX_OCR_PAGES: 250,
  // Langues supportées pour l'OCR (arabe + français)
  LANGUAGES: 'ara+fra',
  // Scale factor pour pdf-to-img (3.0 ≈ 300 DPI, meilleur pour l'arabe)
  SCALE: 3.0,
  // Seuil minimum de confiance OCR (0-100)
  MIN_OCR_CONFIDENCE: 40,
  // Nombre maximum d'utilisations du worker avant recyclage
  MAX_WORKER_USES: 50,
  // Ratio minimum de caractères arabes pour valider le texte extrait
  // En dessous, le texte est considéré comme garbled (police encodée) → OCR forcé
  MIN_ARABIC_RATIO: 0.10,
  // Seuil de caractères minimum pour déclencher la détection de texte garbled
  GARBLED_DETECTION_MIN_CHARS: 200,
}

// Modules chargés dynamiquement pour éviter les erreurs de build
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tesseractModule: typeof import('tesseract.js') | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfToImgModule: typeof import('pdf-to-img') | null = null

/**
 * Charge Tesseract.js dynamiquement
 */
async function loadTesseract(): Promise<typeof import('tesseract.js')> {
  if (!tesseractModule) {
    tesseractModule = await import('tesseract.js')
  }
  return tesseractModule
}

/**
 * Charge pdf-to-img dynamiquement
 */
async function loadPdfToImg(): Promise<typeof import('pdf-to-img')> {
  if (!pdfToImgModule) {
    pdfToImgModule = await import('pdf-to-img')
  }
  return pdfToImgModule
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
    ocrApplied?: boolean
    ocrPagesProcessed?: number
    ocrConfidence?: number
  }
  error?: string
}

export type SupportedFileType = 'pdf' | 'docx' | 'doc' | 'txt'

// =============================================================================
// PARSING PDF
// =============================================================================

/**
 * Extrait le texte d'un fichier PDF
 * Utilise OCR si le texte extrait est insuffisant (PDF scanné)
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedFile> {
  let pageCount = 0
  let text = ''
  let wordCount = 0
  let info: any = {}

  // CORRECTION: pdf-parse peut échouer si DOMMatrix n'est pas disponible (Docker)
  // Dans ce cas, on force directement l'OCR
  let pdfParseSuccess = false

  // Vérifier si l'OCR est activé (désactivable si dépendances manquantes)
  const ocrEnabled = process.env.ENABLE_OCR !== 'false'

  try {
    // pdf-parse v2 utilise une classe PDFParse (import dynamique)
    const PDFParse = await getPDFParse()
    const parser = new PDFParse({ data: buffer })

    // Récupérer le texte avec pdf-parse (rapide)
    const textResult = await parser.getText()
    text = cleanText(textResult.text)
    wordCount = countWords(text)

    // Récupérer les métadonnées
    const infoResult = await parser.getInfo()
    info = infoResult.info
    pageCount = textResult.total || infoResult.total || 0

    pdfParseSuccess = true
  } catch (pdfParseError: any) {
    // Si pdf-parse échoue (ex: DOMMatrix not defined), on continue avec OCR
    const errorMsg = pdfParseError?.message || 'Erreur inconnue'
    if (ocrEnabled) {
      console.warn('[FileParser] pdf-parse échoué, fallback OCR:', errorMsg)
      // On essaie d'estimer le nombre de pages (ou on force OCR sans limite)
      pageCount = OCR_CONFIG.MAX_OCR_PAGES
    } else {
      console.warn('[FileParser] pdf-parse échoué et OCR désactivé:', errorMsg)
      // OCR désactivé, on ne peut pas traiter ce PDF
      throw new Error(`PDF non-textuel et OCR désactivé (pdf-parse: ${errorMsg})`)
    }
  }

  try {
    // Si pdf-parse a échoué complètement, forcer l'OCR
    const forcedOcr = !pdfParseSuccess

    // Vérifier si le PDF nécessite l'OCR
    const avgCharsPerPage = pageCount > 0 ? text.length / pageCount : text.length
    const tooLittleText = text.length < OCR_CONFIG.MIN_TEXT_THRESHOLD
      || (pageCount > 0 && avgCharsPerPage < OCR_CONFIG.MIN_CHARS_PER_PAGE)

    // Détection de texte garbled : le PDF a du texte mais c'est du bruit
    // (police encodée personnalisée — fréquent sur les PDFs gouvernementaux arabes)
    const garbledText = !tooLittleText
      && text.length >= OCR_CONFIG.GARBLED_DETECTION_MIN_CHARS
      && isTextGarbled(text)

    const needsOcr = forcedOcr || tooLittleText || garbledText

    let ocrApplied = false
    let ocrPagesProcessed = 0
    let ocrConfidence: number | undefined

    if (needsOcr && ocrEnabled) {
      const reason = forcedOcr
        ? `pdf-parse indisponible (fallback OCR)`
        : garbledText
        ? `texte garbled (ratio arabe trop bas pour un PDF arabe)`
        : `peu de texte (${text.length} chars, ${avgCharsPerPage.toFixed(0)} chars/page)`
      console.log(`[FileParser] PDF: ${reason}, application de l'OCR...`)

      try {
        const ocrResult = await extractTextWithOcr(buffer, pageCount)
        if (ocrResult && ocrResult.text && ocrResult.text.length > text.length) {
          text = ocrResult.text
          wordCount = countWords(text)
          ocrApplied = true
          ocrPagesProcessed = ocrResult.pagesProcessed
          ocrConfidence = ocrResult.avgConfidence
          console.log(
            `[FileParser] OCR terminé: ${ocrPagesProcessed} pages, ${wordCount} mots, confiance: ${ocrConfidence?.toFixed(1)}%`
          )
        } else if (!ocrResult || !ocrResult.text) {
          console.warn('[FileParser] OCR retourné vide/undefined - dépendances OCR manquantes?')
        }
      } catch (ocrError: any) {
        const errorMsg = ocrError?.message || ocrError?.toString() || 'Erreur OCR inconnue'
        console.error('[FileParser] Erreur OCR (fallback au texte original):', errorMsg)
      }
    }

    return {
      success: true,
      text,
      metadata: {
        title: info?.Title || undefined,
        author: info?.Author || undefined,
        creationDate: info?.CreationDate
          ? parsePdfDate(info.CreationDate)
          : undefined,
        pageCount,
        wordCount,
        ocrApplied,
        ocrPagesProcessed: ocrApplied ? ocrPagesProcessed : undefined,
        ocrConfidence: ocrApplied ? ocrConfidence : undefined,
      },
    }
  } catch (error: any) {
    const errorMsg = error?.message || error?.toString() || 'Erreur parsing PDF inconnue'
    console.error('[FileParser] Erreur parsing PDF:', errorMsg, error)
    return {
      success: false,
      text: '',
      metadata: { wordCount: 0 },
      error: errorMsg,
    }
  }
}

// =============================================================================
// OCR POUR PDFS SCANNÉS
// =============================================================================

// =============================================================================
// POOL WORKER TESSERACT (A6)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tesseractWorker: any = null
let workerUseCount = 0

/**
 * Obtient ou crée un worker Tesseract réutilisable
 * Le worker est recyclé après MAX_WORKER_USES utilisations
 */
async function getOrCreateWorker() {
  if (tesseractWorker && workerUseCount < OCR_CONFIG.MAX_WORKER_USES) {
    workerUseCount++
    return tesseractWorker
  }

  // Terminer l'ancien worker si existant
  if (tesseractWorker) {
    try { await tesseractWorker.terminate() } catch { /* ignore */ }
  }

  const Tesseract = await loadTesseract()
  tesseractWorker = await Tesseract.createWorker(OCR_CONFIG.LANGUAGES, 1)
  workerUseCount = 1
  return tesseractWorker
}

/**
 * Termine le worker Tesseract (pour nettoyage en fin de process)
 */
export async function terminateOcrWorker(): Promise<void> {
  if (tesseractWorker) {
    try { await tesseractWorker.terminate() } catch { /* ignore */ }
    tesseractWorker = null
    workerUseCount = 0
  }
}

// =============================================================================
// PRÉTRAITEMENT D'IMAGE (A2)
// =============================================================================

/**
 * Prétraite une image pour améliorer la qualité OCR
 * Optimisé pour le texte arabe (script connecté, ligatures)
 */
async function preprocessImageForOcr(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(imageBuffer)
    .greyscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .threshold(128)
    .png()
    .toBuffer()
}

// =============================================================================
// EXTRACTION OCR (A1, A4, A5)
// =============================================================================

/**
 * Extrait le texte d'un PDF scanné en utilisant l'OCR
 * Utilise pdf-to-img pour convertir en images + sharp pour prétraitement + Tesseract pour l'OCR
 */
async function extractTextWithOcr(
  buffer: Buffer,
  totalPages: number
): Promise<{ text: string; pagesProcessed: number; avgConfidence: number }> {
  const pagesToProcess = Math.min(totalPages || OCR_CONFIG.MAX_OCR_PAGES, OCR_CONFIG.MAX_OCR_PAGES)
  const textParts: string[] = []
  const confidences: number[] = []

  console.log(`[FileParser] OCR: traitement de ${pagesToProcess} pages (max: ${OCR_CONFIG.MAX_OCR_PAGES})`)

  const { cleanArabicOcrText } = await import('./arabic-text-utils')
  const { pdf } = await loadPdfToImg()

  // Obtenir le worker Tesseract (réutilisable)
  const worker = await getOrCreateWorker()

  let pageIndex = 0
  const doc = await pdf(buffer, { scale: OCR_CONFIG.SCALE })

  const ocrStartTime = Date.now()

  for await (const pageImage of doc) {
    if (pageIndex >= pagesToProcess) break

    try {
      // Prétraiter l'image avec sharp (A2)
      const preprocessed = await preprocessImageForOcr(Buffer.from(pageImage))

      // OCR avec Tesseract
      const { data } = await worker.recognize(preprocessed)

      // Vérifier la confiance (A4)
      if (data.confidence < OCR_CONFIG.MIN_OCR_CONFIDENCE) {
        console.warn(`[FileParser] OCR page ${pageIndex + 1} faible confiance: ${data.confidence}%`)
      }
      confidences.push(data.confidence)

      // Nettoyage du texte : cleanText de base + nettoyage post-OCR arabe (A5)
      let pageText = cleanText(data.text)
      pageText = cleanArabicOcrText(pageText)

      if (pageText.length > 0) {
        textParts.push(`--- Page ${pageIndex + 1} ---\n${pageText}`)
      }
    } catch (pageError) {
      console.error(`[FileParser] Erreur OCR page ${pageIndex + 1}:`, pageError)
    }

    pageIndex++

    // Progression toutes les 25 pages (utile pour les gros PDFs)
    if (pageIndex % 25 === 0) {
      const elapsedSec = ((Date.now() - ocrStartTime) / 1000).toFixed(0)
      const pagesPerMin = (pageIndex / (Date.now() - ocrStartTime) * 60000).toFixed(1)
      console.log(
        `[FileParser] OCR progression: ${pageIndex}/${pagesToProcess} pages | ${elapsedSec}s | ${pagesPerMin} pages/min`
      )
    }
  }

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0

  return {
    text: textParts.join('\n\n'),
    pagesProcessed: textParts.length,
    avgConfidence,
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
 * CORRECTION : Vérifie que le fichier est bien un .docx (ZIP) et non un ancien .doc (OLE2)
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedFile> {
  try {
    // Vérifier la signature du fichier :
    // - .docx (Office Open XML) : commence par "PK" (ZIP header: 0x504B)
    // - .doc ancien (OLE2) : commence par 0xD0CF11E0 ou autres signatures binaires
    const header = buffer.subarray(0, 2).toString('hex')
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B  // PK (ZIP)

    if (!isZip) {
      // Ancien format .doc (OLE2) non supporté par mammoth
      console.warn('[FileParser] Ancien format .doc détecté (non-.docx), skip')
      return {
        success: false,
        text: '',
        metadata: { wordCount: 0 },
        error: 'Ancien format .doc non supporté (nécessite .docx)',
      }
    }

    const mammoth = await getMammoth()
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
 * Détecte si le texte extrait est "garbled" (encodage de police personnalisé)
 * Fréquent sur les PDFs gouvernementaux arabes : les glyphes arabes sont mappés
 * sur des codes Latin, donnant un texte long mais illisible.
 *
 * Heuristique : on échantillonne le texte et on vérifie le ratio de caractères arabes.
 * Si le texte contient assez de lettres mais quasi aucune arabe → garbled.
 */
function isTextGarbled(text: string): boolean {
  // Échantillonner le texte (début + milieu + fin) pour performance sur gros PDFs
  const sampleSize = 2000
  const mid = Math.floor(text.length / 2)
  const sample = text.substring(0, sampleSize)
    + text.substring(Math.max(0, mid - sampleSize / 2), mid + sampleSize / 2)
    + text.substring(Math.max(0, text.length - sampleSize))

  const arabicChars = (sample.match(/[\u0600-\u06FF]/g) || []).length
  const latinChars = (sample.match(/[a-zA-Z]/g) || []).length
  const totalLetters = arabicChars + latinChars

  // Pas assez de lettres pour conclure
  if (totalLetters < 100) return false

  const arabicRatio = arabicChars / totalLetters

  // Un PDF juridique tunisien devrait avoir > 10% d'arabe.
  // Si < MIN_ARABIC_RATIO et beaucoup de latin → texte garbled
  if (arabicRatio < OCR_CONFIG.MIN_ARABIC_RATIO && latinChars > 100) {
    console.log(
      `[FileParser] Texte garbled détecté: ratio arabe ${(arabicRatio * 100).toFixed(1)}% ` +
      `(${arabicChars} arabe / ${latinChars} latin sur échantillon ${sample.length} chars)`
    )
    return true
  }

  return false
}

/**
 * Nettoie le texte extrait
 */
function cleanText(text: string): string {
  return text
    // Normaliser les caractères unicode
    .normalize('NFC')
    // Supprimer les caractères de contrôle (sauf newlines et tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Supprimer les URLs de header/footer PDF (ex: http://www.cassation.tn/ doublées)
    .replace(/https?:\/\/[^\s]+\s+https?:\/\/[^\s]+/g, '')
    .replace(/^https?:\/\/[^\s]+$/gm, '')
    // Supprimer les marqueurs de page PDF (ex: -- 1 of 5 --)
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    // Supprimer les numéros de page isolés (ligne avec juste un chiffre)
    .replace(/^\s*\d{1,3}\s*$/gm, '')
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
