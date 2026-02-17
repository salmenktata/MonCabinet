/**
 * Configuration IA par type d'opération métier - Mode No-Fallback
 *
 * Chaque opération utilise UN SEUL modèle fixe (pas de cascade).
 * Si le provider échoue → throw + alerte email (pas de dégradation silencieuse).
 *
 * Configuration définitive RAG Haute Qualité (Février 2026)
 */

import type { LLMProvider } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types d'opérations métier supportés
 */
export type OperationName =
  | 'indexation'
  | 'assistant-ia'
  | 'dossiers-assistant'
  | 'dossiers-consultation'
  | 'kb-quality-analysis'
  | 'query-classification'
  | 'query-expansion'
  | 'document-consolidation'

/**
 * Sévérité d'alerte en cas d'échec
 */
export type AlertSeverity = 'critical' | 'warning' | 'info'

/**
 * Configuration IA pour une opération spécifique - Mode No-Fallback
 */
export interface OperationAIConfig {
  // Modèle unique fixe pour cette opération
  model: {
    provider: LLMProvider
    name: string
  }

  // Configuration embeddings (si applicable)
  embeddings?: {
    provider: 'ollama' | 'openai' | 'gemini'
    model: string
    dimensions: number
  }

  // Timeouts spécifiques (en ms)
  timeouts?: {
    chat?: number
    embedding?: number
    total?: number
  }

  // Paramètres LLM
  llmConfig?: {
    temperature: number
    maxTokens: number
    systemPromptType?: 'chat' | 'consultation' | 'structuration'
  }

  // Alertes en cas d'échec
  alerts: {
    onFailure: 'email' | 'log'
    severity: AlertSeverity
  }

  // Description pour monitoring/debug
  description: string
}

// =============================================================================
// CONFIGURATION PAR OPÉRATION - MODE NO-FALLBACK
// =============================================================================

const isDev = process.env.NODE_ENV === 'development'

/**
 * Configuration centralisée - 1 modèle fixe par opération, 0 fallback
 *
 * | Opération              | Provider | Modèle                    | Coût     |
 * |------------------------|----------|---------------------------|----------|
 * | Assistant IA (chat)    | Gemini   | gemini-2.5-flash          | 0€       |
 * | Dossiers Assistant     | Gemini   | gemini-2.5-flash          | 0€       |
 * | Consultations IRAC     | Gemini   | gemini-2.5-flash          | 0€       |
 * | KB Quality Analysis    | OpenAI   | gpt-4o-mini               | ~$3/mois |
 * | Query Classification   | Groq     | llama-3.3-70b-versatile   | 0€       |
 * | Query Expansion        | Groq     | llama-3.3-70b-versatile   | 0€       |
 * | Embeddings (tout)      | OpenAI   | text-embedding-3-small    | ~$2-5/mois |
 * | Re-ranking             | Local    | ms-marco-MiniLM-L-6-v2    | 0€       |
 * | Dev local              | Ollama   | qwen3:8b                  | 0€       |
 */
