/**
 * Utilitaires de traitement de texte extraits de content-extractor.ts
 * Fonctions de hashing, comptage, normalisation et détection de langue
 */

import crypto from 'crypto'
import { normalizeArabicText } from './arabic-text-utils'

/**
 * Génère un hash SHA256 du contenu
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Génère un hash SHA256 d'une URL (pour déduplication)
 */
export function hashUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    urlObj.hash = ''
    urlObj.searchParams.delete('utm_source')
    urlObj.searchParams.delete('utm_medium')
    urlObj.searchParams.delete('utm_campaign')

    return crypto.createHash('sha256').update(urlObj.href).digest('hex')
  } catch {
    return crypto.createHash('sha256').update(url).digest('hex')
  }
}

/**
 * Compte les mots dans un texte
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Nettoie et normalise le texte unicode
 * Intègre la normalisation arabe pour les textes juridiques tunisiens
 */
export function normalizeText(text: string, options?: { stripDiacritics?: boolean; preserveNewlines?: boolean }): string {
  let result = text
    // Normaliser les caractères unicode composés
    .normalize('NFC')
    // Supprimer les caractères de contrôle
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normaliser les espaces (préserver les \n si demandé pour le chunking par articles)
    .replace(options?.preserveNewlines ? /[^\S\n]+/g : /\s+/g, ' ')
    // Normaliser les tirets
    .replace(/[\u2010-\u2015]/g, '-')
    // Normaliser les apostrophes
    .replace(/[\u2018\u2019\u201B]/g, "'")
    // Normaliser les guillemets
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')

  // Si preserveNewlines, normaliser les \n multiples en \n\n max
  if (options?.preserveNewlines) {
    result = result.replace(/\n{3,}/g, '\n\n')
  }

  // Normalisation arabe (alef variants, chiffres, espaces, diacritiques optionnels)
  result = normalizeArabicText(result, options)

  return result.trim()
}

/**
 * Détecte la langue d'un texte (simple heuristique)
 */
export function detectTextLanguage(text: string): 'ar' | 'fr' | 'mixed' | null {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length

  const total = arabicChars + latinChars
  if (total < 50) return null

  const arabicRatio = arabicChars / total
  const latinRatio = latinChars / total

  if (arabicRatio > 0.7) return 'ar'
  if (latinRatio > 0.7) return 'fr'
  if (arabicRatio > 0.3 && latinRatio > 0.3) return 'mixed'

  return latinRatio > arabicRatio ? 'fr' : 'ar'
}
