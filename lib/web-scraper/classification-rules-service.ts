/**
 * Service de gestion des règles de classification par source
 *
 * Permet de définir des règles de mapping spécifiques à chaque source web
 * pour classifier automatiquement les pages selon leur URL, breadcrumbs, etc.
 */

import { db } from '@/lib/db/postgres'
import type { SiteStructure, Breadcrumb, UrlSegment } from './site-structure-extractor'

// =============================================================================
// TYPES
// =============================================================================

export type ConditionType =
  | 'url_pattern'        // Regex sur l'URL complète
  | 'url_contains'       // Substring dans l'URL
  | 'url_segment'        // Segment à une position spécifique
  | 'url_starts_with'    // URL commence par
  | 'url_ends_with'      // URL termine par
  | 'breadcrumb_contains' // Texte dans n'importe quel breadcrumb
  | 'breadcrumb_level'   // Texte à un niveau spécifique du breadcrumb
  | 'breadcrumb_exact'   // Breadcrumb exact à un niveau
  | 'title_contains'     // Titre contient
  | 'title_pattern'      // Regex sur le titre
  | 'heading_contains'   // H1 contient
  | 'domain_match'       // Domaine du site

export interface RuleCondition {
  type: ConditionType
  value: string
  // Options supplémentaires selon le type
  position?: number      // Pour url_segment, breadcrumb_level
  caseSensitive?: boolean
  negate?: boolean       // Inverser la condition
}

