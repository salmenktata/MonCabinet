/**
 * Service de configuration des providers (Email, IA)
 * Gère la lecture/écriture des préférences providers depuis la base de données
 */

import { getConfig, setConfig, upsertConfig } from './platform-config'

// =============================================================================
// TYPES
// =============================================================================

export type EmailProviderMode = 'brevo' | 'resend' | 'auto'
export type AIProvider = 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'ollama'

export interface EmailProviderConfig {
  mode: EmailProviderMode
  failoverOrder: ('brevo' | 'resend')[]
  brevo: {
    configured: boolean
    apiKeyMasked: string | null
  }
  resend: {
    configured: boolean
    apiKeyMasked: string | null
  }
}


// =============================================================================
// HELPERS
// =============================================================================

/**
 * Masque une clé API pour affichage (garde les 4 derniers caractères)
 */
function maskApiKey(key: string | null): string | null {
  if (!key || key.length < 8) return null
  return `${'•'.repeat(key.length - 4)}${key.slice(-4)}`
}

// =============================================================================
// GETTERS - EMAIL
// =============================================================================

/**
 * Récupère le mode du provider email actuel
 */
export async function getEmailProviderMode(): Promise<EmailProviderMode> {
  const mode = await getConfig('EMAIL_PROVIDER')
  if (mode === 'brevo' || mode === 'resend' || mode === 'auto') {
    return mode
  }
  return 'auto' // Défaut
}

/**
 * Récupère l'ordre de failover des providers email
 */
export async function getEmailFailoverOrder(): Promise<('brevo' | 'resend')[]> {
  const order = await getConfig('EMAIL_FAILOVER_ORDER')
  if (order) {
    try {
      const parsed = JSON.parse(order)
      if (Array.isArray(parsed)) {
        return parsed.filter(p => p === 'brevo' || p === 'resend')
      }
    } catch {
      // Ignorer erreur de parsing
    }
  }
  return ['brevo', 'resend'] // Défaut
}

/**
 * Récupère la configuration complète des providers email
 */
export async function getEmailProviderConfig(): Promise<EmailProviderConfig> {
  const [mode, failoverOrder, brevoKey, resendKey] = await Promise.all([
    getEmailProviderMode(),
    getEmailFailoverOrder(),
    getConfig('BREVO_API_KEY'),
    getConfig('RESEND_API_KEY'),
  ])

  return {
    mode,
    failoverOrder,
    brevo: {
      configured: !!brevoKey,
      apiKeyMasked: maskApiKey(brevoKey),
    },
    resend: {
      configured: !!resendKey,
      apiKeyMasked: maskApiKey(resendKey),
    },
  }
}

/**
 * Vérifie si un provider email spécifique est configuré (a une clé API)
 */
export async function isEmailProviderConfigured(provider: 'brevo' | 'resend'): Promise<boolean> {
  const key = provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY'
  const apiKey = await getConfig(key)
  return !!apiKey
}

// =============================================================================
// SETTERS - EMAIL
// =============================================================================

/**
 * Définit le mode du provider email
 */
export async function setEmailProviderMode(mode: EmailProviderMode): Promise<boolean> {
  return setConfig('EMAIL_PROVIDER', mode)
}

/**
 * Définit l'ordre de failover des providers email
 */
export async function setEmailFailoverOrder(order: ('brevo' | 'resend')[]): Promise<boolean> {
  return setConfig('EMAIL_FAILOVER_ORDER', JSON.stringify(order))
}

/**
 * Définit la clé API d'un provider email
 */
export async function setEmailApiKey(
  provider: 'brevo' | 'resend',
  apiKey: string
): Promise<boolean> {
  const key = provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY'
  const description = provider === 'brevo' ? 'Clé API Brevo' : 'Clé API Resend'

  return upsertConfig(key, apiKey, {
    description,
    category: 'email',
    isSecret: true,
  })
}

// =============================================================================
// TYPES - IA
// =============================================================================

