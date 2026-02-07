/**
 * Logger centralisé pour Qadhya
 *
 * Remplace les console.log/error dispersés par un système unifié
 * avec niveaux, préfixes et formatage cohérent.
 *
 * Usage:
 * import { logger, createLogger } from '@/lib/logger'
 *
 * // Logger global
 * logger.info('Message général')
 *
 * // Logger avec préfixe module
 * const log = createLogger('Auth')
 * log.info('Connexion réussie')  // → [Auth] Connexion réussie
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerOptions {
  prefix?: string
  enabled?: boolean
  minLevel?: LogLevel
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Niveau minimum configurable via env
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Désactiver les logs en test si souhaité
const IS_ENABLED = process.env.NODE_ENV !== 'test' || process.env.LOG_IN_TESTS === 'true'

/**
 * Formatte un message avec timestamp et préfixe
 */
function formatMessage(prefix: string | undefined, ...args: unknown[]): unknown[] {
  if (prefix) {
    return [`[${prefix}]`, ...args]
  }
  return args
}

/**
 * Vérifie si un niveau de log est actif
 */
function shouldLog(level: LogLevel, minLevel: LogLevel = MIN_LEVEL): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

/**
 * Classe Logger avec support des niveaux et préfixes
 */
class Logger {
  private prefix?: string
  private enabled: boolean
  private minLevel: LogLevel

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix
    this.enabled = options.enabled ?? IS_ENABLED
    this.minLevel = options.minLevel ?? MIN_LEVEL
  }

  /**
   * Log niveau debug (développement uniquement)
   */
  debug(...args: unknown[]): void {
    if (this.enabled && shouldLog('debug', this.minLevel)) {
      console.debug(...formatMessage(this.prefix, ...args))
    }
  }

  /**
   * Log niveau info
   */
  info(...args: unknown[]): void {
    if (this.enabled && shouldLog('info', this.minLevel)) {
      console.log(...formatMessage(this.prefix, ...args))
    }
  }

  /**
   * Log niveau warn
   */
  warn(...args: unknown[]): void {
    if (this.enabled && shouldLog('warn', this.minLevel)) {
      console.warn(...formatMessage(this.prefix, ...args))
    }
  }

  /**
   * Log niveau error
   */
  error(...args: unknown[]): void {
    if (this.enabled && shouldLog('error', this.minLevel)) {
      console.error(...formatMessage(this.prefix, ...args))
    }
  }

  /**
   * Log une erreur avec stack trace
   */
  exception(message: string, error: unknown): void {
    if (this.enabled && shouldLog('error', this.minLevel)) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined

      console.error(...formatMessage(this.prefix, message, '-', errorMessage))
      if (stack && process.env.NODE_ENV !== 'production') {
        console.error(stack)
      }
    }
  }

  /**
   * Crée un sous-logger avec préfixe additionnel
   */
  child(subPrefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix
    return new Logger({
      prefix: newPrefix,
      enabled: this.enabled,
      minLevel: this.minLevel,
    })
  }
}

/**
 * Logger global par défaut
 */
export const logger = new Logger()

/**
 * Factory pour créer un logger avec préfixe
 *
 * @example
 * const log = createLogger('Auth')
 * log.info('Connexion réussie', { userId: '123' })
 * // Output: [Auth] Connexion réussie { userId: '123' }
 */
export function createLogger(prefix: string, options?: Omit<LoggerOptions, 'prefix'>): Logger {
  return new Logger({ ...options, prefix })
}

// Loggers pré-configurés pour les modules principaux
export const loggers = {
  auth: createLogger('Auth'),
  db: createLogger('DB'),
  api: createLogger('API'),
  webhook: createLogger('Webhook'),
  email: createLogger('Email'),
  flouci: createLogger('Flouci'),
  ai: createLogger('AI'),
  storage: createLogger('Storage'),
}

export type { LogLevel, LoggerOptions, Logger }
