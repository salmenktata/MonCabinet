/**
 * Utilitaires pour manipulation sécurisée des nombres
 * Empêche les crashs TypeError sur null/undefined/NaN
 */

/**
 * Formate un nombre avec décimales fixes, gère null/undefined/NaN
 * @param value - Valeur à formater
 * @param decimals - Nombre de décimales (défaut: 2)
 * @returns String formaté ou "0.00" si invalide
 */
export function safeToFixed(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0.' + '0'.repeat(decimals)
  }
  return value.toFixed(decimals)
}

/**
 * Parse un entier de manière sécurisée avec validation et limites
 * @param value - Valeur à parser
 * @param defaultValue - Valeur par défaut si parsing échoue
 * @param min - Valeur minimale (optionnel)
 * @param max - Valeur maximale (optionnel)
 * @returns Entier parsé et validé
 */
export function safeParseInt(
  value: string | null | undefined,
  defaultValue: number = 0,
  min?: number,
  max?: number
): number {
  const parsed = parseInt(value || String(defaultValue), 10)
  let result = isNaN(parsed) ? defaultValue : parsed

  if (min !== undefined) {
    result = Math.max(min, result)
  }
  if (max !== undefined) {
    result = Math.min(max, result)
  }

  return result
}

/**
 * Parse un float de manière sécurisée avec validation et limites
 * @param value - Valeur à parser
 * @param defaultValue - Valeur par défaut si parsing échoue
 * @param min - Valeur minimale (optionnel)
 * @param max - Valeur maximale (optionnel)
 * @returns Float parsé et validé
 */
export function safeParseFloat(
  value: string | null | undefined,
  defaultValue: number = 0.0,
  min?: number,
  max?: number
): number {
  const parsed = parseFloat(value || String(defaultValue))
  let result = isNaN(parsed) ? defaultValue : parsed

  if (min !== undefined) {
    result = Math.max(min, result)
  }
  if (max !== undefined) {
    result = Math.min(max, result)
  }

  return result
}

/**
 * Vérifie si une valeur est un nombre valide
 * @param value - Valeur à vérifier
 * @returns true si nombre valide, false sinon
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

/**
 * Formate un nombre en pourcentage sécurisé
 * @param value - Valeur à formater (0-1 ou 0-100)
 * @param decimals - Nombre de décimales
 * @param isDecimal - true si valeur entre 0-1, false si 0-100
 * @returns String formaté (ex: "45.67%")
 */
export function safeToPercentage(
  value: number | null | undefined,
  decimals: number = 2,
  isDecimal: boolean = true
): string {
  if (!isValidNumber(value)) {
    return '0.' + '0'.repeat(decimals) + '%'
  }

  const percent = isDecimal ? value * 100 : value
  return safeToFixed(percent, decimals) + '%'
}
