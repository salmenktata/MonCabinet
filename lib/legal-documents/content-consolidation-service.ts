/**
 * Content Consolidation Service
 *
 * Fusionne les pages web crawlées individuellement en un document
 * juridique consolidé, préservant la hiérarchie documentaire
 * (Livre > Chapitre > Section > Article).
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import {
  getDocumentWithPages,
  updateConsolidation,
  updateConsolidationStatus,
  type LinkedPage,
} from './document-service'

const log = createLogger('ContentConsolidation')

// =============================================================================
// TYPES
// =============================================================================

export interface ArticleEntry {
  number: string
  text: string
  sourcePageId: string
  isModified: boolean
  wordCount: number
}

export interface ChapterEntry {
  number: number | null
  titleAr: string | null
  articles: ArticleEntry[]
}

export interface BookEntry {
  number: number
  titleAr: string | null
  titleFr: string | null
  chapters: ChapterEntry[]
}

export interface DocumentStructure {
  books: BookEntry[]
  totalArticles: number
  totalWords: number
  consolidatedAt: string
}

export interface ConsolidationResult {
  success: boolean
  documentId: string
  totalPages: number
  totalArticles: number
  totalWords: number
  consolidatedTextLength: number
  structure: DocumentStructure
  errors: string[]
}

// =============================================================================
// CONSOLIDATION
// =============================================================================

/**
 * Consolider un document juridique à partir de ses pages liées
 */
export async function consolidateDocument(
  documentId: string
): Promise<ConsolidationResult> {
  const errors: string[] = []

  // Charger le document et ses pages
  const docData = await getDocumentWithPages(documentId)
  if (!docData) {
    return {
      success: false,
      documentId,
      totalPages: 0,
      totalArticles: 0,
      totalWords: 0,
      consolidatedTextLength: 0,
      structure: { books: [], totalArticles: 0, totalWords: 0, consolidatedAt: new Date().toISOString() },
      errors: [`Document ${documentId} non trouvé`],
    }
  }

  const { document, pages } = docData
  log.info(`Consolidation de ${document.citationKey}: ${pages.length} pages`)

  // Filtrer les pages avec du contenu
  const pagesWithContent = pages.filter(p => {
    if (!p.extractedText || p.extractedText.trim().length < 10) {
      errors.push(`Page ${p.webPageId} (Art. ${p.articleNumber || '?'}) sans contenu`)
      return false
    }
    return true
  })

  log.info(`Pages avec contenu: ${pagesWithContent.length}/${pages.length}`)

  if (pagesWithContent.length === 0) {
    await updateConsolidationStatus(documentId, 'partial')
    return {
      success: false,
      documentId,
      totalPages: 0,
      totalArticles: 0,
      totalWords: 0,
      consolidatedTextLength: 0,
      structure: { books: [], totalArticles: 0, totalWords: 0, consolidatedAt: new Date().toISOString() },
      errors: [...errors, 'Aucune page avec contenu suffisant — consolidation partielle'],
    }
  }

  // Organiser en structure hiérarchique
  const structure = buildStructure(pagesWithContent, document.citationKey)

  // Générer le texte consolidé
  const consolidatedText = generateConsolidatedText(structure, document)

  // Sauvegarder
  await updateConsolidation(
    documentId,
    consolidatedText,
    structure,
    pagesWithContent.length
  )

  const result: ConsolidationResult = {
    success: true,
    documentId,
    totalPages: pagesWithContent.length,
    totalArticles: structure.totalArticles,
    totalWords: structure.totalWords,
    consolidatedTextLength: consolidatedText.length,
    structure,
    errors,
  }

  log.info(`Consolidation terminée: ${result.totalArticles} articles, ${result.totalWords} mots`)
  return result
}

/**
 * Construire la structure hiérarchique depuis les pages ordonnées
 */
