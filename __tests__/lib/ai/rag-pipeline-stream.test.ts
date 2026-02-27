/**
 * Tests unitaires - Pipeline RAG Streaming
 *
 * Couvre answerQuestionStream() de rag-pipeline.ts :
 * - Séquence des chunks émis (progress → metadata → chunk → done)
 * - Cas abstention (aucune source ou similarité faible)
 * - Cas erreur (recherche KO)
 * - Chat désactivé
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { answerQuestionStream, type StreamChunk } from '@/lib/ai/rag-pipeline'
import type { ChatSource } from '@/lib/ai/rag-search-service'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/lib/ai/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/config')>('@/lib/ai/config')
  return {
    ...actual,
    isChatEnabled: vi.fn(() => true),
    getChatProvider: vi.fn(() => 'ollama' as const),
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

vi.mock('@/lib/ai/rag-search-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/rag-search-service')>(
    '@/lib/ai/rag-search-service'
  )
  return {
    ...actual,
    searchRelevantContext: vi.fn(),
    searchRelevantContextBilingual: vi.fn(),
    ENABLE_QUERY_EXPANSION: true,
  }
})

vi.mock('@/lib/ai/rag-context-builder', () => ({
  buildContextFromSources: vi.fn(async () => '## Contexte juridique\n\nTexte des sources...'),
  computeSourceQualityMetrics: vi.fn(() => ({
    averageSimilarity: 0.75,
    qualityLevel: 'high',
    warningMessage: null,
  })),
  sanitizeCitations: vi.fn((answer: string) => answer),
}))

vi.mock('@/lib/ai/llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(),
  callLLMStream: vi.fn(async function* () {
    yield 'Selon '
    yield 'le droit '
    yield 'tunisien...'
  }),
}))

vi.mock('@/lib/ai/legal-reasoning-prompts', () => ({
  getSystemPromptForContext: vi.fn(() => 'System prompt juridique...'),
  PROMPT_CONFIG: {
    chat: { maxTokens: 8000, temperature: 0.3, preferConcise: false },
    consultation: { maxTokens: 4000, temperature: 0.1, preferConcise: false },
    structuration: { maxTokens: 2000, temperature: 0.1, preferConcise: false },
  },
}))

vi.mock('@/lib/ai/operations-config', () => ({
  getOperationProvider: vi.fn(() => 'ollama'),
  getOperationModel: vi.fn(() => 'qwen2.5:3b'),
}))

vi.mock('@/lib/ai/language-utils', () => ({
  detectLanguage: vi.fn(() => 'fr'),
  getOppositeLanguage: vi.fn(() => 'ar'),
}))

vi.mock('@/lib/ai/citation-validator-service', () => ({
  validateArticleCitations: vi.fn(() => []),
  formatValidationWarnings: vi.fn(() => []),
  verifyClaimSourceAlignment: vi.fn(async () => ({ passed: true })),
  verifyBranchAlignment: vi.fn(async () => ({ violations: [] })),
}))

vi.mock('@/lib/ai/abrogation-detector-service', () => ({
  detectAbrogatedReferences: vi.fn(async () => []),
  formatAbrogationWarnings: vi.fn(() => []),
}))

vi.mock('@/lib/logging/rag-logger', () => ({
  RAGLogger: class {
    addContext = vi.fn()
    info = vi.fn()
    warn = vi.fn()
    error = vi.fn()
    finish = vi.fn()
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

vi.mock('@/lib/ai/conversation-summary-service', () => ({
  getConversationContext: vi.fn(async () => ({
    messages: [],
    summary: null,
    tokenCount: 0,
  })),
  triggerSummaryGenerationIfNeeded: vi.fn(),
  SUMMARY_CONFIG: {
    triggerMessageCount: 6,
    recentMessagesLimit: 6,
    maxSummaryTokens: 500,
    llmModel: 'qwen2.5:3b',
  },
}))

vi.mock('@/lib/ai/token-utils', () => ({
  countTokens: vi.fn(() => 100),
}))

vi.mock('@/lib/metrics/rag-metrics', () => ({
  recordRAGMetric: vi.fn(),
}))

vi.mock('@/lib/db/postgres', () => ({
  db: { query: vi.fn() },
}))

// =============================================================================
// HELPERS
// =============================================================================

async function collectChunks(question: string, userId: string): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of answerQuestionStream(question, userId)) {
    chunks.push(chunk)
  }
  return chunks
}

function makeSources(count: number, similarity: number): ChatSource[] {
  return Array.from({ length: count }, (_, i) => ({
    documentId: `doc-${i}`,
    documentName: `Document ${i}`,
    chunkContent: `Contenu juridique pertinent ${i}...`,
    similarity,
    metadata: { category: 'codes', searchType: 'hybrid' },
  }))
}

// =============================================================================
// FIXTURES
// =============================================================================

const USER_ID = 'user-stream-123'
const QUESTION = 'Quelle est la prescription civile?'

// =============================================================================
// TESTS
// =============================================================================

describe('answerQuestionStream() — cas nominal (sources disponibles)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { searchRelevantContextBilingual } = await import('@/lib/ai/rag-search-service')
    vi.mocked(searchRelevantContextBilingual).mockResolvedValue({
      sources: makeSources(3, 0.75),
      cacheHit: false,
    })
  })

  it('émet progress en premier chunk', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    expect(chunks[0]).toMatchObject({ type: 'progress', step: 'searching' })
  })

  it('émet metadata avec les sources', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    const metadata = chunks.find(c => c.type === 'metadata')
    expect(metadata).toBeDefined()
    expect(metadata?.type).toBe('metadata')
    if (metadata?.type === 'metadata') {
      expect(metadata.sources.length).toBeGreaterThan(0)
      expect(typeof metadata.model).toBe('string')
    }
  })

  it('émet au moins un chunk de texte', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    const textChunks = chunks.filter(c => c.type === 'chunk')
    expect(textChunks.length).toBeGreaterThan(0)
  })

  it('termine avec chunk done contenant tokensUsed', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.type).toBe('done')
    if (lastChunk.type === 'done') {
      expect(lastChunk.tokensUsed).toHaveProperty('input')
      expect(lastChunk.tokensUsed).toHaveProperty('output')
      expect(lastChunk.tokensUsed).toHaveProperty('total')
    }
  })

  it('respecte l\'ordre progress → metadata → chunk(s) → done', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    const types = chunks.map(c => c.type)
    const progressIdx = types.indexOf('progress')
    const metadataIdx = types.indexOf('metadata')
    const doneIdx = types.lastIndexOf('done')

    expect(progressIdx).toBe(0)
    expect(metadataIdx).toBeGreaterThan(progressIdx)
    expect(doneIdx).toBe(chunks.length - 1)
    // Tous les chunks 'chunk' viennent après metadata et avant done
    chunks.forEach((c, i) => {
      if (c.type === 'chunk') {
        expect(i).toBeGreaterThan(metadataIdx)
        expect(i).toBeLessThan(doneIdx)
      }
    })
  })
})

describe('answerQuestionStream() — abstention (aucune source)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { searchRelevantContextBilingual } = await import('@/lib/ai/rag-search-service')
    vi.mocked(searchRelevantContextBilingual).mockResolvedValue({
      sources: [],
      cacheHit: false,
      reason: 'no_results',
    })
  })

  it('émet progress puis metadata vides puis done (sans appel LLM)', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)

    const metadata = chunks.find(c => c.type === 'metadata')
    expect(metadata?.type).toBe('metadata')
    if (metadata?.type === 'metadata') {
      expect(metadata.sources).toHaveLength(0)
    }

    // Vérifie que callLLMStream n'a été pas appelé
    const { callLLMStream } = await import('@/lib/ai/llm-fallback-service')
    expect(vi.mocked(callLLMStream)).not.toHaveBeenCalled()

    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.type).toBe('done')
  })
})

describe('answerQuestionStream() — erreur de recherche', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { searchRelevantContextBilingual } = await import('@/lib/ai/rag-search-service')
    vi.mocked(searchRelevantContextBilingual).mockRejectedValue(new Error('Timeout KB search'))
  })

  it('émet progress puis un chunk error', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)

    expect(chunks[0]).toMatchObject({ type: 'progress', step: 'searching' })

    const errorChunk = chunks.find(c => c.type === 'error')
    expect(errorChunk).toBeDefined()
    if (errorChunk?.type === 'error') {
      expect(errorChunk.message).toMatch(/Timeout KB search/)
    }
  })

  it('ne génère pas de chunk done après une erreur', async () => {
    const chunks = await collectChunks(QUESTION, USER_ID)
    const doneChunk = chunks.find(c => c.type === 'done')
    expect(doneChunk).toBeUndefined()
  })
})

describe('answerQuestionStream() — chat désactivé', () => {
  beforeEach(() => vi.clearAllMocks())

  it('émet un chunk error immédiatement si chat désactivé', async () => {
    const { isChatEnabled } = await import('@/lib/ai/config')
    vi.mocked(isChatEnabled).mockReturnValueOnce(false)

    const chunks = await collectChunks(QUESTION, USER_ID)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].type).toBe('error')
  })
})
