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

/**
 * Stratégies de chunking disponibles
 */
export type ChunkingStrategy =
  | 'adaptive'    // Existant : par taille + catégorie
  | 'article'     // Phase 3 : 1 article = 1 chunk (codes/lois)
  | 'semantic'    // Chunking sémantique via embeddings

export interface Chunk {
  content: string
  index: number
  metadata: ChunkMetadata
}

export type ChunkType = 'text' | 'table' | 'article' | 'header'

export interface ChunkMetadata {
  wordCount: number
  charCount: number
  startPosition: number
  endPosition: number
  overlapWithPrevious: boolean
  overlapWithNext: boolean
  articleNumber?: string  // Phase 3: numéro d'article si applicable
  chunkingStrategy?: ChunkingStrategy  // Phase 3: stratégie utilisée
  chunkType?: ChunkType  // Sprint 3: type de chunk (text, table, article, header)
  [key: string]: any  // Permettre métadonnées additionnelles
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
  /** Phase 3: Stratégie de chunking (défaut: adaptive) */
  strategy?: ChunkingStrategy
  /** Phase 3: Langue du document (pour détection articles) */
  language?: 'fr' | 'ar'
}

// =============================================================================
// SPRINT 3 : GESTION BLOCS TABLE
// =============================================================================

/** Taille maximale d'un chunk TABLE en caractères (pas de split au-delà) */
const MAX_TABLE_CHUNK_SIZE = 2000

/**
 * Regex pour détecter les blocs TABLE dans le texte.
 * Un bloc TABLE est délimité par [TABLE] et [/TABLE].
 */
const TABLE_BLOCK_REGEX = /\[TABLE\]([\s\S]*?)\[\/TABLE\]/g

/**
 * Représente un segment du texte (texte normal ou bloc TABLE)
 */
interface TextSegment {
  content: string
  isTable: boolean
  startPosition: number
}

/**
 * Divise un texte en segments (texte normal et blocs TABLE intercalés).
 * Préserve les positions absolues pour que les chunks aient les bons startPosition/endPosition.
 */
function splitTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TABLE_BLOCK_REGEX)) {
    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length

    // Texte avant le bloc TABLE
    if (matchStart > lastIndex) {
      segments.push({
        content: text.slice(lastIndex, matchStart),
        isTable: false,
        startPosition: lastIndex,
      })
    }

    // Bloc TABLE (contenu interne sans les marqueurs)
    const tableContent = match[1].trim()
    if (tableContent.length > 0) {
      segments.push({
        content: tableContent,
        isTable: true,
        startPosition: matchStart,
      })
    }

    lastIndex = matchEnd
  }

  // Texte restant après le dernier bloc TABLE
  if (lastIndex < text.length) {
    segments.push({
      content: text.slice(lastIndex),
      isTable: false,
      startPosition: lastIndex,
    })
  }

  return segments
}

/**
 * Crée un chunk de type 'table' depuis un segment TABLE.
 * Si le contenu dépasse MAX_TABLE_CHUNK_SIZE, le tronque avec avertissement.
 */
