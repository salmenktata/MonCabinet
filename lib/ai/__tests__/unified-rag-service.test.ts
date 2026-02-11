/**
 * Tests unitaires pour unified-rag-service
 * Sprint 3 - Services Unifiés
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  search,
  chat,
  type RAGSearchFilters,
  type RAGSearchOptions,
  type RAGChatOptions,
} from '../unified-rag-service'

// Mock des dépendances
vi.mock('@/lib/db/postgres', () => ({
  db: {
    query: vi.fn(),
  },
}))

vi.mock('../embeddings-service', () => ({
  generateEmbedding: vi.fn(async (text: string) => ({
    embedding: new Array(1024).fill(0.1),
    dimensions: 1024,
    model: 'qwen3-embedding:0.6b',
  })),
  formatEmbeddingForPostgres: vi.fn((embedding: number[]) => `[${embedding.join(',')}]`),
}))

vi.mock('../llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(async (messages, options, usePremiumModel) => ({
    answer: 'Réponse juridique structurée avec sources',
    tokensUsed: { input: 500, output: 300, total: 800 },
    modelUsed: 'ollama/qwen2.5:3b',
    provider: 'ollama',
    fallbackUsed: false,
  })),
}))

vi.mock('@/lib/cache/search-cache', () => ({
  getCachedSearchResults: vi.fn(async () => null),
  setCachedSearchResults: vi.fn(async () => {}),
}))

vi.mock('@/lib/metrics/rag-metrics', () => ({
  recordRAGMetric: vi.fn(async () => {}),
}))

vi.mock('../citation-validator-service', () => ({
  validateArticleCitations: vi.fn(() => []),
  formatValidationWarnings: vi.fn(() => []),
}))

vi.mock('../abrogation-detector-service', () => ({
  detectAbrogatedReferences: vi.fn(async () => []),
  formatAbrogationWarnings: vi.fn(() => []),
}))

vi.mock('../language-utils', () => ({
  detectLanguage: vi.fn((text: string) => 'fr' as const),
}))

import { db } from '@/lib/db/postgres'
import { generateEmbedding } from '../embeddings-service'
import { callLLMWithFallback } from '../llm-fallback-service'
import { getCachedSearchResults, setCachedSearchResults } from '@/lib/cache/search-cache'

describe('unified-rag-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('search', () => {
    it('should perform semantic search with default options', async () => {
      // Mock DB response
      vi.mocked(db.query).mockResolvedValue({
        rows: [
          {
            kb_id: 'kb-1',
            title: 'Code Civil Article 123',
            category: 'codes',
            similarity: 0.85,
            chunk_content: 'Le divorce peut être prononcé...',
            chunk_index: 0,
          },
          {
            kb_id: 'kb-2',
            title: 'Arrêt Cassation 2024',
            category: 'jurisprudence',
            similarity: 0.78,
            chunk_content: 'La pension alimentaire doit être...',
            chunk_index: 1,
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const results = await search('divorce pension alimentaire')

      expect(results).toHaveLength(2)
      expect(results[0].kbId).toBe('kb-1')
      expect(results[0].similarity).toBeGreaterThan(0.8)
      expect(results[0].metadata).toBeDefined()

      expect(generateEmbedding).toHaveBeenCalledWith('divorce pension alimentaire')
      expect(db.query).toHaveBeenCalled()
    })

    it('should apply category filter', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [
          {
            kb_id: 'kb-juris-1',
            title: 'Arrêt',
            category: 'jurisprudence',
            similarity: 0.82,
            chunk_content: 'Contenu',
            chunk_index: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const filters: RAGSearchFilters = {
        category: 'jurisprudence',
      }

      const results = await search('question juridique', filters)

      expect(results).toHaveLength(1)
      expect(results[0].category).toBe('jurisprudence')

      // Vérifier que le filtre a été passé dans la requête SQL
      const queryCall = vi.mocked(db.query).mock.calls[0]
      expect(queryCall[0]).toContain('kb.category = ')
      expect(queryCall[1]).toContain('jurisprudence')
    })

    it('should apply tribunal and chambre filters', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const filters: RAGSearchFilters = {
        tribunal: 'TRIBUNAL_CASSATION',
        chambre: 'CHAMBRE_CIVILE',
      }

      await search('question', filters)

      const queryCall = vi.mocked(db.query).mock.calls[0]
      expect(queryCall[0]).toContain('meta.tribunal_code = ')
      expect(queryCall[0]).toContain('meta.chambre_code = ')
      expect(queryCall[1]).toContain('TRIBUNAL_CASSATION')
      expect(queryCall[1]).toContain('CHAMBRE_CIVILE')
    })

    it('should apply date range filter', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const filters: RAGSearchFilters = {
        dateRange: {
          from: new Date('2020-01-01'),
          to: new Date('2025-12-31'),
        },
      }

      await search('question', filters)

      const queryCall = vi.mocked(db.query).mock.calls[0]
      expect(queryCall[0]).toContain('meta.decision_date >= ')
      expect(queryCall[0]).toContain('meta.decision_date <= ')
      expect(queryCall[1]).toContain('2020-01-01')
      expect(queryCall[1]).toContain('2025-12-31')
    })

    it('should respect limit and threshold options', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const options: RAGSearchOptions = {
        limit: 5,
        threshold: 0.75,
      }

      await search('question', {}, options)

      const queryCall = vi.mocked(db.query).mock.calls[0]
      const params = queryCall[1] as unknown[]

      // Threshold est le 2e param, limit est le 3e
      expect(params[1]).toBe(0.75)
      expect(params[2]).toBe(5)
    })

    it('should use cache when available', async () => {
      const cachedResults = [
        {
          kbId: 'cached-1',
          title: 'Cached Result',
          category: 'codes',
          similarity: 0.9,
          metadata: {
            tribunalCode: null,
            tribunalLabelAr: null,
            tribunalLabelFr: null,
            chambreCode: null,
            chambreLabelAr: null,
            chambreLabelFr: null,
            decisionDate: null,
            decisionNumber: null,
            legalBasis: null,
            extractionConfidence: null,
          },
        },
      ]

      vi.mocked(getCachedSearchResults).mockResolvedValue(cachedResults as any)

      const results = await search('cached query')

      expect(results).toEqual(cachedResults)
      expect(getCachedSearchResults).toHaveBeenCalled()
      expect(db.query).not.toHaveBeenCalled() // Pas de query DB si cache hit
    })

    it('should set cache after successful search', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [
          {
            kb_id: 'kb-1',
            title: 'Result',
            category: 'codes',
            similarity: 0.85,
            chunk_content: 'Content',
            chunk_index: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      await search('new query')

      // Attendre que le cache soit set (async non-blocking)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(setCachedSearchResults).toHaveBeenCalled()
    })
  })

  describe('chat', () => {
    beforeEach(() => {
      // Mock search results
      vi.mocked(db.query).mockResolvedValue({
        rows: [
          {
            kb_id: 'kb-1',
            title: 'Source 1',
            category: 'jurisprudence',
            similarity: 0.88,
            chunk_content: 'Contenu source 1',
            chunk_index: 0,
          },
          {
            kb_id: 'kb-2',
            title: 'Source 2',
            category: 'codes',
            similarity: 0.82,
            chunk_content: 'Contenu source 2',
            chunk_index: 0,
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
    })

    it('should perform RAG chat with context', async () => {
      const response = await chat('Comment calculer la pension alimentaire ?')

      expect(response).toBeDefined()
      expect(response.answer).toBeTruthy()
      expect(response.sources).toHaveLength(2)
      expect(response.tokensUsed).toBeDefined()
      expect(response.model).toBeTruthy()
      expect(response.language).toBe('fr')

      expect(callLLMWithFallback).toHaveBeenCalled()
    })

    it('should respect maxContextChunks option', async () => {
      const options: RAGChatOptions = {
        maxContextChunks: 3,
      }

      await chat('question', options)

      // Vérifier que search a été appelé avec limit=3
      const queryCall = vi.mocked(db.query).mock.calls[0]
      const params = queryCall[1] as unknown[]
      expect(params[2]).toBe(3) // limit
    })

    it('should use premium model when requested', async () => {
      const options: RAGChatOptions = {
        usePremiumModel: true,
      }

      await chat('question', options)

      expect(callLLMWithFallback).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        true // usePremiumModel
      )
    })

    it('should apply filters to search', async () => {
      const options: RAGChatOptions = {
        filters: {
          category: 'jurisprudence',
          tribunal: 'TRIBUNAL_CASSATION',
        },
      }

      await chat('question', options)

      const queryCall = vi.mocked(db.query).mock.calls[0]
      expect(queryCall[0]).toContain('kb.category = ')
      expect(queryCall[1]).toContain('jurisprudence')
    })

    it('should build context from sources with metadata', async () => {
      // Mock métadonnées enrichies
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          // Premier appel: search
          rows: [
            {
              kb_id: 'kb-1',
              title: 'Arrêt Cassation',
              category: 'jurisprudence',
              similarity: 0.88,
              chunk_content: 'Le tribunal a statué...',
              chunk_index: 0,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          // Deuxième appel: métadonnées batch
          rows: [
            {
              knowledge_base_id: 'kb-1',
              tribunal_code: 'TRIBUNAL_CASSATION',
              tribunal_label_ar: 'محكمة التعقيب',
              tribunal_label_fr: 'Cour de Cassation',
              chambre_code: 'CHAMBRE_CIVILE',
              chambre_label_ar: 'الدائرة المدنية',
              chambre_label_fr: 'Chambre Civile',
              decision_date: new Date('2024-01-15'),
              decision_number: '2024/123',
              legal_basis: ['Code Civil Art. 123'],
              extraction_confidence: 0.95,
              cites_count: 3,
              cited_by_count: 5,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })

      const response = await chat('question juridique')

      expect(response.sources[0].metadata).toBeDefined()
      expect(response.sources[0].metadata.tribunalCode).toBe('TRIBUNAL_CASSATION')
      expect(response.sources[0].metadata.decisionDate).toBeInstanceOf(Date)
    })

    it('should return citation warnings if present', async () => {
      const { validateArticleCitations } = await import('../citation-validator-service')
      vi.mocked(validateArticleCitations).mockReturnValue(['Citation Article 123 non vérifiée'])

      const response = await chat('question')

      expect(response.citationWarnings).toBeDefined()
      expect(response.citationWarnings!.length).toBeGreaterThan(0)
    })

    it('should return abrogation warnings if present', async () => {
      const { detectAbrogatedReferences } = await import('../abrogation-detector-service')
      vi.mocked(detectAbrogatedReferences).mockResolvedValue([
        {
          reference: 'Loi 2020-45',
          abrogatedBy: 'Loi 2025-10',
          abrogationDate: new Date('2025-01-01'),
          severity: 'high',
          context: 'Article 123 abrogé',
        },
      ])

      const response = await chat('question')

      expect(response.abrogationWarnings).toBeDefined()
      expect(response.abrogationWarnings!.length).toBeGreaterThan(0)
    })
  })
})
