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
  | 'dossiers-structuration'
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
 * Migration Feb 25, 2026 : Ollama (latence 10-60s) → Groq tiered + Ollama batch
 * Stratégie coût minimal : modèle 70b pour qualité, 8b pour tâches simples (12× moins cher, quota indépendant)
 *
 * Free tier Groq (source : console.groq.com/docs/rate-limits, vérifié fév 2026) :
 *   70b : 100K tokens/jour, 1K req/jour, 30 RPM, 12K TPM
 *   8b  : 500K tokens/jour, 14.4K req/jour, 30 RPM, 6K TPM
 *
 * | Opération              | Provider  | Modèle                    | Free tier            | Coût payant     | Contexte |
 * |------------------------|-----------|---------------------------|----------------------|-----------------|----------|
 * | Assistant IA (chat)    | Groq      | llama-3.3-70b-versatile   | 100K tok/j, 1K req/j | $0.59/$0.79/M   | 128K     |
 * | Structuration dossier  | Groq      | llama-3.3-70b-versatile   | même quota 70b       | $0.59/$0.79/M   | 128K     |
 * | Dossiers Assistant     | DeepSeek  | deepseek-chat             | illimité             | $0.028/$0.42/M* | 128K     |
 * | Consultations IRAC     | DeepSeek  | deepseek-chat             | illimité             | $0.028/$0.42/M* | 128K     |
 * | KB Quality Analysis    | Ollama    | qwen3:8b                  | illimité local       | $0              | 128K     |
 * | Query Classification   | Groq      | llama-3.1-8b-instant      | 500K tok/j†          | $0.05/$0.08/M   | 128K     |
 * | Query Expansion        | Groq      | llama-3.1-8b-instant      | même quota†          | $0.05/$0.08/M   | 128K     |
 * | Consolidation docs     | DeepSeek  | deepseek-chat             | illimité             | $0.028/$0.42/M* | 128K     |
 * | RAG Eval Judge         | Groq      | llama-3.1-8b-instant      | même quota†          | $0.05/$0.08/M   | 128K     |
 * | Embeddings (tout)      | OpenAI    | text-embedding-3-small    | —                    | $0.02/M         | —        |
 * | Re-ranking             | Local     | ms-marco-MiniLM-L-6-v2    | illimité local       | $0              | —        |
 * (* DeepSeek cache hit sur system prompt stable — input = $0.028/M, cache miss = $0.28/M)
 * († quota partagé entre classification, expansion et rag-eval-judge = même modèle 8b)
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
      ? { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }
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
    model: { provider: 'gemini', name: 'gemini-2.0-flash' }, // Gemini : free tier 15 RPM, 1M tok/jour, multilingue AR/FR

    embeddings: isDev
      ? { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }
      : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },

    timeouts: {
      embedding: 3000,
      chat: 45000,  // Gemini free tier ~2-15s → marge 45s
      total: 55000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 2048,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Chat utilisateur temps réel - Gemini 2.0 Flash (free tier 15 RPM, 1M tok/jour, multilingue AR/FR)',
  },

  // ---------------------------------------------------------------------------
  // 3. ASSISTANT DOSSIERS (analyse approfondie)
  // ---------------------------------------------------------------------------
  'dossiers-assistant': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    embeddings: isDev
      ? { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }
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
    description: 'Analyse approfondie dossier - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 3b. STRUCTURATION DOSSIER (narratif → JSON structuré, temps réel)
  // ---------------------------------------------------------------------------
  'dossiers-structuration': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'gemini', name: 'gemini-2.0-flash' }, // Gemini : free tier, bon support JSON structuré

    timeouts: {
      chat: 60000,  // Gemini free tier, marge 60s pour JSON complexe
      total: 75000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 6000, // Augmenté 4000→6000 : cas pénaux complexes (7 phases) peuvent dépasser 4000 tokens
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Structuration narratif → JSON - Gemini 2.0 Flash (free tier, 1M ctx, JSON structuré)',
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
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    embeddings: isDev
      ? { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }
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
    description: 'Consultation juridique formelle IRAC - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 6. QUERY CLASSIFICATION (pré-filtrage KB)
  // ---------------------------------------------------------------------------
  'query-classification': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama : gratuit, déjà sur prod, tâche légère

    timeouts: {
      chat: 20000,  // Ollama VPS 12GB ~2-5s → marge 20s
      total: 25000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 500,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Classification query KB - Ollama qwen3:8b (gratuit, local, VPS 12GB RAM)',
  },

  // ---------------------------------------------------------------------------
  // 7. QUERY EXPANSION (reformulation requêtes courtes)
  // ---------------------------------------------------------------------------
  'query-expansion': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama : gratuit, reformulation simple

    timeouts: {
      chat: 20000,  // Ollama VPS 12GB ~2-5s → marge 20s
      total: 25000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 200,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'Expansion queries courtes <50 chars - Ollama qwen3:8b (gratuit, local)',
  },

  // ---------------------------------------------------------------------------
  // 8. CONSOLIDATION DOCUMENTS (multi-pages → 1 document)
  // ---------------------------------------------------------------------------
  'document-consolidation': {
    model: isDev
      ? { provider: 'ollama', name: 'qwen3:8b' }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    timeouts: {
      chat: 90000,
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000, // Réduit 16000→8000 (très longs dossiers >50p tronqués — risque accepté)
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Consolidation documents multi-pages - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 9. RAG EVAL JUDGE (évaluation fidélité réponses)
  // ---------------------------------------------------------------------------
  'rag-eval-judge': {
    model: { provider: 'ollama', name: 'qwen3:8b' }, // Ollama : évite compétition quota Gemini avec assistant-ia (VPS 12GB, stable)

    timeouts: {
      chat: 60000,  // Ollama VPS 12GB ~5-15s pour judge JSON court → marge 60s
      total: 75000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 400,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'LLM judge fidélité réponse RAG - Ollama qwen3:8b (gratuit, quota Gemini préservé pour chat)',
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
