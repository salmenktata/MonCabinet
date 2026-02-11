/**
 * Service Timeline Jurisprudentielle Tunisienne (Phase 4.3)
 *
 * Construit une timeline interactive de l'évolution de la jurisprudence
 * tunisienne avec identification des arrêts clés et types d'événements.
 *
 * Types d'événements :
 * - major_shift : Revirement jurisprudentiel (نقض)
 * - confirmation : Confirmation de position (تأكيد)
 * - nuance : Distinction/précision (تمييز)
 * - standard : Arrêt normal sans événement majeur
 *
 * @module lib/ai/jurisprudence-timeline-service
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type d'événement jurisprudentiel
 */
export type EventType = 'major_shift' | 'confirmation' | 'nuance' | 'standard'

/**
 * Événement timeline (arrêt tunisien)
 */
export interface TimelineEvent {
  // Identifiant
  id: string

  // Métadonnées décision
  title: string
  decisionNumber: string | null
  decisionDate: Date | null

  // Juridiction
  tribunalCode: string | null
  tribunalLabel: string | null
  chambreCode: string | null
  chambreLabel: string | null

  // Classification
  domain: string | null
  domainLabel: string | null
  category: string

  // Type événement
  eventType: EventType
  eventDescription: string | null

  // Importance
  precedentValue: number // 0-1 (PageRank)
  citedByCount: number
  hasOverrules: boolean // Renverse un précédent
  isOverruled: boolean // Est renversé par un arrêt ultérieur

  // Relations clés
  overrulesIds: string[] // IDs arrêts renversés
  confirmsIds: string[] // IDs arrêts confirmés
  distinguishesIds: string[] // IDs arrêts distingués

  // Contenu
  summary: string | null
  legalBasis: string[] | null
  solution: string | null
}

/**
 * Options construction timeline
 */
export interface TimelineOptions {
  domain?: string // Filtrer par domaine (civil, pénal, etc.)
  tribunalCode?: string // Filtrer par tribunal
  dateFrom?: Date
  dateTo?: Date
  minCitedBy?: number // Min citations pour être considéré "clé"
  includeStandard?: boolean // Inclure arrêts standard (pas événement majeur)
  limit?: number
}

/**
 * Résultat timeline
 */
export interface TimelineResult {
  events: TimelineEvent[]
  stats: TimelineStats
  filters: TimelineOptions
}

/**
 * Statistiques timeline
 */
