/**
 * Service de recherche RAG (Retrieval-Augmented Generation) partagé
 *
 * Factorise la logique de recherche dans la base de connaissances
 * utilisée par Consultation et Structuration IA.
 */

import { db } from '@/lib/db/postgres'
import { detectLanguage, type DetectedLanguage } from '@/lib/ai/language-utils'
import { translateQuery, isTranslationAvailable } from '@/lib/ai/translation-service'

export interface RagSearchResult {
  id: string
  titre: string
  type: 'document' | 'knowledge_base'
  extrait: string
  pertinence: number
}

export interface RagSearchOptions {
  maxResults?: number
  includeTranslation?: boolean
  userId?: string
}

/**
 * Recherche dans la base de connaissances avec support bilingue AR/FR
 * Utilise ILIKE pour recherche textuelle simple (pas embeddings)
 *
 * @param query - Question ou texte à rechercher
 * @param options - Options de recherche (maxResults, includeTranslation, userId)
 * @returns Liste de résultats triés par pertinence
 */
export async function searchKnowledgeBase(
  query: string,
  options: RagSearchOptions = {}
): Promise<RagSearchResult[]> {
  const { maxResults = 5, includeTranslation = true, userId } = options

  try {
    // Détecter la langue de la question
    const questionLang = detectLanguage(query)

    const sources: RagSearchResult[] = []

    // Extraire les 3 premiers mots pour recherche ILIKE
    const searchTerms = query.split(' ').slice(0, 3).join('%')

    // Recherche avec les termes originaux
    const [docsResult, kbResult] = await Promise.all([
      db.query(
        `SELECT id, nom, type, contenu_extrait
         FROM documents
         WHERE nom ILIKE $1 OR contenu_extrait ILIKE $1
         LIMIT $2`,
        [`%${searchTerms}%`, maxResults]
      ),
      db.query(
        `SELECT id, titre, type, contenu
         FROM knowledge_base
         WHERE titre ILIKE $1 OR contenu ILIKE $1
         LIMIT $2`,
        [`%${searchTerms}%`, maxResults]
      ),
    ])

    // Ajouter documents trouvés
    for (const doc of docsResult.rows) {
      sources.push({
        id: doc.id,
        titre: doc.nom,
        type: 'document',
        extrait: doc.contenu_extrait?.substring(0, 500) || '',
        pertinence: 0.75,
      })
    }

    // Ajouter articles KB trouvés
    for (const article of kbResult.rows) {
      sources.push({
        id: article.id,
        titre: article.titre,
        type: 'knowledge_base',
        extrait: article.contenu?.substring(0, 500) || '',
        pertinence: 0.8,
      })
    }

    // Si la question est en arabe ET includeTranslation activé,
    // tenter une recherche traduite en FR pour élargir les résultats
    if ((questionLang === 'ar' || questionLang === 'mixed') && includeTranslation && isTranslationAvailable()) {
      const translation = await translateQuery(query, 'ar', 'fr')

      if (translation.success && translation.translatedText !== query) {
        const translatedTerms = translation.translatedText.split(' ').slice(0, 3).join('%')
        const seenIds = new Set(sources.map((s) => s.id))

        const [translatedDocsResult, translatedKbResult] = await Promise.all([
          db.query(
            `SELECT id, nom, type, contenu_extrait
             FROM documents
             WHERE nom ILIKE $1 OR contenu_extrait ILIKE $1
             LIMIT $2`,
            [`%${translatedTerms}%`, maxResults]
          ),
          db.query(
            `SELECT id, titre, type, contenu
             FROM knowledge_base
             WHERE titre ILIKE $1 OR contenu ILIKE $1
             LIMIT $2`,
            [`%${translatedTerms}%`, maxResults]
          ),
        ])

        // Ajouter documents traduits (si pas déjà présents)
        for (const doc of translatedDocsResult.rows) {
          if (!seenIds.has(doc.id)) {
            sources.push({
              id: doc.id,
              titre: doc.nom,
              type: 'document',
              extrait: doc.contenu_extrait?.substring(0, 500) || '',
              pertinence: 0.7, // Légèrement inférieur car traduit
            })
            seenIds.add(doc.id)
          }
        }

        // Ajouter articles KB traduits (si pas déjà présents)
        for (const article of translatedKbResult.rows) {
          if (!seenIds.has(article.id)) {
            sources.push({
              id: article.id,
              titre: article.titre,
              type: 'knowledge_base',
              extrait: article.contenu?.substring(0, 500) || '',
              pertinence: 0.75,
            })
            seenIds.add(article.id)
          }
        }
      }
    }

    // Trier par pertinence décroissante et limiter au nombre max
    return sources
      .sort((a, b) => b.pertinence - a.pertinence)
      .slice(0, maxResults)
  } catch (error) {
    console.error('Erreur recherche KB:', error)
    return []
  }
}

/**
 * Formate les résultats RAG en contexte pour le LLM
 *
 * @param sources - Résultats de recherche RAG
 * @returns Contexte formaté avec numérotation [Source N]
 */
export function formatRagContext(sources: RagSearchResult[]): string {
  if (sources.length === 0) {
    return ''
  }

  return sources
    .map((s, i) => `[Source ${i + 1}] ${s.titre} (${s.type}):\n${s.extrait}`)
    .join('\n\n')
}
