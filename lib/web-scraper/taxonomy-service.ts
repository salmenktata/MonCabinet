/**
 * Service de gestion de la taxonomie juridique centralisée
 *
 * Fournit les fonctions CRUD pour la taxonomie juridique tunisienne
 * et gère les suggestions IA pour de nouveaux types
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

export type TaxonomyType = 'category' | 'domain' | 'document_type' | 'tribunal' | 'chamber'

export interface TaxonomyItem {
  id: string
  type: TaxonomyType
  code: string
  parentCode: string | null
  labelFr: string
  labelAr: string
  description: string | null
  icon: string | null
  color: string | null
  isActive: boolean
  isSystem: boolean
  sortOrder: number
  suggestedByAi: boolean
  aiSuggestionReason: string | null
  validatedBy: string | null
  validatedAt: Date | null
  children?: TaxonomyItem[]
  createdAt: Date
  updatedAt: Date
}

export interface TaxonomySuggestion {
  id: string
  type: TaxonomyType
  suggestedCode: string
  suggestedLabelFr: string
  suggestedLabelAr: string | null
  suggestedParentCode: string | null
  reason: string | null
  basedOnPages: string[]
  occurrenceCount: number
  sampleUrls: string[]
  status: 'pending' | 'approved' | 'rejected' | 'merged'
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  createdTaxonomyId: string | null
  createdAt: Date
}

export interface CreateTaxonomyInput {
  type: TaxonomyType
  code: string
  parentCode?: string
  labelFr: string
  labelAr: string
  description?: string
  icon?: string
  color?: string
  sortOrder?: number
}

export interface UpdateTaxonomyInput {
  labelFr?: string
  labelAr?: string
  description?: string
  icon?: string
  color?: string
  isActive?: boolean
  sortOrder?: number
  parentCode?: string
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Récupère toute la taxonomie par type
 */
export async function getTaxonomyByType(type: TaxonomyType): Promise<TaxonomyItem[]> {
  const result = await db.query(
    `SELECT * FROM get_taxonomy_by_type($1)`,
    [type]
  )

  return result.rows.map(mapRowToTaxonomyItem)
}

/**
 * Récupère un élément de taxonomie par son code
 */
export async function getTaxonomyByCode(code: string): Promise<TaxonomyItem | null> {
  const result = await db.query(
    `SELECT * FROM legal_taxonomy WHERE code = $1`,
    [code]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapDbRowToTaxonomyItem(result.rows[0])
}

/**
 * Récupère tous les éléments de taxonomie actifs
 */
export async function getAllActiveTaxonomy(): Promise<TaxonomyItem[]> {
  const result = await db.query(
    `SELECT * FROM legal_taxonomy
     WHERE is_active = true
     ORDER BY type, sort_order, label_fr`
  )

  return result.rows.map(mapDbRowToTaxonomyItem)
}

/**
 * Crée un nouvel élément de taxonomie
 */
export async function createTaxonomy(input: CreateTaxonomyInput): Promise<TaxonomyItem> {
  const result = await db.query(
    `INSERT INTO legal_taxonomy (
      type, code, parent_code, label_fr, label_ar,
      description, icon, color, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      input.type,
      input.code,
      input.parentCode || null,
      input.labelFr,
      input.labelAr,
      input.description || null,
      input.icon || null,
      input.color || null,
      input.sortOrder || 0,
    ]
  )

  return mapDbRowToTaxonomyItem(result.rows[0])
}

/**
 * Met à jour un élément de taxonomie
 */
export async function updateTaxonomy(
  code: string,
  input: UpdateTaxonomyInput
): Promise<TaxonomyItem | null> {
  // Vérifier que l'élément existe et n'est pas système (sauf pour certains champs)
  const existing = await getTaxonomyByCode(code)
  if (!existing) {
    return null
  }

  // Les éléments système ne peuvent pas être désactivés ou avoir leur code parent modifié
  if (existing.isSystem) {
    if (input.isActive === false) {
      throw new Error('Les éléments système ne peuvent pas être désactivés')
    }
    // Autoriser les autres modifications (labels, description, icon, color)
  }

  const updates: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (input.labelFr !== undefined) {
    updates.push(`label_fr = $${paramIndex++}`)
    values.push(input.labelFr)
  }
  if (input.labelAr !== undefined) {
    updates.push(`label_ar = $${paramIndex++}`)
    values.push(input.labelAr)
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`)
    values.push(input.description)
  }
  if (input.icon !== undefined) {
    updates.push(`icon = $${paramIndex++}`)
    values.push(input.icon)
  }
  if (input.color !== undefined) {
    updates.push(`color = $${paramIndex++}`)
    values.push(input.color)
  }
  if (input.isActive !== undefined && !existing.isSystem) {
    updates.push(`is_active = $${paramIndex++}`)
    values.push(input.isActive)
  }
  if (input.sortOrder !== undefined) {
    updates.push(`sort_order = $${paramIndex++}`)
    values.push(input.sortOrder)
  }
  if (input.parentCode !== undefined && !existing.isSystem) {
    updates.push(`parent_code = $${paramIndex++}`)
    values.push(input.parentCode)
  }

  if (updates.length === 0) {
    return existing
  }

  values.push(code)
  const result = await db.query(
    `UPDATE legal_taxonomy
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE code = $${paramIndex}
     RETURNING *`,
    values
  )

  return mapDbRowToTaxonomyItem(result.rows[0])
}

