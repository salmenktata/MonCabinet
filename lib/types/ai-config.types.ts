/**
 * Types centralisés pour configuration IA dynamique
 *
 * Source unique de vérité pour tous types liés à la configuration
 * des providers IA par opération.
 *
 * @see lib/config/operations-config-service.ts
 * @see app/api/admin/operations-config
 */

import type { LLMProvider, AIContext } from '@/lib/ai/llm-fallback-service'
import type { OperationName } from '@/lib/ai/operations-config'

// =============================================================================
// DATABASE MODELS
// =============================================================================

/**
 * Modèle DB: operation_provider_configs
 */
export interface OperationProviderConfig {
  id: string
  operationName: OperationName
  displayName: string
  description: string | null
  category: OperationCategory

  // Providers chat/LLM
  primaryProvider: LLMProvider
  fallbackProviders: LLMProvider[]
  enabledProviders: LLMProvider[]

  // Embeddings
  embeddingsProvider: EmbeddingsProvider | null
  embeddingsFallbackProvider: EmbeddingsProvider | null
  embeddingsModel: string | null
  embeddingsDimensions: number | null

  // Timeouts
  timeoutEmbedding: number | null
  timeoutChat: number
  timeoutTotal: number

  // LLM config
  llmTemperature: number
  llmMaxTokens: number

  // State
  isActive: boolean
  useStaticConfig: boolean

  // Source (database, static, ou merged)
  source?: 'database' | 'static' | 'merged'

  // Audit
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
  updatedBy: string | null
}

/**
 * Modèle DB: ai_config_change_history
 */
export interface AIConfigChangeHistory {
  id: string
  configId: string | null
  operationName: OperationName
  changeType: ConfigChangeType
  changedFields: string[]
  oldValues: Record<string, any> | null
  newValues: Record<string, any> | null
  changedAt: Date
  changedBy: string
  changeReason: string | null
}

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export type OperationCategory = 'chat' | 'indexation' | 'dossiers' | 'quality' | 'general'

export type EmbeddingsProvider = 'openai' | 'ollama'

export type ConfigChangeType = 'create' | 'update' | 'delete' | 'reset' | 'enable' | 'disable'

/**
 * Labels français par opération
 */
export const OPERATION_LABELS: Record<OperationName, { fr: string; ar: string }> = {
  'assistant-ia': {
    fr: 'Assistant IA',
    ar: 'المساعد الذكي',
  },
  'indexation': {
    fr: 'Indexation KB',
    ar: 'فهرسة قاعدة المعرفة',
  },
  'dossiers-assistant': {
    fr: 'Assistant Dossiers',
    ar: 'مساعد الملفات',
  },
  'dossiers-structuration': {
    fr: 'Structuration Dossier',
    ar: 'هيكلة الملف',
  },
  'dossiers-consultation': {
    fr: 'Consultation Juridique',
    ar: 'الاستشارة القانونية',
  },
  'kb-quality-analysis': {
    fr: 'Analyse Qualité KB',
    ar: 'تحليل جودة قاعدة المعرفة',
  },
  'query-classification': {
    fr: 'Classification de requête',
    ar: 'تصنيف الاستعلام',
  },
  'query-expansion': {
    fr: 'Expansion de requête',
    ar: 'توسيع الاستعلام',
  },
  'document-consolidation': {
    fr: 'Consolidation documents',
    ar: 'توحيد الوثائق',
  },
  'rag-eval-judge': {
    fr: 'Évaluation RAG',
    ar: 'تقييم RAG',
  },
}

/**
 * Descriptions détaillées par opération
 */
export const OPERATION_DESCRIPTIONS: Record<OperationName, string> = {
  'assistant-ia': 'Chat utilisateur en temps réel avec recherche RAG (performance critique)',
  'indexation': 'Indexation documents KB en batch (background processing)',
  'dossiers-assistant': 'Analyse approfondie de dossiers juridiques (qualité prioritaire)',
  'dossiers-structuration': 'Structuration narratif → JSON structuré (Groq, temps réel)',
  'dossiers-consultation': 'Génération de consultation juridique formelle IRAC',
  'kb-quality-analysis': 'Analyse qualité documents KB (OpenAI gpt-4o-mini)',
  'query-classification': 'Classification automatique de la requête utilisateur',
  'query-expansion': 'Reformulation et expansion de requêtes courtes',
  'document-consolidation': 'Consolidation documents multi-pages en documents juridiques unifiés',
  'rag-eval-judge': 'LLM judge pour évaluer la fidélité des réponses RAG',
}

