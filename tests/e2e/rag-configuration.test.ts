/**
 * Tests E2E - Configuration RAG
 *
 * Valide la configuration RAG en environnement production
 * et s'assure qu'aucune régression n'est introduite
 */

import { describe, it, expect, beforeAll } from '@jest/globals'

const PROD_URL = process.env.TEST_PROD_URL || 'https://qadhya.tn'
const TIMEOUT = 30000 // 30s

interface RAGConfig {
  enabled: boolean
  semanticSearchEnabled: boolean
  ollamaEnabled: boolean
  openaiConfigured: boolean
  kbDocsIndexed: number
  kbChunksAvailable: number
  status: 'ok' | 'misconfigured'
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  rag?: RAGConfig
  services: {
    database: string
    storage: string
    api: string
  }
}

describe('RAG Configuration E2E Tests', () => {
  let healthData: HealthCheckResponse

  beforeAll(async () => {
    // Fetch health check data
    const response = await fetch(`${PROD_URL}/api/health`)
    expect(response.ok).toBe(true)
    healthData = await response.json()
  }, TIMEOUT)

  describe('Health Check API', () => {
    it('should return healthy status', () => {
      expect(healthData.status).toBe('healthy')
    })

    it('should expose rag section', () => {
      expect(healthData.rag).toBeDefined()
      expect(healthData.rag).not.toBeNull()
    })

    it('should have valid rag configuration structure', () => {
      const rag = healthData.rag!
      expect(typeof rag.enabled).toBe('boolean')
      expect(typeof rag.semanticSearchEnabled).toBe('boolean')
      expect(typeof rag.ollamaEnabled).toBe('boolean')
      expect(typeof rag.openaiConfigured).toBe('boolean')
      expect(typeof rag.kbDocsIndexed).toBe('number')
      expect(typeof rag.kbChunksAvailable).toBe('number')
      expect(['ok', 'misconfigured']).toContain(rag.status)
    })
  })

  describe('RAG Configuration Validation', () => {
    it('should have RAG enabled', () => {
      expect(healthData.rag!.enabled).toBe(true)
    })

    it('should have semantic search enabled', () => {
      expect(healthData.rag!.semanticSearchEnabled).toBe(true)
    })

    it('should have at least one embeddings provider active', () => {
      const rag = healthData.rag!
      const hasOllama = rag.ollamaEnabled
      const hasOpenAI = rag.openaiConfigured

      expect(hasOllama || hasOpenAI).toBe(true)
    })

    it('should NOT be misconfigured', () => {
      expect(healthData.rag!.status).toBe('ok')
    })
  })

  describe('Knowledge Base Status', () => {
    it('should have documents indexed', () => {
      expect(healthData.rag!.kbDocsIndexed).toBeGreaterThan(0)
    })

    it('should have chunks available', () => {
      expect(healthData.rag!.kbChunksAvailable).toBeGreaterThan(0)
    })

    it('should have reasonable docs to chunks ratio', () => {
      const rag = healthData.rag!
      const ratio = rag.kbChunksAvailable / rag.kbDocsIndexed

      // Each doc should produce at least 1 chunk, max ~10 on average
      expect(ratio).toBeGreaterThanOrEqual(1)
      expect(ratio).toBeLessThanOrEqual(20)
    })

    it('should have minimum expected KB size (8000+ docs)', () => {
      // Production devrait avoir au moins 8000 docs indexés
      expect(healthData.rag!.kbDocsIndexed).toBeGreaterThanOrEqual(8000)
    })
  })

  describe('Provider Configuration', () => {
    it('should have Ollama enabled as primary provider', () => {
      // Ollama est le provider recommandé (gratuit, local)
      expect(healthData.rag!.ollamaEnabled).toBe(true)
    })

    it('should have consistent configuration', () => {
      const rag = healthData.rag!

      // Si RAG activé + provider disponible → semantic search DOIT être enabled
      if (rag.enabled && (rag.ollamaEnabled || rag.openaiConfigured)) {
        expect(rag.semanticSearchEnabled).toBe(true)
      }
    })
  })

  describe('Configuration Coherence', () => {
    it('should have coherent status', () => {
      const rag = healthData.rag!

      if (rag.enabled && rag.semanticSearchEnabled) {
        // Configuration valide
        expect(rag.status).toBe('ok')
      }

      if (rag.enabled && !rag.semanticSearchEnabled) {
        // Configuration invalide
        expect(rag.status).toBe('misconfigured')
      }
    })

    it('should detect misconfiguration correctly', () => {
      const rag = healthData.rag!

      // Si misconfigured, alors semantic search DOIT être disabled
      if (rag.status === 'misconfigured') {
        expect(rag.semanticSearchEnabled).toBe(false)
      }
    })
  })

  describe('Critical Regression Prevention', () => {
    it('should NEVER have misconfigured status in production', () => {
      // Test critique : empêche déploiement si config invalide
      expect(healthData.rag!.status).not.toBe('misconfigured')
    })

    it('should NEVER have RAG enabled without providers', () => {
      const rag = healthData.rag!

      if (rag.enabled) {
        // Au moins un provider DOIT être disponible
        expect(rag.ollamaEnabled || rag.openaiConfigured).toBe(true)
      }
    })

    it('should have stable KB size (no massive drops)', () => {
      const docs = healthData.rag!.kbDocsIndexed
      const chunks = healthData.rag!.kbChunksAvailable

      // Si docs > 0, chunks DOIT être > 0
      if (docs > 0) {
        expect(chunks).toBeGreaterThan(0)
      }

      // Minimum absolu (détection régression massive)
      expect(docs).toBeGreaterThan(1000)
      expect(chunks).toBeGreaterThan(1000)
    })
  })

  describe('Services Health', () => {
    it('should have all services healthy', () => {
      expect(healthData.services.database).toBe('healthy')
      expect(healthData.services.storage).toBe('healthy')
      expect(healthData.services.api).toBe('healthy')
    })
  })
})

describe('RAG System Functional Tests', () => {
  it('should fetch system config dashboard', async () => {
    const response = await fetch(`${PROD_URL}/super-admin/monitoring?tab=system-config`)
    expect(response.ok).toBe(true)
  }, TIMEOUT)

  it('should have monitoring metrics API accessible', async () => {
    // Note: Requiert authentification en prod
    const response = await fetch(`${PROD_URL}/api/admin/monitoring/metrics`)

    // Devrait être 401 (Unauthorized) ou 200 si session admin active
    expect([200, 401]).toContain(response.status)
  }, TIMEOUT)
})

describe('Validation Script Tests', () => {
  it('should validate RAG config script exists', async () => {
    // Script doit exister dans le repo
    const fs = require('fs')
    const scriptPath = './scripts/validate-rag-config.sh'

    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  it('should have cron check script', async () => {
    const fs = require('fs')
    const cronPath = './scripts/cron-check-rag-config.sh'

    expect(fs.existsSync(cronPath)).toBe(true)
  })
})
