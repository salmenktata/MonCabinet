/**
 * Tests unitaires: operations-config-service.ts
 *
 * Coverage:
 * - getOperationConfig() : Merge DB + static config
 * - updateOperationConfig() : Partial update + validation
 * - resetOperationConfig() : Revert to defaults
 * - Cache behavior (2-min TTL)
 * - Feature flag fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getOperationConfig,
  updateOperationConfig,
  resetOperationConfig,
  clearOperationConfigCache,
} from '../operations-config-service'
import { db } from '@/lib/db'
import { cache } from '@/lib/cache'

// Mock dependencies
vi.mock('@/lib/db')
vi.mock('@/lib/cache')
vi.mock('@/lib/config/platform-config')

describe('operations-config-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getOperationConfig', () => {
    it('should return config from cache if available', async () => {
      const cachedConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        primaryProvider: 'groq',
        source: 'database',
      }

      vi.mocked(cache.get).mockResolvedValue(cachedConfig)

      const result = await getOperationConfig('assistant-ia')

      expect(cache.get).toHaveBeenCalledWith('operation-config:assistant-ia')
      expect(result).toEqual(cachedConfig)
      expect(db.query).not.toHaveBeenCalled()
    })

    it('should fetch from DB and cache if not in cache', async () => {
      const dbConfig = {
        id: 'test-id',
        operation_name: 'assistant-ia',
        primary_provider: 'groq',
        fallback_providers: ['gemini', 'deepseek'],
        enabled_providers: ['groq', 'gemini', 'deepseek'],
        is_active: true,
        use_static_config: false,
      }

      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(db.query).mockResolvedValue({ rows: [dbConfig] })
      vi.mocked(cache.set).mockResolvedValue(undefined)

      const result = await getOperationConfig('assistant-ia')

      expect(db.query).toHaveBeenCalled()
      expect(cache.set).toHaveBeenCalledWith(
        'operation-config:assistant-ia',
        expect.objectContaining({
          operationName: 'assistant-ia',
          primaryProvider: 'groq',
        }),
        120 // 2-min TTL
      )
    })

    it('should fallback to static config if DB returns null', async () => {
      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(db.query).mockResolvedValue({ rows: [] })
      vi.mocked(cache.set).mockResolvedValue(undefined)

      const result = await getOperationConfig('assistant-ia')

      expect(result.source).toBe('static')
      expect(result.operationName).toBe('assistant-ia')
    })

    it('should use static config if use_static_config=true', async () => {
      const dbConfig = {
        id: 'test-id',
        operation_name: 'assistant-ia',
        use_static_config: true,
      }

      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(db.query).mockResolvedValue({ rows: [dbConfig] })
      vi.mocked(cache.set).mockResolvedValue(undefined)

      const result = await getOperationConfig('assistant-ia')

      expect(result.source).toBe('static')
    })

    it('should respect DYNAMIC_OPERATION_CONFIG=false', async () => {
      // Mock process.env
      const originalEnv = process.env.DYNAMIC_OPERATION_CONFIG
      process.env.DYNAMIC_OPERATION_CONFIG = 'false'

      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(cache.set).mockResolvedValue(undefined)

      const result = await getOperationConfig('assistant-ia')

      expect(result.source).toBe('static')
      expect(db.query).not.toHaveBeenCalled()

      // Restore env
      if (originalEnv !== undefined) {
        process.env.DYNAMIC_OPERATION_CONFIG = originalEnv
      } else {
        delete process.env.DYNAMIC_OPERATION_CONFIG
      }
    })
  })

  describe('updateOperationConfig', () => {
    it('should update config and invalidate cache', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        primaryProvider: 'groq',
        fallbackProviders: ['gemini'],
        enabledProviders: ['groq', 'gemini'],
        timeoutChat: 30000,
        timeoutTotal: 45000,
      }

      const updates = {
        primaryProvider: 'gemini',
        timeoutChat: 35000,
      }

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [currentConfig] }) // Fetch current
        .mockResolvedValueOnce({ rows: [{ ...currentConfig, ...updates }] }) // Update
        .mockResolvedValueOnce({ rows: [] }) // Audit log

      vi.mocked(cache.del).mockResolvedValue(1)

      const result = await updateOperationConfig('assistant-ia', updates, 'test-user')

      expect(result.success).toBe(true)
      expect(result.config?.primaryProvider).toBe('gemini')
      expect(cache.del).toHaveBeenCalledWith('operation-config:assistant-ia')
    })

    it('should validate primary provider is in enabled providers', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        primaryProvider: 'groq',
        enabledProviders: ['groq', 'gemini'],
      }

      const updates = {
        primaryProvider: 'deepseek', // Not in enabled providers
      }

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [currentConfig] })

      const result = await updateOperationConfig('assistant-ia', updates, 'test-user')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Provider primaire doit être dans la liste')
    })

    it('should validate timeouts are coherent', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        timeoutChat: 30000,
        timeoutTotal: 45000,
      }

      const updates = {
        timeoutChat: 50000, // > timeoutTotal
      }

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [currentConfig] })

      const result = await updateOperationConfig('assistant-ia', updates, 'test-user')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Timeout chat doit être ≤ timeout total')
    })

    it('should require at least 1 enabled provider', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        enabledProviders: ['groq'],
      }

      const updates = {
        enabledProviders: [], // Empty!
      }

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [currentConfig] })

      const result = await updateOperationConfig('assistant-ia', updates, 'test-user')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Au moins un provider doit être actif')
    })

    it('should prevent circular dependencies', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        primaryProvider: 'groq',
        fallbackProviders: ['gemini'],
      }

      const updates = {
        primaryProvider: 'groq',
        fallbackProviders: ['groq', 'gemini'], // Primary in fallback!
      }

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [currentConfig] })

      const result = await updateOperationConfig('assistant-ia', updates, 'test-user')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/primaire ne peut pas être dans.*fallback/i)
    })
  })

  describe('resetOperationConfig', () => {
    it('should reset to static config values', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
        primaryProvider: 'gemini', // Modified
        timeoutChat: 50000, // Modified
      }

      vi.mocked(db.query)
        .mockResolvedValueOnce({
          rows: [
            {
              ...currentConfig,
              primary_provider: 'groq', // Reset to default
              timeout_chat: 30000, // Reset to default
            },
          ],
        }) // Update
        .mockResolvedValueOnce({ rows: [] }) // Audit log

      vi.mocked(cache.del).mockResolvedValue(1)

      const result = await resetOperationConfig('assistant-ia', 'test-user')

      expect(result.success).toBe(true)
      expect(db.query).toHaveBeenCalled()
      expect(cache.del).toHaveBeenCalledWith('operation-config:assistant-ia')
    })
  })

  describe('clearOperationConfigCache', () => {
    it('should clear cache for specific operation', async () => {
      vi.mocked(cache.del).mockResolvedValue(1)

      await clearOperationConfigCache('assistant-ia')

      expect(cache.del).toHaveBeenCalledWith('operation-config:assistant-ia')
      expect(cache.del).toHaveBeenCalledTimes(1)
    })

    it('should clear cache for all operations if no name provided', async () => {
      vi.mocked(cache.del).mockResolvedValue(1)

      await clearOperationConfigCache()

      // Should clear 6 operations
      expect(cache.del).toHaveBeenCalledTimes(6)
      expect(cache.del).toHaveBeenCalledWith('operation-config:indexation')
      expect(cache.del).toHaveBeenCalledWith('operation-config:assistant-ia')
      expect(cache.del).toHaveBeenCalledWith('operation-config:dossiers-assistant')
      expect(cache.del).toHaveBeenCalledWith('operation-config:dossiers-consultation')
      expect(cache.del).toHaveBeenCalledWith('operation-config:kb-quality-analysis')
      expect(cache.del).toHaveBeenCalledWith('operation-config:kb-quality-analysis-short')
    })
  })

  describe('Cache TTL behavior', () => {
    it('should use 120s (2-min) TTL for cache', async () => {
      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(db.query).mockResolvedValue({ rows: [] })
      vi.mocked(cache.set).mockResolvedValue(undefined)

      await getOperationConfig('assistant-ia')

      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        120 // 2-min TTL
      )
    })
  })

  describe('Error handling', () => {
    it('should handle DB errors gracefully', async () => {
      vi.mocked(cache.get).mockResolvedValue(null)
      vi.mocked(db.query).mockRejectedValue(new Error('DB connection failed'))
      vi.mocked(cache.set).mockResolvedValue(undefined)

      // Should fallback to static config on error
      const result = await getOperationConfig('assistant-ia')

      expect(result.source).toBe('static')
    })

    it('should return error on update failure', async () => {
      const currentConfig = {
        id: 'test-id',
        operationName: 'assistant-ia',
      }

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [currentConfig] })
        .mockRejectedValueOnce(new Error('Update failed'))

      const result = await updateOperationConfig(
        'assistant-ia',
        { primaryProvider: 'gemini' },
        'test-user'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Update failed')
    })
  })
})