export interface TimelineStats {
  totalEvents: number
  majorShifts: number
  confirmations: number
  nuances: number
  standardEvents: number
  dateRange: {
    earliest: Date | null
    latest: Date | null
  }
  topPrecedents: Array<{
    id: string
    title: string
    precedentValue: number
    citedByCount: number
  }>
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Construit une timeline jurisprudentielle tunisienne
 *
 * @param options - Options de filtrage et construction
 * @returns Timeline avec événements et statistiques
 *
 * @example
 * ```ts
 * const timeline = await buildJurisprudenceTimeline({
 *   domain: 'civil',
 *   tribunalCode: 'cassation',
 *   dateFrom: new Date('2015-01-01'),
 *   minCitedBy: 3
 * })
 *
 * console.log(`${timeline.stats.totalEvents} événements, dont ${timeline.stats.majorShifts} revirements`)
 * ```
 */
export async function buildJurisprudenceTimeline(
  options: TimelineOptions = {}
): Promise<TimelineResult> {
  console.log('[Timeline] Construction timeline jurisprudentielle tunisienne...')

  const {
    domain,
    tribunalCode,
    dateFrom,
    dateTo,
    minCitedBy = 0,
    includeStandard = true,
    limit = 100,
  } = options

  // 1. Requête DB : tous arrêts tunisiens filtrés
  const events = await fetchJurisprudenceEvents({
    domain,
    tribunalCode,
    dateFrom,
    dateTo,
    limit,
  })

  console.log(`[Timeline] ${events.length} arrêts récupérés de la DB`)

  // 2. Enrichir avec relations juridiques (overrules, confirms, etc.)
  const enrichedEvents = await enrichWithRelations(events)

  console.log(`[Timeline] Événements enrichis avec relations juridiques`)

  // 3. Classifier type événement (major_shift, confirmation, nuance)
  const classifiedEvents = classifyEventTypes(enrichedEvents)

  console.log(`[Timeline] Types événements classifiés`)

  // 4. Filtrer arrêts clés si minCitedBy spécifié
  let filteredEvents = classifiedEvents
  if (minCitedBy > 0 || !includeStandard) {
    filteredEvents = classifiedEvents.filter(event => {
      const meetsMinCitations = event.citedByCount >= minCitedBy
      const isKeyEvent =
        event.eventType === 'major_shift' ||
        event.eventType === 'confirmation' ||
        event.eventType === 'nuance'

      return meetsMinCitations || (includeStandard ? true : isKeyEvent)
    })

    console.log(
      `[Timeline] Filtrage : ${filteredEvents.length}/${classifiedEvents.length} événements clés`
    )
  }

  // 5. Trier par date décroissante
  filteredEvents.sort((a, b) => {
    if (!a.decisionDate || !b.decisionDate) return 0
    return b.decisionDate.getTime() - a.decisionDate.getTime()
  })

  // 6. Calculer statistiques
  const stats = calculateTimelineStats(filteredEvents)

  console.log(
    `[Timeline] Timeline construite : ${stats.totalEvents} événements (${stats.majorShifts} revirements, ${stats.confirmations} confirmations)`
  )

  return {
    events: filteredEvents,
    stats,
    filters: options,
  }
}

// =============================================================================
// FONCTIONS AUXILIAIRES
// =============================================================================

/**
 * Récupère arrêts jurisprudence depuis DB
 */
async function fetchJurisprudenceEvents(filters: {
  domain?: string
  tribunalCode?: string
  dateFrom?: Date
  dateTo?: Date
  limit: number
}): Promise<TimelineEvent[]> {
  const conditions: string[] = ["kb.category = 'jurisprudence'", 'meta.decision_date IS NOT NULL']
  const params: any[] = []

  let paramIndex = 1

  if (filters.domain) {
    conditions.push(`kb.taxonomy_domain_code = $${paramIndex}`)
    params.push(filters.domain)
    paramIndex++
  }

  if (filters.tribunalCode) {
    conditions.push(`meta.tribunal_code = $${paramIndex}`)
    params.push(filters.tribunalCode)
    paramIndex++
  }

  if (filters.dateFrom) {
    conditions.push(`meta.decision_date >= $${paramIndex}`)
    params.push(filters.dateFrom)
    paramIndex++
  }

  if (filters.dateTo) {
    conditions.push(`meta.decision_date <= $${paramIndex}`)
    params.push(filters.dateTo)
    paramIndex++
  }

  const query = `
    SELECT
      kb.id,
      kb.title,
      kb.category,
      meta.decision_number,
      meta.decision_date,
      meta.tribunal_code,
      trib_tax.label_fr AS tribunal_label,
      meta.chambre_code,
      chambre_tax.label_fr AS chambre_label,
      kb.taxonomy_domain_code AS domain_code,
      domain_tax.label_fr AS domain_label,
      meta.precedent_value,
      meta.solution,
      meta.legal_basis,
      -- Compteur citations (relations entrantes)
      (SELECT COUNT(*)
       FROM kb_legal_relations
       WHERE target_kb_id = kb.id
         AND validated = true
         AND relation_type IN ('cites', 'cited_by', 'confirms', 'applies')
      ) AS cited_by_count
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
    LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
    LEFT JOIN legal_taxonomy domain_tax ON kb.taxonomy_domain_code = domain_tax.code
    WHERE ${conditions.join(' AND ')}
    ORDER BY meta.decision_date DESC
    LIMIT $${paramIndex}
  `

  params.push(filters.limit)

  const result = await db.query(query, params)

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    decisionNumber: row.decision_number,
    decisionDate: row.decision_date ? new Date(row.decision_date) : null,
    tribunalCode: row.tribunal_code,
    tribunalLabel: row.tribunal_label,
    chambreCode: row.chambre_code,
    chambreLabel: row.chambre_label,
    domain: row.domain_code,
    domainLabel: row.domain_label,
    category: row.category,
    eventType: 'standard', // Sera classifié après
    eventDescription: null,
    precedentValue: parseFloat(row.precedent_value || '0'),
    citedByCount: parseInt(row.cited_by_count || '0'),
    hasOverrules: false, // Sera enrichi après
    isOverruled: false,
    overrulesIds: [],
    confirmsIds: [],
    distinguishesIds: [],
    summary: null,
    legalBasis: row.legal_basis,
    solution: row.solution,
  }))
}

/**
 * Enrichit événements avec relations juridiques
 */
async function enrichWithRelations(events: TimelineEvent[]): Promise<TimelineEvent[]> {
  const eventIds = events.map(e => e.id)

  if (eventIds.length === 0) return events

  // Requête relations sortantes (ce document vers d'autres)
  const relationsQuery = `
    SELECT
      source_kb_id,
      target_kb_id,
      relation_type
    FROM kb_legal_relations
    WHERE source_kb_id = ANY($1)
      AND validated = true
      AND relation_type IN ('overrules', 'confirms', 'distinguishes')
  `

  const relationsResult = await db.query(relationsQuery, [eventIds])

  // Mapper relations par source
  const relationsBySource = new Map<string, typeof relationsResult.rows>()
  for (const rel of relationsResult.rows) {
    if (!relationsBySource.has(rel.source_kb_id)) {
      relationsBySource.set(rel.source_kb_id, [])
    }
    relationsBySource.get(rel.source_kb_id)!.push(rel)
  }

  // Requête relations entrantes 'overrules' (ce document est renversé)
  const overruledQuery = `
    SELECT target_kb_id
    FROM kb_legal_relations
    WHERE target_kb_id = ANY($1)
      AND validated = true
      AND relation_type = 'overrules'
  `

  const overruledResult = await db.query(overruledQuery, [eventIds])
  const overruledIds = new Set(overruledResult.rows.map(r => r.target_kb_id))

  // Enrichir chaque événement
  return events.map(event => {
    const relations = relationsBySource.get(event.id) || []

    const overrulesIds = relations
      .filter(r => r.relation_type === 'overrules')
      .map(r => r.target_kb_id)

    const confirmsIds = relations
      .filter(r => r.relation_type === 'confirms')
      .map(r => r.target_kb_id)

    const distinguishesIds = relations
      .filter(r => r.relation_type === 'distinguishes')
      .map(r => r.target_kb_id)

    return {
      ...event,
      hasOverrules: overrulesIds.length > 0,
      isOverruled: overruledIds.has(event.id),
      overrulesIds,
      confirmsIds,
      distinguishesIds,
    }
  })
}