function buildStructure(pages: LinkedPage[], citationKey: string): DocumentStructure {
  // Pour le Code Pénal tunisien, on connaît la structure des livres
  const isCodePenal = citationKey.includes('code-penal')

  // Séparer les pages avec et sans numéro d'article
  const pagesWithArticle = pages.filter(p => p.articleNumber)
  const pagesWithoutArticle = pages.filter(p => !p.articleNumber)

  const articles: ArticleEntry[] = pagesWithArticle
    .map(p => ({
      number: p.articleNumber!,
      text: cleanArticleText(p.extractedText || ''),
      sourcePageId: p.webPageId,
      isModified: false,
      wordCount: p.wordCount || countWords(p.extractedText || ''),
    }))

  // Tri par numéro d'article
  articles.sort((a, b) => {
    const numA = parseArticleNumber(a.number)
    const numB = parseArticleNumber(b.number)
    return numA - numB
  })

  // Pour les pages sans numéro d'article (sections génériques),
  // les convertir en articles numérotés séquentiellement
  const sections: ArticleEntry[] = pagesWithoutArticle
    .map((p, idx) => ({
      number: String(idx + 1),
      text: cleanArticleText(p.extractedText || ''),
      sourcePageId: p.webPageId,
      isModified: false,
      wordCount: p.wordCount || countWords(p.extractedText || ''),
    }))

  // Utiliser les articles si disponibles, sinon les sections
  const allEntries = articles.length > 0 ? articles : sections

  let books: BookEntry[]

  if (isCodePenal) {
    books = buildCodePenalBooks(allEntries)
  } else {
    // Structure générique : 1 seul "livre" contenant tout
    books = [{
      number: 1,
      titleAr: null,
      titleFr: null,
      chapters: [{ number: null, titleAr: null, articles: allEntries }],
    }]
  }

  const totalWords = allEntries.reduce((sum, a) => sum + a.wordCount, 0)

  return {
    books,
    totalArticles: allEntries.length,
    totalWords,
    consolidatedAt: new Date().toISOString(),
  }
}

/**
 * Structure spécifique du Code Pénal tunisien
 */
function buildCodePenalBooks(articles: ArticleEntry[]): BookEntry[] {
  // Livre 1: Articles 1-60 (Dispositions générales)
  const book1Articles = articles.filter(a => {
    const num = parseArticleNumber(a.number)
    return num >= 1 && num <= 60
  })

  // Livre 2: Articles 61+ (Des diverses infractions)
  const book2Articles = articles.filter(a => {
    const num = parseArticleNumber(a.number)
    return num > 60
  })

  return [
    {
      number: 1,
      titleAr: 'الكتاب الأول - أحكام عامة',
      titleFr: 'Livre Premier - Dispositions Générales',
      chapters: groupIntoChapters(book1Articles, [
        { maxArticle: 15, titleAr: 'الباب الأول - في الجرائم وأنواعها' },
        { maxArticle: 30, titleAr: 'الباب الثاني - في العقوبات' },
        { maxArticle: 45, titleAr: 'الباب الثالث - في المسؤولية الجزائية' },
        { maxArticle: 60, titleAr: 'الباب الرابع - في أسباب الإباحة والتخفيف والتشديد' },
      ]),
    },
    {
      number: 2,
      titleAr: 'الكتاب الثاني - في مختلف الجرائم',
      titleFr: 'Livre Deuxième - Des Diverses Infractions',
      chapters: [{ number: null, titleAr: null, articles: book2Articles }],
    },
  ]
}

/**
 * Grouper les articles en chapitres basé sur des seuils
 */
function groupIntoChapters(
  articles: ArticleEntry[],
  chapterDefs: { maxArticle: number; titleAr: string }[]
): ChapterEntry[] {
  const chapters: ChapterEntry[] = []
  let chapterIdx = 0

  for (const def of chapterDefs) {
    chapterIdx++
    const chapterArticles = articles.filter(a => {
      const num = parseArticleNumber(a.number)
      const prevMax = chapterIdx > 1 ? chapterDefs[chapterIdx - 2].maxArticle : 0
      return num > prevMax && num <= def.maxArticle
    })

    if (chapterArticles.length > 0) {
      chapters.push({
        number: chapterIdx,
        titleAr: def.titleAr,
        articles: chapterArticles,
      })
    }
  }

  return chapters
}

/**
 * Générer le texte consolidé formaté
 */
function generateConsolidatedText(
  structure: DocumentStructure,
  document: { officialTitleAr: string | null; officialTitleFr: string | null; citationKey: string }
): string {
  const lines: string[] = []

  // En-tête
  if (document.officialTitleAr) {
    lines.push(document.officialTitleAr)
    lines.push('='.repeat(document.officialTitleAr.length))
  }
  if (document.officialTitleFr) {
    lines.push(document.officialTitleFr)
  }
  lines.push('')

  // Corps
  for (const book of structure.books) {
    if (book.titleAr) {
      lines.push(`\n${'─'.repeat(40)}`)
      lines.push(book.titleAr)
      if (book.titleFr) lines.push(book.titleFr)
      lines.push('─'.repeat(40))
    }

    for (const chapter of book.chapters) {
      if (chapter.titleAr) {
        lines.push(`\n${chapter.titleAr}`)
        lines.push('─'.repeat(30))
      }

      for (const article of chapter.articles) {
        lines.push('')
        lines.push(`الفصل ${article.number}`)
        lines.push(article.text)
      }
    }
  }

  return lines.join('\n')
}

