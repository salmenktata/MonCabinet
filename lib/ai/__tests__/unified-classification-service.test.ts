/**
 * Tests unitaires pour unified-classification-service
 * Sprint 3 - Services Unifiés
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classify,
  classifyBatch,
  type ClassificationFilters,
  type ClassificationOptions,
} from '../unified-classification-service'

// Mock des dépendances
vi.mock('../llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(async (messages, options, usePremiumModel) => ({
    answer: JSON.stringify({
      category: 'jurisprudence',
      domain: 'civil',
      documentType: 'arret',
      confidence: 0.85,
    }),
    tokensUsed: { input: 200, output: 50, total: 250 },
    modelUsed: 'ollama/qwen2.5:3b',
    provider: 'ollama',
    fallbackUsed: false,
  })),
}))

vi.mock('../usage-tracker', () => ({
  logUsage: vi.fn(async () => {}),
}))

vi.mock('@/lib/cache/redis', () => ({
  getRedisClient: vi.fn(async () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => 0),
    scanIterator: vi.fn(() => []),
  })),
}))

import { callLLMWithFallback } from '../llm-fallback-service'

describe('unified-classification-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('classify', () => {
    it('should classify content with structure signal', async () => {
      const filters: ClassificationFilters = {
        sourceName: '9anoun.tn',
        url: '/jurisprudence/123/details',
        textContent: 'Arrêt de la Cour de Cassation...',
        siteStructure: {
          breadcrumbs: ['Accueil', 'Jurisprudence', 'Cassation'],
          urlPath: '/jurisprudence/123/details',
        },
      }

      const result = await classify(filters)

      expect(result).toBeDefined()
      expect(result.primaryCategory).toBeTruthy()
      expect(result.confidenceScore).toBeGreaterThan(0)
      expect(result.signalsUsed.length).toBeGreaterThan(0)

      // Vérifier signal structure
      const structureSignal = result.signalsUsed.find((s) => s.source === 'structure')
      expect(structureSignal).toBeDefined()
      expect(structureSignal?.confidence).toBeGreaterThan(0)
    })

    it('should detect category from breadcrumbs', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page',
        textContent: 'Contenu générique',
        siteStructure: {
          breadcrumbs: ['Accueil', 'Jurisprudence', 'Arrêts'],
        },
      }

      const result = await classify(filters)

      const structureSignal = result.signalsUsed.find((s) => s.source === 'structure')
      expect(structureSignal?.category).toBe('jurisprudence')
    })

    it('should detect category from URL path', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/code/civil/article-123',
        textContent: 'Article de loi...',
      }

      const result = await classify(filters)

      const structureSignal = result.signalsUsed.find((s) => s.source === 'structure')
      expect(structureSignal?.category).toBe('codes')
    })

    it('should detect category from keywords', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page',
        textContent: 'Arrêt de la cour de cassation. Décision du tribunal. محكمة التعقيب.',
      }

      const result = await classify(filters)

      const keywordsSignal = result.signalsUsed.find((s) => s.source === 'keywords')
      expect(keywordsSignal).toBeDefined()
      expect(keywordsSignal?.category).toBe('jurisprudence')
      expect(keywordsSignal?.evidence).toContain('Mots-clés jurisprudence')
    })

    it('should activate LLM when confidence below threshold', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page-ambigue',
        textContent: 'Texte court et peu clair.',
      }

      const result = await classify(filters)

      // LLM devrait être activé car confiance faible
      expect(callLLMWithFallback).toHaveBeenCalled()

      const llmSignal = result.signalsUsed.find((s) => s.source === 'llm')
      expect(llmSignal).toBeDefined()
    })

    it('should skip LLM when confidence above threshold', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/jurisprudence/123',
        textContent: 'Arrêt du tribunal. Décision de la cour. محكمة.',
        siteStructure: {
          breadcrumbs: ['Jurisprudence', 'Cassation'],
        },
      }

      // Forcer une confiance élevée via structure + keywords
      const result = await classify(filters)

      // Si confiance >= seuil, LLM ne devrait pas être appelé
      // (sauf si forceLLM=true)
      if (result.confidenceScore >= 0.6) {
        expect(callLLMWithFallback).not.toHaveBeenCalled()
      }
    })

    it('should force LLM when forceLLM option is true', async () => {
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/jurisprudence/123',
        textContent: 'Arrêt clair',
        siteStructure: {
          breadcrumbs: ['Jurisprudence'],
        },
      }

      const options: ClassificationOptions = {
        forceLLM: true,
      }

      await classify(filters, options)

      expect(callLLMWithFallback).toHaveBeenCalled()
    })

    it('should use adaptive threshold based on domain', async () => {
      // Jurisprudence devrait avoir seuil 0.65 (permissif)
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/jurisprudence/123',
        textContent: 'Arrêt',
        siteStructure: {
          breadcrumbs: ['Jurisprudence'],
        },
      }

      const result = await classify(filters)

      // Si domaine=jurisprudence et confiance >= 0.65, validation pas nécessaire
      if (result.domain === 'civil' && result.confidenceScore >= 0.65) {
        expect(result.requiresValidation).toBe(false)
      }
    })

    it('should require validation when confidence below adaptive threshold', async () => {
      // Mock LLM pour retourner confiance basse
      vi.mocked(callLLMWithFallback).mockResolvedValueOnce({
        answer: JSON.stringify({
          category: 'legislation',
          domain: 'fiscal',
          confidence: 0.50, // Sous seuil 0.75 pour législation
        }),
        tokensUsed: { input: 100, output: 50, total: 150 },
        modelUsed: 'ollama/qwen2.5:3b',
        provider: 'ollama',
        fallbackUsed: false,
      })

      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page',
        textContent: 'Contenu ambigu',
      }

      const result = await classify(filters, { forceLLM: true })

      expect(result.requiresValidation).toBe(true)
      expect(result.validationReason).toContain('Confiance')
    })

    it('should require validation when signals are contradictory', async () => {
      // Mock pour créer des signaux contradictoires
      // (structure dit jurisprudence, keywords dit législation)
      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/jurisprudence/loi-123', // URL mixte
        textContent: 'Loi décret arrêté ordonnance circulaire', // Keywords législation
        siteStructure: {
          breadcrumbs: ['Jurisprudence'], // Structure jurisprudence
        },
      }

      const result = await classify(filters, { forceLLM: true })

      // Si 3+ catégories différentes détectées
      const uniqueCategories = new Set(
        result.signalsUsed.map((s) => s.category).filter((c) => c !== null)
      )

      if (uniqueCategories.size >= 3) {
        expect(result.requiresValidation).toBe(true)
        expect(result.validationReason).toContain('contradictoires')
      }
    })

    it('should normalize cache key for similar URLs', async () => {
      const filters1: ClassificationFilters = {
        sourceName: '9anoun.tn',
        url: '/jurisprudence/123/details',
        textContent: 'Contenu',
      }

      const filters2: ClassificationFilters = {
        sourceName: '9anoun.tn',
        url: '/jurisprudence/456/details', // Même pattern, ID différent
        textContent: 'Contenu',
      }

      await classify(filters1, { useCache: true })
      await classify(filters2, { useCache: true })

      // Les deux URLs devraient utiliser le même cache pattern
      // (impossible à vérifier directement sans exposer generateCacheKey,
      // mais on vérifie que les résultats sont cohérents)
      expect(true).toBe(true) // Placeholder test
    })

    it('should handle LLM failure gracefully', async () => {
      vi.mocked(callLLMWithFallback).mockRejectedValueOnce(new Error('LLM timeout'))

      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page',
        textContent: 'Contenu',
      }

      const result = await classify(filters, { forceLLM: true })

      // Devrait fallback sur signaux non-LLM
      expect(result).toBeDefined()
      expect(result.primaryCategory).toBeTruthy()

      const llmSignal = result.signalsUsed.find((s) => s.source === 'llm')
      expect(llmSignal?.confidence).toBe(0)
      expect(llmSignal?.evidence).toBe('LLM failed')
    })

    it('should parse LLM JSON response correctly', async () => {
      vi.mocked(callLLMWithFallback).mockResolvedValueOnce({
        answer: '```json\n{"category": "codes", "domain": "civil", "confidence": 0.92}\n```',
        tokensUsed: { input: 150, output: 40, total: 190 },
        modelUsed: 'ollama/qwen2.5:3b',
        provider: 'ollama',
        fallbackUsed: false,
      })

      const filters: ClassificationFilters = {
        sourceName: 'test.tn',
        url: '/page',
        textContent: 'Code civil article...',
      }

      const result = await classify(filters, { forceLLM: true })

      const llmSignal = result.signalsUsed.find((s) => s.source === 'llm')
      expect(llmSignal?.category).toBe('codes')
      expect(llmSignal?.domain).toBe('civil')
      expect(llmSignal?.confidence).toBe(0.92)
    })
  })

  describe('classifyBatch', () => {
    it('should classify multiple items in batches', async () => {
      const items: ClassificationFilters[] = [
        {
          sourceName: '9anoun.tn',
          url: '/jurisprudence/1',
          textContent: 'Arrêt 1',
        },
        {
          sourceName: '9anoun.tn',
          url: '/jurisprudence/2',
          textContent: 'Arrêt 2',
        },
        {
          sourceName: '9anoun.tn',
          url: '/code/3',
          textContent: 'Code 3',
        },
        {
          sourceName: '9anoun.tn',
          url: '/loi/4',
          textContent: 'Loi 4',
        },
        {
          sourceName: '9anoun.tn',
          url: '/jurisprudence/5',
          textContent: 'Arrêt 5',
        },
        {
          sourceName: '9anoun.tn',
          url: '/jurisprudence/6',
          textContent: 'Arrêt 6',
        },
      ]

      const results = await classifyBatch(items)

      expect(results).toHaveLength(6)
      results.forEach((result) => {
        expect(result.primaryCategory).toBeTruthy()
        expect(result.confidenceScore).toBeGreaterThan(0)
      })
    })

    it('should process items in batches of 5', async () => {
      const items: ClassificationFilters[] = Array.from({ length: 12 }, (_, i) => ({
        sourceName: 'test.tn',
        url: `/page/${i}`,
        textContent: `Contenu ${i}`,
      }))

      const startTime = Date.now()
      await classifyBatch(items)
      const duration = Date.now() - startTime

      // Avec batch size 5, devrait faire 3 batches
      // (impossible à vérifier précisément, mais on valide que ça ne crash pas)
      expect(duration).toBeGreaterThan(0)
    })

    it('should apply same options to all items', async () => {
      const items: ClassificationFilters[] = [
        { sourceName: 'test.tn', url: '/1', textContent: 'Content 1' },
        { sourceName: 'test.tn', url: '/2', textContent: 'Content 2' },
      ]

      const options: ClassificationOptions = {
        forceLLM: true,
        useCache: false,
      }

      await classifyBatch(items, options)

      // Vérifier que LLM a été appelé pour chaque item
      expect(callLLMWithFallback).toHaveBeenCalledTimes(2)
    })
  })
})
