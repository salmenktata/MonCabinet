/**
 * Constructeur d'Arbre Décisionnel Juridique (Phase 3.3)
 *
 * Construit un arbre hiérarchique représentant le raisonnement juridique
 * depuis une réponse multi-chain, avec justifications sourcées.
 *
 * Structure IRAC arborescente :
 * - Root (Question) → Enfants (Rules) → Enfants (Applications) → Conclusion
 *
 * @module lib/ai/explanation-tree-builder
 */

import type {
  ExplanationTree,
  ExplanationNode,
  SourceReference,
  TreeBuildOptions,
  TreeMetadata,
  TreeSummary,
} from '../types/explanation-tree'
import type { MultiChainResponse } from './multi-chain-legal-reasoning'
import { getMaxDepth, getAllSources, getAllNodes } from '../types/explanation-tree'

// =============================================================================
// FONCTION PRINCIPALE : BUILD TREE
// =============================================================================

/**
 * Construit un arbre décisionnel depuis une réponse multi-chain
 *
 * @param multiChainResponse - Réponse complète des 4 chains
 * @param options - Options construction
 * @returns Arbre décisionnel complet
 *
 * @example
 * ```ts
 * const tree = buildExplanationTree(multiChainResponse, {
 *   maxDepth: 5,
 *   includeAlternatives: true,
 *   language: 'fr'
 * })
 *
 * console.log(`Arbre: ${tree.metadata.totalNodes} nœuds, profondeur ${tree.metadata.maxDepth}`)
 * ```
 */
export function buildExplanationTree(
  multiChainResponse: MultiChainResponse,
  options: TreeBuildOptions = {}
): ExplanationTree {
  const opts: Required<TreeBuildOptions> = {
    maxDepth: options.maxDepth || 10,
    minConfidence: options.minConfidence || 0,
    includeAlternatives: options.includeAlternatives ?? true,
    includeContradictions: options.includeContradictions ?? true,
    language: options.language || multiChainResponse.language,
  }

  console.log('[TreeBuilder] Start building explanation tree...')

  // Construire nœud racine (Question)
  const root = buildRootNode(multiChainResponse, opts)

  // Construire enfants récursivement
  buildChildrenRecursive(root, multiChainResponse, opts, 1)

  // Calculer métadonnées
  const tree: ExplanationTree = {
    root,
    metadata: buildTreeMetadata(root, multiChainResponse),
    summary: buildTreeSummary(multiChainResponse, opts.language),
    exportFormats: generateExportFormats(root, multiChainResponse, opts.language),
  }

  console.log(
    `[TreeBuilder] Complete - ${tree.metadata.totalNodes} nodes, depth ${tree.metadata.maxDepth}`
  )

  return tree
}

// =============================================================================
// CONSTRUCTION NŒUDS
// =============================================================================

/**
 * Construit nœud racine (Question)
 */
function buildRootNode(
  response: MultiChainResponse,
  opts: Required<TreeBuildOptions>
): ExplanationNode {
  return {
    id: 'root',
    type: 'question',
    content: response.question,
    sources: [],
    confidence: Math.round(response.overallConfidence * 100),
    children: [],
    metadata: {
      isControversial: response.chain2.contradictions.length > 0,
      hasAlternative: response.chain3.antithesis.arguments.length > 0,
    },
  }
}

/**
 * Construit enfants récursivement
 */
function buildChildrenRecursive(
  parent: ExplanationNode,
  response: MultiChainResponse,
  opts: Required<TreeBuildOptions>,
  currentDepth: number
): void {
  if (currentDepth >= opts.maxDepth) return

  if (parent.type === 'question') {
    // Niveau 1 : Rules (Règles de droit)
    parent.children = buildRuleNodes(response, opts)

    // Pour chaque règle, construire applications
    parent.children.forEach(ruleNode => {
      buildChildrenRecursive(ruleNode, response, opts, currentDepth + 1)
    })
  } else if (parent.type === 'rule') {
    // Niveau 2 : Applications (Thèse, Antithèse, Synthèse)
    parent.children = buildApplicationNodes(response, parent, opts)

    // Pour chaque application, construire conclusion
    parent.children.forEach(appNode => {
      buildChildrenRecursive(appNode, response, opts, currentDepth + 1)
    })
  } else if (parent.type === 'application') {
    // Niveau 3 : Conclusion
    if (parent.id.includes('synthesis')) {
      parent.children = [buildConclusionNode(response, opts)]
    }
  }
}

/**
 * Construit nœuds de règles de droit
 */