// =============================================================================
// HELPERS
// =============================================================================

function parseArticleNumber(articleNum: string): number {
  const match = articleNum.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function cleanArticleText(text: string): string {
  return text
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

// =============================================================================
// CONSOLIDATION "COLLECTION" (cassation.tn / IORT)
// =============================================================================

/**
 * Consolider un document de type "collection" (jurisprudence, JORT)
 *
 * Stratégie différente de consolidateDocument() (hiérarchique pour codes) :
 * - Pas de structure livre/chapitre
 * - Texte consolidé = index des décisions/textes liés (titre + extrait court)
 * - Toutes les pages liées sont référencées
 * - consolidation_status = 'complete'
 *
 * Utilisé par :
 * - scripts/process-cassation-themes.ts
 * - scripts/process-iort-types.ts
 */
export async function consolidateCollection(
  documentId: string
): Promise<ConsolidationResult> {
  const errors: string[] = []

  const docData = await getDocumentWithPages(documentId)
  if (!docData) {
    return {
      success: false,
      documentId,
      totalPages: 0,
      totalArticles: 0,
      totalWords: 0,
      consolidatedTextLength: 0,
      structure: { books: [], totalArticles: 0, totalWords: 0, consolidatedAt: new Date().toISOString() },
      errors: [`Document ${documentId} non trouvé`],
    }
  }

  const { document, pages } = docData
  log.info(`Consolidation (collection) de ${document.citationKey}: ${pages.length} pages`)

  const pagesWithContent = pages.filter(p => p.extractedText && p.extractedText.trim().length > 10)

  if (pagesWithContent.length === 0) {
    await updateConsolidationStatus(documentId, 'partial')
    return {
      success: false,
      documentId,
      totalPages: 0,
      totalArticles: 0,
      totalWords: 0,
      consolidatedTextLength: 0,
      structure: { books: [], totalArticles: 0, totalWords: 0, consolidatedAt: new Date().toISOString() },
      errors: ['Aucune page avec contenu suffisant — consolidation partielle'],
    }
  }

  // Générer le texte consolidé complet (même modèle que consolidateDocument)
  // Format : titre + séparateur + texte complet de chaque page
  let totalWords = 0
  const titleLine = document.officialTitleFr || document.officialTitleAr || document.citationKey
  const separator = '─'.repeat(60)
  const sections: string[] = [titleLine, separator, '']

  for (const page of pagesWithContent) {
    const title = page.title || page.url
    const ref = page.articleNumber ? ` [${page.articleNumber}]` : ''
    const content = cleanArticleText(page.extractedText || '')
    sections.push(`${title}${ref}`)
    sections.push(separator)
    sections.push(content)
    sections.push('')
    totalWords += countWords(content)
  }

  const consolidatedText = sections.join('\n')

  // Structure simplifiée (1 livre, 1 chapitre, pas d'articles)
  const structure: DocumentStructure = {
    books: [{
      number: 1,
      titleAr: document.officialTitleAr || null,
      titleFr: document.officialTitleFr || null,
      chapters: [{
        number: 1,
        titleAr: null,
        articles: pagesWithContent.map((p, i) => ({
          number: p.articleNumber || String(i + 1),
          text: p.extractedText || '',
          sourcePageId: p.webPageId,
          isModified: false,
          wordCount: countWords(p.extractedText || ''),
        })),
      }],
    }],
    totalArticles: pagesWithContent.length,
    totalWords,
    consolidatedAt: new Date().toISOString(),
  }

  await updateConsolidation(documentId, consolidatedText, structure, pagesWithContent.length)

  log.info(`Consolidation (collection) terminée: ${pagesWithContent.length} items, ${totalWords} mots`)

  return {
    success: true,
    documentId,
    totalPages: pagesWithContent.length,
    totalArticles: pagesWithContent.length,
    totalWords,
    consolidatedTextLength: consolidatedText.length,
    structure,
    errors,
  }
}