export interface ClassificationRule {
  id: string
  webSourceId: string | null
  name: string
  description: string | null
  conditions: RuleCondition[]
  targetCategory: string | null
  targetDomain: string | null
  targetDocumentType: string | null
  priority: number
  confidenceBoost: number
  isActive: boolean
  timesMatched: number
  timesCorrect: number
  lastMatchedAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateRuleInput {
  webSourceId?: string
  name: string
  description?: string
  conditions: RuleCondition[]
  targetCategory?: string
  targetDomain?: string
  targetDocumentType?: string
  priority?: number
  confidenceBoost?: number
}

export interface UpdateRuleInput {
  name?: string
  description?: string
  conditions?: RuleCondition[]
  targetCategory?: string
  targetDomain?: string
  targetDocumentType?: string
  priority?: number
  confidenceBoost?: number
  isActive?: boolean
}

export interface RuleMatch {
  rule: ClassificationRule
  matchedConditions: number
  totalConditions: number
  confidence: number
}

export interface RuleMatchContext {
  url: string
  title?: string
  structure?: SiteStructure
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Récupère toutes les règles actives pour une source
 */
export async function getRulesForSource(webSourceId: string): Promise<ClassificationRule[]> {
  const result = await db.query(
    `SELECT * FROM source_classification_rules
     WHERE web_source_id = $1 AND is_active = true
     ORDER BY priority DESC, created_at`,
    [webSourceId]
  )

  return result.rows.map(mapRowToRule)
}

/**
 * Récupère toutes les règles globales (sans source spécifique)
 */
export async function getGlobalRules(): Promise<ClassificationRule[]> {
  const result = await db.query(
    `SELECT * FROM source_classification_rules
     WHERE web_source_id IS NULL AND is_active = true
     ORDER BY priority DESC, created_at`
  )

  return result.rows.map(mapRowToRule)
}

/**
 * Récupère toutes les règles applicables (globales + source spécifique)
 */
export async function getApplicableRules(webSourceId: string): Promise<ClassificationRule[]> {
  const result = await db.query(
    `SELECT * FROM source_classification_rules
     WHERE (web_source_id = $1 OR web_source_id IS NULL)
       AND is_active = true
     ORDER BY
       CASE WHEN web_source_id IS NOT NULL THEN 0 ELSE 1 END,
       priority DESC,
       created_at`,
    [webSourceId]
  )

  return result.rows.map(mapRowToRule)
}

/**
 * Crée une nouvelle règle
 */
export async function createRule(
  input: CreateRuleInput,
  createdBy?: string
): Promise<ClassificationRule> {
  const result = await db.query(
    `INSERT INTO source_classification_rules (
      web_source_id, name, description, conditions,
      target_category, target_domain, target_document_type,
      priority, confidence_boost, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      input.webSourceId || null,
      input.name,
      input.description || null,
      JSON.stringify(input.conditions),
      input.targetCategory || null,
      input.targetDomain || null,
      input.targetDocumentType || null,
      input.priority || 0,
      input.confidenceBoost || 0.2,
      createdBy || null,
    ]
  )

  return mapRowToRule(result.rows[0])
}

/**
 * Met à jour une règle
 */
export async function updateRule(
  ruleId: string,
  input: UpdateRuleInput
): Promise<ClassificationRule | null> {
  const updates: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`)
    values.push(input.name)
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`)
    values.push(input.description)
  }
  if (input.conditions !== undefined) {
    updates.push(`conditions = $${paramIndex++}`)
    values.push(JSON.stringify(input.conditions))
  }
  if (input.targetCategory !== undefined) {
    updates.push(`target_category = $${paramIndex++}`)
    values.push(input.targetCategory)
  }
  if (input.targetDomain !== undefined) {
    updates.push(`target_domain = $${paramIndex++}`)
    values.push(input.targetDomain)
  }
  if (input.targetDocumentType !== undefined) {
    updates.push(`target_document_type = $${paramIndex++}`)
    values.push(input.targetDocumentType)
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex++}`)
    values.push(input.priority)
  }
  if (input.confidenceBoost !== undefined) {
    updates.push(`confidence_boost = $${paramIndex++}`)
    values.push(input.confidenceBoost)
  }
  if (input.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`)
    values.push(input.isActive)
  }

  if (updates.length === 0) {
    return null
  }

  values.push(ruleId)
  const result = await db.query(
    `UPDATE source_classification_rules
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToRule(result.rows[0])
}

/**
 * Supprime une règle
 */
export async function deleteRule(ruleId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM source_classification_rules WHERE id = $1`,
    [ruleId]
  )

  return (result.rowCount ?? 0) > 0
}

/**
 * Récupère une règle par son ID
 */
export async function getRuleById(ruleId: string): Promise<ClassificationRule | null> {
  const result = await db.query(
    `SELECT * FROM source_classification_rules WHERE id = $1`,
    [ruleId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToRule(result.rows[0])
}

// =============================================================================
// MATCHING DE RÈGLES
// =============================================================================

/**
 * Évalue toutes les règles applicables et retourne les matches
 */
export async function matchRules(
  webSourceId: string,
  context: RuleMatchContext
): Promise<RuleMatch[]> {
  const rules = await getApplicableRules(webSourceId)
  const matches: RuleMatch[] = []

  for (const rule of rules) {
    const match = evaluateRule(rule, context)
    if (match) {
      matches.push(match)
    }
  }

  // Trier par confiance décroissante
  matches.sort((a, b) => b.confidence - a.confidence)

  return matches
}

/**
 * Évalue une règle contre un contexte
 */
export function evaluateRule(
  rule: ClassificationRule,
  context: RuleMatchContext
): RuleMatch | null {
  if (rule.conditions.length === 0) {
    return null
  }

  let matchedConditions = 0

  for (const condition of rule.conditions) {
    const matches = evaluateCondition(condition, context)
    if (condition.negate) {
      // Si negate et la condition matche, la règle échoue
      if (matches) return null
    } else {
      if (matches) matchedConditions++
    }
  }

  // Toutes les conditions non-negate doivent matcher
  const nonNegateConditions = rule.conditions.filter(c => !c.negate).length

  if (matchedConditions < nonNegateConditions) {
    return null
  }

  // Calculer la confiance
  const baseConfidence = matchedConditions / rule.conditions.length
  const confidence = Math.min(baseConfidence + rule.confidenceBoost, 1)

  return {
    rule,
    matchedConditions,
    totalConditions: rule.conditions.length,
    confidence,
  }
}

/**
 * Évalue une condition individuelle
 */
function evaluateCondition(
  condition: RuleCondition,
  context: RuleMatchContext
): boolean {
  const { url, title, structure } = context

  switch (condition.type) {
    case 'url_pattern': {
      try {
        const flags = condition.caseSensitive ? '' : 'i'
        const regex = new RegExp(condition.value, flags)
        return regex.test(url)
      } catch {
        return false
      }
    }

    case 'url_contains': {
      const urlToCheck = condition.caseSensitive ? url : url.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      return urlToCheck.includes(valueToCheck)
    }

    case 'url_starts_with': {
      const urlToCheck = condition.caseSensitive ? url : url.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      try {
        const urlObj = new URL(urlToCheck)
        return urlObj.pathname.startsWith(valueToCheck)
      } catch {
        return urlToCheck.includes(valueToCheck)
      }
    }

    case 'url_ends_with': {
      const urlToCheck = condition.caseSensitive ? url : url.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      try {
        const urlObj = new URL(urlToCheck)
        return urlObj.pathname.endsWith(valueToCheck)
      } catch {
        return urlToCheck.endsWith(valueToCheck)
      }
    }

    case 'url_segment': {
      if (condition.position === undefined) return false
      try {
        const urlObj = new URL(url)
        const segments = urlObj.pathname.split('/').filter(s => s.length > 0)
        const segment = segments[condition.position]
        if (!segment) return false

        const segmentToCheck = condition.caseSensitive ? segment : segment.toLowerCase()
        const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
        return segmentToCheck === valueToCheck
      } catch {
        return false
      }
    }

    case 'breadcrumb_contains': {
      if (!structure?.breadcrumbs) return false
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()

      return structure.breadcrumbs.some(crumb => {
        const labelToCheck = condition.caseSensitive ? crumb.label : crumb.label.toLowerCase()
        return labelToCheck.includes(valueToCheck)
      })
    }

    case 'breadcrumb_level': {
      if (!structure?.breadcrumbs || condition.position === undefined) return false
      const crumb = structure.breadcrumbs.find(c => c.level === condition.position)
      if (!crumb) return false

      const labelToCheck = condition.caseSensitive ? crumb.label : crumb.label.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      return labelToCheck.includes(valueToCheck)
    }

    case 'breadcrumb_exact': {
      if (!structure?.breadcrumbs || condition.position === undefined) return false
      const crumb = structure.breadcrumbs.find(c => c.level === condition.position)
      if (!crumb) return false

      const labelToCheck = condition.caseSensitive ? crumb.label : crumb.label.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      return labelToCheck === valueToCheck
    }

    case 'title_contains': {
      if (!title) return false
      const titleToCheck = condition.caseSensitive ? title : title.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      return titleToCheck.includes(valueToCheck)
    }

    case 'title_pattern': {
      if (!title) return false
      try {
        const flags = condition.caseSensitive ? '' : 'i'
        const regex = new RegExp(condition.value, flags)
        return regex.test(title)
      } catch {
        return false
      }
    }

    case 'heading_contains': {
      if (!structure?.headings?.h1) return false
      const h1ToCheck = condition.caseSensitive ? structure.headings.h1 : structure.headings.h1.toLowerCase()
      const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
      return h1ToCheck.includes(valueToCheck)
    }

    case 'domain_match': {
      try {
        const urlObj = new URL(url)
        const domainToCheck = condition.caseSensitive ? urlObj.hostname : urlObj.hostname.toLowerCase()
        const valueToCheck = condition.caseSensitive ? condition.value : condition.value.toLowerCase()
        return domainToCheck === valueToCheck || domainToCheck.endsWith('.' + valueToCheck)
      } catch {
        return false
      }
    }

    default:
      return false
  }
}

/**
 * Incrémente le compteur de match d'une règle
 */
export async function incrementRuleMatch(
  ruleId: string,
  isCorrect?: boolean
): Promise<void> {
  await db.query(
    `SELECT increment_rule_match($1, $2)`,
    [ruleId, isCorrect ?? null]
  )
}

// =============================================================================
// GÉNÉRATION DE RÈGLES
// =============================================================================

/**
 * Suggère une nouvelle règle basée sur des corrections similaires
 */
export async function suggestRuleFromCorrections(
  webSourceId: string,
  minOccurrences: number = 3
): Promise<CreateRuleInput | null> {
  // Récupérer les corrections non utilisées pour cette source
  const correctionsResult = await db.query(
    `SELECT cc.*, wp.web_source_id
     FROM classification_corrections cc
     JOIN web_pages wp ON cc.web_page_id = wp.id
     WHERE wp.web_source_id = $1
       AND cc.used_for_learning = false
     ORDER BY cc.corrected_at DESC
     LIMIT 100`,
    [webSourceId]
  )

  if (correctionsResult.rows.length < minOccurrences) {
    return null
  }

  // Grouper par classification corrigée
  const groups = new Map<string, typeof correctionsResult.rows>()

  for (const row of correctionsResult.rows) {
    const key = `${row.corrected_category}|${row.corrected_domain}|${row.corrected_document_type}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(row)
  }

