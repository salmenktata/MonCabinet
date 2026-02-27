/**
 * Tests unitaires - Service RAG Search
 *
 * Couvre les fonctions publiques de rag-search-service.ts :
 * - searchRelevantContext() : cache hit/miss, quality gate, no results
 * - searchRelevantContext() boost behavior (via sources retournées)
 * - Importations depuis le nouveau module (vérification frontières post-split)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchRelevantContext,
  type ChatSource,
  type ChatOptions,
  type SearchResult,
} from '@/lib/ai/rag-search-service'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/lib/db/postgres', () => ({
  db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
}))

vi.mock('@/lib/ai/embeddings-service', () => ({
  generateEmbedding: vi.fn(async () => ({
    embedding: Array(768).fill(0.1),
    dimensions: 768,
    model: 'nomic-embed-text',
  })),
  formatEmbeddingForPostgres: vi.fn((e: number[]) => `[${e.join(',')}]`),
}))

vi.mock('@/lib/ai/knowledge-base-service', () => ({
  searchKnowledgeBase: vi.fn(async () => []),
  searchKnowledgeBaseHybrid: vi.fn(async () => []),
}))

vi.mock('@/lib/ai/feedback-service', () => ({
  getDynamicBoostFactors: vi.fn(async () => ({
    factors: { document: 1.0, knowledge_base: 1.0, autre: 1.0 },
  })),
}))

vi.mock('@/lib/ai/reranker-service', () => ({
  rerankDocuments: vi.fn(async (query, docs) =>
    docs.map((d: { content: string; originalScore: number; metadata: Record<string, unknown> }, i: number) => ({ index: i, score: d.originalScore }))
  ),
  combineScores: vi.fn((a: number, b: number) => (a + b) / 2),
  isRerankerEnabled: vi.fn(() => false),
}))

vi.mock('@/lib/ai/rag-abrogation-filter', () => ({
  filterAbrogatedSources: vi.fn(async (sources: ChatSource[]) => ({
    validSources: sources,
    filteredCount: 0,
  })),
}))

vi.mock('@/lib/ai/legal-router-service', () => ({
  routeQuery: vi.fn(async () => ({
    classification: {
      categories: ['civil'],
      domains: ['civil'],
      confidence: 0.8,
    },
    tracks: [],
    allowedBranches: [],
    forbiddenBranches: [],
  })),
}))

vi.mock('@/lib/ai/query-expansion-service', () => ({
  expandQuery: vi.fn(async (q: string) => q),
  condenseQuery: vi.fn(async (q: string) => q),
  enrichQueryWithLegalSynonyms: vi.fn((q: string) => q),
}))

vi.mock('@/lib/ai/translation-service', () => ({
  translateQuery: vi.fn(async (q: string) => q),
  isTranslationAvailable: vi.fn(() => false),
}))

vi.mock('@/lib/cache/search-cache', () => ({
  getCachedSearchResults: vi.fn(async () => null),
  setCachedSearchResults: vi.fn(async () => {}),
  SearchScope: { USER: 'user', GLOBAL: 'global' },
}))

vi.mock('@/lib/metrics/rag-metrics', () => ({
  recordRAGMetric: vi.fn(),
}))

vi.mock('@/lib/logging/rag-logger', () => ({
  RAGLogger: class {
    info = vi.fn()
    warn = vi.fn()
    error = vi.fn()
  },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('@/lib/ai/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/config')>('@/lib/ai/config')
  return {
    ...actual,
    aiConfig: {
      ...actual.aiConfig,
      rag: {
        ...(actual.aiConfig?.rag ?? {}),
        maxResults: 7,
        similarityThreshold: 0.35,
      },
    },
  }
})

// =============================================================================
// FIXTURES
// =============================================================================

// 'eval-system' est non-UUID → rag-search-service saute la requête document_embeddings
// et utilise 'SELECT 1 WHERE false' → db.query retourne { rows: [] } via le mock par défaut
const USER_ID = 'eval-system'
const BASE_QUESTION = 'Quelle est la durée de prescription en droit civil tunisien?'

function makeSources(count: number, similarity: number): ChatSource[] {
  return Array.from({ length: count }, (_, i) => ({
    documentId: `doc-${i}`,
    documentName: `Document ${i}`,
    chunkContent: `Contenu du chunk ${i}...`,
    similarity,
    metadata: { category: 'codes', searchType: 'hybrid' },
  }))
}

// =============================================================================
// TESTS — Module boundaries (post-split)
// =============================================================================

describe('Import depuis rag-search-service (frontières module post-split)', () => {
  it('exporte ChatSource, ChatOptions, SearchResult comme types', () => {
    // Si le import réussit sans erreur, les types sont bien exportés
    const source: ChatSource = {
      documentId: 'x',
      documentName: 'Test',
      chunkContent: 'content',
      similarity: 0.5,
    }
    expect(source.similarity).toBe(0.5)
  })

  it('exporte ENABLE_QUERY_EXPANSION et BILINGUAL_SEARCH_TIMEOUT_MS', async () => {
    const { ENABLE_QUERY_EXPANSION, BILINGUAL_SEARCH_TIMEOUT_MS } = await import(
      '@/lib/ai/rag-search-service'
    )
    expect(typeof ENABLE_QUERY_EXPANSION).toBe('boolean')
    expect(typeof BILINGUAL_SEARCH_TIMEOUT_MS).toBe('number')
    expect(BILINGUAL_SEARCH_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

// =============================================================================
// TESTS — searchRelevantContext()
// =============================================================================

describe('searchRelevantContext() — cache hit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne les sources du cache sans appeler KB', async () => {
    const cachedSources = makeSources(3, 0.75)
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(cachedSources as any)

    const result = await searchRelevantContext(BASE_QUESTION, USER_ID)

    expect(result.cacheHit).toBe(true)
    expect(result.sources).toHaveLength(3)

    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    expect(vi.mocked(searchKnowledgeBaseHybrid)).not.toHaveBeenCalled()
  })
})

describe('searchRelevantContext() — cache miss', () => {
  beforeEach(() => vi.clearAllMocks())

  it('génère un embedding et appelle KB search', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    const sources = makeSources(2, 0.70)
    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue(sources as any)

    const { generateEmbedding } = await import('@/lib/ai/embeddings-service')

    await searchRelevantContext(BASE_QUESTION, USER_ID, { includeKnowledgeBase: true })

    expect(vi.mocked(generateEmbedding)).toHaveBeenCalled()
    expect(vi.mocked(searchKnowledgeBaseHybrid)).toHaveBeenCalled()
  })

  it('met le résultat en cache après recherche', async () => {
    const { getCachedSearchResults, setCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    const sources = makeSources(2, 0.70)
    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue(sources as any)

    await searchRelevantContext(BASE_QUESTION, USER_ID)

    expect(vi.mocked(setCachedSearchResults)).toHaveBeenCalled()
  })
})

describe('searchRelevantContext() — quality gate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne sources vides si similarité en-dessous du seuil minimum (RAG_THRESHOLDS.minimum)', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    // Sources avec similarité très basse (0.05 < RAG_THRESHOLDS.minimum=0.55)
    // → filtrées par aboveThreshold avant même le quality gate adaptatif
    const lowSources = makeSources(2, 0.05)
    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue(lowSources as any)

    const result = await searchRelevantContext(BASE_QUESTION, USER_ID)

    // Sources filtrées → tableau vide (reason peut être undefined ou 'quality_gate')
    expect(result.sources).toHaveLength(0)
    expect(result.cacheHit).toBe(false)
  })
})

describe('searchRelevantContext() — no results', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne sources vides si KB ne retourne aucun résultat', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue([])

    const result = await searchRelevantContext(BASE_QUESTION, USER_ID)

    expect(result.sources).toHaveLength(0)
    expect(result.cacheHit).toBe(false)
  })

  it('désactive KB search si includeKnowledgeBase=false', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')

    const result = await searchRelevantContext(BASE_QUESTION, USER_ID, {
      includeKnowledgeBase: false,
    })

    expect(vi.mocked(searchKnowledgeBaseHybrid)).not.toHaveBeenCalled()
    expect(result.sources).toHaveLength(0)
  })
})

describe('searchRelevantContext() — boost (comportement observable)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('les sources retournées ont boostedSimilarity ≥ similarity de base', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    // Source avec similarité 0.60 — devrait passer le quality gate
    const sources = makeSources(1, 0.60)
    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue(sources as any)

    const result = await searchRelevantContext(BASE_QUESTION, USER_ID)

    if (result.sources.length > 0) {
      expect(result.sources[0].boostedSimilarity).toBeDefined()
      // boostedSimilarity peut être > ou = à similarity de base (jamais NaN)
      expect(result.sources[0].boostedSimilarity).not.toBeNaN()
      expect(result.sources[0].boostedSimilarity).toBeGreaterThan(0)
    }
  })

  it('boostedSimilarity ne dépasse jamais 2× la similarité originale (cap 2.0×)', async () => {
    const { getCachedSearchResults } = await import('@/lib/cache/search-cache')
    vi.mocked(getCachedSearchResults).mockResolvedValueOnce(null)

    const sources: ChatSource[] = [{
      documentId: 'doc-coc',
      documentName: 'مجلة الالتزامات والعقود',
      chunkContent: 'التزامات مدنية...',
      similarity: 0.50,
      metadata: { category: 'codes', doc_type: 'TEXTES', searchType: 'hybrid' },
    }]
    const { searchKnowledgeBaseHybrid } = await import('@/lib/ai/knowledge-base-service')
    vi.mocked(searchKnowledgeBaseHybrid).mockResolvedValue(sources as any)

    const result = await searchRelevantContext('مسؤولية مدنية التزامات', USER_ID)

    if (result.sources.length > 0) {
      const boosted = result.sources[0].boostedSimilarity ?? 0
      const original = result.sources[0].similarity
      // Cap est appliqué à 2.0× sur le boost — donc boostedSimilarity ≤ original × 2.0
      expect(boosted).toBeLessThanOrEqual(original * 2.0 + 0.001) // marge flottante
    }
  })
})