function createTableChunk(segment: TextSegment, index: number): Chunk {
  let content = segment.content
  if (content.length > MAX_TABLE_CHUNK_SIZE) {
    console.log(`[Chunking] Table chunk tronqué: ${content.length} > ${MAX_TABLE_CHUNK_SIZE} chars`)
    content = content.slice(0, MAX_TABLE_CHUNK_SIZE)
  }
  return {
    content,
    index,
    metadata: {
      wordCount: countWords(content),
      charCount: content.length,
      startPosition: segment.startPosition,
      endPosition: segment.startPosition + content.length,
      overlapWithPrevious: false,
      overlapWithNext: false,
      chunkType: 'table',
      chunkingStrategy: 'adaptive',
    },
  }
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
    strategy = 'adaptive',  // Phase 3: stratégie par défaut
    language,
  } = options

  // Log si overlap adaptatif utilisé
  if (category && overlap !== aiConfig.rag.chunkOverlap) {
    console.log(`[Chunking] Overlap adaptatif pour catégorie "${category}": ${overlap} mots`)
  }

  if (!text || text.trim().length === 0) {
    return []
  }

  // ── SPRINT 3 : Pré-traitement des blocs TABLE ──
  // Si le texte contient des blocs [TABLE]...[/TABLE], on les extrait séparément
  // pour créer des chunks de type 'table' (non splittés)
  if (TABLE_BLOCK_REGEX.test(text)) {
    TABLE_BLOCK_REGEX.lastIndex = 0  // Reset après le test
    const segments = splitTextSegments(text)
    const allChunks: Chunk[] = []

    for (const segment of segments) {
      if (segment.isTable) {
        // Créer un chunk TABLE non-splittable
        allChunks.push(createTableChunk(segment, allChunks.length))
      } else if (segment.content.trim().length > 0) {
        // Chunker le texte normal normalement
        const subChunks = chunkText(segment.content, options)
        for (const sub of subChunks) {
          allChunks.push({
            ...sub,
            index: allChunks.length,
            metadata: {
              ...sub.metadata,
              startPosition: segment.startPosition + sub.metadata.startPosition,
              endPosition: segment.startPosition + sub.metadata.endPosition,
            },
          })
        }
      }
    }

    return allChunks.map((c, i) => ({ ...c, index: i }))
  }

  // Nettoyer le texte
  const cleanedText = text.trim()

  // Phase 3: Router selon stratégie
  if (strategy === 'article') {
    // Vérifier si applicable (codes/legislation)
    const isLegalCode = ['codes', 'legislation', 'constitution', 'code'].includes(category || '')
    if (isLegalCode) {
      const articleChunks = chunkTextByArticles(cleanedText, {
        language,
        maxChunkWords: chunkSize,
        category
      })

      // Si détection articles réussie, retourner
      if (articleChunks.length > 0) {
        console.log(`[Chunking] Stratégie article-level: ${articleChunks.length} articles détectés (catégorie: ${category})`)
        return articleChunks
      }

      console.log(`[Chunking] Aucun article détecté, fallback vers chunking adaptive`)
    }
    // Fallback vers adaptive si pas applicable
  }

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
          chunkingStrategy: strategy,
        },
      },
    ]
  }

  // Stratégie de chunking selon les options (adaptive)
  let chunks: Chunk[]

  if (preserveParagraphs) {
    chunks = chunkByParagraphs(cleanedText, chunkSize, overlap, preserveSentences)
  } else if (preserveSentences) {
    chunks = chunkBySentences(cleanedText, chunkSize, overlap)
  } else {
    // Chunking simple par mots
    chunks = chunkByWords(cleanedText, chunkSize, overlap)
  }

  // Ajouter stratégie aux métadonnées
  chunks = chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      chunkingStrategy: strategy,
    },
  }))

  // Filtrer les chunks trop petits SAUF le dernier chunk (pour éviter perte de contenu en fin de doc)
  // Fix Feb 24, 2026 : seuil réduit de 100 → 40 mots pour préserver les dispositions légales courtes
  // (articles, définitions, alinéas) qui étaient silencieusement perdus
  const MIN_CHUNK_WORDS = 40
  const filteredChunks = chunks.filter((chunk, idx) => {
    const wordCount = chunk.metadata.wordCount

    // Garder le dernier chunk même s'il est petit
    if (idx === chunks.length - 1) {
      return true
    }

    if (wordCount < MIN_CHUNK_WORDS) {
      console.log(`[Chunking] Chunk ${idx} filtré (${wordCount} mots < ${MIN_CHUNK_WORDS} min) — contenu: "${chunk.content.substring(0, 60).replace(/\n/g, ' ')}..."`)
      return false
    }

    return true
  })

  // Réindexer les chunks après filtrage
  return filteredChunks.map((chunk, newIndex) => ({
    ...chunk,
    index: newIndex,
  }))
}

// =============================================================================
// STRATÉGIES DE CHUNKING
// =============================================================================

// Patterns de détection d'articles pour le tracking dans le chunking adaptatif
const AR_ARTICLE_PATTERN = /^(?:الفصل|فصل)\s+(\d+(?:\s+مكرر)?)/
const FR_ARTICLE_PATTERN = /^(?:Article|art\.?)\s+(\d+(?:\s*[-–]\s*\d+)?(?:\s+(?:bis|ter|quater))?)/i

/**
 * Détecte un numéro d'article au début d'un paragraphe
 */
function detectArticleNumber(paragraph: string): string | undefined {
  const trimmed = paragraph.trim()
  const arMatch = trimmed.match(AR_ARTICLE_PATTERN)
  if (arMatch) return arMatch[1].trim()
  const frMatch = trimmed.match(FR_ARTICLE_PATTERN)
  if (frMatch) return frMatch[1].trim()
  return undefined
}