export interface AIProviderConfig {
  deepseek: {
    configured: boolean
    apiKeyMasked: string | null
  }
  groq: {
    configured: boolean
    apiKeyMasked: string | null
  }
  openai: {
    configured: boolean
    apiKeyMasked: string | null
  }
  anthropic: {
    configured: boolean
    apiKeyMasked: string | null
  }
  ollama: {
    enabled: boolean
    baseUrl: string | null
  }
  activeProvider: AIProvider | null
}

// =============================================================================
// GETTERS - IA
// =============================================================================

/**
 * Récupère la configuration complète des providers IA
 */
export async function getAIProviderConfig(): Promise<AIProviderConfig> {
  const [deepseekKey, groqKey, openaiKey, anthropicKey, ollamaEnabled, ollamaUrl] = await Promise.all([
    getConfig('DEEPSEEK_API_KEY'),
    getConfig('GROQ_API_KEY'),
    getConfig('OPENAI_API_KEY'),
    getConfig('ANTHROPIC_API_KEY'),
    getConfig('OLLAMA_ENABLED'),
    getConfig('OLLAMA_BASE_URL'),
  ])

  // Déterminer le provider actif (ordre de priorité: DeepSeek > Groq > Ollama > Anthropic > OpenAI)
  let activeProvider: AIProvider | null = null
  if (deepseekKey) activeProvider = 'deepseek'
  else if (groqKey) activeProvider = 'groq'
  else if (ollamaEnabled === 'true') activeProvider = 'ollama'
  else if (anthropicKey) activeProvider = 'anthropic'
  else if (openaiKey) activeProvider = 'openai'

  return {
    deepseek: {
      configured: !!deepseekKey,
      apiKeyMasked: maskApiKey(deepseekKey),
    },
    groq: {
      configured: !!groqKey,
      apiKeyMasked: maskApiKey(groqKey),
    },
    openai: {
      configured: !!openaiKey,
      apiKeyMasked: maskApiKey(openaiKey),
    },
    anthropic: {
      configured: !!anthropicKey,
      apiKeyMasked: maskApiKey(anthropicKey),
    },
    ollama: {
      enabled: ollamaEnabled === 'true',
      baseUrl: ollamaUrl || null,
    },
    activeProvider,
  }
}

/**
 * Vérifie si un provider IA spécifique est configuré
 */
export async function isAIProviderConfigured(provider: AIProvider): Promise<boolean> {
  if (provider === 'ollama') {
    const enabled = await getConfig('OLLAMA_ENABLED')
    return enabled === 'true'
  }

  const keyMap: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    groq: 'GROQ_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  }

  const apiKey = await getConfig(keyMap[provider])
  return !!apiKey
}

// =============================================================================
// SETTERS - IA
// =============================================================================

/**
 * Définit la clé API d'un provider IA
 */
export async function setAIApiKey(
  provider: Exclude<AIProvider, 'ollama'>,
  apiKey: string
): Promise<boolean> {
  const keyMap: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    groq: 'GROQ_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  }

  const descMap: Record<string, string> = {
    deepseek: 'Clé API DeepSeek',
    groq: 'Clé API Groq',
    openai: 'Clé API OpenAI',
    anthropic: 'Clé API Anthropic',
  }

  return upsertConfig(keyMap[provider], apiKey, {
    description: descMap[provider],
    category: 'ai',
    isSecret: true,
  })
}

/**
 * Configure Ollama (activation + URL)
 */
export async function setOllamaConfig(enabled: boolean, baseUrl?: string): Promise<boolean> {
  const results = await Promise.all([
    upsertConfig('OLLAMA_ENABLED', enabled ? 'true' : 'false', {
      description: 'Ollama LLM local activé',
      category: 'ai',
      isSecret: false,
    }),
    baseUrl
      ? upsertConfig('OLLAMA_BASE_URL', baseUrl, {
          description: 'URL du serveur Ollama',
          category: 'ai',
          isSecret: false,
        })
      : Promise.resolve(true),
  ])

  return results.every(r => r)
}
