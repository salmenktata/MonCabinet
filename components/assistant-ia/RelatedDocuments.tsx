'use client'

/**
 * Composant d'affichage des documents juridiques liés
 *
 * Affiche les relations juridiques d'un document :
 * - Citations (↗️)
 * - Cité par (↙️)
 * - Remplace/Abrogé (⚠️)
 * - Documents liés (🔗)
 *
 * @module components/assistant-ia/RelatedDocuments
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react'
import type { EnhancedSearchResult } from '@/lib/ai/enhanced-rag-search-service'

// =============================================================================
// TYPES
// =============================================================================

interface RelatedDocumentsProps {
  /** Document source avec relations */
  document: EnhancedSearchResult
  /** Callback lors du clic sur un document lié */
  onDocumentClick?: (kbId: string) => void
  /** Classe CSS personnalisée */
  className?: string
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function RelatedDocuments({
  document,
  onDocumentClick,
  className = '',
}: RelatedDocumentsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!document.relations) {
    return null
  }

  const { cites = [], citedBy = [], supersedes = [], supersededBy = [], relatedCases = [] } = document.relations

  const totalRelations = cites.length + citedBy.length + supersedes.length + supersededBy.length + relatedCases.length

  if (totalRelations === 0) {
    return null
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Documents liés
          </span>
          <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
            {totalRelations}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Relations content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {/* Citations (ce document cite d'autres) */}
          {cites.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <span>↗️</span>
                <span>Cite ({cites.length})</span>
              </h4>
              <ul className="space-y-2">
                {cites.map((relation, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => onDocumentClick?.(relation.relatedKbId)}
                      className="w-full text-left p-2 rounded bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {relation.relatedTitle}
                          </p>
                          <p className="text-xs text-muted-foreground dark:text-muted-foreground/80 mt-1">
                            {relation.relatedCategory}
                          </p>
                          {relation.context && (
                            <p className="text-xs text-gray-600 dark:text-muted-foreground/80 mt-1 line-clamp-2">
                              "{relation.context}"
                            </p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/80 group-hover:text-primary-600 flex-shrink-0 ml-2" />
                      </div>
                      {relation.confidence && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                          {Math.round(relation.confidence * 100)}% confiance
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cité par (d'autres documents citent celui-ci) */}
          {citedBy.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <span>↙️</span>
                <span>Cité par ({citedBy.length})</span>
              </h4>
              <ul className="space-y-2">
                {citedBy.map((relation, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => onDocumentClick?.(relation.relatedKbId)}
                      className="w-full text-left p-2 rounded bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {relation.relatedTitle}
                          </p>
                          <p className="text-xs text-muted-foreground dark:text-muted-foreground/80 mt-1">
                            {relation.relatedCategory}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/80 group-hover:text-primary-600 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Remplace/Abroge */}
          {supersedes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <span>⚠️</span>
                <span>Remplace/Abroge ({supersedes.length})</span>
              </h4>
              <ul className="space-y-2">
                {supersedes.map((relation, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => onDocumentClick?.(relation.relatedKbId)}
                      className="w-full text-left p-2 rounded bg-orange-50 dark:bg-orange-950 hover:bg-orange-100 dark:hover:bg-orange-900 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {relation.relatedTitle}
                          </p>
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            Abrogé/Remplacé
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/80 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Jurisprudences liées */}
          {relatedCases.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <span>🔗</span>
                <span>Cas similaires ({relatedCases.length})</span>
              </h4>
              <ul className="space-y-2">
                {relatedCases.map((relation, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => onDocumentClick?.(relation.relatedKbId)}
                      className="w-full text-left p-2 rounded bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {relation.relatedTitle}
                          </p>
                          <p className="text-xs text-muted-foreground dark:text-muted-foreground/80 mt-1">
                            Problématique similaire
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/80 group-hover:text-primary-600 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
