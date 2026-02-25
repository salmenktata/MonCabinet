/**
 * Ollama Warmup Service - Pré-chargement des modèles
 * Réduit latence premier appel (cold start) 30-60s → <5s
 *
 * @module lib/ai/ollama-warmup-service
 * @see Phase 4.7 - Optimisations - Ollama Keep-Alive
 */

import { createLogger } from '@/lib/logger'
import { getErrorMessage } from '@/lib/utils/error-utils'

const log = createLogger('AI:OllamaWarmup')

/**
 * Configuration
 */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434'
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED === 'true'

/**
 * Modèles à pré-charger
 */
const MODELS_TO_WARMUP = [
  'qwen2.5:3b', // Modèle chat par défaut
  'nomic-embed-text', // Embeddings KB (768-dim, migré Feb 25, 2026)
]

/**
 * Temps de keep-alive (30min par défaut)
 */
const KEEP_ALIVE_DURATION = '30m'

/**
 * Pré-charger un modèle Ollama
 * Envoie une requête minimale pour charger le modèle en mémoire
 */
async function warmupModel(model: string): Promise<boolean> {
  if (!OLLAMA_ENABLED) {
    return false
  }

  try {
    log.info(`Warming up model: ${model}`)

    const startTime = Date.now()

    // Requête minimale pour charger le modèle
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'ping', // Prompt minimal
        stream: false,
        keep_alive: KEEP_ALIVE_DURATION, // Garder le modèle chargé
        options: {
          num_predict: 1, // Générer 1 seul token
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(60000), // Timeout 60s
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const duration = Date.now() - startTime

    log.info(`Model warmed up successfully`, {
      model,
      duration,
      keepAlive: KEEP_ALIVE_DURATION,
    })

    return true
  } catch (error) {
    log.error(`Failed to warmup model: ${model}`, {
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Pré-charger un modèle d'embeddings
 */
async function warmupEmbeddingModel(model: string): Promise<boolean> {
  if (!OLLAMA_ENABLED) {
    return false
  }

  try {
    log.info(`Warming up embedding model: ${model}`)

    const startTime = Date.now()

    // Requête minimale pour charger le modèle d'embeddings
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'test', // Texte minimal
        keep_alive: KEEP_ALIVE_DURATION,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const duration = Date.now() - startTime

    log.info(`Embedding model warmed up successfully`, {
      model,
      duration,
      keepAlive: KEEP_ALIVE_DURATION,
    })

    return true
  } catch (error) {
    log.error(`Failed to warmup embedding model: ${model}`, {
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Pré-charger tous les modèles configurés
 * À appeler au démarrage de l'application ou périodiquement (cron)
 */
export async function warmupAllModels(): Promise<{
  success: boolean
  warmedUp: number
  failed: number
  duration: number
}> {
  if (!OLLAMA_ENABLED) {
    log.warn('Ollama disabled, skipping warmup')
    return { success: false, warmedUp: 0, failed: 0, duration: 0 }
  }

  const startTime = Date.now()
  let warmedUp = 0
  let failed = 0

  log.info('Starting models warmup', { models: MODELS_TO_WARMUP })

  // Warmer les modèles en parallèle pour gagner du temps
  const results = await Promise.allSettled(
    MODELS_TO_WARMUP.map((model) => {
      // Déterminer le type de modèle
      if (model.includes('embedding')) {
        return warmupEmbeddingModel(model)
      } else {
        return warmupModel(model)
      }
    })
  )

  // Compter les succès/échecs
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value === true) {
      warmedUp++
    } else {
      failed++
    }
  }

  const duration = Date.now() - startTime

  log.info('Models warmup completed', {
    warmedUp,
    failed,
    total: MODELS_TO_WARMUP.length,
    duration,
  })

  return {
    success: warmedUp > 0,
    warmedUp,
    failed,
    duration,
  }
}

/**
 * Ping un modèle pour maintenir keep-alive
 * À appeler périodiquement (toutes les 15min) si le modèle est utilisé
 */
export async function keepAlive(model: string): Promise<boolean> {
  if (!OLLAMA_ENABLED) {
    return false
  }

  try {
    // Requête keep-alive sans génération
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: '',
        keep_alive: KEEP_ALIVE_DURATION,
        options: { num_predict: 0 }, // Pas de génération
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      log.debug(`Keep-alive sent for model: ${model}`)
      return true
    }

    return false
  } catch (error) {
    log.debug(`Keep-alive failed for model: ${model}`, {
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Vérifier si un modèle est déjà chargé en mémoire
 */
export async function isModelLoaded(model: string): Promise<boolean> {
  if (!OLLAMA_ENABLED) {
    return false
  }

  try {
    // Lister les modèles en cours d'exécution
    const response = await fetch(`${OLLAMA_BASE_URL}/api/ps`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()

    // Vérifier si le modèle est dans la liste
    if (data.models && Array.isArray(data.models)) {
      return data.models.some(
        (m: { name?: string }) => m.name === model || m.name?.startsWith(model)
      )
    }

    return false
  } catch (error) {
    log.debug(`Failed to check if model is loaded: ${model}`, {
      error: getErrorMessage(error),
    })
    return false
  }
}
