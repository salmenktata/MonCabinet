/**
 * Composant Visualisation Arbre Décisionnel (Phase 3.3)
 *
 * Affichage interactif d'un arbre de raisonnement juridique avec :
 * - Expand/collapse nodes
 * - Badges confiance colorés
 * - Hover sources avec détails
 * - Export JSON/Markdown
 *
 * @module components/chat/ExplanationTreeView
 */

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Download, Info } from 'lucide-react'
import type {
  ExplanationTree,
  ExplanationNode,
  SourceReference,
  NodeExpansionState,
} from '@/lib/types/explanation-tree'
import {
  getConfidenceLevel,
  getConfidenceColor,
  getConfidenceBadge,
} from '@/lib/types/explanation-tree'

// =============================================================================
// PROPS
// =============================================================================

interface ExplanationTreeViewProps {
  tree: ExplanationTree
  onNodeClick?: (node: ExplanationNode) => void
  onSourceClick?: (source: SourceReference) => void
  expandedByDefault?: boolean
  className?: string
}

interface TreeNodeProps {
  node: ExplanationNode
  depth: number
  isExpanded: boolean
  onToggle: (nodeId: string) => void
  onNodeClick?: (node: ExplanationNode) => void
  onSourceClick?: (source: SourceReference) => void
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ExplanationTreeView({
  tree,
  onNodeClick,
  onSourceClick,
  expandedByDefault = true,
  className = '',
}: ExplanationTreeViewProps) {
  // État expansion nœuds
  const [expansionState, setExpansionState] = useState<NodeExpansionState>(() => {
    if (!expandedByDefault) return {}

    // Expand tous par défaut
    const state: NodeExpansionState = {}
    function markExpanded(node: ExplanationNode) {
      state[node.id] = true
      node.children.forEach(markExpanded)
    }
    markExpanded(tree.root)
    return state
  })

  // Toggle expansion
  const handleToggle = (nodeId: string) => {
    setExpansionState(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }))
  }

  // Export handlers
  const handleExportJSON = () => {
    const blob = new Blob([tree.exportFormats.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arbre-decision.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportMarkdown = () => {
    const blob = new Blob([tree.exportFormats.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arbre-decision.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`explanation-tree-view ${className}`}>
      {/* Header */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5" />
            {tree.metadata.language === 'ar' ? 'شجرة القرار القانوني' : 'Arbre Décisionnel'}
          </h3>

          <div className="flex gap-2">
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Exporter JSON"
            >
              <Download className="h-4 w-4" />
              JSON
            </button>
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Exporter Markdown"
            >
              <Download className="h-4 w-4" />
              MD
            </button>
          </div>
        </div>

        {/* Métadonnées */}
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-muted-foreground/80 md:grid-cols-4">
          <div>
            <span className="font-medium">Nœuds :</span> {tree.metadata.totalNodes}
          </div>
          <div>
            <span className="font-medium">Profondeur :</span> {tree.metadata.maxDepth}
          </div>
          <div>
            <span className="font-medium">Sources :</span> {tree.metadata.sourcesUsed}
          </div>
          <div>
            <span className="font-medium">Confiance :</span>{' '}
            <span className={getConfidenceColor(tree.metadata.averageConfidence)}>
              {tree.metadata.averageConfidence}%
            </span>
          </div>
        </div>

        {tree.metadata.controversialNodes > 0 && (
          <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-500">
            ⚠️ {tree.metadata.controversialNodes} nœud(s) controversé(s) détecté(s)
          </div>
        )}
      </div>

      {/* Arbre */}
      <div className="tree-nodes">
        <TreeNode
          node={tree.root}
          depth={0}
          isExpanded={expansionState[tree.root.id] ?? true}
          onToggle={handleToggle}
          onNodeClick={onNodeClick}
          onSourceClick={onSourceClick}
        />
      </div>

      {/* Résumé */}
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h4 className="mb-2 font-semibold">
          {tree.metadata.language === 'ar' ? 'الخلاصة' : 'Conclusion Principale'}
        </h4>
        <p className="text-sm">{tree.summary.mainConclusion}</p>

        {tree.summary.risks.length > 0 && (
          <div className="mt-2">
            <h5 className="text-sm font-medium text-red-600 dark:text-red-400">
              {tree.metadata.language === 'ar' ? 'المخاطر' : 'Risques'} :
            </h5>
            <ul className="ml-4 mt-1 list-disc text-sm">
              {tree.summary.risks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANT NŒUD
// =============================================================================

function TreeNode({
  node,
  depth,
  isExpanded,
  onToggle,
  onNodeClick,
  onSourceClick,
}: TreeNodeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const hasChildren = node.children.length > 0
  const indent = depth * 24 // 24px par niveau

  // Icône type nœud
  const getTypeIcon = () => {
    switch (node.type) {
      case 'question':
        return '❓'
      case 'rule':
        return '📚'
      case 'application':
        return '⚖️'
      case 'synthesis':
        return '🔀'
      case 'conclusion':
        return '✅'
      default:
        return '📄'
    }
  }

  // Couleur bordure selon type
  const getBorderColor = () => {
    switch (node.type) {
      case 'question':
        return 'border-l-blue-500'
      case 'rule':
        return 'border-l-purple-500'
      case 'application':
        return 'border-l-orange-500'
      case 'synthesis':
        return 'border-l-green-500'
      case 'conclusion':
        return 'border-l-teal-500'
      default:
        return 'border-l-gray-500'
    }
  }

  return (
    <div className="tree-node" style={{ marginLeft: `${indent}px` }}>
      {/* Nœud */}
      <div
        className={`my-1 cursor-pointer rounded-lg border-l-4 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 ${getBorderColor()} ${
          node.metadata.isControversial ? 'ring-2 ring-yellow-400' : ''
        }`}
        onClick={() => {
          if (hasChildren) onToggle(node.id)
          if (onNodeClick) onNodeClick(node)
        }}
      >
        <div className="flex items-start gap-2">
          {/* Toggle icon */}
          {hasChildren && (
            <button className="mt-0.5 flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Icône type */}
          <span className="text-lg">{getTypeIcon()}</span>

          {/* Contenu */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
                {node.type}
              </span>

              {/* Badge confiance */}
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  node.confidence >= 80
                    ? 'bg-green-100 text-green-700'
                    : node.confidence >= 60
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {getConfidenceBadge(node.confidence)} {node.confidence}%
              </span>

              {node.metadata.isControversial && (
                <span className="text-xs text-yellow-600" title="Position controversée">
                  ⚠️ Controversé
                </span>
              )}
            </div>

            <p className="mt-1 text-sm">{node.content}</p>

            {/* Sources */}
            {node.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {node.sources.map((source, i) => (
                  <button
                    key={i}
                    onClick={e => {
                      e.stopPropagation()
                      if (onSourceClick) onSourceClick(source)
                    }}
                    className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300"
                    title={source.excerpt || `Source ${source.category}`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            )}

            {/* Métadonnées */}
            {(node.metadata.tribunal || node.metadata.legalBasis) && (
              <div className="mt-2 text-xs text-gray-500 dark:text-muted-foreground/80">
                {node.metadata.tribunal && <span>{node.metadata.tribunal}</span>}
                {node.metadata.tribunal && node.metadata.legalBasis && <span> • </span>}
                {node.metadata.legalBasis && (
                  <span className="italic">{node.metadata.legalBasis}</span>
                )}
              </div>
            )}
          </div>

          {/* Info icon */}
          <button
            className="relative flex-shrink-0"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Info className="h-4 w-4 text-muted-foreground/80" />

            {/* Tooltip */}
            {showTooltip && (
              <div className="absolute right-0 top-6 z-10 w-64 rounded-lg border bg-white p-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <div>
                  <strong>Type :</strong> {node.type}
                </div>
                <div>
                  <strong>Confiance :</strong> {getConfidenceLevel(node.confidence)}
                </div>
                <div>
                  <strong>Sources :</strong> {node.sources.length}
                </div>
                <div>
                  <strong>Enfants :</strong> {node.children.length}
                </div>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Enfants (si expanded) */}
      {isExpanded &&
        node.children.map(child => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            isExpanded={false} // Enfants collapsés par défaut
            onToggle={onToggle}
            onNodeClick={onNodeClick}
            onSourceClick={onSourceClick}
          />
        ))}
    </div>
  )
}
