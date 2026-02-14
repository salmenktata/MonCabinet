/**
 * Service de gestion dynamique des configurations IA par opération
 *
 * Responsabilités:
 * - CRUD configurations (get, update, reset)
 * - Merge DB + config statique (backward compat)
 * - Cache 2-min TTL (invalidation auto)
 * - Audit trail logging
 * - Test provider connectivity
 *
 * @see migrations/20260215_create_operation_provider_configs.sql
 * @see lib/types/ai-config.types.ts
 */

import { db } from '@/lib/db'
import { cache } from '@/lib/cache'
import {
  AI_OPERATIONS_CONFIG,
  type OperationName,
  getOperationConfig as getStaticConfig,
} from '@/lib/ai/operations-config'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'
import type {
  OperationProviderConfig,
  OperationConfigUpdatePayload,
  OperationConfigCreatePayload,
  AIConfigChangeHistory,
  MergedOperationConfig,
  ProviderTestResult,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '@/lib/types/ai-config.types'
import {
  operationConfigUpdateSchema,
  operationConfigCreateSchema,
  validateProvidersHaveKeys,
  validateNoCircularDeps,
  validateTimeouts,
} from '@/lib/validations/operations-config-schemas'
import { callLLM } from '@/lib/ai/llm-fallback-service'
import { getDecryptedApiKey } from '@/lib/config/platform-config'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CACHE_PREFIX = 'operation-config'
const CACHE_TTL_SECONDS = 120 // 2 minutes (vs 5min pour platform_config)

/**
 * Feature flag pour activer configuration dynamique
 * Si false, utilise uniquement config statique (operations-config.ts)
 */
const DYNAMIC_CONFIG_ENABLED =
  process.env.DYNAMIC_OPERATION_CONFIG === 'true' ||
  process.env.NEXT_PUBLIC_DYNAMIC_OPERATION_CONFIG === 'true'

// =============================================================================
// GET CONFIGURATION
// =============================================================================

/**
 * Récupère configuration merged (DB override static)
 *
 * Flow:
 * 1. Check cache (2-min TTL)
 * 2. Si feature flag disabled → retourne config statique
 * 3. Fetch DB
 * 4. Si DB vide ou use_static_config=true → retourne config statique
 * 5. Merge DB + static config (DB prioritaire)
 * 6. Cache + retourne
 */
export async function getOperationConfig(
  operationName: OperationName
): Promise<MergedOperationConfig> {
  const cacheKey = `${CACHE_PREFIX}:${operationName}`

  // 1. Check cache
  const cached = await cache.get<MergedOperationConfig>(cacheKey)
  if (cached) {
    return cached
  }

  // 2. Feature flag disabled → static config only
  if (!DYNAMIC_CONFIG_ENABLED) {
    const staticConfig = getStaticConfig(operationName)
    const mergedConfig = mapStaticToMerged(operationName, staticConfig)
    await cache.set(cacheKey, mergedConfig, CACHE_TTL_SECONDS)
    return mergedConfig
  }

  // 3. Fetch DB
  const dbConfig = await fetchOperationConfigFromDB(operationName)

  // 4. DB vide ou use_static_config=true → static
  if (!dbConfig || dbConfig.useStaticConfig) {
    const staticConfig = getStaticConfig(operationName)
    const mergedConfig = mapStaticToMerged(operationName, staticConfig)
    mergedConfig.source = dbConfig?.useStaticConfig ? 'static' : 'merged'
    await cache.set(cacheKey, mergedConfig, CACHE_TTL_SECONDS)
    return mergedConfig
  }

  // 5. Merge DB + static (DB prioritaire)
  const mergedConfig: MergedOperationConfig = {
    ...dbConfig,
    source: 'database',
    staticConfig: getStaticConfig(operationName),
  }

  // 6. Cache + retourne
  await cache.set(cacheKey, mergedConfig, CACHE_TTL_SECONDS)
  return mergedConfig
}

/**
 * Liste toutes les configurations
 */
export async function getAllOperationsConfigs(): Promise<MergedOperationConfig[]> {
  const operations: OperationName[] = [
    'indexation',
    'assistant-ia',
    'dossiers-assistant',
    'dossiers-consultation',
    'kb-quality-analysis',
    'kb-quality-analysis-short',
  ]

  return Promise.all(operations.map((op) => getOperationConfig(op)))
}

/**
 * Fetch config depuis DB (raw)
 */
async function fetchOperationConfigFromDB(
  operationName: OperationName
): Promise<OperationProviderConfig | null> {
  try {
    const result = await db.query<OperationProviderConfig>(
      `
      SELECT
        id,
        operation_name AS "operationName",
        display_name AS "displayName",
        description,
        category,
        primary_provider AS "primaryProvider",
        fallback_providers AS "fallbackProviders",
        enabled_providers AS "enabledProviders",
        embeddings_provider AS "embeddingsProvider",
        embeddings_fallback_provider AS "embeddingsFallbackProvider",
        embeddings_model AS "embeddingsModel",
        embeddings_dimensions AS "embeddingsDimensions",
        timeout_embedding AS "timeoutEmbedding",
        timeout_chat AS "timeoutChat",
        timeout_total AS "timeoutTotal",
        llm_temperature AS "llmTemperature",
        llm_max_tokens AS "llmMaxTokens",
        is_active AS "isActive",
        use_static_config AS "useStaticConfig",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        created_by AS "createdBy",
        updated_by AS "updatedBy"
      FROM operation_provider_configs
      WHERE operation_name = $1 AND is_active = true
      LIMIT 1
      `,
      [operationName]
    )

    return result.rows[0] || null
  } catch (error) {
    console.error(`[OperationsConfigService] Error fetching config for ${operationName}:`, error)
    return null
  }
}

// =============================================================================
// UPDATE CONFIGURATION
// =============================================================================

/**
 * Met à jour configuration (partial update)
 *
 * Flow:
 * 1. Valide payload (Zod + business rules)
 * 2. Fetch config actuelle
 * 3. Merge updates
 * 4. Save DB
 * 5. Log audit trail
 * 6. Invalide cache
 * 7. Retourne config updated
 */
export async function updateOperationConfig(
  operationName: OperationName,
  updates: OperationConfigUpdatePayload,
  userId: string
): Promise<{
  success: boolean
  config?: OperationProviderConfig
  error?: string
  warnings?: string[]
}> {
  try {
    // 1. Valide payload
    const validationResult = operationConfigUpdateSchema.safeParse(updates)
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error.errors[0].message,
      }
    }

    // 2. Fetch config actuelle
    const currentConfig = await fetchOperationConfigFromDB(operationName)
    if (!currentConfig) {
      return {
        success: false,
        error: `Configuration non trouvée pour operation "${operationName}"`,
      }
    }

    // 3. Business rules validation
    const businessValidation = await validateBusinessRules(updates, currentConfig)
    if (!businessValidation.valid) {
      return {
        success: false,
        error: businessValidation.errors[0]?.message || 'Validation échouée',
        warnings: businessValidation.warnings.map((w) => w.message),
      }
    }

    // 4. Merge updates
    const updatedFields = Object.keys(updates)
    const oldValues: Record<string, any> = {}
    const newValues: Record<string, any> = {}

    updatedFields.forEach((field) => {
      oldValues[field] = currentConfig[field as keyof OperationProviderConfig]
      newValues[field] = updates[field as keyof OperationConfigUpdatePayload]
    })

    // 5. Save DB
    const setClause = updatedFields
      .map((field, index) => {
        const dbField = camelToSnake(field)
        return `${dbField} = $${index + 2}`
      })
      .join(', ')

    const values = [operationName, ...updatedFields.map((f) => updates[f as keyof typeof updates])]

    const result = await db.query<OperationProviderConfig>(
      `
      UPDATE operation_provider_configs
      SET
        ${setClause},
        updated_at = NOW(),
        updated_by = $${values.length + 1}
      WHERE operation_name = $1
      RETURNING *
      `,
      [...values, userId]
    )

    const updatedConfig = result.rows[0]

    // 6. Log audit trail
    await logConfigChange({
      operationName,
      changeType: 'update',
      changedFields: updatedFields,
      oldValues,
      newValues,
      changedBy: userId,
    })

    // 7. Invalide cache
    await clearOperationConfigCache(operationName)

    return {
      success: true,
      config: updatedConfig,
      warnings: businessValidation.warnings.map((w) => w.message),
    }
  } catch (error) {
    console.error('[OperationsConfigService] Error updating config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

// =============================================================================
// RESET CONFIGURATION
// =============================================================================

/**
 * Reset configuration aux valeurs par défaut (config statique)
 */
export async function resetOperationConfig(
  operationName: OperationName,
  userId: string
): Promise<{
  success: boolean
  config?: OperationProviderConfig
  error?: string
}> {
  try {
    // 1. Récupère config statique
    const staticConfig = getStaticConfig(operationName)

    // 2. Map vers format DB
    const resetPayload = mapStaticToDBFormat(operationName, staticConfig)

    // 3. Update DB
    const result = await db.query<OperationProviderConfig>(
      `
      UPDATE operation_provider_configs
      SET
        primary_provider = $2,
        fallback_providers = $3,
        enabled_providers = $4,
        embeddings_provider = $5,
        embeddings_fallback_provider = $6,
        embeddings_model = $7,
        embeddings_dimensions = $8,
        timeout_embedding = $9,
        timeout_chat = $10,
        timeout_total = $11,
        llm_temperature = $12,
        llm_max_tokens = $13,
        use_static_config = false,
        updated_at = NOW(),
        updated_by = $14
      WHERE operation_name = $1
      RETURNING *
      `,
      [
        operationName,
        resetPayload.primaryProvider,
        JSON.stringify(resetPayload.fallbackProviders),
        JSON.stringify(resetPayload.enabledProviders),
        resetPayload.embeddingsProvider,
        resetPayload.embeddingsFallbackProvider,
        resetPayload.embeddingsModel,
        resetPayload.embeddingsDimensions,
        resetPayload.timeoutEmbedding,
        resetPayload.timeoutChat,
        resetPayload.timeoutTotal,
        resetPayload.llmTemperature,
        resetPayload.llmMaxTokens,
        userId,
      ]
    )

    // 4. Log audit
    await logConfigChange({
      operationName,
      changeType: 'reset',
      changedFields: ['all'],
      oldValues: null,
      newValues: resetPayload as any,
      changedBy: userId,
    })

    // 5. Invalide cache
    await clearOperationConfigCache(operationName)

    return {
      success: true,
      config: result.rows[0],
    }
  } catch (error) {
    console.error('[OperationsConfigService] Error resetting config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

// =============================================================================
// TEST PROVIDER
// =============================================================================

/**
 * Teste connectivité d'un provider
 */
export async function testProviderConnectivity(
  provider: LLMProvider,
  testType: 'chat' | 'embedding',
  operationName?: OperationName
): Promise<ProviderTestResult> {
  const startTime = Date.now()

  try {
    // 1. Vérifie clé API existe
    const apiKey = await getDecryptedApiKey(provider)
    if (!apiKey && provider !== 'ollama') {
      return {
        available: false,
        latencyMs: null,
        modelUsed: null,
        tokensUsed: null,
        error: `Clé API ${provider} non configurée`,
      }
    }

    // 2. Test simple selon type
    if (testType === 'chat') {
      const response = await callLLM(
        [{ role: 'user', content: 'Test connexion' }],
        {
          temperature: 0.1,
          maxTokens: 50,
          operationName,
        },
        provider
      )

      const latencyMs = Date.now() - startTime

      return {
        available: true,
        latencyMs,
        modelUsed: response.modelUsed,
        tokensUsed: response.tokensUsed,
      }
    } else {
      // Test embedding (TODO: implémenter test embedding)
      return {
        available: true,
        latencyMs: Date.now() - startTime,
        modelUsed: 'embedding-test',
        tokensUsed: { input: 0, output: 0, total: 0 },
      }
    }
  } catch (error) {
    return {
      available: false,
      latencyMs: Date.now() - startTime,
      modelUsed: null,
      tokensUsed: null,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Invalide cache pour une opération
 */
export async function clearOperationConfigCache(operationName?: OperationName): Promise<void> {
  if (operationName) {
    const cacheKey = `${CACHE_PREFIX}:${operationName}`
    await cache.del(cacheKey)
  } else {
    // Clear all operation configs
    const operations: OperationName[] = [
      'indexation',
      'assistant-ia',
      'dossiers-assistant',
      'dossiers-consultation',
      'kb-quality-analysis',
      'kb-quality-analysis-short',
    ]

    await Promise.all(operations.map((op) => cache.del(`${CACHE_PREFIX}:${op}`)))
  }
}

// =============================================================================
// AUDIT TRAIL
// =============================================================================

/**
 * Log changement dans audit trail
 */
async function logConfigChange(change: {
  operationName: OperationName
  changeType: 'create' | 'update' | 'delete' | 'reset' | 'enable' | 'disable'
  changedFields: string[]
  oldValues: Record<string, any> | null
  newValues: Record<string, any> | null
  changedBy: string
}): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO ai_config_change_history (
        operation_name, change_type, changed_fields,
        old_values, new_values, changed_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        change.operationName,
        change.changeType,
        change.changedFields,
        JSON.stringify(change.oldValues),
        JSON.stringify(change.newValues),
        change.changedBy,
      ]
    )
  } catch (error) {
    console.error('[OperationsConfigService] Error logging audit trail:', error)
    // Ne pas bloquer l'opération si audit échoue
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Valide business rules
 */
async function validateBusinessRules(
  updates: OperationConfigUpdatePayload,
  currentConfig: OperationProviderConfig
): Promise<ValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // 1. Au moins 1 provider enabled
  const enabledProviders = updates.enabledProviders || currentConfig.enabledProviders
  if (enabledProviders.length === 0) {
    errors.push({
      field: 'enabledProviders',
      message: 'Au moins un provider doit être actif',
      code: 'MIN_PROVIDERS',
    })
  }

  // 2. Primary provider dans enabled providers
  const primaryProvider = updates.primaryProvider || currentConfig.primaryProvider
  if (!enabledProviders.includes(primaryProvider)) {
    errors.push({
      field: 'primaryProvider',
      message: 'Provider primaire doit être dans la liste des providers actifs',
      code: 'PRIMARY_NOT_ENABLED',
    })
  }

  // 3. Pas de circular deps
  const fallbackProviders = updates.fallbackProviders || currentConfig.fallbackProviders
  const circularCheck = validateNoCircularDeps(primaryProvider, fallbackProviders)
  if (!circularCheck.valid) {
    errors.push({
      field: 'fallbackProviders',
      message: circularCheck.error!,
      code: 'CIRCULAR_DEPENDENCY',
    })
  }

  // 4. Timeouts cohérents
  const timeouts = {
    embedding: updates.timeoutEmbedding ?? currentConfig.timeoutEmbedding,
    chat: updates.timeoutChat ?? currentConfig.timeoutChat,
    total: updates.timeoutTotal ?? currentConfig.timeoutTotal,
  }
  const timeoutsCheck = validateTimeouts(timeouts)
  if (!timeoutsCheck.valid) {
    timeoutsCheck.errors.forEach((err) => {
      errors.push({
        field: 'timeouts',
        message: err,
        code: 'INVALID_TIMEOUTS',
      })
    })
  }

  // 5. Providers ont des clés API (warnings)
  const providersToCheck = [primaryProvider, ...fallbackProviders].filter(
    (p) => p !== 'ollama'
  )
  for (const provider of providersToCheck) {
    const hasKey = await getDecryptedApiKey(provider)
    if (!hasKey) {
      warnings.push({
        field: 'providers',
        message: `Provider "${provider}" n'a pas de clé API configurée`,
        severity: 'medium',
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convertit camelCase en snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Map config statique vers MergedOperationConfig
 */
function mapStaticToMerged(
  operationName: OperationName,
  staticConfig: any
): MergedOperationConfig {
  return {
    id: 'static',
    operationName,
    displayName: operationName,
    description: staticConfig.description || null,
    category: 'general',
    primaryProvider: staticConfig.providers?.primary || 'ollama',
    fallbackProviders: staticConfig.providers?.fallback || [],
    enabledProviders: [
      staticConfig.providers?.primary,
      ...(staticConfig.providers?.fallback || []),
    ],
    embeddingsProvider: staticConfig.embeddings?.provider || null,
    embeddingsFallbackProvider: staticConfig.embeddings?.fallbackProvider || null,
    embeddingsModel: staticConfig.embeddings?.model || null,
    embeddingsDimensions: staticConfig.embeddings?.dimensions || null,
    timeoutEmbedding: staticConfig.timeouts?.embedding || null,
    timeoutChat: staticConfig.timeouts?.chat || 30000,
    timeoutTotal: staticConfig.timeouts?.total || 45000,
    llmTemperature: staticConfig.llmConfig?.temperature || 0.3,
    llmMaxTokens: staticConfig.llmConfig?.maxTokens || 2000,
    isActive: true,
    useStaticConfig: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    source: 'static',
    staticConfig,
  }
}

/**
 * Map config statique vers format DB
 */
function mapStaticToDBFormat(operationName: OperationName, staticConfig: any): any {
  return {
    primaryProvider: staticConfig.providers?.primary || 'ollama',
    fallbackProviders: staticConfig.providers?.fallback || [],
    enabledProviders: [
      staticConfig.providers?.primary,
      ...(staticConfig.providers?.fallback || []),
    ],
    embeddingsProvider: staticConfig.embeddings?.provider || null,
    embeddingsFallbackProvider: staticConfig.embeddings?.fallbackProvider || null,
    embeddingsModel: staticConfig.embeddings?.model || null,
    embeddingsDimensions: staticConfig.embeddings?.dimensions || null,
    timeoutEmbedding: staticConfig.timeouts?.embedding || null,
    timeoutChat: staticConfig.timeouts?.chat || 30000,
    timeoutTotal: staticConfig.timeouts?.total || 45000,
    llmTemperature: staticConfig.llmConfig?.temperature || 0.3,
    llmMaxTokens: staticConfig.llmConfig?.maxTokens || 2000,
  }
}
