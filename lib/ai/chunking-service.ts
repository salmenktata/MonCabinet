/**
 * Service de découpage de texte en chunks pour le RAG
 * Gère le chunking avec overlap pour maintenir le contexte
 */

import { aiConfig } from './config'

// =============================================================================
// OVERLAP PAR CATÉGORIE - Contexte adapté au type de document juridique
// =============================================================================

/**
 * Overlap variable par catégorie de document
 * Plus d'overlap pour les documents où le contexte inter-paragraphes est crucial
 */
export const OVERLAP_BY_CATEGORY: Record<string, number> = {
  code: 100,           // Codes juridiques: contexte légal important entre articles
  jurisprudence: 80,   // Jurisprudence: attendus liés entre paragraphes
  doctrine: 60,        // Doctrine: argumentation continue
  modele: 40,          // Modèles: sections plus indépendantes
  default: 50,         // Valeur par défaut
}

/**
 * Retourne l'overlap approprié pour une catégorie de document
 */
export function getOverlapForCategory(category?: string): number {
  if (!category) return OVERLAP_BY_CATEGORY.default
  return OVERLAP_BY_CATEGORY[category.toLowerCase()] ?? OVERLAP_BY_CATEGORY.default
}

// =============================================================================
// TYPES
// =============================================================================

export interface Chunk {
  content: string
  index: number
  metadata: ChunkMetadata
}

export interface ChunkMetadata {
  wordCount: number
  charCount: number
  startPosition: number
  endPosition: number
  overlapWithPrevious: boolean
  overlapWithNext: boolean
}

export interface ChunkingOptions {
  /** Taille cible des chunks en mots (défaut: config RAG) */
  chunkSize?: number
  /** Nombre de mots de chevauchement entre chunks (défaut: config RAG ou catégorie) */
  overlap?: number
  /** Préserver les paragraphes si possible */
  preserveParagraphs?: boolean
  /** Préserver les phrases si possible */
  preserveSentences?: boolean
  /** Catégorie du document pour overlap adaptatif (code, jurisprudence, doctrine, modele) */
  category?: string
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Découpe un texte en chunks avec chevauchement
 * @param text - Texte à découper
 * @param options - Options de chunking
 * @returns Liste de chunks avec métadonnées
 */
export function chunkText(text: string, options: ChunkingOptions = {}): Chunk[] {
  const {
    chunkSize = aiConfig.rag.chunkSize,
    overlap = options.category ? getOverlapForCategory(options.category) : aiConfig.rag.chunkOverlap,
    preserveParagraphs = true,
    preserveSentences = true,
    category,
  } = options

  // Log si overlap adaptatif utilisé
  if (category && overlap !== aiConfig.rag.chunkOverlap) {
    console.log(`[Chunking] Overlap adaptatif pour catégorie "${category}": ${overlap} mots`)
  }

  if (!text || text.trim().length === 0) {
    return []
  }

  // Nettoyer le texte
  const cleanedText = text.trim()

  // Si le texte est plus court que la taille de chunk, retourner un seul chunk
  const words = cleanedText.split(/\s+/)
  if (words.length <= chunkSize) {
    return [
      {
        content: cleanedText,
        index: 0,
        metadata: {
          wordCount: words.length,
          charCount: cleanedText.length,
          startPosition: 0,
          endPosition: cleanedText.length,
          overlapWithPrevious: false,
          overlapWithNext: false,
        },
      },
    ]
  }

  // Stratégie de chunking selon les options
  if (preserveParagraphs) {
    return chunkByParagraphs(cleanedText, chunkSize, overlap, preserveSentences)
  }

  if (preserveSentences) {
    return chunkBySentences(cleanedText, chunkSize, overlap)
  }

  // Chunking simple par mots
  return chunkByWords(cleanedText, chunkSize, overlap)
}

// =============================================================================
// STRATÉGIES DE CHUNKING
// =============================================================================

/**
 * Découpe en préservant les paragraphes
 */
function chunkByParagraphs(
  text: string,
  chunkSize: number,
  overlap: number,
  preserveSentences: boolean
): Chunk[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: Chunk[] = []

  let currentChunk = ''
  let currentWordCount = 0
  let startPosition = 0
  let textPosition = 0

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim()
    if (!paragraph) {
      textPosition += 2 // Pour \n\n
      continue
    }

    const paragraphWords = paragraph.split(/\s+/).length

    // Si le paragraphe seul dépasse la taille, le découper
    if (paragraphWords > chunkSize) {
      // Sauvegarder le chunk actuel si non vide
      if (currentChunk) {
        chunks.push(createChunk(currentChunk, chunks.length, startPosition))
        currentChunk = ''
        currentWordCount = 0
      }

      // Découper le paragraphe long
      const subChunks = preserveSentences
        ? chunkBySentences(paragraph, chunkSize, overlap)
        : chunkByWords(paragraph, chunkSize, overlap)

      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          index: chunks.length,
          metadata: {
            ...subChunk.metadata,
            startPosition: textPosition + subChunk.metadata.startPosition,
            endPosition: textPosition + subChunk.metadata.endPosition,
          },
        })
      }

      textPosition += paragraph.length + 2
      startPosition = textPosition
      continue
    }

    // Vérifier si ajouter ce paragraphe dépasse la taille
    if (currentWordCount + paragraphWords > chunkSize && currentChunk) {
      // Créer le chunk actuel
      chunks.push(createChunk(currentChunk, chunks.length, startPosition))

      // Overlap: reprendre les derniers mots du chunk précédent
      const overlapText = getOverlapText(currentChunk, overlap)
      currentChunk = overlapText + (overlapText ? '\n\n' : '') + paragraph
      currentWordCount = countWords(currentChunk)
      startPosition =
        textPosition - (overlapText ? overlapText.length + 2 : 0)
    } else {
      // Ajouter le paragraphe au chunk actuel
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      currentWordCount += paragraphWords
    }

    textPosition += paragraph.length + 2
  }

  // Dernier chunk
  if (currentChunk.trim()) {
    chunks.push(createChunk(currentChunk, chunks.length, startPosition))
  }

  return addOverlapFlags(chunks)
}

