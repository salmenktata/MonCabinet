/**
 * Tests unitaires pour le service de recherche RAG
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { searchKnowledgeBase, formatRagContext, type RagSearchResult } from './rag-search'

// Mock du pool DB
jest.mock('@/lib/db/postgres', () => ({
  db: {
    query: jest.fn(),
  },
}))

// Mock du service de traduction
jest.mock('@/lib/ai/translation-service', () => ({
  isTranslationAvailable: jest.fn(() => true),
  translateQuery: jest.fn(),
}))

describe('rag-search', () => {
  describe('searchKnowledgeBase', () => {
    it('devrait retourner des résultats de la KB', async () => {
      const { db } = await import('@/lib/db/postgres')
      const mockQuery = db.query as jest.MockedFunction<typeof db.query>

      // Mock documents
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc1',
            nom: 'Code du travail',
            type: 'document',
            contenu_extrait: 'Article 1: Le contrat de travail...',
          },
        ],
      } as any)

      // Mock knowledge_base
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'kb1',
            titre: 'Licenciement abusif',
            type: 'knowledge_base',
            contenu: 'Le licenciement abusif est...',
          },
        ],
      } as any)

      const results = await searchKnowledgeBase('contrat de travail', {
        maxResults: 5,
        includeTranslation: false,
      })

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        id: expect.any(String),
        titre: expect.any(String),
        type: expect.stringMatching(/document|knowledge_base/),
        extrait: expect.any(String),
        pertinence: expect.any(Number),
      })
    })

    it('devrait gérer les erreurs gracieusement', async () => {
      const { db } = await import('@/lib/db/postgres')
      const mockQuery = db.query as jest.MockedFunction<typeof db.query>

      mockQuery.mockRejectedValueOnce(new Error('DB error'))

      const results = await searchKnowledgeBase('test', {
        maxResults: 5,
      })

      expect(results).toEqual([])
    })

    it('devrait limiter le nombre de résultats', async () => {
      const { db } = await import('@/lib/db/postgres')
      const mockQuery = db.query as jest.MockedFunction<typeof db.query>

      // Mock 10 documents
      mockQuery.mockResolvedValueOnce({
        rows: Array(10)
          .fill(null)
          .map((_, i) => ({
            id: `doc${i}`,
            nom: `Document ${i}`,
            type: 'document',
            contenu_extrait: `Contenu ${i}`,
          })),
      } as any)

      // Mock 0 KB articles
      mockQuery.mockResolvedValueOnce({ rows: [] } as any)

      const results = await searchKnowledgeBase('test', {
        maxResults: 3,
        includeTranslation: false,
      })

      expect(results.length).toBeLessThanOrEqual(3)
    })
  })

  describe('formatRagContext', () => {
    it('devrait formater les résultats avec numérotation', () => {
      const sources: RagSearchResult[] = [
        {
          id: '1',
          titre: 'Code civil',
          type: 'knowledge_base',
          extrait: 'Article 1...',
          pertinence: 0.9,
        },
        {
          id: '2',
          titre: 'Jurisprudence X',
          type: 'document',
          extrait: 'Arrêt du...',
          pertinence: 0.8,
        },
      ]

      const context = formatRagContext(sources)

      expect(context).toContain('[Source 1] Code civil (knowledge_base)')
      expect(context).toContain('[Source 2] Jurisprudence X (document)')
      expect(context).toContain('Article 1...')
      expect(context).toContain('Arrêt du...')
    })

    it('devrait retourner une chaîne vide si aucune source', () => {
      const context = formatRagContext([])
      expect(context).toBe('')
    })
  })
})