function buildRuleNodes(
  response: MultiChainResponse,
  opts: Required<TreeBuildOptions>
): ExplanationNode[] {
  const nodes: ExplanationNode[] = []

  // Collecter règles depuis Chain 1 (analyse sources)
  const uniqueRules = new Set<string>()

  response.chain1.sourceAnalysis.forEach(source => {
    source.legalPoints.forEach(point => {
      if (!uniqueRules.has(point) && point.length > 10) {
        uniqueRules.add(point)
      }
    })
  })

  // Créer nœuds (max 5 règles principales)
  Array.from(uniqueRules)
    .slice(0, 5)
    .forEach((rule, i) => {
      // Trouver sources pour cette règle
      const ruleSources: SourceReference[] = []

      response.chain1.sourceAnalysis.forEach(source => {
        if (source.legalPoints.includes(rule)) {
          ruleSources.push({
            id: source.sourceId,
            label: `[${source.category === 'code' ? 'Code' : source.category === 'jurisprudence' ? 'Juris' : 'KB'}-${i + 1}]`,
            category: source.category,
            relevance: source.confidence,
            tribunal: source.tribunal,
            date: source.date,
          })
        }
      })

      const avgConfidence =
        ruleSources.reduce((sum, s) => sum + s.relevance, 0) / (ruleSources.length || 1)

      nodes.push({
        id: `rule-${i + 1}`,
        type: 'rule',
        content: rule,
        sources: ruleSources,
        confidence: Math.round(avgConfidence * 100),
        children: [],
        metadata: {
          legalBasis: rule.substring(0, 50),
        },
      })
    })

  return nodes
}

/**
 * Construit nœuds d'application (Thèse, Antithèse, Synthèse)
 */
function buildApplicationNodes(
  response: MultiChainResponse,
  ruleNode: ExplanationNode,
  opts: Required<TreeBuildOptions>
): ExplanationNode[] {
  const nodes: ExplanationNode[] = []

  // Thèse (Arguments pour)
  if (response.chain3.thesis.arguments.length > 0) {
    nodes.push({
      id: `${ruleNode.id}-thesis`,
      type: 'application',
      content:
        opts.language === 'ar'
          ? `الأطروحة: ${response.chain3.thesis.title || 'الموقف الرئيسي'}`
          : `Thèse : ${response.chain3.thesis.title || 'Position principale'}`,
      sources: response.chain3.thesis.arguments.flatMap(arg =>
        arg.sources.map((srcId, i) => ({
          id: srcId,
          label: `[Arg-${i + 1}]`,
          category: 'argument',
          relevance: arg.confidence,
        }))
      ),
      confidence: Math.round(response.chain3.thesis.strength * 100),
      children: [],
      metadata: {
        legalBasis: response.chain3.thesis.arguments[0]?.legalBasis,
      },
    })
  }

  // Antithèse (Arguments contre)
  if (response.chain3.antithesis.arguments.length > 0 && opts.includeAlternatives) {
    nodes.push({
      id: `${ruleNode.id}-antithesis`,
      type: 'application',
      content:
        opts.language === 'ar'
          ? `نقيض الأطروحة: ${response.chain3.antithesis.title || 'الموقف المضاد'}`
          : `Antithèse : ${response.chain3.antithesis.title || 'Position contraire'}`,
      sources: response.chain3.antithesis.arguments.flatMap(arg =>
        arg.sources.map((srcId, i) => ({
          id: srcId,
          label: `[Contre-${i + 1}]`,
          category: 'argument',
          relevance: arg.confidence,
        }))
      ),
      confidence: Math.round(response.chain3.antithesis.strength * 100),
      children: [],
      metadata: {
        legalBasis: response.chain3.antithesis.arguments[0]?.legalBasis,
        isControversial: true,
      },
    })
  }

  // Synthèse (Position équilibrée)
  if (response.chain3.synthesis.arguments.length > 0) {
    nodes.push({
      id: `${ruleNode.id}-synthesis`,
      type: 'synthesis',
      content:
        opts.language === 'ar'
          ? `التوليف: ${response.chain3.synthesis.title || 'الموقف المتوازن'}`
          : `Synthèse : ${response.chain3.synthesis.title || 'Position équilibrée'}`,
      sources: response.chain3.synthesis.arguments.flatMap(arg =>
        arg.sources.map((srcId, i) => ({
          id: srcId,
          label: `[Synth-${i + 1}]`,
          category: 'synthesis',
          relevance: arg.confidence,
        }))
      ),
      confidence: Math.round(response.chain3.synthesis.strength * 100),
      children: [],
      metadata: {
        legalBasis: response.chain3.synthesis.arguments[0]?.legalBasis,
      },
    })
  }

  return nodes
}

/**
 * Construit nœud de conclusion
 */
function buildConclusionNode(
  response: MultiChainResponse,
  opts: Required<TreeBuildOptions>
): ExplanationNode {
  return {
    id: 'conclusion',
    type: 'conclusion',
    content:
      opts.language === 'ar'
        ? response.chain3.recommendation.mainRecommendation
        : response.chain3.recommendation.mainRecommendation,
    sources: [],
    confidence: Math.round(response.chain3.recommendation.confidence * 100),
    children: [],
    metadata: {},
  }
}

