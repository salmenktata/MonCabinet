/**
 * Service de Détection d'Abrogations Juridiques
 *
 * Analyse les messages utilisateur pour détecter des références à des lois abrogées
 * et retourner des alertes avec suggestions de remplacement.
 */

import type { LegalAbrogation, AbrogationSearchResult } from '@/types/legal-abrogations'
import type { LegalReference, AbrogationAlert } from '@/types/abrogation-alerts'
import { db } from '@/lib/db/postgres'

// Re-export pour compatibilité
export type { LegalReference, AbrogationAlert }

/**
 * Patterns de détection de références juridiques tunisiennes
 */
const LEGAL_PATTERNS = [
  // Codes
  {
    pattern: /Code\s+(pénal|civil|du\s+travail|de\s+commerce|des\s+obligations)/gi,
    type: 'code' as const,
  },
  // Articles de codes
  {
    pattern:
      /(?:article|art\.?|فصل)\s*(\d+(?:-\d+)?)\s*(?:du\s+)?(Code\s+(?:pénal|civil|du\s+travail))/gi,
    type: 'article' as const,
  },
  // Lois avec numéro
  {
    pattern: /(?:loi|قانون)\s*(?:n°|عدد|numero)?\s*(\d{1,4}[-\/]\d{2,4})/gi,
    type: 'law' as const,
  },
  // Décrets-lois
  {
    pattern: /(?:décret-loi|مرسوم-قانون)\s*(?:n°|عدد)?\s*(\d{4}-\d+)/gi,
    type: 'decree' as const,
  },
  // Lois organiques
  {
    pattern: /(?:loi\s+organique|قانون\s+أساسي)\s*(?:n°|عدد)?\s*(\d{4}-\d+)/gi,
    type: 'law' as const,
  },
  // Références arabes spécifiques
  {
    pattern: /(?:المجلة|مجلة)\s+(الجنائية|المدنية|الجزائية|الشغل)/g,
    type: 'code' as const,
  },
]

/**
 * Extrait les références juridiques d'un texte
 */
export function extractLegalReferences(text: string): LegalReference[] {
  const references: LegalReference[] = []
  const seen = new Set<string>() // Éviter doublons

  for (const { pattern, type } of LEGAL_PATTERNS) {
    const matches = text.matchAll(pattern)

    for (const match of matches) {
      const reference = match[0].trim()

      // Skip si déjà trouvé (éviter doublons)
      if (seen.has(reference.toLowerCase())) continue
      seen.add(reference.toLowerCase())

      references.push({
        text: reference,
        type,
        confidence: calculateConfidence(reference, type),
      })
    }
  }

  return references
}

/**
 * Calcule le niveau de confiance d'une référence détectée
 */
function calculateConfidence(reference: string, type: string): number {
  let confidence = 0.6 // Base

  // Boost si numéro spécifique
  if (/\d+/.test(reference)) confidence += 0.2

  // Boost si mention d'article
  if (/article|art\.|فصل/.test(reference)) confidence += 0.1

  // Boost si référence complète (code + article)
  if (type === 'article' && /Code/.test(reference)) confidence += 0.1

  return Math.min(confidence, 1)
}

/**
 * Recherche des abrogations pour une liste de références
 */
