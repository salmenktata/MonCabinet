/**
 * Helper centralisé pour appels Ollama via OpenAI SDK
 *
 * Utilisé par les 7 services qui nécessitent le SDK OpenAI pour appeler Ollama :
 * - rag-chat-service.ts
 * - kb-quality-analyzer-service.ts
 * - kb-duplicate-detector-service.ts
 * - metadata-extractor-service.ts
 * - legal-classifier-service.ts
 * - contradiction-detector-service.ts
 * - content-analyzer-service.ts
 * - conversation-summary-service.ts
 */

import OpenAI from 'openai'
import { aiConfig } from './config'

// =============================================================================
// TYPES
// =============================================================================

export interface OllamaCallOptions {
  temperature?: number
  maxTokens?: number
  usePremiumModel?: boolean
}

export interface OllamaResponse {
  content: string
  model: string
  isPremium: boolean
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Appelle Ollama via l'endpoint OpenAI SDK
 *
 * @param messages - Messages de la conversation (format OpenAI)
 * @param options - Options d'appel (temperature, maxTokens, usePremiumModel)
 * @returns Réponse Ollama avec métadonnées
 * @throws Error si Ollama n'est pas configuré ou échoue
 */
export async function callOllamaWithSDK(
  messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
  options: OllamaCallOptions = {}
): Promise<OllamaResponse> {
  if (!aiConfig.ollama.enabled) {
    throw new Error(
      'Ollama non activé. Configurez OLLAMA_ENABLED=true et démarrez "ollama serve".'
    )
  }

  // Option C : toujours mode rapide local, premium utilise cloud providers
  const model = aiConfig.ollama.chatModelDefault
  const timeout = aiConfig.ollama.chatTimeoutDefault
  const usePremium = false // forcé à false avec Option C

  const client = new OpenAI({
    apiKey: 'ollama', // Valeur arbitraire, Ollama ne vérifie pas
    baseURL: `${aiConfig.ollama.baseUrl}/v1`,
    timeout,
  })

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens,
    })

    const content = response.choices[0]?.message?.content || ''

    if (!content) {
      throw new Error(
        `Ollama a retourné une réponse vide (modèle: ${model}). ` +
        `Vérifiez que le modèle est téléchargé avec "ollama pull ${model}".`
      )
    }

    return {
      content,
      model,
      isPremium: usePremium,
    }
  } catch (error) {
    // Messages d'erreur clairs selon le type d'erreur
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(
          `Ollama n'est pas accessible sur ${aiConfig.ollama.baseUrl}. ` +
          `Démarrez-le avec "ollama serve".`
        )
      }
      if (error.message.includes('timeout')) {
        throw new Error(
          `Timeout après ${timeout / 1000}s avec le modèle ${model}. ` +
          `${usePremium ? 'Mode premium peut prendre 2-4 min sur CPU. ' : ''}` +
          `Augmentez OLLAMA_CHAT_TIMEOUT_${usePremium ? 'PREMIUM' : 'DEFAULT'} si nécessaire.`
        )
      }
      if (error.message.includes('model')) {
        throw new Error(
          `Modèle ${model} non trouvé. Téléchargez-le avec "ollama pull ${model}".`
        )
      }
    }
    throw error
  }
}

/**
 * Vérifie si Ollama est accessible et fonctionnel
 * @returns true si Ollama répond, false sinon
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (!aiConfig.ollama.enabled) return false

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Retourne la liste des modèles disponibles dans Ollama
 * @returns Liste des modèles (noms uniquement)
 */
export async function listOllamaModels(): Promise<string[]> {
  if (!aiConfig.ollama.enabled) return []

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return []

    const data = await response.json()
    return data.models?.map((m: { name: string }) => m.name) || []
  } catch {
    return []
  }
}
