/**
 * Détecteur de contenu OCR arabe corrompu
 *
 * Identifie les documents dont le contenu est inutilisable pour le RAG :
 * - OCR arabe cassé (lettres isolées séparées par des espaces)
 * - En-têtes IORT dans le corps du document
 * - Mélange incohérent de caractères arabes et latins
 */

export interface CorruptionResult {
  isCorrupted: boolean
  score: number // 0.0 à 1.0
  reasons: string[]
}

const CORRUPTION_THRESHOLD = 0.6

/**
 * Détecte si un contenu texte est un OCR arabe corrompu non utilisable.
 * Score > CORRUPTION_THRESHOLD = corrompu.
 */
export function detectOcrCorruption(content: string): CorruptionResult {
  if (!content || content.length < 100) {
    return { isCorrupted: false, score: 0, reasons: [] }
  }

  const reasons: string[] = []
  let score = 0

  // 1. En-tête IORT dans le corps → signal très fort (couverture PDF scannée)
  if (content.includes('Imprimerie Officielle de la République Tunisienne')) {
    score += 0.5
    reasons.push('En-tête IORT dans le corps du document')
  }

  // 2. Ratio de tokens courts (1-2 chars) → OCR arabe cassé = lettres isolées
  const tokens = content.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length > 50) {
    const shortTokens = tokens.filter(t => t.length <= 2)
    const shortRatio = shortTokens.length / tokens.length
    if (shortRatio > 0.65) {
      score += 0.35
      reasons.push(`${Math.round(shortRatio * 100)}% de tokens ≤ 2 chars (OCR arabe fragmenté)`)
    } else if (shortRatio > 0.50) {
      score += 0.20
      reasons.push(`${Math.round(shortRatio * 100)}% de tokens ≤ 2 chars (OCR suspect)`)
    }
  }

  // 3. Pattern lettres arabes isolées enchaînées : arabe-espace-arabe-espace-arabe
  // Ex : "K 6 G ). <P" ou "4 F 4'F G H3"
  const arabicIsolatedPattern = /[\u0600-\u06FF]\s[\u0600-\u06FF\u0660-\u0669]\s[\u0600-\u06FF]/g
  const arabicIsolatedMatches = content.match(arabicIsolatedPattern)
  if (arabicIsolatedMatches && arabicIsolatedMatches.length > 20) {
    score += 0.30
    reasons.push(`${arabicIsolatedMatches.length} séquences de lettres arabes isolées`)
  } else if (arabicIsolatedMatches && arabicIsolatedMatches.length > 10) {
    score += 0.15
    reasons.push(`${arabicIsolatedMatches.length} séquences de lettres arabes isolées`)
  }

  // 4. Densité de caractères spéciaux non-textuels élevée
  const specialChars = content.match(/[*#$%&!^|\\~<>{}=]/g)
  if (specialChars) {
    const specialRatio = specialChars.length / content.length
    if (specialRatio > 0.025) {
      score += 0.20
      reasons.push(`${Math.round(specialRatio * 100)}% de caractères spéciaux anormaux`)
    } else if (specialRatio > 0.015) {
      score += 0.10
      reasons.push(`${Math.round(specialRatio * 100)}% de caractères spéciaux élevés`)
    }
  }

  // 5. Mélange arabe-majuscule isolée-arabe : "K 6" style (lettre latine isolée entre arabes)
  const mixedPattern = /[\u0600-\u06FF]\s[A-Z]\s[\u0600-\u06FF]/g
  const mixedMatches = content.match(mixedPattern)
  if (mixedMatches && mixedMatches.length > 15) {
    score += 0.25
    reasons.push(`${mixedMatches.length} mélanges arabe-latin isolé-arabe`)
  } else if (mixedMatches && mixedMatches.length > 8) {
    score += 0.15
    reasons.push(`${mixedMatches.length} mélanges arabe-latin isolé-arabe`)
  }

  // 6. Ratio de chiffres isolés (numéros d'articles OCR fragmentés)
  const isolatedNumbers = tokens.filter(t => /^\d{1,3}$/.test(t))
  if (tokens.length > 50) {
    const numberRatio = isolatedNumbers.length / tokens.length
    if (numberRatio > 0.12) {
      score += 0.15
      reasons.push(`${Math.round(numberRatio * 100)}% de tokens = chiffres isolés`)
    }
  }

  // Plafonner à 1.0
  score = Math.min(score, 1.0)

  return {
    isCorrupted: score >= CORRUPTION_THRESHOLD,
    score: Math.round(score * 100) / 100,
    reasons,
  }
}

export { CORRUPTION_THRESHOLD }
