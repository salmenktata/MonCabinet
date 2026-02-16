/**
 * Utilitaires de gestion d'erreurs type-safe
 *
 * Phase 4.4 - Type Safety
 * Remplace pattern `error: any` + `error.message` non sécurisé
 */

/**
 * Extrait le message d'une erreur de manière type-safe
 *
 * @param error - Erreur inconnue (catch block)
 * @returns Message d'erreur ou chaîne par défaut
 *
 * @example
 * ```typescript
 * try {
 *   // ...
 * } catch (error) {
 *   const message = getErrorMessage(error)
 *   console.error('Erreur:', message)
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }

  return 'Une erreur inconnue s\'est produite'
}

/**
 * Extrait le stack trace d'une erreur de manière type-safe
 *
 * @param error - Erreur inconnue
 * @returns Stack trace ou undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack
  }

  return undefined
}

/**
 * Convertit une erreur en objet sérialisable (pour logs/API)
 *
 * @param error - Erreur inconnue
 * @returns Objet avec message, name, stack
 *
 * @example
 * ```typescript
 * try {
 *   // ...
 * } catch (error) {
 *   const errorObj = serializeError(error)
 *   logger.error('API failed', errorObj)
 * }
 * ```
 */
export function serializeError(error: unknown): {
  message: string
  name: string
  stack?: string
  raw?: unknown
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: getErrorMessage(error),
    name: 'UnknownError',
    raw: error,
  }
}

/**
 * Vérifie si une erreur est d'un type spécifique
 *
 * @param error - Erreur inconnue
 * @param errorClass - Classe d'erreur attendue
 * @returns true si l'erreur est du type attendu
 *
 * @example
 * ```typescript
 * if (isErrorOfType(error, TypeError)) {
 *   // Gérer TypeError spécifiquement
 * }
 * ```
 */
export function isErrorOfType<T extends Error>(
  error: unknown,
  errorClass: new (...args: any[]) => T
): error is T {
  return error instanceof errorClass
}

/**
 * Helper pour créer des erreurs personnalisées
 *
 * @example
 * ```typescript
 * class ValidationError extends CustomError {
 *   constructor(message: string, public field: string) {
 *     super(message, 'ValidationError')
 *   }
 * }
 * ```
 */
export class CustomError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message)
    this.name = 'CustomError'
    Object.setPrototypeOf(this, CustomError.prototype)
  }
}

/**
 * Erreurs métier courantes (exemples)
 */
export class NotFoundError extends CustomError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} avec ID ${id} introuvable`
      : `${resource} introuvable`
    super(message, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends CustomError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class UnauthorizedError extends CustomError {
  constructor(message: string = 'Non autorisé') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}
