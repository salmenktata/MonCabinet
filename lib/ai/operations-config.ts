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
  | 'rag-eval-judge'

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
 * Migration coûts Feb 24, 2026 : Groq ($9/m) + Gemini (€44/m) → Ollama (gratuit) + DeepSeek (~$1-3/m)
 *
 * | Opération              | Provider  | Modèle                    | Coût        | Contexte |
 * |------------------------|-----------|---------------------------|-------------|----------|
 * | Assistant IA (chat)    | Ollama    | qwen3:8b                  | 0€          | 128K     |
 * | Dossiers Assistant     | DeepSeek  | deepseek-chat             | ~$0.10/Mtkn | 64K      |
 * | Consultations IRAC     | DeepSeek  | deepseek-chat             | ~$0.10/Mtkn | 64K      |
 * | KB Quality Analysis    | Ollama    | qwen3:8b                  | 0€          | 128K     |
 * | Query Classification   | Ollama    | qwen3:8b                  | 0€          | 128K     |
 * | Query Expansion        | Ollama    | qwen3:8b                  | 0€          | 128K     |
 * | Consolidation docs     | DeepSeek  | deepseek-chat             | ~$0.10/Mtkn | 64K      |
 * | RAG Eval Judge         | Ollama    | qwen3:8b                  | 0€          | 128K     |
 * | Embeddings (tout)      | OpenAI    | text-embedding-3-small    | ~$2-5/mois  | —        |
 * | Re-ranking             | Local     | ms-marco-MiniLM-L-6-v2    | 0€          | —        |
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
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama gratuit (latence 5-15s acceptable phase dev)

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 3000,
      chat: 60000,  // Ollama plus lent que Groq → 60s
      total: 75000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 2048, // Réduit 8000→2048 pour limiter latence Ollama
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Chat utilisateur temps réel - Ollama qwen3:8b (gratuit, latence ~5-15s)',
  },

  // ---------------------------------------------------------------------------
  // 3. ASSISTANT DOSSIERS (analyse approfondie)
  // ---------------------------------------------------------------------------
  'dossiers-assistant': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : ~$0.10/Mtkn, 64K ctx

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 5000,
      chat: 90000,  // DeepSeek plus lent que Gemini sur longs contextes
      total: 105000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 8000,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Analyse approfondie dossier - DeepSeek deepseek-chat (~$1-3/mois, 64K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 4. ANALYSE QUALITÉ KB (tous documents, courts et longs)
  // ---------------------------------------------------------------------------
  'kb-quality-analysis': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama en dev ET prod (batch, pas temps réel)

    timeouts: {
      chat: 60000, // Ollama plus lent que Groq, marge élargie
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000,
    },

    alerts: { onFailure: 'log', severity: 'warning' }, // Log seulement (batch non-critique)
    description: 'Analyse qualité documents KB - Ollama qwen3:8b (gratuit, batch)',
  },

  // ---------------------------------------------------------------------------
  // 5. CONSULTATION (génération formelle IRAC)
  // ---------------------------------------------------------------------------
  'dossiers-consultation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : ~$0.10/Mtkn, 64K ctx

    embeddings: isDev
      ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 5000,
      chat: 90000,  // DeepSeek sur longues consultations
      total: 105000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 2000,
      systemPromptType: 'consultation',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Consultation juridique formelle IRAC - DeepSeek deepseek-chat (~$1-3/mois, 64K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 6. QUERY CLASSIFICATION (pré-filtrage KB)
  // ---------------------------------------------------------------------------
  'query-classification': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama gratuit (Groq supprimé)

    timeouts: {
      chat: 20000,  // Ollama plus lent → 20s (était 5s Groq)
      total: 30000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 500,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Classification query pour filtrage catégories KB - Ollama qwen3:8b',
  },

  // ---------------------------------------------------------------------------
  // 7. QUERY EXPANSION (reformulation requêtes courtes)
  // ---------------------------------------------------------------------------
  'query-expansion': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama gratuit (Groq supprimé)

    timeouts: {
      chat: 20000,  // Ollama plus lent → 20s (était 5s Groq)
      total: 30000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 200,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Expansion queries courtes <50 chars - Ollama qwen3:8b',
  },

  // ---------------------------------------------------------------------------
  // 8. CONSOLIDATION DOCUMENTS (multi-pages → 1 document)
  // ---------------------------------------------------------------------------
  'document-consolidation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : 64K ctx (Gemini 1M supprimé — coût)

    timeouts: {
      chat: 90000,
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000, // Réduit 16000→8000 (très longs dossiers >50p tronqués — risque accepté)
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Consolidation documents multi-pages - DeepSeek deepseek-chat (64K ctx, ~$1-3/mois)',
  },

  // ---------------------------------------------------------------------------
  // 9. RAG EVAL JUDGE (évaluation fidélité réponses)
  // ---------------------------------------------------------------------------
  'rag-eval-judge': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama gratuit (Groq supprimé)

    timeouts: {
      chat: 30000,  // Ollama plus lent → 30s (était 15s Groq)
      total: 45000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 400,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'LLM judge fidélité réponse RAG - Ollama qwen3:8b',
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