/**
 * Classifie type événement jurisprudentiel
 */
function classifyEventTypes(events: TimelineEvent[]): TimelineEvent[] {
  return events.map(event => {
    // Revirement jurisprudentiel (نقض)
    if (event.hasOverrules) {
      return {
        ...event,
        eventType: 'major_shift',
        eventDescription: `Revirement : renverse ${event.overrulesIds.length} précédent(s)`,
      }
    }

    // Confirmation de jurisprudence (تأكيد)
    if (event.confirmsIds.length > 0) {
      return {
        ...event,
        eventType: 'confirmation',
        eventDescription: `Confirme ${event.confirmsIds.length} arrêt(s) antérieur(s)`,
      }
    }

    // Distinction/nuance (تمييز)
    if (event.distinguishesIds.length > 0) {
      return {
        ...event,
        eventType: 'nuance',
        eventDescription: `Distingue ${event.distinguishesIds.length} arrêt(s)`,
      }
    }

    // Arrêt standard
    return {
      ...event,
      eventType: 'standard',
      eventDescription: null,
    }
  })
}

/**
 * Calcule statistiques timeline
 */
function calculateTimelineStats(events: TimelineEvent[]): TimelineStats {
  const majorShifts = events.filter(e => e.eventType === 'major_shift').length
  const confirmations = events.filter(e => e.eventType === 'confirmation').length
  const nuances = events.filter(e => e.eventType === 'nuance').length
  const standardEvents = events.filter(e => e.eventType === 'standard').length

  // Date range
  const datesValid = events.filter(e => e.decisionDate !== null)
  const earliest =
    datesValid.length > 0
      ? new Date(Math.min(...datesValid.map(e => e.decisionDate!.getTime())))
      : null
  const latest =
    datesValid.length > 0
      ? new Date(Math.max(...datesValid.map(e => e.decisionDate!.getTime())))
      : null

  // Top précédents (par PageRank + citations)
  const topPrecedents = [...events]
    .sort((a, b) => {
      // Trier par precedent_value DESC, puis citedByCount DESC
      if (b.precedentValue !== a.precedentValue) {
        return b.precedentValue - a.precedentValue
      }
      return b.citedByCount - a.citedByCount
    })
    .slice(0, 10)
    .map(e => ({
      id: e.id,
      title: e.title,
      precedentValue: e.precedentValue,
      citedByCount: e.citedByCount,
    }))

  return {
    totalEvents: events.length,
    majorShifts,
    confirmations,
    nuances,
    standardEvents,
    dateRange: {
      earliest,
      latest,
    },
    topPrecedents,
  }
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Obtient tous les domaines disponibles avec compteur arrêts
 */
export async function getAvailableDomains(): Promise<
  Array<{
    code: string
    label: string
    count: number
  }>
> {
  const query = `
    SELECT
      kb.taxonomy_domain_code AS code,
      tax.label_fr AS label,
      COUNT(*) AS count
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    LEFT JOIN legal_taxonomy tax ON kb.taxonomy_domain_code = tax.code
    WHERE kb.category = 'jurisprudence'
      AND meta.decision_date IS NOT NULL
      AND kb.taxonomy_domain_code IS NOT NULL
    GROUP BY kb.taxonomy_domain_code, tax.label_fr
    ORDER BY count DESC
  `

  const result = await db.query(query)

  return result.rows.map(row => ({
    code: row.code,
    label: row.label || row.code,
    count: parseInt(row.count),
  }))
}

/**
 * Obtient détails d'un arrêt pour popup hover
 */
export async function getEventDetails(eventId: string): Promise<TimelineEvent | null> {
  const result = await fetchJurisprudenceEvents({
    limit: 1,
  })

  // Filter by ID manually (simple approach)
  const timeline = await buildJurisprudenceTimeline({ limit: 1000 })
  const event = timeline.events.find(e => e.id === eventId)

  return event || null
}

// =============================================================================
// EXPORTS
// =============================================================================

export { buildJurisprudenceTimeline as default, getAvailableDomains, getEventDetails }