/**
 * Découpe en préservant les phrases
 */
function chunkBySentences(
  text: string,
  chunkSize: number,
  overlap: number
): Chunk[] {
  // Regex pour détecter les fins de phrases
  // Supporte la ponctuation latine (. ! ?) et arabe (؟ ، ؛)
  const sentences = text.match(/[^.!?؟،؛]+[.!?؟،؛]+[\s]*/g) || [text]
  const chunks: Chunk[] = []

  let currentChunk = ''
  let currentWordCount = 0
  let startPosition = 0
  let textPosition = 0

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length

    if (currentWordCount + sentenceWords > chunkSize && currentChunk) {
      chunks.push(createChunk(currentChunk.trim(), chunks.length, startPosition))

      const overlapText = getOverlapText(currentChunk, overlap)
      currentChunk = overlapText + (overlapText ? ' ' : '') + sentence
      currentWordCount = countWords(currentChunk)
      startPosition = textPosition - (overlapText ? overlapText.length + 1 : 0)
    } else {
      currentChunk += sentence
      currentWordCount += sentenceWords
    }

    textPosition += sentence.length
  }

  if (currentChunk.trim()) {
    chunks.push(createChunk(currentChunk.trim(), chunks.length, startPosition))
  }

  return addOverlapFlags(chunks)
}

/**
 * Découpe simple par mots
 */
function chunkByWords(
  text: string,
  chunkSize: number,
  overlap: number
): Chunk[] {
  const words = text.split(/\s+/)
  const chunks: Chunk[] = []

  const step = chunkSize - overlap

  for (let i = 0; i < words.length; i += step) {
    const chunkWords = words.slice(i, i + chunkSize)
    const content = chunkWords.join(' ')

    if (content.trim()) {
      // Calculer les positions (approximation)
      const startPosition = words.slice(0, i).join(' ').length + (i > 0 ? 1 : 0)
      const endPosition = startPosition + content.length

      chunks.push({
        content,
        index: chunks.length,
        metadata: {
          wordCount: chunkWords.length,
          charCount: content.length,
          startPosition,
          endPosition,
          overlapWithPrevious: i > 0,
          overlapWithNext: i + chunkSize < words.length,
        },
      })
    }
  }

  return chunks
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Crée un objet Chunk
 */
function createChunk(content: string, index: number, startPosition: number): Chunk {
  const trimmed = content.trim()
  return {
    content: trimmed,
    index,
    metadata: {
      wordCount: countWords(trimmed),
      charCount: trimmed.length,
      startPosition,
      endPosition: startPosition + trimmed.length,
      overlapWithPrevious: false,
      overlapWithNext: false,
    },
  }
}

/**
 * Extrait le texte de chevauchement depuis la fin d'un chunk
 */
function getOverlapText(text: string, overlapWords: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= overlapWords) {
    return text.trim()
  }
  return words.slice(-overlapWords).join(' ')
}

/**
 * Ajoute les flags d'overlap aux chunks
 */
function addOverlapFlags(chunks: Chunk[]): Chunk[] {
  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      overlapWithPrevious: i > 0,
      overlapWithNext: i < chunks.length - 1,
    },
  }))
}

/**
 * Compte les mots dans un texte
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

// =============================================================================
// FONCTIONS AVANCÉES
// =============================================================================

/**
 * Découpe un document avec contexte structuré (headers, sections)
 * Utile pour les documents longs avec structure
 */
export function chunkWithStructure(
  text: string,
  options: ChunkingOptions & { headerPattern?: RegExp } = {}
): Chunk[] {
  const headerPattern = options.headerPattern || /^(#{1,6}\s+.+|[A-Z][A-Z\s]+:?)$/gm

  // Identifier les sections par les headers
  const sections: { header: string; content: string }[] = []
  let lastIndex = 0
  let currentHeader = ''

  const matches = text.matchAll(headerPattern)
  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index).trim()
      if (content) {
        sections.push({ header: currentHeader, content })
      }
    }
    currentHeader = match[0]
    lastIndex = match.index! + match[0].length
  }

  // Dernier contenu
  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    sections.push({ header: currentHeader, content: remaining })
  }

  // Si pas de structure détectée, utiliser le chunking standard
  if (sections.length <= 1) {
    return chunkText(text, options)
  }

  // Chunker chaque section et préfixer avec le header
  const allChunks: Chunk[] = []

  for (const section of sections) {
    const sectionChunks = chunkText(section.content, options)

    for (const chunk of sectionChunks) {
      allChunks.push({
        content: section.header
          ? `[${section.header.trim()}]\n\n${chunk.content}`
          : chunk.content,
        index: allChunks.length,
        metadata: {
          ...chunk.metadata,
          // Ajuster le charCount pour inclure le header
          charCount:
            chunk.content.length +
            (section.header ? section.header.length + 4 : 0),
        },
      })
    }
  }

  return allChunks
}

/**
 * Estime le nombre de tokens pour un chunk
 * Approximation: ~4 caractères = 1 token (français)
 */
export function estimateChunkTokens(chunk: Chunk): number {
  return Math.ceil(chunk.metadata.charCount / 4)
}

/**
 * Vérifie si le texte nécessite un chunking
 */
export function needsChunking(
  text: string,
  maxChunkSize: number = aiConfig.rag.chunkSize
): boolean {
  const wordCount = countWords(text)
  return wordCount > maxChunkSize
}