  // Trouver le groupe le plus fréquent
  let maxGroup: typeof correctionsResult.rows = []
  let maxKey = ''

  for (const [key, group] of groups) {
    if (group.length >= minOccurrences && group.length > maxGroup.length) {
      maxGroup = group
      maxKey = key
    }
  }

  if (maxGroup.length < minOccurrences) {
    return null
  }

  // Analyser les patterns communs dans les URLs
  const urls = maxGroup.map(c => c.page_url)
  const commonPatterns = findCommonUrlPatterns(urls)

  if (commonPatterns.length === 0) {
    return null
  }

  // Construire la règle suggérée
  const [category, domain, documentType] = maxKey.split('|')

  const conditions: RuleCondition[] = commonPatterns.map(pattern => ({
    type: pattern.type as ConditionType,
    value: pattern.value,
    position: pattern.position,
  }))

  return {
    webSourceId,
    name: `Auto: ${category || domain || documentType}`,
    description: `Règle générée automatiquement à partir de ${maxGroup.length} corrections`,
    conditions,
    targetCategory: category || undefined,
    targetDomain: domain || undefined,
    targetDocumentType: documentType || undefined,
    priority: 10,
    confidenceBoost: 0.15,
  }
}

/**
 * Trouve les patterns communs dans une liste d'URLs
 */