export const AI_OPERATIONS_CONFIG: Record<OperationName, OperationAIConfig> = {
  // ---------------------------------------------------------------------------
  // 1. INDEXATION (background processing)
  // ---------------------------------------------------------------------------
  'indexation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'ollama', name: 'qwen3:8b' }, // Ollama pour classification (gratuit)

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 10000,
      chat: 30000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 2000,
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Indexation KB - Ollama classification + OpenAI embeddings',
  },

  // ---------------------------------------------------------------------------
  // 2. ASSISTANT IA (chat temps réel utilisateur)
  // ---------------------------------------------------------------------------
  'assistant-ia': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'gemini', name: 'gemini-2.5-flash' },

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 3000,
      chat: 30000,
      total: 45000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Chat utilisateur temps réel - Gemini 2.5 Flash',
  },

  // ---------------------------------------------------------------------------
  // 3. ASSISTANT DOSSIERS (analyse approfondie)
  // ---------------------------------------------------------------------------
  'dossiers-assistant': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'gemini', name: 'gemini-2.5-flash' },

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 5000,
      chat: 40000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 8000,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Analyse approfondie dossier - Gemini (contexte 1M tokens)',
  },

  // ---------------------------------------------------------------------------
  // 4. ANALYSE QUALITÉ KB (tous documents, courts et longs)
  // ---------------------------------------------------------------------------
  'kb-quality-analysis': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'openai', name: 'gpt-4o-mini' },

    timeouts: {
      chat: 30000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 4000,
    },

    alerts: { onFailure: 'email', severity: 'warning' },
    description: 'Analyse qualité documents KB - OpenAI gpt-4o-mini (strict JSON)',
  },

  // ---------------------------------------------------------------------------
  // 5. CONSULTATION (génération formelle IRAC)
  // ---------------------------------------------------------------------------
  'dossiers-consultation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'gemini', name: 'gemini-2.5-flash' },

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 5000,
      chat: 30000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 4000,
      systemPromptType: 'consultation',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Consultation juridique formelle IRAC - Gemini',
  },

  // ---------------------------------------------------------------------------
  // 6. QUERY CLASSIFICATION (pré-filtrage KB)
  // ---------------------------------------------------------------------------
  'query-classification': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'groq', name: 'llama-3.3-70b-versatile' },

    timeouts: {
      chat: 5000,
      total: 10000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 500,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Classification query pour filtrage catégories KB - Groq',
  },

  // ---------------------------------------------------------------------------
  // 7. QUERY EXPANSION (reformulation requêtes courtes)
  // ---------------------------------------------------------------------------
  'query-expansion': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'groq', name: 'llama-3.3-70b-versatile' },

    timeouts: {
      chat: 5000,
      total: 10000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 200,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Expansion queries courtes <50 chars - Groq',
  },

  // ---------------------------------------------------------------------------
  // 8. CONSOLIDATION DOCUMENTS (multi-pages → 1 document)
  // ---------------------------------------------------------------------------
  'document-consolidation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'gemini', name: 'gemini-2.5-flash' },

    timeouts: {
      chat: 60000,
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 16000,
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Consolidation documents multi-pages - Gemini contexte 1M tokens',
  },
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Récupère la configuration pour une opération donnée
 */
export function getOperationConfig(operation: OperationName): OperationAIConfig {
  return AI_OPERATIONS_CONFIG[operation]
}

/**
 * Vérifie si une opération est configurée
 */
export function isOperationConfigured(operation: string): operation is OperationName {
  return operation in AI_OPERATIONS_CONFIG
}

/**
 * Liste toutes les opérations configurées
 */
export function getConfiguredOperations(): OperationName[] {
  return Object.keys(AI_OPERATIONS_CONFIG) as OperationName[]
}

/**
 * Retourne le provider fixe pour une opération (pas de fallback)
 */
export function getOperationProvider(operation: OperationName): LLMProvider {
  return AI_OPERATIONS_CONFIG[operation].model.provider
}

/**
 * Retourne le nom du modèle pour une opération
 */
export function getOperationModel(operation: OperationName): string {
  return AI_OPERATIONS_CONFIG[operation].model.name
}

/**
 * Retourne la description d'une opération (pour monitoring)
 */
export function getOperationDescription(operation: OperationName): string {
  return AI_OPERATIONS_CONFIG[operation].description
}

// =============================================================================
// RÉTROCOMPATIBILITÉ (deprecated, à supprimer dans version future)
// =============================================================================

/**
 * @deprecated Utiliser getOperationProvider() - pas de fallback en mode no-fallback
 */
export function getPrimaryProvider(operation: OperationName): LLMProvider {
  return getOperationProvider(operation)
}

/**
 * @deprecated Plus de fallback en mode no-fallback - retourne []
 */
export function getFallbackProviders(_operation: OperationName): LLMProvider[] {
  return []
}
