/**
 * Calcule le temps de lecture estimé pour un texte donné
 * Basé sur une vitesse moyenne de 200 mots par minute
 */
export function calculateReadingTime(text: string): number {
  // Nombre de mots par minute (moyenne pour un adulte)
  const WORDS_PER_MINUTE = 200

  // Compter les mots (séparés par des espaces)
  const wordCount = text.trim().split(/\s+/).length

  // Calculer le temps en minutes
  const minutes = wordCount / WORDS_PER_MINUTE

  // Arrondir au supérieur pour éviter 0 minutes
  return Math.ceil(minutes)
}

/**
 * Formate le temps de lecture en chaîne lisible
 */
export function formatReadingTime(minutes: number, locale: string = 'fr'): string {
  if (minutes < 1) {
    return locale === 'ar' ? '< دقيقة واحدة' : '< 1 min'
  }

  if (minutes === 1) {
    return locale === 'ar' ? 'دقيقة واحدة' : '1 min'
  }

  return locale === 'ar' ? `${minutes} دقائق` : `${minutes} min`
}

/**
 * Calcule le temps de lecture estimé pour un objet (en extrayant toutes les chaînes)
 */
export function calculateReadingTimeFromObject(obj: any): number {
  let text = ''

  function extractText(value: any) {
    if (typeof value === 'string') {
      text += value + ' '
    } else if (Array.isArray(value)) {
      value.forEach(extractText)
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(extractText)
    }
  }

  extractText(obj)
  return calculateReadingTime(text)
}