/**
 * Supprime un élément de taxonomie (soft delete si utilisé, hard delete sinon)
 */
export async function deleteTaxonomy(code: string): Promise<boolean> {
  const existing = await getTaxonomyByCode(code)
  if (!existing) {
    return false
  }

  if (existing.isSystem) {
    throw new Error('Les éléments système ne peuvent pas être supprimés')
  }

  // Vérifier s'il y a des enfants
  const childrenResult = await db.query(
    `SELECT COUNT(*) as count FROM legal_taxonomy WHERE parent_code = $1 AND is_active = true`,
    [code]
  )

  if (parseInt(childrenResult.rows[0].count, 10) > 0) {
    throw new Error('Cet élément a des enfants. Supprimez-les d\'abord.')
  }

  // Vérifier si utilisé dans des classifications
  const usageResult = await db.query(
    `SELECT COUNT(*) as count FROM legal_classifications
     WHERE primary_category = $1 OR domain = $1 OR document_nature = $1`,
    [code]
  )

  if (parseInt(usageResult.rows[0].count, 10) > 0) {
    // Soft delete
    await db.query(
      `UPDATE legal_taxonomy SET is_active = false, updated_at = NOW() WHERE code = $1`,
      [code]
    )
  } else {
    // Hard delete
    await db.query(`DELETE FROM legal_taxonomy WHERE code = $1`, [code])
  }

  return true
}

/**
 * Vérifie si un code de taxonomie est valide
 */
export async function isValidTaxonomyCode(
  code: string,
  type?: TaxonomyType
): Promise<boolean> {
  const result = await db.query(
    `SELECT is_valid_taxonomy_code($1, $2) as valid`,
    [code, type || null]
  )
  return result.rows[0].valid
}

// =============================================================================
// SUGGESTIONS IA
// =============================================================================

/**
 * Récupère les suggestions en attente
 */
export async function getPendingSuggestions(): Promise<TaxonomySuggestion[]> {
  const result = await db.query(
    `SELECT * FROM taxonomy_suggestions
     WHERE status = 'pending'
     ORDER BY occurrence_count DESC, created_at DESC`
  )

  return result.rows.map(mapRowToSuggestion)
}

/**
 * Crée une suggestion de taxonomie
 */
export async function createTaxonomySuggestion(
  type: TaxonomyType,
  suggestedCode: string,
  suggestedLabelFr: string,
  suggestedLabelAr?: string,
  reason?: string,
  pageId?: string,
  sampleUrl?: string
): Promise<string> {
  const result = await db.query(
    `SELECT create_taxonomy_suggestion($1, $2, $3, $4, $5, $6, $7) as id`,
    [type, suggestedCode, suggestedLabelFr, suggestedLabelAr || null, reason || null, pageId || null, sampleUrl || null]
  )

  return result.rows[0].id
}

/**
 * Approuve une suggestion et crée l'élément de taxonomie
 */
