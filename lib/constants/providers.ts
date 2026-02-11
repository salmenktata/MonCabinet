/**
 * Configuration Centralisée des Providers IA
 *
 * Source unique de vérité pour tous les composants :
 * - Settings > Architecture IA (ProviderConfigTable)
 * - Settings > Système (ApiKeysDBCard)
 * - Quotas page
 * - Monitoring > Providers
 *
 * Dernière mise à jour : 11 février 2026
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
 * Ordre de priorité basé sur le fallback chain :
 * 1. Gemini (primaire, tier gratuit généreux)
 * 2. DeepSeek (fallback 1, économique)
 * 3. Groq (fallback 2, rapide)
 * 4. Ollama (fallback 3, local gratuit)
 * 5. Anthropic (fallback 4, haute qualité)
 * 6. OpenAI (fallback 5, embeddings turbo)
 */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini 2.0 Flash',
    icon: '✨',
    color: 'blue',
    colorClass: 'text-blue-400 border-blue-500',
    priority: 1,
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
    priority: 2,
    tier: 'paid',
    hasQuotas: true,
    hasMonitoring: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    color: 'yellow',
    colorClass: 'text-yellow-400 border-yellow-500',
    priority: 3,
    tier: 'free',
    hasQuotas: true,
    hasMonitoring: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    color: 'green',
    colorClass: 'text-green-400 border-green-500',
    priority: 4,
    tier: 'local',
    hasQuotas: true,
    hasMonitoring: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: '🧡',
    color: 'orange',
    colorClass: 'text-orange-400 border-orange-500',
    priority: 5,
    tier: 'paid',
    hasQuotas: true,
    hasMonitoring: true,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    color: 'cyan',
    colorClass: 'text-cyan-400 border-cyan-500',
    priority: 6,
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
  gemini: 1,
  deepseek: 2,
  groq: 3,
  ollama: 4,
  anthropic: 5,
  openai: 6,
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
  gemini: 'Gemini 2.0 Flash',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  ollama: 'Ollama',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
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