/**
 * Découpe en préservant les paragraphes, avec tracking d'article courant
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
  let currentArticle: string | undefined

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim()
    if (!paragraph) {
      textPosition += 2 // Pour \n\n
      continue
    }

    // Détecter si ce paragraphe commence un nouvel article
    const detectedArticle = detectArticleNumber(paragraph)
    if (detectedArticle) {
      currentArticle = detectedArticle
    }

    const paragraphWords = paragraph.split(/\s+/).length

    // Si le paragraphe seul dépasse la taille, le découper
    if (paragraphWords > chunkSize) {
      // Sauvegarder le chunk actuel si non vide
      if (currentChunk) {
        const chunk = createChunk(currentChunk, chunks.length, startPosition)
        if (currentArticle) chunk.metadata.articleNumber = currentArticle
        chunks.push(chunk)
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
            articleNumber: currentArticle,
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
      const chunk = createChunk(currentChunk, chunks.length, startPosition)
      if (currentArticle) chunk.metadata.articleNumber = currentArticle
      chunks.push(chunk)

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
    const chunk = createChunk(currentChunk, chunks.length, startPosition)
    if (currentArticle) chunk.metadata.articleNumber = currentArticle
    chunks.push(chunk)
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
          // Stocker le header de section en metadata structurée
          ...(section.header ? { sectionHeader: section.header.trim() } : {}),
        },
      })
    }
  }

  return allChunks
}

// =============================================================================
// CHUNKING PAR ARTICLE (DOCUMENTS JURIDIQUES CONSOLIDÉS)
// =============================================================================

/**
 * Options pour le chunking par article
 */
export interface ArticleChunkingOptions {
  /** Taille max d'un chunk en mots (articles longs seront splittés) */
  maxChunkWords?: number
  /** Nom du code pour le contexte */
  codeName?: string
}

/**
 * Phase 3: Options pour le chunking par articles depuis texte brut
 */
export interface ArticleTextChunkingOptions {
  /** Langue du document (pour patterns regex) */
  language?: 'fr' | 'ar'
  /** Taille max d'un chunk en mots */
  maxChunkWords?: number
  /** Catégorie pour contexte */
  category?: string
}

/**
 * Phase 3: Chunking article-level depuis texte brut
 * Détecte automatiquement les articles via patterns FR/AR
 *
 * Patterns supportés:
 * - FR: "Article 258", "art. 42 bis", "Art 12"
 * - AR: "الفصل 258", "فصل 12", "الفصل 42 مكرر"
 *
 * @param text - Texte brut du document juridique
 * @param options - Options de chunking
 * @returns Liste de chunks (1 article = 1 chunk)
 */
export function chunkTextByArticles(
  text: string,
  options: ArticleTextChunkingOptions = {}
): Chunk[] {
  const { language, maxChunkWords = 2000, category } = options

  // Patterns de détection articles
  const articlePatterns: Record<string, RegExp> = {
    // Français: "Article 258" ou "art. 42 bis"
    fr: /(?:^|\n)\s*(?:Article|art\.?)\s+(\d+(?:\s+(?:bis|ter|quater))?)/gi,
    // Arabe: "الفصل 258" ou "فصل 12 مكرر"
    ar: /(?:^|\n)\s*(?:الفصل|فصل)\s+(\d+(?:\s+مكرر)?)/g,
  }

  // Auto-détection langue si non fournie
  let detectedLanguage = language
  if (!detectedLanguage) {
    // Chercher pattern arabe
    const hasArabic = articlePatterns.ar.test(text)
    articlePatterns.ar.lastIndex = 0 // Reset regex

    detectedLanguage = hasArabic ? 'ar' : 'fr'
  }

  const pattern = articlePatterns[detectedLanguage]
  if (!pattern) {
    console.warn(`[chunkTextByArticles] Langue non supportée: ${detectedLanguage}`)
    return []
  }

  // Détecter tous les articles
  const articleMatches: Array<{ number: string; index: number }> = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    articleMatches.push({
      number: match[1].trim(),
      index: match.index,
    })
  }

  // Si aucun article détecté, retourner vide (fallback adaptive)
  if (articleMatches.length === 0) {
    return []
  }

  console.log(`[chunkTextByArticles] ${articleMatches.length} articles détectés (langue: ${detectedLanguage})`)

  // Construire chunks par article
  const chunks: Chunk[] = []

  for (let i = 0; i < articleMatches.length; i++) {
    const currentArticle = articleMatches[i]
    const nextArticle = articleMatches[i + 1]

    // Extraire texte de l'article (jusqu'au prochain article ou fin)
    const startIndex = currentArticle.index
    const endIndex = nextArticle ? nextArticle.index : text.length

    const articleText = text.slice(startIndex, endIndex).trim()
    const articleWords = countWords(articleText)

    // Construire label article
    const articleLabel =
      detectedLanguage === 'ar'
        ? `الفصل ${currentArticle.number}`
        : `Article ${currentArticle.number}`

    if (articleWords <= maxChunkWords) {
      // Article tient dans 1 chunk
      chunks.push({
        content: articleText,
        index: chunks.length,
        metadata: {
          wordCount: articleWords,
          charCount: articleText.length,
          startPosition: startIndex,
          endPosition: endIndex,
          overlapWithPrevious: false,
          overlapWithNext: false,
          articleNumber: currentArticle.number,
          chunkingStrategy: 'article',
        },
      })
    } else {
      // Article trop long : splitter en gardant contexte
      console.log(
        `[chunkTextByArticles] ${articleLabel} trop long (${articleWords} mots), split en sous-chunks`
      )

      const subChunks = chunkText(articleText, {
        chunkSize: maxChunkWords,
        overlap: 100,
        preserveSentences: true,
        category,
      })

      for (let j = 0; j < subChunks.length; j++) {
        const partLabel =
          detectedLanguage === 'ar'
            ? `${articleLabel} (${j + 1}/${subChunks.length})`
            : `${articleLabel} (partie ${j + 1}/${subChunks.length})`

        chunks.push({
          content: `[${partLabel}]\n\n${subChunks[j].content}`,
          index: chunks.length,
          metadata: {
            ...subChunks[j].metadata,
            startPosition: startIndex + subChunks[j].metadata.startPosition,
            endPosition: startIndex + subChunks[j].metadata.endPosition,
            articleNumber: currentArticle.number,
            chunkingStrategy: 'article',
          },
        })
      }
    }
  }

  return chunks
}