export async function approveSuggestion(
  suggestionId: string,
  reviewerId: string,
  parentCode?: string,
  notes?: string
): Promise<TaxonomyItem> {
  // Récupérer la suggestion
  const suggestionResult = await db.query(
    `SELECT * FROM taxonomy_suggestions WHERE id = $1`,
    [suggestionId]
  )

  if (suggestionResult.rows.length === 0) {
    throw new Error('Suggestion non trouvée')
  }

  const suggestion = suggestionResult.rows[0]

  if (suggestion.status !== 'pending') {
    throw new Error(`Suggestion déjà traitée (statut: ${suggestion.status})`)
  }

  // Créer l'élément de taxonomie
  const taxonomy = await createTaxonomy({
    type: suggestion.type,
    code: suggestion.suggested_code,
    parentCode: parentCode || suggestion.suggested_parent_code,
    labelFr: suggestion.suggested_label_fr,
    labelAr: suggestion.suggested_label_ar || suggestion.suggested_label_fr,
  })

  // Mettre à jour le statut de la suggestion
  await db.query(
    `UPDATE taxonomy_suggestions
     SET status = 'approved',
         reviewed_by = $1,
         reviewed_at = NOW(),
         review_notes = $2,
         created_taxonomy_id = $3
     WHERE id = $4`,
    [reviewerId, notes || null, taxonomy.id, suggestionId]
  )

  // Marquer l'élément comme suggéré par IA et validé
  await db.query(
    `UPDATE legal_taxonomy
     SET suggested_by_ai = true,
         ai_suggestion_reason = $1,
         validated_by = $2,
         validated_at = NOW()
     WHERE id = $3`,
    [suggestion.reason, reviewerId, taxonomy.id]
  )

  return taxonomy
}

/**
 * Rejette une suggestion
 */
export async function rejectSuggestion(
  suggestionId: string,
  reviewerId: string,
  notes?: string
): Promise<void> {
  await db.query(
    `UPDATE taxonomy_suggestions
     SET status = 'rejected',
         reviewed_by = $1,
         reviewed_at = NOW(),
         review_notes = $2
     WHERE id = $3`,
    [reviewerId, notes || null, suggestionId]
  )
}

/**
 * Fusionne une suggestion avec un élément existant
 */
export async function mergeSuggestion(
  suggestionId: string,
  existingCode: string,
  reviewerId: string,
  notes?: string
): Promise<void> {
  await db.query(
    `UPDATE taxonomy_suggestions
     SET status = 'merged',
         reviewed_by = $1,
         reviewed_at = NOW(),
         review_notes = $2
     WHERE id = $3`,
    [reviewerId, notes || `Fusionné avec ${existingCode}`, suggestionId]
  )
}

// =============================================================================
// LOOKUPS RAPIDES
// =============================================================================

/**
 * Cache en mémoire pour les lookups fréquents
 */
let taxonomyCache: Map<string, TaxonomyItem> | null = null
let taxonomyCacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Récupère un élément de taxonomie depuis le cache
 */
export async function lookupTaxonomy(code: string): Promise<TaxonomyItem | null> {
  // Rafraîchir le cache si nécessaire
  if (!taxonomyCache || Date.now() - taxonomyCacheTimestamp > CACHE_TTL_MS) {
    await refreshTaxonomyCache()
  }

  return taxonomyCache?.get(code) || null
}

/**
 * Rafraîchit le cache de taxonomie
 */
export async function refreshTaxonomyCache(): Promise<void> {
  const items = await getAllActiveTaxonomy()
  taxonomyCache = new Map(items.map(item => [item.code, item]))
  taxonomyCacheTimestamp = Date.now()
}

/**
 * Invalide le cache (à appeler après modifications)
 */
export function invalidateTaxonomyCache(): void {
  taxonomyCache = null
  taxonomyCacheTimestamp = 0
}

/**
 * Récupère les labels pour une liste de codes
 */
export async function getTaxonomyLabels(codes: string[]): Promise<Map<string, { fr: string; ar: string }>> {
  const result = await db.query(
    `SELECT code, label_fr, label_ar FROM legal_taxonomy WHERE code = ANY($1)`,
    [codes]
  )

  const labels = new Map<string, { fr: string; ar: string }>()
  for (const row of result.rows) {
    labels.set(row.code, { fr: row.label_fr, ar: row.label_ar })
  }

  return labels
}

/**
 * Récupère les enfants d'un code parent
 */
export async function getChildrenOf(parentCode: string): Promise<TaxonomyItem[]> {
  const result = await db.query(
    `SELECT * FROM legal_taxonomy
     WHERE parent_code = $1 AND is_active = true
     ORDER BY sort_order, label_fr`,
    [parentCode]
  )

  return result.rows.map(mapDbRowToTaxonomyItem)
}

/**
 * Récupère le chemin complet (breadcrumb) d'un code
 */
