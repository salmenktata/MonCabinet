/**
 * Retry Logic avec Exponential Backoff
 *
 * Utilitaire pour réessayer des opérations asynchrones avec:
 * - Backoff exponentiel
 * - Nombre de tentatives configurable
 * - Filtrage des erreurs réessayables
 *
 * Usage:
 * import { withRetry, retryGoogleDrive, retryResend } from '@/lib/utils/retry'
 *
 * const result = await withRetry(() => fetchData(), { maxRetries: 3 })
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('Retry')

/**
 * Options pour withRetry
 */
export interface RetryOptions {
  /**
   * Nombre maximum de tentatives (incluant la première)
   * @default 3
   */
  maxRetries?: number

  /**
   * Délai initial entre les tentatives (ms)
   * @default 1000
   */
  initialDelayMs?: number

  /**
   * Facteur multiplicateur pour le backoff exponentiel
   * @default 2
   */
  backoffMultiplier?: number

  /**
   * Délai maximum entre les tentatives (ms)
   * @default 30000
   */
  maxDelayMs?: number

  /**
   * Fonction pour déterminer si une erreur est réessayable
   * @default () => true
   */
  isRetryable?: (error: unknown) => boolean

  /**
   * Callback appelé avant chaque retry
   */
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void

  /**
   * Nom de l'opération pour les logs
   */
  operationName?: string
}

/**
 * Erreur de retry épuisés
 */
export class RetryExhaustedError extends Error {
  public readonly attempts: number
  public readonly lastError: unknown

  constructor(attempts: number, lastError: unknown) {
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    super(`Toutes les tentatives épuisées (${attempts}): ${message}`)
    this.name = 'RetryExhaustedError'
    this.attempts = attempts
    this.lastError = lastError
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Attend un certain temps
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calcule le délai pour le backoff exponentiel avec jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  backoffMultiplier: number,
  maxDelayMs: number
): number {
  // Backoff exponentiel: delay = initial * multiplier^attempt
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1)

  // Ajouter du jitter (±20%) pour éviter les thundering herds
  const jitter = exponentialDelay * (0.8 + Math.random() * 0.4)

  // Plafonner au max
  return Math.min(jitter, maxDelayMs)
}

/**
 * Vérifie si une erreur réseau/HTTP est réessayable
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    // Erreurs réseau
    if (
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    ) {
      return true
    }

    // Erreurs HTTP réessayables (5xx, 429)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504') || message.includes('429')) {
      return true
    }
  }

  return false
}

/**
 * Vérifie si une erreur HTTP est réessayable par code de statut
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  // 429 Too Many Requests
  // 500, 502, 503, 504 - erreurs serveur
  return statusCode === 429 || (statusCode >= 500 && statusCode <= 504)
}

/**
 * Exécute une fonction avec retry et exponential backoff
 *
 * @example
 * const data = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * )
 *
 * @example
 * // Avec filtrage d'erreurs
 * const data = await withRetry(
 *   () => callExternalAPI(),
 *   {
 *     maxRetries: 5,
 *     isRetryable: (error) => isNetworkError(error),
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}...`)
 *   }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    isRetryable = () => true,
    onRetry,
    operationName = 'operation',
  } = options

  let lastError: unknown
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++

    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Vérifier si l'erreur est réessayable
      if (!isRetryable(error)) {
        log.warn(`[${operationName}] Erreur non réessayable, abandon`, {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }

      // Si c'était la dernière tentative, propager l'erreur
      if (attempt >= maxRetries) {
        log.error(`[${operationName}] Toutes les tentatives épuisées`, {
          attempts: attempt,
          error: error instanceof Error ? error.message : String(error),
        })
        break
      }

      // Calculer le délai avant le prochain essai
      const nextDelayMs = calculateDelay(attempt, initialDelayMs, backoffMultiplier, maxDelayMs)

      log.info(`[${operationName}] Tentative ${attempt}/${maxRetries} échouée, retry dans ${Math.round(nextDelayMs)}ms`, {
        error: error instanceof Error ? error.message : String(error),
      })

      // Callback onRetry
      if (onRetry) {
        onRetry(attempt, error, nextDelayMs)
      }

      // Attendre avant de réessayer
      await delay(nextDelayMs)
    }
  }

  throw new RetryExhaustedError(attempt, lastError)
}

// =============================================================================
// INSTANCES PRÉ-CONFIGURÉES
// =============================================================================

/**
 * Retry pour Google Drive API
 * 3 tentatives, 2s initial, erreurs réseau uniquement
 */
export async function retryGoogleDrive<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 2000,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
    isRetryable: isNetworkError,
    operationName: 'GoogleDrive',
  })
}

/**
 * Retry pour Resend (email)
 * 3 tentatives, 1s initial, erreurs réseau uniquement
 */
export async function retryResend<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
    isRetryable: isNetworkError,
    operationName: 'Resend',
  })
}

/**
 * Retry pour Flouci API
 * 3 tentatives, 1.5s initial, erreurs réseau uniquement
 */
export async function retryFlouci<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 1500,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
    isRetryable: isNetworkError,
    operationName: 'Flouci',
  })
}

/**
 * Retry pour Anthropic API (IA)
 * 3 tentatives, 2s initial, erreurs réseau + rate limit
 */
export async function retryAnthropic<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 2000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
    isRetryable: (error) => {
      if (isNetworkError(error)) return true
      // Rate limit Anthropic
      if (error instanceof Error && error.message.includes('rate_limit')) return true
      return false
    },
    operationName: 'Anthropic',
  })
}