export async function searchAbrogationsForReferences(
  references: LegalReference[],
  threshold: number = 0.5
): Promise<AbrogationSearchResult[]> {
  if (references.length === 0) return []

  const allResults: AbrogationSearchResult[] = []

  // Rechercher pour chaque référence — appel DB direct (pas de fetch relatif côté serveur)
  for (const ref of references) {
    try {
      const result = await db.query(
        `SELECT * FROM find_abrogations($1, $2, $3)`,
        [ref.text, threshold, 3]
      )
      if (result.rows.length > 0) {
        const mapped: AbrogationSearchResult[] = result.rows.map((row) => ({
          id: row.id,
          abrogatedReference: row.abrogated_reference,
          abrogatedReferenceAr: row.abrogated_reference_ar,
          abrogatingReference: row.abrogating_reference,
          abrogatingReferenceAr: row.abrogating_reference_ar,
          abrogationDate: row.abrogation_date,
          scope: row.scope as 'total' | 'partial' | 'implicit',
          affectedArticles: row.affected_articles || [],
          jortUrl: row.jort_url || '',
          sourceUrl: row.source_url || '',
          notes: row.notes || '',
          domain: row.domain,
          verified: row.verified,
          confidence: row.confidence as 'high' | 'medium' | 'low',
          verificationStatus: row.verification_status as 'verified' | 'pending' | 'disputed',
          similarityScore: parseFloat(row.similarity_score),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))
        allResults.push(...mapped)
      }
    } catch (error) {
      console.error('[AbrogationDetector] Search error:', error)
    }
  }

  // Dédupliquer par ID
  const uniqueResults = Array.from(
    new Map(allResults.map((r) => [r.id, r])).values()
  )

  // Trier par similarité décroissante
  return uniqueResults.sort((a, b) => b.similarityScore - a.similarityScore)
}

/**
 * Génère des alertes d'abrogation à partir des résultats de recherche
 */
export function generateAbrogationAlerts(
  references: LegalReference[],
  abrogations: AbrogationSearchResult[]
): AbrogationAlert[] {
  const alerts: AbrogationAlert[] = []

  for (const abrogation of abrogations) {
    // Trouver la référence qui correspond le mieux
    const matchingRef = references.find((ref) =>
      abrogation.abrogatedReference.toLowerCase().includes(ref.text.toLowerCase()) ||
      ref.text.toLowerCase().includes(abrogation.abrogatedReference.toLowerCase())
    ) || references[0] // Fallback première référence

    const severity = determineSeverity(abrogation)
    const message = formatAlertMessage(abrogation)
    const replacement = formatReplacementSuggestion(abrogation)

    alerts.push({
      reference: matchingRef,
      abrogation,
      severity,
      message,
      replacementSuggestion: replacement,
    })
  }

  return alerts
}

/**
 * Détermine le niveau de sévérité de l'alerte
 */
function determineSeverity(
  abrogation: AbrogationSearchResult
): 'critical' | 'warning' | 'info' {
  // Abrogation totale = critique
  if (abrogation.scope === 'total') return 'critical'

  // Haute confiance + vérifiée = warning
  if (abrogation.confidence === 'high' && abrogation.verified) return 'warning'

  // Autres cas = info
  return 'info'
}

/**
 * Formate le message d'alerte
 */
function formatAlertMessage(abrogation: AbrogationSearchResult): string {
  const date = new Date(abrogation.abrogationDate).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const scopeText =
    abrogation.scope === 'total'
      ? 'totalement abrogée'
      : abrogation.scope === 'partial'
        ? 'partiellement abrogée'
        : 'implicitement abrogée'

  let message = `⚠️ **Attention** : ${abrogation.abrogatedReference} a été **${scopeText}**`

  if (abrogation.abrogatingReference) {
    message += ` par ${abrogation.abrogatingReference}`
  }

  message += ` le **${date}**.`

  if (abrogation.affectedArticles && abrogation.affectedArticles.length > 0) {
    message += `\n\n**Articles concernés** : ${abrogation.affectedArticles.join(', ')}`
  }

  return message
}

/**
 * Formate la suggestion de remplacement
 */
function formatReplacementSuggestion(abrogation: AbrogationSearchResult): string {
  if (!abrogation.abrogatingReference) return ''

  let suggestion = `📜 **Nouvelle référence** : ${abrogation.abrogatingReference}`

  if (abrogation.abrogatingReferenceAr) {
    suggestion += `\n${abrogation.abrogatingReferenceAr}`
  }

  return suggestion
}

/**
 * Fonction principale : Détecte et alerte sur les abrogations dans un texte
 */
export async function detectAbrogations(
  userMessage: string,
  options: {
    threshold?: number
    minConfidence?: number
  } = {}
): Promise<AbrogationAlert[]> {
  const { threshold = 0.5, minConfidence = 0.6 } = options

  // 1. Extraire références juridiques
  const references = extractLegalReferences(userMessage)

  // Filtrer par confiance minimale
  const validReferences = references.filter((ref) => ref.confidence >= minConfidence)

  if (validReferences.length === 0) {
    return []
  }

  console.log('[AbrogationDetector] Références détectées:', validReferences.length)

  // 2. Rechercher abrogations
  const abrogations = await searchAbrogationsForReferences(validReferences, threshold)

  if (abrogations.length === 0) {
    return []
  }

  console.log('[AbrogationDetector] Abrogations trouvées:', abrogations.length)

  // 3. Générer alertes
  const alerts = generateAbrogationAlerts(validReferences, abrogations)

  return alerts
}

/**
 * Fonction utilitaire pour usage serveur (SSR)
 * Appelle directement la BD sans passer par l'API
 */
export async function detectAbrogationsServer(
  userMessage: string,
  options: {
    threshold?: number
    minConfidence?: number
  } = {}
): Promise<AbrogationAlert[]> {
  // Import dynamique pour éviter erreur client
  const { db } = await import('@/lib/db/postgres')

  const { threshold = 0.5, minConfidence = 0.6 } = options

  const references = extractLegalReferences(userMessage)
  const validReferences = references.filter((ref) => ref.confidence >= minConfidence)

  if (validReferences.length === 0) return []

  const allResults: AbrogationSearchResult[] = []

  for (const ref of validReferences) {
    const result = await db.query(
      `SELECT * FROM find_abrogations($1, $2, 3)`,
      [ref.text, threshold]
    )

    if (result.rows.length > 0) {
      allResults.push(
        ...result.rows.map((row: any) => ({
          id: row.id,
          abrogatedReference: row.abrogated_reference,
          abrogatedReferenceAr: row.abrogated_reference_ar,
          abrogatingReference: row.abrogating_reference,
          abrogatingReferenceAr: row.abrogating_reference_ar,
          abrogationDate: row.abrogation_date,
          scope: row.scope,
          affectedArticles: row.affected_articles || [],
          jortUrl: row.jort_url,
          sourceUrl: row.source_url,
          notes: row.notes,
          domain: row.domain,
          verified: row.verified,
          confidence: row.confidence,
          verificationStatus: row.verification_status,
          similarityScore: parseFloat(row.similarity_score),
        }))
      )
    }
  }

  const uniqueResults = Array.from(new Map(allResults.map((r) => [r.id, r])).values())
  const sortedResults = uniqueResults.sort((a, b) => b.similarityScore - a.similarityScore)

  return generateAbrogationAlerts(validReferences, sortedResults)
}