/**
 * Chunk un document juridique consolidé par article.
 * Chaque article = 1 chunk (sauf s'il dépasse maxChunkWords).
 * Metadata enrichie : article_number, chapter, book, code_name.
 */
export function chunkByArticle(
  structure: {
    books: Array<{
      number: number
      titleAr?: string | null
      titleFr?: string | null
      chapters: Array<{
        number?: number | null
        titleAr?: string | null
        articles: Array<{
          number: string
          text: string
          wordCount?: number
        }>
      }>
    }>
  },
  options: ArticleChunkingOptions = {}
): Chunk[] {
  const { maxChunkWords = 2000, codeName } = options
  const chunks: Chunk[] = []
  let position = 0

  for (const book of structure.books) {
    for (const chapter of book.chapters) {
      for (const article of chapter.articles) {
        const articleWords = countWords(article.text)

        // Construire le contexte de l'article
        const contextHeader = [
          codeName ? `📖 ${codeName}` : null,
          book.titleAr ? `📕 ${book.titleAr}` : null,
          chapter.titleAr ? `📑 ${chapter.titleAr}` : null,
          `⚖️ الفصل ${article.number}`,
        ].filter(Boolean).join(' | ')

        if (articleWords <= maxChunkWords) {
          // Article tient dans 1 chunk
          const content = `${contextHeader}\n\n${article.text}`
          chunks.push({
            content,
            index: chunks.length,
            metadata: {
              wordCount: countWords(content),
              charCount: content.length,
              startPosition: position,
              endPosition: position + content.length,
              overlapWithPrevious: false,
              overlapWithNext: false,
              articleNumber: article.number,
              bookNumber: book.number,
              chapterNumber: chapter.number ?? undefined,
              codeName,
            } as ChunkMetadata & { articleNumber: string; bookNumber: number; chapterNumber?: number; codeName?: string },
          })
          position += content.length
        } else {
          // Article trop long : splitter en gardant le contexte
          const subChunks = chunkText(article.text, {
            chunkSize: maxChunkWords,
            overlap: 100,
            preserveSentences: true,
            category: 'code',
          })

          for (let i = 0; i < subChunks.length; i++) {
            const partLabel = `(${i + 1}/${subChunks.length})`
            const content = `${contextHeader} ${partLabel}\n\n${subChunks[i].content}`
            chunks.push({
              content,
              index: chunks.length,
              metadata: {
                wordCount: countWords(content),
                charCount: content.length,
                startPosition: position,
                endPosition: position + content.length,
                overlapWithPrevious: i > 0,
                overlapWithNext: i < subChunks.length - 1,
                articleNumber: article.number,
                bookNumber: book.number,
                chapterNumber: chapter.number ?? undefined,
                codeName,
              } as ChunkMetadata & { articleNumber: string; bookNumber: number; chapterNumber?: number; codeName?: string },
            })
            position += content.length
          }
        }
      }
    }
  }

  return chunks
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

// =============================================================================
// SEMANTIC CHUNKING
// =============================================================================

/**
 * Split text into sentences (supports Arabic and French punctuation)
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.match(/[^.!?؟]+[.!?؟]+[\s]*/g)
  if (!sentences || sentences.length === 0) {
    // Fallback: split on newlines
    return text.split(/\n+/).filter(s => s.trim().length > 0)
  }
  return sentences.map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * Cosine similarity between two embedding vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dotProduct / denom
}