// =============================================================================
// MÉTADONNÉES ARBRE
// =============================================================================

function buildTreeMetadata(root: ExplanationNode, response: MultiChainResponse): TreeMetadata {
  const allNodes = getAllNodes({ root } as ExplanationTree)
  const allSources = getAllSources({ root } as ExplanationTree)

  const avgConfidence =
    allNodes.reduce((sum, n) => sum + n.confidence, 0) / (allNodes.length || 1)

  const controversialNodes = allNodes.filter(n => n.metadata.isControversial).length

  return {
    question: response.question,
    language: response.language,
    createdAt: new Date(),
    totalNodes: allNodes.length,
    maxDepth: getMaxDepth({ root } as ExplanationTree),
    sourcesUsed: allSources.length,
    averageConfidence: Math.round(avgConfidence),
    controversialNodes,
  }
}

function buildTreeSummary(
  response: MultiChainResponse,
  language: 'fr' | 'ar'
): TreeSummary {
  const keyArguments = response.chain3.synthesis.arguments.map(arg => arg.content).slice(0, 3)

  const confidenceLevel =
    response.overallConfidence >= 0.8 ? 'high' : response.overallConfidence >= 0.6 ? 'medium' : 'low'

  return {
    mainConclusion: response.chain3.recommendation.mainRecommendation,
    keyArguments,
    risks: response.chain3.recommendation.risks,
    recommendations: response.chain3.recommendation.alternativeOptions,
    confidenceLevel,
  }
}

// =============================================================================
// EXPORT FORMATS
// =============================================================================

function generateExportFormats(
  root: ExplanationNode,
  response: MultiChainResponse,
  language: 'fr' | 'ar'
): { json: string; markdown: string } {
  return {
    json: JSON.stringify({ root }, null, 2),
    markdown: exportToMarkdown(root, response, language),
  }
}

function exportToMarkdown(
  root: ExplanationNode,
  response: MultiChainResponse,
  language: 'fr' | 'ar'
): string {
  let md = `# ${language === 'ar' ? 'شجرة القرار القانوني' : 'Arbre Décisionnel Juridique'}\n\n`

  md += `**${language === 'ar' ? 'السؤال' : 'Question'}** : ${root.content}\n\n`

  function traverse(node: ExplanationNode, depth: number = 0): string {
    const indent = '  '.repeat(depth)
    let text = ''

    // Titre nœud
    text += `${indent}- **${getNodeTypeLabel(node.type, language)}** : ${node.content}\n`

    // Sources
    if (node.sources.length > 0) {
      text += `${indent}  ${language === 'ar' ? 'المصادر' : 'Sources'}: ${node.sources.map(s => s.label).join(', ')}\n`
    }

    // Confiance
    text += `${indent}  ${language === 'ar' ? 'الثقة' : 'Confiance'}: ${node.confidence}%\n`

    // Enfants
    node.children.forEach(child => {
      text += traverse(child, depth + 1)
    })

    return text
  }

  md += traverse(root)

  md += `\n---\n`
  md += `${language === 'ar' ? 'التوصية الرئيسية' : 'Recommandation Principale'} : ${response.chain3.recommendation.mainRecommendation}\n`

  return md
}

function getNodeTypeLabel(type: string, language: 'fr' | 'ar'): string {
  const labels: Record<string, { fr: string; ar: string }> = {
    question: { fr: 'Question', ar: 'السؤال' },
    rule: { fr: 'Règle', ar: 'القاعدة' },
    application: { fr: 'Application', ar: 'التطبيق' },
    synthesis: { fr: 'Synthèse', ar: 'التوليف' },
    conclusion: { fr: 'Conclusion', ar: 'الخلاصة' },
  }

  return labels[type]?.[language] || type
}

// =============================================================================
// UTILITAIRES RECHERCHE
// =============================================================================

/**
 * Trouve tous les nœuds d'un certain type
 */
export function findNodesByType(
  tree: ExplanationTree,
  type: ExplanationNode['type']
): ExplanationNode[] {
  const nodes: ExplanationNode[] = []

  function traverse(node: ExplanationNode) {
    if (node.type === type) {
      nodes.push(node)
    }
    node.children.forEach(traverse)
  }

  traverse(tree.root)
  return nodes
}

/**
 * Trouve nœuds controversés (avec contradictions)
 */
export function findControversialNodes(tree: ExplanationTree): ExplanationNode[] {
  return getAllNodes(tree).filter(n => n.metadata.isControversial)
}

/**
 * Trouve nœuds avec confiance basse (<60%)
 */
export function findLowConfidenceNodes(tree: ExplanationTree): ExplanationNode[] {
  return getAllNodes(tree).filter(n => n.confidence < 60)
}

// =============================================================================
// EXPORTS
// =============================================================================

export { buildExplanationTree as default, findNodesByType, findControversialNodes, findLowConfidenceNodes }