export async function getTaxonomyPath(code: string): Promise<TaxonomyItem[]> {
  const result = await db.query(
    `WITH RECURSIVE path AS (
      SELECT * FROM legal_taxonomy WHERE code = $1
      UNION ALL
      SELECT t.* FROM legal_taxonomy t
      JOIN path p ON t.code = p.parent_code
    )
    SELECT * FROM path ORDER BY
      CASE type
        WHEN 'category' THEN 1
        WHEN 'domain' THEN 2
        WHEN 'document_type' THEN 3
        WHEN 'tribunal' THEN 4
        WHEN 'chamber' THEN 5
      END`,
    [code]
  )

  return result.rows.map(mapDbRowToTaxonomyItem)
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Statistiques de la taxonomie
 */
export async function getTaxonomyStats(): Promise<{
  total: number
  byType: Record<TaxonomyType, number>
  aiSuggested: number
  pendingSuggestions: number
}> {
  const result = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE type = 'category') as categories,
      COUNT(*) FILTER (WHERE type = 'domain') as domains,
      COUNT(*) FILTER (WHERE type = 'document_type') as document_types,
      COUNT(*) FILTER (WHERE type = 'tribunal') as tribunals,
      COUNT(*) FILTER (WHERE type = 'chamber') as chambers,
      COUNT(*) FILTER (WHERE suggested_by_ai = true) as ai_suggested,
      (SELECT COUNT(*) FROM taxonomy_suggestions WHERE status = 'pending') as pending_suggestions
    FROM legal_taxonomy
    WHERE is_active = true
  `)

  const row = result.rows[0]

  return {
    total: parseInt(row.total, 10),
    byType: {
      category: parseInt(row.categories, 10),
      domain: parseInt(row.domains, 10),
      document_type: parseInt(row.document_types, 10),
      tribunal: parseInt(row.tribunals, 10),
      chamber: parseInt(row.chambers, 10),
    },
    aiSuggested: parseInt(row.ai_suggested, 10),
    pendingSuggestions: parseInt(row.pending_suggestions, 10),
  }
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapRowToTaxonomyItem(row: Record<string, unknown>): TaxonomyItem {
  return {
    id: row.id as string,
    type: 'category' as TaxonomyType, // Default, will be overwritten
    code: row.code as string,
    parentCode: row.parent_code as string | null,
    labelFr: row.label_fr as string,
    labelAr: row.label_ar as string,
    description: row.description as string | null,
    icon: row.icon as string | null,
    color: row.color as string | null,
    isActive: true,
    isSystem: row.is_system as boolean,
    sortOrder: row.sort_order as number,
    suggestedByAi: false,
    aiSuggestionReason: null,
    validatedBy: null,
    validatedAt: null,
    children: (row.children as TaxonomyItem[]) || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function mapDbRowToTaxonomyItem(row: Record<string, unknown>): TaxonomyItem {
  return {
    id: row.id as string,
    type: row.type as TaxonomyType,
    code: row.code as string,
    parentCode: row.parent_code as string | null,
    labelFr: row.label_fr as string,
    labelAr: row.label_ar as string,
    description: row.description as string | null,
    icon: row.icon as string | null,
    color: row.color as string | null,
    isActive: row.is_active as boolean,
    isSystem: row.is_system as boolean,
    sortOrder: row.sort_order as number,
    suggestedByAi: row.suggested_by_ai as boolean,
    aiSuggestionReason: row.ai_suggestion_reason as string | null,
    validatedBy: row.validated_by as string | null,
    validatedAt: row.validated_at ? new Date(row.validated_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}

function mapRowToSuggestion(row: Record<string, unknown>): TaxonomySuggestion {
  return {
    id: row.id as string,
    type: row.type as TaxonomyType,
    suggestedCode: row.suggested_code as string,
    suggestedLabelFr: row.suggested_label_fr as string,
    suggestedLabelAr: row.suggested_label_ar as string | null,
    suggestedParentCode: row.suggested_parent_code as string | null,
    reason: row.reason as string | null,
    basedOnPages: (row.based_on_pages as string[]) || [],
    occurrenceCount: row.occurrence_count as number,
    sampleUrls: (row.sample_urls as string[]) || [],
    status: row.status as 'pending' | 'approved' | 'rejected' | 'merged',
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string) : null,
    reviewNotes: row.review_notes as string | null,
    createdTaxonomyId: row.created_taxonomy_id as string | null,
    createdAt: new Date(row.created_at as string),
  }
}
