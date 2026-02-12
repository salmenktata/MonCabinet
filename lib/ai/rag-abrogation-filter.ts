/**
 * Filtre RAG pour exclure documents abrogés/suspendus
 *
 * Intégration avec le pipeline RAG pour valider les sources
 * avant de les utiliser dans la génération de réponse.
 *
 * @module lib/ai/rag-abrogation-filter
 */

import { validateDocumentActive, type AbrogationMetadata } from '@/lib/knowledge-base/abrogation-detector'
import type { ChatSource } from './rag-chat-service'

// =============================================================================
// TYPES
// =============================================================================

export interface FilteredSource extends ChatSource {
  abrogationWarning?: string    // Warning si document modifié
  abrogationStatus?: string      // Statut pour logging
}

export interface AbrogationFilterResult {
  validSources: FilteredSource[]
  filteredCount: number
  reasons: {
    abrogated: number
    suspended: number
    notFound: number
  }
}

// =============================================================================
// FILTRAGE PRINCIPAL
// =============================================================================

/**
 * Filtre les sources RAG pour exclure documents abrogés/suspendus
 *
 * Workflow :
 * 1. Pour chaque source KB, vérifier métadonnées abrogation
 * 2. Exclure si abrogé ou suspendu
 * 3. Ajouter warning si modifié
 * 4. Logger les exclusions pour monitoring
 *
 * @param sources - Sources RAG à filtrer
 * @param options - Options de filtrage
 * @returns Sources valides + statistiques filtrage
 */
export async function filterAbrogatedSources(
  sources: ChatSource[],
  options: {
    enableFilter?: boolean         // Activer/désactiver filtre (défaut: true)
    warnOnModified?: boolean      // Warning si modifié (défaut: true)
    logExclusions?: boolean       // Logger exclusions (défaut: true)
  } = {}
): Promise<AbrogationFilterResult> {
  const {
    enableFilter = true,
    warnOnModified = true,
    logExclusions = true,
  } = options

  // Si filtre désactivé, retourner toutes les sources
  if (!enableFilter) {
    return {
      validSources: sources,
      filteredCount: 0,
      reasons: { abrogated: 0, suspended: 0, notFound: 0 },
    }
  }

  const validSources: FilteredSource[] = []
  const reasons = {
    abrogated: 0,
    suspended: 0,
    notFound: 0,
  }

  for (const source of sources) {
    // Filtrer uniquement les sources de type knowledge_base
    const isKB = source.metadata?.type === 'knowledge_base'
    if (!isKB) {
      // Documents utilisateur/dossiers → toujours valides
      validSources.push(source)
      continue
    }

    // Valider si document KB est actif
    const validation = await validateDocumentActive(source.documentId)

    if (!validation.isActive) {
      // Document abrogé ou suspendu → EXCLURE
      if (logExclusions) {
        console.log(`[RAG Filter] ❌ Exclu: ${source.documentName} - ${validation.reason}`)
      }

      if (validation.reason?.includes('abrogé')) {
        reasons.abrogated++
      } else if (validation.reason?.includes('suspendu')) {
        reasons.suspended++
      } else {
        reasons.notFound++
      }

      continue // Ne pas ajouter à validSources
    }

    // Document actif → INCLURE
    const filteredSource: FilteredSource = { ...source }

    // Si modifié, ajouter warning
    if (warnOnModified && validation.metadata?.status === 'modified') {
      const modifiedBy = validation.metadata.modifiedBy?.[0]
      const modificationDate = validation.metadata.modificationDates?.[0]

      filteredSource.abrogationWarning = `⚠️ Document modifié ${modifiedBy ? `par ${modifiedBy}` : ''} ${modificationDate ? `le ${modificationDate}` : ''}`
      filteredSource.abrogationStatus = 'modified'

      if (logExclusions) {
        console.log(`[RAG Filter] ⚠️  Modifié: ${source.documentName} - ${filteredSource.abrogationWarning}`)
      }
    }

    validSources.push(filteredSource)
  }

  const filteredCount = sources.length - validSources.length

  if (logExclusions && filteredCount > 0) {
    console.log(`[RAG Filter] 📊 Statistiques:`)
    console.log(`  Total sources: ${sources.length}`)
    console.log(`  Valides: ${validSources.length}`)
    console.log(`  Filtrées: ${filteredCount}`)
    console.log(`    - Abrogées: ${reasons.abrogated}`)
    console.log(`    - Suspendues: ${reasons.suspended}`)
    console.log(`    - Non trouvées: ${reasons.notFound}`)
  }

  return {
    validSources,
    filteredCount,
    reasons,
  }
}

// =============================================================================
// FORMATAGE WARNINGS
// =============================================================================

/**
 * Formate les warnings abrogation pour affichage dans la réponse
 *
 * Génère un message d'avertissement à ajouter à la réponse
 * si des documents modifiés sont utilisés.
 */
export function formatAbrogationWarnings(sources: FilteredSource[]): string | null {
  const modifiedSources = sources.filter(s => s.abrogationWarning)

  if (modifiedSources.length === 0) {
    return null
  }

  const warnings = modifiedSources.map(s => `- ${s.documentName}: ${s.abrogationWarning}`)

  return `\n\n⚠️ **Avertissement** : Certaines sources utilisées ont été modifiées :\n${warnings.join('\n')}\n\nVeuillez vérifier la version actuelle de ces textes.`
}

// =============================================================================
// MÉTRIQUES MONITORING
// =============================================================================

/**
 * Structure de métriques pour le monitoring qualité
 */
export interface AbrogationFilterMetrics {
  timestamp: string
  totalSources: number
  filteredCount: number
  filterRate: number              // % sources filtrées
  abrogatedCount: number
  suspendedCount: number
  modifiedCount: number
}

/**
 * Extrait les métriques de filtrage pour monitoring
 */
export function extractFilterMetrics(result: AbrogationFilterResult, sources: FilteredSource[]): AbrogationFilterMetrics {
  const modifiedCount = sources.filter(s => s.abrogationStatus === 'modified').length

  return {
    timestamp: new Date().toISOString(),
    totalSources: sources.length + result.filteredCount,
    filteredCount: result.filteredCount,
    filterRate: result.filteredCount / (sources.length + result.filteredCount) * 100,
    abrogatedCount: result.reasons.abrogated,
    suspendedCount: result.reasons.suspended,
    modifiedCount,
  }
}