function findCommonUrlPatterns(urls: string[]): Array<{
  type: string
  value: string
  position?: number
}> {
  const patterns: Array<{ type: string; value: string; position?: number }> = []

  try {
    // Analyser les segments d'URL
    const segmentsByPosition: Map<number, Map<string, number>> = new Map()

    for (const url of urls) {
      const urlObj = new URL(url)
      const segments = urlObj.pathname.split('/').filter(s => s.length > 0)

      segments.forEach((segment, position) => {
        if (!segmentsByPosition.has(position)) {
          segmentsByPosition.set(position, new Map())
        }
        const positionMap = segmentsByPosition.get(position)!
        positionMap.set(segment, (positionMap.get(segment) || 0) + 1)
      })
    }

    // Trouver les segments qui apparaissent dans >70% des URLs
    const threshold = urls.length * 0.7

    for (const [position, segments] of segmentsByPosition) {
      for (const [segment, count] of segments) {
        if (count >= threshold && !/^\d+$/.test(segment)) {
          // Ignorer les IDs numériques
          patterns.push({
            type: 'url_segment',
            value: segment,
            position,
          })
        }
      }
    }

    // Chercher des substrings communs
    if (patterns.length === 0 && urls.length >= 2) {
      // Trouver le plus long substring commun dans les paths
      const paths = urls.map(u => new URL(u).pathname)
      const common = findLongestCommonSubstring(paths)

      if (common && common.length > 3) {
        patterns.push({
          type: 'url_contains',
          value: common,
        })
      }
    }
  } catch {
    // Ignorer les erreurs d'URL
  }

  return patterns
}

/**
 * Trouve le plus long substring commun
 */
function findLongestCommonSubstring(strings: string[]): string | null {
  if (strings.length === 0) return null
  if (strings.length === 1) return strings[0]

  const first = strings[0]
  let longest = ''

  for (let i = 0; i < first.length; i++) {
    for (let len = first.length - i; len > longest.length; len--) {
      const candidate = first.substring(i, i + len)

      if (strings.every(s => s.includes(candidate))) {
        longest = candidate
        break
      }
    }
  }

  return longest || null
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Récupère les statistiques des règles
 */
export async function getRulesStats(webSourceId?: string): Promise<{
  total: number
  active: number
  totalMatches: number
  avgAccuracy: number
  topRules: Array<{ id: string; name: string; matches: number; accuracy: number }>
}> {
  const whereClause = webSourceId ? 'WHERE web_source_id = $1' : 'WHERE web_source_id IS NOT NULL'
  const params = webSourceId ? [webSourceId] : []

  const result = await db.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      SUM(times_matched) as total_matches,
      AVG(CASE WHEN times_matched > 0 THEN times_correct::float / times_matched ELSE 0 END) as avg_accuracy
     FROM source_classification_rules
     ${whereClause}`,
    params
  )

  const topResult = await db.query(
    `SELECT id, name, times_matched, times_correct
     FROM source_classification_rules
     ${whereClause}
     ORDER BY times_matched DESC
     LIMIT 10`,
    params
  )

  const row = result.rows[0]

  return {
    total: parseInt(row.total, 10),
    active: parseInt(row.active, 10),
    totalMatches: parseInt(row.total_matches || '0', 10),
    avgAccuracy: parseFloat(row.avg_accuracy || '0'),
    topRules: topResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      matches: r.times_matched,
      accuracy: r.times_matched > 0 ? r.times_correct / r.times_matched : 0,
    })),
  }
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapRowToRule(row: Record<string, unknown>): ClassificationRule {
  return {
    id: row.id as string,
    webSourceId: row.web_source_id as string | null,
    name: row.name as string,
    description: row.description as string | null,
    conditions: (row.conditions as RuleCondition[]) || [],
    targetCategory: row.target_category as string | null,
    targetDomain: row.target_domain as string | null,
    targetDocumentType: row.target_document_type as string | null,
    priority: row.priority as number,
    confidenceBoost: parseFloat(row.confidence_boost as string),
    isActive: row.is_active as boolean,
    timesMatched: row.times_matched as number,
    timesCorrect: row.times_correct as number,
    lastMatchedAt: row.last_matched_at ? new Date(row.last_matched_at as string) : null,
    createdBy: row.created_by as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}
