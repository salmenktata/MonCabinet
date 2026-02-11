/**
 * Types pour Arbre Décisionnel Juridique (Phase 3.3)
 *
 * Structure hiérarchique pour représenter le raisonnement juridique
 * avec justifications sourcées et confiance explicite.
 *
 * @module lib/types/explanation-tree
 */

// =============================================================================
// TYPES PRINCIPAUX
// =============================================================================

/**
 * Nœud d'arbre décisionnel juridique
 *
 * Représente une étape du raisonnement :
 * - question : Question juridique ou problématique
 * - rule : Règle de droit applicable
 * - application : Application de la règle aux faits
 * - conclusion : Conclusion juridique
 */
export interface ExplanationNode {
  id: string
  type: 'question' | 'rule' | 'application' | 'conclusion' | 'synthesis'
  content: string
  sources: SourceReference[]
  confidence: number // 0-100
  children: ExplanationNode[]
  metadata: NodeMetadata
  alternativePaths?: AlternativePath[]
}

/**
 * Référence source avec détails
 */
export interface SourceReference {
  id: string
  label: string // [KB-1], [Juris-2], [Code-3]
  category: string
  excerpt?: string
  relevance: number // 0-1
  tribunal?: string
  date?: string
  articleNumber?: string
}

/**
 * Métadonnées nœud
 */
export interface NodeMetadata {
  tribunal?: string
  chambre?: string
  decisionDate?: string
  domain?: string
  legalBasis?: string
  contradicts?: string[] // IDs nœuds contradictoires
  supportsBy?: string[] // IDs nœuds qui supportent celui-ci
  isControversial?: boolean
  hasAlternative?: boolean
}

/**
 * Chemin alternatif (si plusieurs interprétations possibles)
 */
export interface AlternativePath {
  id: string
  title: string
  description: string
  confidence: number
  nodes: ExplanationNode[]
  preferred: boolean
}

// =============================================================================
// ARBRE COMPLET
// =============================================================================

/**
 * Arbre décisionnel complet
 */
export interface ExplanationTree {
  root: ExplanationNode
  metadata: TreeMetadata
  summary: TreeSummary
  exportFormats: ExportFormats
}

/**
 * Métadonnées arbre global
 */
export interface TreeMetadata {
  question: string
  language: 'fr' | 'ar'
  createdAt: Date
  totalNodes: number
  maxDepth: number
  sourcesUsed: number
  averageConfidence: number
  controversialNodes: number
}

/**
 * Résumé arbre
 */
export interface TreeSummary {
  mainConclusion: string
  keyArguments: string[]
  risks: string[]
  recommendations: string[]
  confidenceLevel: 'high' | 'medium' | 'low'
}

/**
 * Formats d'export disponibles
 */
export interface ExportFormats {
  json: string
  markdown: string
  html?: string
}

// =============================================================================
// OPTIONS CONSTRUCTION
// =============================================================================

/**
 * Options construction arbre
 */
export interface TreeBuildOptions {
  maxDepth?: number
  minConfidence?: number
  includeAlternatives?: boolean
  includeContradictions?: boolean
  language?: 'fr' | 'ar'
}

// =============================================================================
// OPTIONS VISUALISATION
// =============================================================================

/**
 * Options visualisation arbre (UI)
 */
export interface TreeVisualizationOptions {
  expandedByDefault?: boolean
  showConfidence?: boolean
  showSources?: boolean
  highlightControversial?: boolean
  colorByConfidence?: boolean
  maxDepthVisible?: number
  interactiveHover?: boolean
}

// =============================================================================
// ÉVÉNEMENTS UI
// =============================================================================

/**
 * Événements interaction arbre
 */
export interface TreeInteractionEvents {
  onNodeClick?: (node: ExplanationNode) => void
  onNodeExpand?: (nodeId: string) => void
  onNodeCollapse?: (nodeId: string) => void
  onSourceClick?: (source: SourceReference) => void
  onExport?: (format: 'json' | 'markdown' | 'html') => void
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * État expansion nœud (pour UI)
 */
export interface NodeExpansionState {
  [nodeId: string]: boolean
}

/**
 * Statistiques nœud
 */
export interface NodeStats {
  depth: number
  childrenCount: number
  sourcesCount: number
  confidenceLevel: 'high' | 'medium' | 'low'
  hasContradictions: boolean
}

// =============================================================================
// HELPERS TYPE GUARDS
// =============================================================================

export function isQuestionNode(node: ExplanationNode): boolean {
  return node.type === 'question'
}

export function isRuleNode(node: ExplanationNode): boolean {
  return node.type === 'rule'
}

export function isApplicationNode(node: ExplanationNode): boolean {
  return node.type === 'application'
}

export function isConclusionNode(node: ExplanationNode): boolean {
  return node.type === 'conclusion'
}

export function isSynthesisNode(node: ExplanationNode): boolean {
  return node.type === 'synthesis'
}

// =============================================================================
// HELPERS CONFIANCE
// =============================================================================

export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600'
  if (confidence >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export function getConfidenceBadge(confidence: number): string {
  if (confidence >= 80) return '🟢'
  if (confidence >= 60) return '🟡'
  return '🔴'
}

// =============================================================================
// HELPERS NAVIGATION
// =============================================================================

/**
 * Trouve un nœud par ID dans l'arbre
 */
export function findNodeById(tree: ExplanationTree, nodeId: string): ExplanationNode | null {
  function search(node: ExplanationNode): ExplanationNode | null {
    if (node.id === nodeId) return node

    for (const child of node.children) {
      const found = search(child)
      if (found) return found
    }

    return null
  }

  return search(tree.root)
}

/**
 * Collecte tous les nœuds de l'arbre (parcours en profondeur)
 */
export function getAllNodes(tree: ExplanationTree): ExplanationNode[] {
  const nodes: ExplanationNode[] = []

  function traverse(node: ExplanationNode) {
    nodes.push(node)
    node.children.forEach(traverse)
  }

  traverse(tree.root)
  return nodes
}

/**
 * Calcule profondeur maximale de l'arbre
 */
export function getMaxDepth(tree: ExplanationTree): number {
  function getDepth(node: ExplanationNode, currentDepth: number): number {
    if (node.children.length === 0) return currentDepth

    return Math.max(...node.children.map(child => getDepth(child, currentDepth + 1)))
  }

  return getDepth(tree.root, 1)
}

/**
 * Collecte toutes les sources uniques de l'arbre
 */
export function getAllSources(tree: ExplanationTree): SourceReference[] {
  const sourcesMap = new Map<string, SourceReference>()

  function collectSources(node: ExplanationNode) {
    node.sources.forEach(source => {
      if (!sourcesMap.has(source.id)) {
        sourcesMap.set(source.id, source)
      }
    })
    node.children.forEach(collectSources)
  }

  collectSources(tree.root)
  return Array.from(sourcesMap.values())
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  ExplanationNode as default,
  ExplanationTree,
  SourceReference,
  NodeMetadata,
  TreeMetadata,
  TreeSummary,
  TreeBuildOptions,
  TreeVisualizationOptions,
  TreeInteractionEvents,
}
