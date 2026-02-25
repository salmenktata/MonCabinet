/**
 * Configuration Centralisée des Providers IA
 *
 * Source unique de vérité pour tous les composants :
 * - Settings > Architecture IA (ProviderConfigTable)
 * - Settings > Système (ApiKeysDBCard)
 * - Quotas page
 * - Monitoring > Providers
 *
 * Dernière mise à jour : 25 février 2026
 */

export type ProviderId = 'gemini' | 'deepseek' | 'groq' | 'anthropic' | 'ollama' | 'openai'

export interface ProviderConfig {
  id: ProviderId
  name: string
  icon: string
  color: string
  colorClass: string
  priority: number
  tier: 'free' | 'paid' | 'local'
  hasQuotas: boolean
  hasMonitoring: boolean
}

/**
 * Configuration complète de tous les providers
 * Mode no-fallback (Feb 2026) — 1 provider fixe par opération :
 * - Groq llama-3.3-70b   : assistant-ia (chat utilisateur)
 * - Groq llama-3.1-8b    : query-classification, query-expansion (routing, 12× moins cher)
 * - DeepSeek deepseek-chat: dossiers-assistant, dossiers-consultation, document-consolidation
 * - Ollama qwen3:8b      : indexation, kb-quality-analysis, rag-eval-judge (batch local gratuit)
 * - OpenAI text-emb-3-sm : embeddings prod (1536-dim)
 * - Gemini text-emb-004  : embeddings secondaires (768-dim) — plus utilisé comme LLM
 * La priorité ci-dessous = ordre d'affichage dans les tableaux admin uniquement.
 */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    color: 'yellow',
    colorClass: 'text-yellow-400 border-yellow-500',
    priority: 1, // LLM principal : chat 70b + routing 8b
    tier: 'free',
    hasQuotas: true,
    hasMonitoring: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '💜',
    color: 'purple',
    colorClass: 'text-purple-400 border-purple-500',
    priority: 2, // Dossiers juridiques (cache hit $0.028/M)
    tier: 'paid',
    hasQuotas: true,
    hasMonitoring: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    color: 'green',
    colorClass: 'text-green-400 border-green-500',
    priority: 3, // Batch local gratuit (indexation, qualité, eval)
    tier: 'local',
    hasQuotas: true,
    hasMonitoring: true,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    color: 'cyan',
    colorClass: 'text-cyan-400 border-cyan-500',
    priority: 4, // Embeddings prod (text-embedding-3-small, 1536-dim)
    tier: 'paid',
    hasQuotas: true,
    hasMonitoring: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini (Embeddings)',
    icon: '✨',
    color: 'blue',
    colorClass: 'text-blue-400 border-blue-500',
    priority: 5, // Embeddings secondaires uniquement (text-embedding-004, 768-dim)
    tier: 'free',
    hasQuotas: true,
    hasMonitoring: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: '🧡',
    color: 'orange',
    colorClass: 'text-orange-400 border-orange-500',
    priority: 6, // Non utilisé en prod
    tier: 'paid',
    hasQuotas: true,
    hasMonitoring: true,
  },
}

/**
 * Liste des providers triés par priorité
 */
export const PROVIDERS_BY_PRIORITY = Object.values(PROVIDERS).sort(
  (a, b) => a.priority - b.priority
)

/**
 * Providers avec quotas (pour page Quotas)
 */
export const PROVIDERS_WITH_QUOTAS = PROVIDERS_BY_PRIORITY.filter(p => p.hasQuotas)

/**
 * Providers avec monitoring (pour page Monitoring)
 */
export const PROVIDERS_WITH_MONITORING = PROVIDERS_BY_PRIORITY.filter(p => p.hasMonitoring)

/**
 * Récupérer la config d'un provider par ID
 */
export function getProviderConfig(id: string): ProviderConfig | undefined {
  return PROVIDERS[id as ProviderId]
}

/**
 * Vérifier si un provider existe
 */
export function isValidProvider(id: string): id is ProviderId {
  return id in PROVIDERS
}

/**
 * Ordre de priorité pour mapping (legacy)
 */
export const PROVIDER_PRIORITY: Record<string, number> = {
  groq: 1,       // LLM principal (chat 70b + routing 8b)
  deepseek: 2,   // Dossiers juridiques
  ollama: 3,     // Batch local (indexation, qualité, eval)
  openai: 4,     // Embeddings prod (1536-dim)
  gemini: 5,     // Embeddings secondaires uniquement (768-dim)
  anthropic: 6,  // Non utilisé en prod
}

/**
 * Icônes par provider (legacy)
 */
export const PROVIDER_ICONS: Record<string, string> = {
  gemini: '✨',
  deepseek: '💜',
  groq: '⚡',
  ollama: '🦙',
  anthropic: '🧡',
  openai: '🤖',
}

/**
 * Noms par provider (legacy)
 */
export const PROVIDER_NAMES: Record<string, string> = {
  groq: 'Groq',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
  openai: 'OpenAI',
  gemini: 'Gemini (Embeddings)',
  anthropic: 'Anthropic Claude',
}

/**
 * Classes de couleur par provider (legacy)
 */
export const PROVIDER_COLORS: Record<string, string> = {
  gemini: 'text-blue-400 border-blue-500',
  deepseek: 'text-purple-400 border-purple-500',
  groq: 'text-yellow-400 border-yellow-500',
  ollama: 'text-green-400 border-green-500',
  anthropic: 'text-orange-400 border-orange-500',
  openai: 'text-cyan-400 border-cyan-500',
}
