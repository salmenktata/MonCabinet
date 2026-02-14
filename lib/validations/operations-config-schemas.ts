/**
 * Schémas de validation Zod pour configuration IA dynamique
 *
 * Valide les payloads API et garantit la cohérence des données.
 *
 * @see lib/config/operations-config-service.ts
 * @see app/api/admin/operations-config
 */

import { z } from 'zod'

// =============================================================================
// BASE SCHEMAS
// =============================================================================

/**
 * Provider LLM (chat)
 */
export const providerSchema = z.enum([
  'groq',
  'gemini',
  'deepseek',
  'openai',
  'anthropic',
  'ollama',
])

/**
 * Provider embeddings
 */
export const embeddingsProviderSchema = z.enum(['openai', 'ollama'])

/**
 * Nom d'opération
 */
export const operationNameSchema = z.enum([
  'indexation',
  'assistant-ia',
  'dossiers-assistant',
  'dossiers-consultation',
  'kb-quality-analysis',
  'kb-quality-analysis-short',
])

/**
 * Catégorie d'opération
 */
export const operationCategorySchema = z.enum([
  'chat',
  'indexation',
  'dossiers',
  'quality',
  'general',
])

/**
 * Type de changement
 */
export const changeTypeSchema = z.enum([
  'create',
  'update',
  'delete',
  'reset',
  'enable',
  'disable',
])

// =============================================================================
// CONFIGURATION SCHEMAS
// =============================================================================

/**
 * Configuration providers (primary + fallback)
 */
export const providersConfigSchema = z
  .object({
    primary: providerSchema,
    fallback: z.array(providerSchema).min(1, 'Au moins 1 provider de fallback requis'),
  })
  .refine((data) => !data.fallback.includes(data.primary), {
    message: 'Le provider primaire ne peut pas être dans la liste de fallback',
    path: ['fallback'],
  })

/**
 * Timeouts (milliseconds)
 */
export const timeoutsSchema = z
  .object({
    embedding: z
      .number()
      .int()
      .min(1000, 'Timeout embedding minimum: 1000ms')
      .max(60000, 'Timeout embedding maximum: 60000ms')
      .optional()
      .nullable(),
    chat: z
      .number()
      .int()
      .min(5000, 'Timeout chat minimum: 5000ms')
      .max(120000, 'Timeout chat maximum: 120000ms'),
    total: z
      .number()
      .int()
      .min(10000, 'Timeout total minimum: 10000ms')
      .max(180000, 'Timeout total maximum: 180000ms'),
  })
  .refine((data) => data.chat <= data.total, {
    message: 'Timeout chat doit être ≤ timeout total',
    path: ['chat'],
  })

/**
 * Configuration LLM
 */
export const llmConfigSchema = z.object({
  temperature: z
    .number()
    .min(0, 'Temperature minimum: 0')
    .max(2, 'Temperature maximum: 2'),
  maxTokens: z
    .number()
    .int()
    .min(100, 'Max tokens minimum: 100')
    .max(16000, 'Max tokens maximum: 16000'),
})

/**
 * Configuration embeddings
 */
export const embeddingsConfigSchema = z
  .object({
    provider: embeddingsProviderSchema.nullable(),
    fallbackProvider: embeddingsProviderSchema.nullable(),
    model: z.string().min(1).max(100).nullable(),
    dimensions: z
      .number()
      .int()
      .min(128)
      .max(3072)
      .nullable(),
  })
  .refine(
    (data) => {
      // Si provider défini, fallback ne peut pas être identique
      if (data.provider && data.fallbackProvider) {
        return data.provider !== data.fallbackProvider
      }
      return true
    },
    {
      message: 'Provider embeddings et fallback ne peuvent pas être identiques',
      path: ['fallbackProvider'],
    }
  )
  .refine(
    (data) => {
      // Si provider défini, model et dimensions requis
      if (data.provider) {
        return data.model && data.dimensions
      }
      return true
    },
    {
      message: 'Model et dimensions requis quand provider est défini',
      path: ['model'],
    }
  )

// =============================================================================
// UPDATE/CREATE SCHEMAS
// =============================================================================

/**
 * Payload pour update partiel de configuration
 */
