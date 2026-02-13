/**
 * Configuration IA par type d'opération métier
 *
 * Ce fichier définit une configuration spécifique pour chaque type d'opération,
 * permettant d'optimiser coût/performance/qualité selon le cas d'usage.
 *
 * Février 2026 - Optimisation par opération métier
 */

import type { AIContext, LLMProvider } from './llm-fallback-service'

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
  | 'kb-quality-analysis-short'

/**
 * Configuration IA pour une opération spécifique
 */
export interface OperationAIConfig {
  // Mapping vers AIContext existant (réutilise les stratégies existantes)
  context: AIContext

  // Override des providers (optionnel, sinon utilise la stratégie du context)
  providers?: {
    primary: LLMProvider
    fallback: LLMProvider[]
  }

  // Configuration embeddings (si applicable)
  embeddings?: {
    provider: 'ollama' | 'openai'
    fallbackProvider?: 'ollama' | 'openai'
    model?: string
    dimensions?: number
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

  // Description pour monitoring/debug
  description?: string
}

// =============================================================================
// CONFIGURATION PAR OPÉRATION
// =============================================================================

/**
 * Configuration centralisée par type d'opération
 *
 * Chaque opération définit sa stratégie optimale de providers,
 * ses timeouts, et ses paramètres LLM.
 */
export const AI_OPERATIONS_CONFIG: Record<OperationName, OperationAIConfig> = {
  // ---------------------------------------------------------------------------
  // 1. INDEXATION (background processing)
  // ---------------------------------------------------------------------------
  'indexation': {
    context: 'embeddings',  // Utilise stratégie embeddings existante

    description: 'Indexation KB avec OpenAI (haute qualité, ~$2-5/mois)',

    embeddings: {
      provider: 'openai',
      fallbackProvider: 'ollama',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },

    timeouts: {
      embedding: 10000,  // 10s par embedding (Ollama CPU-only)
      chat: 30000,       // 30s pour classification LLM
      total: 60000,      // 1min total max
    },

    llmConfig: {
      temperature: 0.2,  // Déterministe pour classification
      maxTokens: 2000,
    },
  },

  // ---------------------------------------------------------------------------
  // 2. ASSISTANT IA (chat temps réel utilisateur)
  // ---------------------------------------------------------------------------
  'assistant-ia': {
    context: 'rag-chat',  // Utilise stratégie rag-chat existante

    description: 'Chat utilisateur temps réel (performance critique, volume élevé)',

    // Providers: Groq ultra-rapide (292ms) en priorité
    providers: {
      primary: 'groq',
      fallback: ['gemini', 'deepseek', 'ollama'],
    },

    // ✨ OPTIMISATION RAG - Sprint 1 (Feb 2026)
    // OpenAI embeddings pour meilleure qualité (54-63% → 75-85% similarité)
    // Coût: ~0.50€/mois (1M tokens ≈ $0.02, volume faible chat)
    embeddings: {
      provider: 'openai',   // Qualité supérieure pour assistant IA
      fallbackProvider: 'ollama',  // Fallback si OpenAI indisponible
      model: 'text-embedding-3-small',
      dimensions: 1536,  // OpenAI dimensions (vs 1024 Ollama)
    },

    timeouts: {
      embedding: 3000,   // 3s max (OpenAI plus rapide qu'Ollama)
      chat: 30000,       // 30s max (permet fallback Ollama 18s + marge)
      total: 45000,      // 45s total (cascade complète + marge réseau)
    },

    llmConfig: {
      temperature: 0.1,  // Très factuel pour conseil juridique (anti-hallucination)
      maxTokens: 2000,   // Analyses juridiques détaillées (~1500 mots)
      systemPromptType: 'chat',
    },
  },

  // ---------------------------------------------------------------------------
  // 3. ASSISTANT DOSSIERS (analyse approfondie)
  // ---------------------------------------------------------------------------
  'dossiers-assistant': {
    context: 'quality-analysis',  // Qualité > vitesse

    description: 'Analyse approfondie dossier (qualité critique)',

    // Providers: Gemini prioritaire (qualité + contexte 1M)
    providers: {
      primary: 'gemini',
      fallback: ['groq', 'deepseek'],
    },

    embeddings: {
      provider: 'openai',   // Qualité supérieure pour analyse dossiers
      fallbackProvider: 'ollama',
      model: 'text-embedding-3-small',
      dimensions: 1536,  // OpenAI dimensions
    },

    timeouts: {
      embedding: 5000,   // 5s max
      chat: 15000,       // 15s (analyse approfondie OK)
      total: 30000,      // 30s total
    },

    llmConfig: {
      temperature: 0.2,  // Précis et factuel
      maxTokens: 2000,   // Réponses détaillées
      systemPromptType: 'chat',
    },
  },

  // ---------------------------------------------------------------------------
  // 4. ANALYSE QUALITÉ KB (analyse documents à grande échelle)
  // ---------------------------------------------------------------------------
  'kb-quality-analysis': {
    context: 'quality-analysis',

    description: 'Analyse qualité documents KB en batch (volume élevé, vitesse critique)',

    // Providers: Gemini prioritaire (stable, gratuit pour volume)
    providers: {
      primary: 'gemini',
      fallback: ['openai', 'ollama'],
    },

    timeouts: {
      chat: 30000,       // 30s (analyse approfondie)
      total: 60000,      // 1min total
    },

    llmConfig: {
      temperature: 0.1,  // Précision maximale pour évaluation
      maxTokens: 4000,   // 4000 tokens pour JSON complet (était 2000, trop court)
    },
  },

  // Analyse qualité documents courts (< 500 chars) - OpenAI plus strict sur JSON
  'kb-quality-analysis-short': {
    context: 'quality-analysis',

    description: 'Analyse qualité documents courts (< 500 chars) - OpenAI strict sur JSON',

    // Providers: OpenAI prioritaire (plus strict sur format JSON pour textes courts)
    // Fallback: Ollama avant Gemini (Gemini échoue souvent sur textes courts AR)
    providers: {
      primary: 'openai',
      fallback: ['ollama', 'gemini'],
    },

    timeouts: {
      chat: 20000,       // 20s (textes courts, analyse rapide)
      total: 40000,      // 40s total
    },

    llmConfig: {
      temperature: 0.1,  // Précision maximale
      maxTokens: 2000,   // 2000 tokens suffisent pour textes courts
    },
  },

  // ---------------------------------------------------------------------------
  // 5. CONSULTATION (génération formelle IRAC)
  // ---------------------------------------------------------------------------
  'dossiers-consultation': {
    context: 'structuring',  // Structuration formelle

    description: 'Consultation juridique formelle IRAC (qualité maximale)',

    // Providers: Gemini prioritaire (qualité + raisonnement)
    providers: {
      primary: 'gemini',
      fallback: ['deepseek', 'groq'],
    },

    embeddings: {
      provider: 'openai',   // Qualité maximale pour consultation
      fallbackProvider: 'ollama',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },

    timeouts: {
      embedding: 5000,   // 5s max
      chat: 30000,       // 30s (consultation détaillée)
      total: 60000,      // 1min total
    },

    llmConfig: {
      temperature: 0.1,  // Très factuel et précis
      maxTokens: 4000,   // Consultation longue
      systemPromptType: 'consultation',
    },
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
 * Retourne le provider primaire pour une opération
 */
export function getPrimaryProvider(operation: OperationName): LLMProvider | undefined {
  const config = getOperationConfig(operation)
  return config.providers?.primary
}

/**
 * Retourne les providers de fallback pour une opération
 */
export function getFallbackProviders(operation: OperationName): LLMProvider[] {
  const config = getOperationConfig(operation)
  return config.providers?.fallback || []
}

/**
 * Retourne la description d'une opération (pour monitoring)
 */
export function getOperationDescription(operation: OperationName): string {
  const config = getOperationConfig(operation)
  return config.description || operation
}