/**
 * Semantic chunking: split text at natural topic boundaries detected via embeddings.
 *
 * Algorithm:
 * 1. Split text into sentences
 * 2. Embed each sentence
 * 3. Compute cosine similarity between consecutive sentences
 * 4. Cut at similarity drops (below threshold)
 * 5. Merge small groups to respect min/max chunk size
 *
 * Falls back to classic chunking if <3 sentences or embedding fails.
 *
 * @param text - Text to chunk
 * @param options - Chunking options (chunkSize, overlap, category)
 * @param embedFn - Function to generate embeddings for a batch of texts
 * @returns Chunks with metadata
 */
export async function chunkTextSemantic(
  text: string,
  options: ChunkingOptions = {},
  embedFn: (texts: string[]) => Promise<number[][]>
): Promise<Chunk[]> {
  const {
    chunkSize = aiConfig.rag.chunkSize,
    category,
  } = options

  if (!text || text.trim().length === 0) return []

  const sentences = splitIntoSentences(text.trim())

  // Fallback if too few sentences
  if (sentences.length < 3) {
    return chunkText(text, options)
  }

  // Embed all sentences
  let embeddings: number[][]
  try {
    embeddings = await embedFn(sentences)
  } catch (error) {
    console.error('[Semantic Chunking] Embedding failed, fallback to classic:', error instanceof Error ? error.message : error)
    return chunkText(text, options)
  }

  if (embeddings.length !== sentences.length) {
    return chunkText(text, options)
  }

  // Compute cosine similarity between consecutive sentences
  const similarities: number[] = []
  for (let i = 0; i < embeddings.length - 1; i++) {
    similarities.push(cosineSimilarity(embeddings[i], embeddings[i + 1]))
  }

  // Determine threshold: mean - 1 stddev (cut at significant drops)
  const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length
  const stddev = Math.sqrt(
    similarities.reduce((sum, s) => sum + (s - mean) ** 2, 0) / similarities.length
  )
  const threshold = mean - stddev

  // Find boundary indices (where similarity drops below threshold)
  const boundaries: number[] = []
  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < threshold) {
      boundaries.push(i + 1) // Cut AFTER sentence i
    }
  }

  // Build sentence groups from boundaries
  const groups: string[][] = []
  let start = 0
  for (const boundary of boundaries) {
    groups.push(sentences.slice(start, boundary))
    start = boundary
  }
  groups.push(sentences.slice(start))

  // Merge groups that are too small (< chunkSize/3 words) with next group
  const minWords = Math.floor(chunkSize / 3)
  const maxWords = Math.floor(chunkSize * 1.5)
  const mergedGroups: string[][] = []
  let currentGroup: string[] = []

  for (const group of groups) {
    currentGroup.push(...group)
    const wordCount = countWords(currentGroup.join(' '))

    if (wordCount >= minWords) {
      // If too large, split and push
      if (wordCount > maxWords) {
        // Use classic chunking on this oversized group
        const subChunks = chunkText(currentGroup.join(' '), options)
        for (const sub of subChunks) {
          mergedGroups.push([sub.content])
        }
      } else {
        mergedGroups.push([...currentGroup])
      }
      currentGroup = []
    }
  }

  // Remaining sentences
  if (currentGroup.length > 0) {
    if (mergedGroups.length > 0) {
      // Append to last group
      mergedGroups[mergedGroups.length - 1].push(...currentGroup)
    } else {
      mergedGroups.push(currentGroup)
    }
  }

  // Build chunks from merged groups
  const chunks: Chunk[] = []
  let textPosition = 0

  for (const group of mergedGroups) {
    const content = group.join(' ').trim()
    if (!content) continue

    const startPos = text.indexOf(content.substring(0, 50), Math.max(0, textPosition - 10))
    const actualStart = startPos >= 0 ? startPos : textPosition

    chunks.push({
      content,
      index: chunks.length,
      metadata: {
        wordCount: countWords(content),
        charCount: content.length,
        startPosition: actualStart,
        endPosition: actualStart + content.length,
        overlapWithPrevious: false,
        overlapWithNext: false,
      },
    })

    textPosition = actualStart + content.length
  }

  console.log(
    `[Semantic Chunking] ${sentences.length} phrases → ${boundaries.length} boundaries → ${chunks.length} chunks (threshold: ${threshold.toFixed(3)}, category: ${category || 'default'})`
  )

  return chunks
}