export const operationConfigUpdateSchema = z
  .object({
    description: z.string().max(500).optional(),

    // Providers
    primaryProvider: providerSchema.optional(),
    fallbackProviders: z.array(providerSchema).min(1).optional(),
    enabledProviders: z.array(providerSchema).min(1).optional(),

    // Embeddings
    embeddingsProvider: embeddingsProviderSchema.nullable().optional(),
    embeddingsFallbackProvider: embeddingsProviderSchema.nullable().optional(),
    embeddingsModel: z.string().min(1).max(100).nullable().optional(),
    embeddingsDimensions: z.number().int().min(128).max(3072).nullable().optional(),

    // Timeouts
    timeoutEmbedding: z.number().int().min(1000).max(60000).nullable().optional(),
    timeoutChat: z.number().int().min(5000).max(120000).optional(),
    timeoutTotal: z.number().int().min(10000).max(180000).optional(),

    // LLM
    llmTemperature: z.number().min(0).max(2).optional(),
    llmMaxTokens: z.number().int().min(100).max(16000).optional(),

    // State
    isActive: z.boolean().optional(),
    useStaticConfig: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ requis pour mise à jour',
  })
  .refine(
    (data) => {
      // Valider cohérence timeouts si fournis
      if (data.timeoutChat && data.timeoutTotal) {
        return data.timeoutChat <= data.timeoutTotal
      }
      return true
    },
    {
      message: 'Timeout chat doit être ≤ timeout total',
      path: ['timeoutChat'],
    }
  )
  .refine(
    (data) => {
      // Primary provider doit être dans enabled providers
      if (data.primaryProvider && data.enabledProviders) {
        return data.enabledProviders.includes(data.primaryProvider)
      }
      return true
    },
    {
      message: 'Provider primaire doit être dans la liste des providers actifs',
      path: ['primaryProvider'],
    }
  )
  .refine(
    (data) => {
      // Fallback providers doivent tous être dans enabled providers
      if (data.fallbackProviders && data.enabledProviders) {
        return data.fallbackProviders.every((p) => data.enabledProviders!.includes(p))
      }
      return true
    },
    {
      message: 'Tous les providers de fallback doivent être actifs',
      path: ['fallbackProviders'],
    }
  )

/**
 * Payload pour création complète de configuration
 */
export const operationConfigCreateSchema = z.object({
  operationName: operationNameSchema,
  displayName: z.string().min(1).max(200),
  description: z.string().max(500).nullable(),
  category: operationCategorySchema,

  primaryProvider: providerSchema,
  fallbackProviders: z.array(providerSchema).min(1),
  enabledProviders: z.array(providerSchema).min(1),

  embeddingsProvider: embeddingsProviderSchema.nullable(),
  embeddingsFallbackProvider: embeddingsProviderSchema.nullable(),
  embeddingsModel: z.string().min(1).max(100).nullable(),
  embeddingsDimensions: z.number().int().min(128).max(3072).nullable(),

  timeoutEmbedding: z.number().int().min(1000).max(60000).nullable(),
  timeoutChat: z.number().int().min(5000).max(120000),
  timeoutTotal: z.number().int().min(10000).max(180000),

  llmTemperature: z.number().min(0).max(2),
  llmMaxTokens: z.number().int().min(100).max(16000),

  createdBy: z.string().min(1).max(255),
})

/**
 * Payload pour test provider
 */
export const providerTestSchema = z.object({
  provider: providerSchema,
  testType: z.enum(['chat', 'embedding']),
  operationName: operationNameSchema.optional(),
})

// =============================================================================
// AUDIT SCHEMAS
// =============================================================================

/**
 * Historique de changement
 */
export const configChangeHistorySchema = z.object({
  operationName: operationNameSchema,
  changeType: changeTypeSchema,
  changedFields: z.array(z.string()),
  oldValues: z.record(z.any()).nullable(),
  newValues: z.record(z.any()).nullable(),
  changedBy: z.string().min(1).max(255),
  changeReason: z.string().max(500).nullable().optional(),
})

// =============================================================================
// QUERY PARAMS SCHEMAS
// =============================================================================

/**
 * Filtres pour liste configurations
 */
export const operationsConfigFilterSchema = z.object({
  category: operationCategorySchema.optional(),
  isActive: z.boolean().optional(),
  primaryProvider: providerSchema.optional(),
})

/**
 * Tri pour liste configurations
 */
export const operationsConfigSortSchema = z.object({
  field: z.enum(['operationName', 'updatedAt', 'category', 'primaryProvider']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Valide que les providers ont des clés API disponibles
 */
export async function validateProvidersHaveKeys(
  providers: string[],
  getApiKey: (provider: string) => Promise<boolean>
): Promise<{ valid: boolean; missingKeys: string[] }> {
  const missingKeys: string[] = []

  for (const provider of providers) {
    // Ollama n'a pas besoin de clé API (local)
    if (provider === 'ollama') continue

    const hasKey = await getApiKey(provider)
    if (!hasKey) {
      missingKeys.push(provider)
    }
  }

  return {
    valid: missingKeys.length === 0,
    missingKeys,
  }
}

/**
 * Valide qu'il n'y a pas de dépendance circulaire
 */
export function validateNoCircularDeps(
  primary: string,
  fallback: string[]
): { valid: boolean; error?: string } {
  if (fallback.includes(primary)) {
    return {
      valid: false,
      error: `Provider primaire "${primary}" ne peut pas être dans la liste de fallback`,
    }
  }

  // Vérifier doublons dans fallback
  const uniqueFallback = new Set(fallback)
  if (uniqueFallback.size !== fallback.length) {
    return {
      valid: false,
      error: 'Doublons détectés dans la liste de fallback',
    }
  }

  return { valid: true }
}

/**
 * Valide cohérence timeouts
 */
export function validateTimeouts(timeouts: {
  embedding?: number | null
  chat: number
  total: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (timeouts.embedding && timeouts.embedding > timeouts.chat) {
    errors.push('Timeout embedding doit être ≤ timeout chat')
  }

  if (timeouts.chat > timeouts.total) {
    errors.push('Timeout chat doit être ≤ timeout total')
  }

  if (timeouts.embedding && timeouts.embedding > timeouts.total) {
    errors.push('Timeout embedding doit être ≤ timeout total')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