/**
 * Catégories visuelles
 */
export const CATEGORY_COLORS: Record<OperationCategory, string> = {
  chat: 'bg-blue-500',
  indexation: 'bg-green-500',
  dossiers: 'bg-purple-500',
  quality: 'bg-orange-500',
  general: 'bg-gray-500',
}

// =============================================================================
// UPDATE PAYLOADS
// =============================================================================

/**
 * Payload pour mise à jour configuration
 * (tous champs optionnels pour partial update)
 */
export interface OperationConfigUpdatePayload {
  description?: string
  primaryProvider?: LLMProvider
  fallbackProviders?: LLMProvider[]
  enabledProviders?: LLMProvider[]
  embeddingsProvider?: EmbeddingsProvider | null
  embeddingsFallbackProvider?: EmbeddingsProvider | null
  embeddingsModel?: string | null
  embeddingsDimensions?: number | null
  timeoutEmbedding?: number | null
  timeoutChat?: number
  timeoutTotal?: number
  llmTemperature?: number
  llmMaxTokens?: number
  isActive?: boolean
  useStaticConfig?: boolean
}

/**
 * Payload pour création configuration (tous champs requis)
 */
export interface OperationConfigCreatePayload {
  operationName: OperationName
  displayName: string
  description: string | null
  category: OperationCategory
  primaryProvider: LLMProvider
  fallbackProviders: LLMProvider[]
  enabledProviders: LLMProvider[]
  embeddingsProvider: EmbeddingsProvider | null
  embeddingsFallbackProvider: EmbeddingsProvider | null
  embeddingsModel: string | null
  embeddingsDimensions: number | null
  timeoutEmbedding: number | null
  timeoutChat: number
  timeoutTotal: number
  llmTemperature: number
  llmMaxTokens: number
  createdBy: string
}

// =============================================================================
// API RESPONSES
// =============================================================================

/**
 * Réponse GET /api/admin/operations-config
 */
export interface OperationsConfigListResponse {
  success: boolean
  operations: OperationProviderConfig[]
  metadata: {
    totalOperations: number
    customConfigs: number
    availableProviders: LLMProvider[]
  }
}

/**
 * Réponse GET /api/admin/operations-config/[operationName]
 */
export interface OperationConfigDetailResponse {
  success: boolean
  operation: OperationProviderConfig
  providerAvailability: Record<LLMProvider, ProviderAvailability>
}

/**
 * Réponse PUT /api/admin/operations-config/[operationName]
 */
export interface OperationConfigUpdateResponse {
  success: boolean
  operation: OperationProviderConfig
  changes: {
    fields: string[]
    previous: Partial<OperationProviderConfig>
    current: Partial<OperationProviderConfig>
  }
  warnings: string[]
}

/**
 * Réponse POST /api/admin/operations-config/test-provider
 */
export interface ProviderTestResponse {
  success: boolean
  provider: LLMProvider
  result: ProviderTestResult
}

/**
 * Disponibilité d'un provider
 */
export interface ProviderAvailability {
  available: boolean
  hasApiKey: boolean
  lastError: string | null
  latencyMs?: number
}

/**
 * Résultat d'un test provider
 */
export interface ProviderTestResult {
  available: boolean
  latencyMs: number | null
  modelUsed: string | null
  tokensUsed: {
    input: number
    output: number
    total: number
  } | null
  error?: string
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Résultat de validation
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

/**
 * Erreur de validation
 */
export interface ValidationError {
  field: string
  message: string
  code: string
}

/**
 * Warning de validation
 */
export interface ValidationWarning {
  field: string
  message: string
  severity: 'low' | 'medium' | 'high'
}

// =============================================================================
// UTILS
// =============================================================================

/**
 * Configuration merged (DB + static fallback)
 */
export interface MergedOperationConfig extends OperationProviderConfig {
  source: 'database' | 'static' | 'merged'
  staticConfig?: any
}

/**
 * Statistiques d'utilisation provider
 */
export interface ProviderUsageStats {
  provider: LLMProvider
  operationsCount: number
  primaryCount: number
  fallbackCount: number
  enabledCount: number
  operationsPrimary: OperationName[]
  operationsFallback: OperationName[]
}
