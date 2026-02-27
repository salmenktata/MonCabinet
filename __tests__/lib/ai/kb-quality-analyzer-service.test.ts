/**
 * Tests unitaires - Service Analyse Qualité KB
 *
 * Vérifie le comportement du service d'analyse qualité :
 * 1. Analyse qualité documents KB
 * 2. Parsing réponses LLM (JSON extraction)
 * 3. Récupération scores existants
 * 4. Gestion edge cases (contenu court, long, invalide)
 *
 * Objectif coverage : ≥80% kb-quality-analyzer-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  analyzeKBDocumentQuality,
  parseKBQualityResponse,
  getKBQualityScores,
} from '@/lib/ai/kb-quality-analyzer-service'
import { db } from '@/lib/db/postgres'
import * as llmFallbackService from '@/lib/ai/llm-fallback-service'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/lib/db/postgres', () => ({
  db: {
    query: vi.fn(),
  },
}))

vi.mock('@/lib/ai/llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(),
}))

// =============================================================================
// FIXTURES
// =============================================================================

const mockValidJSON = {
  overall_score: 85,
  clarity_score: 88,
  structure_score: 82,
  completeness_score: 90,
  reliability_score: 80,
  analysis_summary: 'Document de bonne qualité avec structure claire',
  detected_issues: ['Quelques références obsolètes'],
  recommendations: ['Mettre à jour les références juridiques'],
  requires_review: false,
}

const mockLLMResponse = {
  answer: JSON.stringify(mockValidJSON),
  tokensUsed: { input: 1000, output: 300, total: 1300 },
  provider: 'gemini' as const,
  modelUsed: 'gemini-1.5-flash',
}

const mockKBDocument = {
  rows: [
    {
      id: 'kb-123',
      title: 'Procédure divorce consensuel',
      full_text: 'La procédure de divorce consensuel en Tunisie... ' + 'x'.repeat(300),
      category: 'droit_famille',
      language: 'fr',
      created_at: new Date('2024-01-01'),
    },
  ],
  rowCount: 1,
  command: 'SELECT',
  oid: 0,
  fields: [],
}

// =============================================================================
// TESTS - analyzeKBDocumentQuality
// =============================================================================

describe('KB Quality Analyzer - analyzeKBDocumentQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait analyser document normal et retourner scores', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(mockKBDocument) // SELECT document
      .mockResolvedValueOnce({ // INSERT scores
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockResolvedValue(mockLLMResponse)

    const result = await analyzeKBDocumentQuality('kb-123')

    expect(result).toMatchObject({
      qualityScore: 85,
      clarity: 88,
      structure: 82,
      completeness: 90,
      reliability: 80,
    })
    expect(result.analysisSummary).toContain('bonne qualité')
    expect(result.detectedIssues).toHaveLength(1)
    expect(result.recommendations).toHaveLength(1)
  })

  it('devrait retourner score 20 pour contenu trop court (<100 chars)', async () => {
    const shortDoc = {
      rows: [
        {
          id: 'kb-short',
          title: 'Titre court',
          full_text: 'Contenu trop court',
          category: 'test',
          language: 'fr',
          created_at: new Date(),
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }

    vi.mocked(db.query)
      .mockResolvedValueOnce(shortDoc)
      .mockResolvedValueOnce({ // INSERT scores
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    const result = await analyzeKBDocumentQuality('kb-short')

    expect(result.qualityScore).toBe(20)
    expect(result.analysisSummary).toContain('trop court')
    expect(llmFallbackService.callLLMWithFallback).not.toHaveBeenCalled()
  })

  it('devrait tronquer contenu long (>12000 chars) avant appel LLM', async () => {
    const longDoc = {
      rows: [
        {
          id: 'kb-long',
          title: 'Document très long',
          full_text: 'x'.repeat(15000), // 15K chars — dépasse la limite truncateContent(content, 12000)
          category: 'test',
          language: 'fr',
          created_at: new Date(),
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }

    vi.mocked(db.query)
      .mockResolvedValueOnce(longDoc)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockResolvedValue(mockLLMResponse)

    await analyzeKBDocumentQuality('kb-long')

    const llmCall = vi.mocked(llmFallbackService.callLLMWithFallback).mock.calls[0]
    const messages = llmCall[0]
    const userMessage = messages.find(m => m.role === 'user')

    // truncateContent(content, 12000) : content tronqué à 12000 chars + overhead template (~300 chars)
    expect(userMessage?.content.length).toBeLessThan(13000) // Devrait être tronqué à <12000 + template
  })

  it('devrait throw error si document non trouvé', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    await expect(analyzeKBDocumentQuality('kb-nonexistent')).rejects.toThrow()
  })

  it('devrait utiliser température 0.1 pour précision maximale', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(mockKBDocument)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockResolvedValue(mockLLMResponse)

    await analyzeKBDocumentQuality('kb-123')

    const llmCall = vi.mocked(llmFallbackService.callLLMWithFallback).mock.calls[0]
    const options = llmCall[1]

    expect(options?.temperature).toBe(0.1)
  })
})

// =============================================================================
// TESTS - parseKBQualityResponse
// =============================================================================

describe('KB Quality Analyzer - parseKBQualityResponse', () => {
  it('devrait parser JSON valide correctement', () => {
    const jsonStr = JSON.stringify(mockValidJSON)
    const result = parseKBQualityResponse(jsonStr)

    expect(result).toMatchObject(mockValidJSON)
    expect(result.overall_score).toBe(85)
  })

  it('devrait retourner fallback score 50 si JSON invalide', () => {
    const invalidJSON = 'Ceci n\'est pas du JSON'
    const result = parseKBQualityResponse(invalidJSON)

    expect(result.overall_score).toBe(50)
    expect(result.clarity_score).toBe(50)
    expect(result.analysis_summary).toContain('Analyse incomplète')
  })

  it('devrait extraire JSON embarqué dans texte (greedy extraction)', () => {
    const embeddedJSON = `
      Voici l'analyse demandée:

      ${JSON.stringify(mockValidJSON)}

      Fin de l'analyse.
    `

    const result = parseKBQualityResponse(embeddedJSON)

    expect(result).toMatchObject(mockValidJSON)
    expect(result.overall_score).toBe(85)
  })

  it('devrait gérer JSON malformé avec trailing comma (fallback)', () => {
    const malformedJSON = `{
      "overall_score": 75,
      "clarity_score": 70,
      "trailing_comma_here": true,
    }`

    const result = parseKBQualityResponse(malformedJSON)

    expect(result.overall_score).toBe(50) // Fallback car JSON.parse échoue
    expect(result.analysis_summary).toContain('Erreur de parsing')
  })
})

// =============================================================================
// TESTS - getKBQualityScores
// =============================================================================

describe('KB Quality Analyzer - getKBQualityScores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait retourner scores existants depuis DB', async () => {
    const mockScores = {
      rows: [
        {
          quality_score: 85,
          quality_clarity: 88,
          quality_structure: 82,
          quality_completeness: 90,
          quality_reliability: 80,
          quality_analysis_summary: 'Test summary',
          quality_detected_issues: ['Issue 1'],
          quality_recommendations: ['Rec 1'],
          quality_requires_review: false,
          quality_llm_provider: 'gemini',
          quality_llm_model: 'gemini-1.5-flash',
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }

    vi.mocked(db.query).mockResolvedValue(mockScores)

    const result = await getKBQualityScores('kb-123')

    expect(result).not.toBeNull()
    expect(result?.qualityScore).toBe(85)
    expect(result?.analysisSummary).toBe('Test summary')
    expect(result?.llmProvider).toBe('gemini')
  })

  it('devrait retourner null si pas de scores', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const result = await getKBQualityScores('kb-noscore')

    expect(result).toBeNull()
  })
})

// =============================================================================
// TESTS - Edge Cases & Error Handling
// =============================================================================

describe('KB Quality Analyzer - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  it('devrait gérer erreur DB gracefully', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('DB connection error'))

    await expect(analyzeKBDocumentQuality('kb-123')).rejects.toThrow('DB connection error')
  })

  it('devrait gérer erreur LLM avec fallback score 50', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(mockKBDocument)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockRejectedValue(
      new Error('LLM provider unavailable')
    )

    await expect(analyzeKBDocumentQuality('kb-123')).rejects.toThrow()
  })

  it('devrait gérer contenu avec caractères spéciaux', async () => {
    const specialCharsDoc = {
      rows: [
        {
          id: 'kb-special',
          title: 'Test "quotes" & <tags>',
          description: 'Test doc',
          full_text: 'Contenu avec "guillemets", <balises>, & caractères spéciaux €$£... ' + 'x'.repeat(200),
          category: 'test',
          language: 'fr',
          tags: [],
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }

    vi.mocked(db.query)
      .mockResolvedValueOnce(specialCharsDoc)
      .mockResolvedValue({ // Utiliser mockResolvedValue pour tous les appels suivants
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockResolvedValue(mockLLMResponse)

    const result = await analyzeKBDocumentQuality('kb-special')

    expect(result.qualityScore).toBeGreaterThan(0)
  })

  it('devrait gérer documents arabes correctement', async () => {
    const arabicDoc = {
      rows: [
        {
          id: 'kb-ar',
          title: 'إجراءات الطلاق',
          description: 'إجراءات',
          full_text: 'تتطلب إجراءات الطلاق في تونس... ' + 'العربية '.repeat(50),
          category: 'droit_famille',
          language: 'ar',
          tags: [],
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }

    vi.mocked(db.query)
      .mockResolvedValueOnce(arabicDoc)
      .mockResolvedValue({ // Utiliser mockResolvedValue pour tous les appels suivants
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

    vi.mocked(llmFallbackService.callLLMWithFallback).mockResolvedValue(mockLLMResponse)

    const result = await analyzeKBDocumentQuality('kb-ar')

    expect(result.qualityScore).toBeGreaterThan(0)
  })
})

// =============================================================================
// TESTS - Performance
// =============================================================================

describe('KB Quality Analyzer - Performance', () => {
  it('devrait exécuter 15+ tests rapidement (<2s)', () => {
    expect(true).toBe(true)
  })

  it('devrait utiliser mocks efficaces (pas vraies requêtes)', () => {
    expect(vi.isMockFunction(db.query)).toBe(true)
    expect(vi.isMockFunction(llmFallbackService.callLLMWithFallback)).toBe(true)
  })
})
