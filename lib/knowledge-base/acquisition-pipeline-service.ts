/**
 * Service de Pipeline d'Acquisition Multi-Sources - Phase 1
 *
 * Objectif : Acquérir 500 documents juridiques de qualité supérieure
 * - Cour de Cassation (cassation.tn) : 150 arrêts fondateurs par domaine
 * - Codes juridiques (legislation.tn) : 8 codes majeurs
 * - JORT : 50 lois critiques 2015-2025
 * - Doctrine (da5ira.com) : 100 analyses doctrinales
 * - Google Drive : 100 modèles/guides
 *
 * Critères de qualité :
 * - Jurisprudence citée >5 fois
 * - Chambres mixtes et revirements de jurisprudence
 * - Textes fondateurs (COC, CSP, CP, etc.)
 * - Analyses doctrinales approfondies (>1000 mots)
 *
 * @module lib/knowledge-base/acquisition-pipeline-service
 */

import { db } from '@/lib/db/postgres'
import type { WebSource } from '@/lib/web-scraper/types'

// =============================================================================
// TYPES
// =============================================================================

export interface AcquisitionTarget {
  id: string
  source: 'cassation' | 'legislation' | 'jort' | 'doctrine' | 'gdrive' | 'autre'
  priority: number // 1-10 (10 = plus haute)
  category: string
  domain?: string
  estimatedDocCount: number
  qualityCriteria: QualityCriteria
  crawlConfig?: CrawlConfig
}

export interface QualityCriteria {
  minWordCount?: number
  minCitationCount?: number
  requiredFields?: string[]
  excludePatterns?: string[]
  dateRange?: {
    from?: Date
    to?: Date
  }
  tribunalTypes?: string[]
  chambreTypes?: string[]
  isFundamental?: boolean // Texte fondateur
  isLandmark?: boolean // Arrêt de principe
}

export interface CrawlConfig {
  baseUrl: string
  crawlDepth: number
  followLinks: boolean
  useSitemap: boolean
  requiresJavascript: boolean
  seedUrls?: string[]
  urlPatterns?: string[]
  excludedPatterns?: string[]
}

export interface AcquisitionResult {
  targetId: string
  source: string
  discoveredUrls: number
  acquiredDocuments: number
  failedDocuments: number
  qualityScore: number
  durationMs: number
  errors: string[]
  warnings: string[]
}

export interface AcquisitionStats {
  totalTargets: number
  completedTargets: number
  inProgressTargets: number
  totalDocuments: number
  qualityScoreAvg: number
  estimatedCompletion: Date
}

// =============================================================================
// TARGETS D'ACQUISITION PRIORITAIRES (Phase 1)
// =============================================================================

/**
 * Liste des 5 sources prioritaires avec objectifs Phase 1
 */
export const ACQUISITION_TARGETS: AcquisitionTarget[] = [
  // 1. COUR DE CASSATION - 150 arrêts fondateurs
  {
    id: 'cassation-arrêts-fondateurs',
    source: 'cassation',
    priority: 10,
    category: 'jurisprudence',
    estimatedDocCount: 150,
    qualityCriteria: {
      minWordCount: 500,
      minCitationCount: 5,
      requiredFields: ['tribunal', 'chambre', 'decision_date', 'solution'],
      dateRange: {
        from: new Date('2010-01-01'),
        to: new Date('2026-12-31'),
      },
      tribunalTypes: ['TRIBUNAL_CASSATION'],
      chambreTypes: [
        'CHAMBRE_CIVILE',
        'CHAMBRE_COMMERCIALE',
        'CHAMBRE_SOCIALE',
        'CHAMBRE_PENALE',
      ],
      isLandmark: true,
    },
    crawlConfig: {
      baseUrl: 'https://cassation.tn',
      crawlDepth: 3,
      followLinks: true,
      useSitemap: false,
      requiresJavascript: true,
      seedUrls: [
        'https://cassation.tn/index.php?option=com_datacompliance&task=arrêts',
      ],
      urlPatterns: ['/arrêts/', '/decisions/'],
      excludedPatterns: ['/archives/', '/ancien/'],
    },
  },

  // 2. CODES JURIDIQUES - 8 codes majeurs
  {
    id: 'codes-juridiques-majeurs',
    source: 'legislation',
    priority: 9,
    category: 'code',
    estimatedDocCount: 8,
    qualityCriteria: {
      minWordCount: 5000,
      requiredFields: ['code_name', 'article_range', 'effective_date'],
      isFundamental: true,
    },
    crawlConfig: {
      baseUrl: 'https://legislation.tn',
      crawlDepth: 2,
      followLinks: true,
      useSitemap: true,
      requiresJavascript: false,
      seedUrls: [
        'https://legislation.tn/fr/code-des-obligations-et-des-contrats',
        'https://legislation.tn/fr/code-du-statut-personnel',
        'https://legislation.tn/fr/code-penal',
        'https://legislation.tn/fr/code-de-procedure-penale',
        'https://legislation.tn/fr/code-de-procedure-civile-et-commerciale',
        'https://legislation.tn/fr/code-du-travail',
        'https://legislation.tn/fr/code-de-commerce',
        'https://legislation.tn/fr/code-de-la-route',
      ],
    },
  },

  // 3. JORT - 50 lois critiques 2015-2025
  {
    id: 'jort-lois-critiques-2015-2025',
    source: 'jort',
    priority: 8,
    category: 'législation',
    estimatedDocCount: 50,
    qualityCriteria: {
      minWordCount: 1000,
      requiredFields: ['loi_number', 'jort_number', 'jort_date'],
      dateRange: {
        from: new Date('2015-01-01'),
        to: new Date('2025-12-31'),
      },
      isFundamental: false,
    },
    crawlConfig: {
      baseUrl: 'https://legislation.tn/fr/lois-organiques',
      crawlDepth: 2,
      followLinks: true,
      useSitemap: true,
      requiresJavascript: false,
      urlPatterns: ['/lois/', '/decrets/'],
      excludedPatterns: ['/archives-avant-2015/'],
    },
  },

  // 4. DOCTRINE - 100 analyses doctrinales approfondies
  {
    id: 'doctrine-analyses-approfondies',
    source: 'doctrine',
    priority: 7,
    category: 'doctrine',
    estimatedDocCount: 100,
    qualityCriteria: {
      minWordCount: 1000,
      requiredFields: ['author', 'publication_date'],
      excludePatterns: ['brèves', 'actualités', 'annonces'],
      dateRange: {
        from: new Date('2020-01-01'),
        to: new Date('2026-12-31'),
      },
    },
    crawlConfig: {
      baseUrl: 'https://www.da5ira.com',
      crawlDepth: 2,
      followLinks: true,
      useSitemap: true,
      requiresJavascript: false,
      urlPatterns: ['/\\d{4}/\\d{2}/.+\\.html$/'],
      excludedPatterns: [
        '*.html?m=1', // Mobile
        '*.html#*', // Ancres
        '*.html?showComment=*', // Commentaires
      ],
    },
  },

  // 5. GOOGLE DRIVE - 100 modèles et guides pratiques
  {
    id: 'gdrive-modeles-guides',
    source: 'gdrive',
    priority: 6,
    category: 'google_drive',
    estimatedDocCount: 100,
    qualityCriteria: {
      minWordCount: 500,
      requiredFields: ['title', 'category'],
    },
    // Note: Google Drive utilise un système de crawl différent (gdrive-crawler-service.ts)
    // Le crawlConfig est optionnel car géré par drive_config dans web_sources
  },
]

// =============================================================================
// SCHEDULER & PRIORISATION
// =============================================================================

/**
 * Planifie les acquisitions selon les priorités
 *
 * @returns Targets triés par priorité décroissante
 */
export function scheduleAcquisitions(): AcquisitionTarget[] {
  return ACQUISITION_TARGETS.sort((a, b) => b.priority - a.priority)
}

/**
 * Filtre les targets selon les critères dynamiques
 *
 * @param filters - Filtres optionnels
 * @returns Targets filtrés
 */
export function filterTargets(filters: {
  source?: string[]
  category?: string[]
  minPriority?: number
  onlyFundamental?: boolean
}): AcquisitionTarget[] {
  let targets = [...ACQUISITION_TARGETS]

  if (filters.source) {
    targets = targets.filter(t => filters.source!.includes(t.source))
  }

  if (filters.category) {
    targets = targets.filter(t => filters.category!.includes(t.category))
  }

  if (filters.minPriority) {
    targets = targets.filter(t => t.priority >= filters.minPriority!)
  }

  if (filters.onlyFundamental) {
    targets = targets.filter(t => t.qualityCriteria.isFundamental || t.qualityCriteria.isLandmark)
  }

  return targets.sort((a, b) => b.priority - a.priority)
}

// =============================================================================
// CRÉATION WEB SOURCES AUTOMATIQUE
// =============================================================================

/**
 * Crée une web source à partir d'un acquisition target
 *
 * @param target - Target d'acquisition
 * @param userId - ID de l'utilisateur créateur
 * @returns ID de la source créée
 */
export async function createWebSourceFromTarget(
  target: AcquisitionTarget,
  userId: string
): Promise<string> {
  const { crawlConfig, category, source } = target

  if (!crawlConfig) {
    throw new Error(`Target ${target.id} n'a pas de crawlConfig défini`)
  }

  // Mapper le nom de source vers une description
  const sourceNames = {
    cassation: 'Cour de Cassation Tunisienne',
    legislation: 'Législation Tunisienne',
    jort: 'Journal Officiel de la République Tunisienne',
    doctrine: 'Doctrine Juridique (da5ira.com)',
    gdrive: 'Google Drive - Documents Juridiques',
    autre: 'Autre Source',
  }

  const query = `
    INSERT INTO web_sources (
      name,
      base_url,
      category,
      crawl_depth,
      seed_urls,
      url_patterns,
      excluded_patterns,
      follow_links,
      use_sitemap,
      requires_javascript,
      is_active,
      created_by,
      metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    RETURNING id
  `

  const values = [
    sourceNames[source],
    crawlConfig.baseUrl,
    category,
    crawlConfig.crawlDepth,
    JSON.stringify(crawlConfig.seedUrls || []),
    JSON.stringify(crawlConfig.urlPatterns || []),
    JSON.stringify(crawlConfig.excludedPatterns || []),
    crawlConfig.followLinks,
    crawlConfig.useSitemap,
    crawlConfig.requiresJavascript,
    true, // is_active
    userId,
    JSON.stringify({
      targetId: target.id,
      priority: target.priority,
      estimatedDocCount: target.estimatedDocCount,
      qualityCriteria: target.qualityCriteria,
      createdByPipeline: true,
      createdAt: new Date().toISOString(),
    }),
  ]

  const result = await db.query(query, values)
  return result.rows[0].id
}

/**
 * Crée toutes les web sources pour les targets prioritaires
 *
 * @param userId - ID de l'utilisateur créateur
 * @param filters - Filtres optionnels
 * @returns IDs des sources créées
 */
export async function batchCreateWebSources(
  userId: string,
  filters?: {
    source?: string[]
    minPriority?: number
  }
): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  const targets = filterTargets(filters || {})
  const created: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const target of targets) {
    try {
      // Vérifier si la source existe déjà (par base_url)
      if (target.crawlConfig) {
        const existingQuery = `
          SELECT id FROM web_sources
          WHERE base_url = $1 AND category = $2
        `
        const existingResult = await db.query(existingQuery, [
          target.crawlConfig.baseUrl,
          target.category,
        ])

        if (existingResult.rows.length > 0) {
          skipped.push(target.id)
          console.log(`[Acquisition Pipeline] Source déjà existante pour ${target.id}`)
          continue
        }
      }

      const sourceId = await createWebSourceFromTarget(target, userId)
      created.push(sourceId)
      console.log(`[Acquisition Pipeline] Source créée : ${target.id} → ${sourceId}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(`${target.id}: ${errorMsg}`)
      console.error(`[Acquisition Pipeline] Erreur création source ${target.id}:`, error)
    }
  }

  return { created, skipped, errors }
}

// =============================================================================
// VALIDATION QUALITÉ POST-ACQUISITION
// =============================================================================

/**
 * Valide la qualité d'un document acquis selon les critères
 *
 * @param documentId - ID du document KB
 * @param criteria - Critères de qualité
 * @returns Score de qualité (0-100)
 */
export async function validateDocumentQuality(
  documentId: string,
  criteria: QualityCriteria
): Promise<{ score: number; passed: boolean; issues: string[] }> {
  const issues: string[] = []
  let score = 100

  // Récupérer le document
  const docResult = await db.query(
    `SELECT id, title, full_text, category, created_at FROM knowledge_base WHERE id = $1`,
    [documentId]
  )

  if (docResult.rows.length === 0) {
    return { score: 0, passed: false, issues: ['Document introuvable'] }
  }

  const doc = docResult.rows[0]

  // 1. Validation nombre de mots
  if (criteria.minWordCount) {
    const wordCount = doc.full_text?.split(/\s+/).length || 0
    if (wordCount < criteria.minWordCount) {
      issues.push(`Nombre de mots insuffisant: ${wordCount} < ${criteria.minWordCount}`)
      score -= 20
    }
  }

  // 2. Validation champs requis (via kb_structured_metadata)
  if (criteria.requiredFields && criteria.requiredFields.length > 0) {
    const metadataResult = await db.query(
      `SELECT * FROM kb_structured_metadata WHERE knowledge_base_id = $1`,
      [documentId]
    )

    if (metadataResult.rows.length > 0) {
      const metadata = metadataResult.rows[0]
      const missingFields = criteria.requiredFields.filter(field => {
        const fieldValue = metadata[field.toLowerCase()]
        return !fieldValue || fieldValue === null
      })

      if (missingFields.length > 0) {
        issues.push(`Champs manquants: ${missingFields.join(', ')}`)
        score -= missingFields.length * 10
      }
    } else {
      issues.push('Métadonnées structurées non extraites')
      score -= 30
    }
  }

  // 3. Validation date range
  if (criteria.dateRange) {
    const metadataResult = await db.query(
      `SELECT document_date FROM kb_structured_metadata WHERE knowledge_base_id = $1`,
      [documentId]
    )

    if (metadataResult.rows.length > 0) {
      const docDate = metadataResult.rows[0].document_date
      if (docDate) {
        const date = new Date(docDate)
        if (criteria.dateRange.from && date < criteria.dateRange.from) {
          issues.push(`Date trop ancienne: ${date.toISOString().split('T')[0]}`)
          score -= 15
        }
        if (criteria.dateRange.to && date > criteria.dateRange.to) {
          issues.push(`Date trop récente: ${date.toISOString().split('T')[0]}`)
          score -= 15
        }
      }
    }
  }

  // 4. Validation patterns exclus
  if (criteria.excludePatterns && criteria.excludePatterns.length > 0) {
    const text = doc.full_text?.toLowerCase() || ''
    const matchedPatterns = criteria.excludePatterns.filter(pattern =>
      text.includes(pattern.toLowerCase())
    )
    if (matchedPatterns.length > 0) {
      issues.push(`Patterns exclus trouvés: ${matchedPatterns.join(', ')}`)
      score -= matchedPatterns.length * 10
    }
  }

  score = Math.max(0, score)
  const passed = score >= 70 // Seuil de passage : 70/100

  return { score, passed, issues }
}

/**
 * Valide en batch tous les documents d'une source
 *
 * @param sourceId - ID de la web source
 * @param criteria - Critères de qualité
 * @returns Statistiques de validation
 */
export async function batchValidateSourceDocuments(
  sourceId: string,
  criteria: QualityCriteria
): Promise<{
  total: number
  passed: number
  failed: number
  avgScore: number
  issues: Record<string, string[]>
}> {
  // Récupérer tous les documents de la source
  const docsResult = await db.query(
    `SELECT id FROM knowledge_base
     WHERE metadata->>'sourceId' = $1`,
    [sourceId]
  )

  const total = docsResult.rows.length
  let passed = 0
  let failed = 0
  let totalScore = 0
  const issues: Record<string, string[]> = {}

  for (const row of docsResult.rows) {
    const validation = await validateDocumentQuality(row.id, criteria)
    totalScore += validation.score

    if (validation.passed) {
      passed++
    } else {
      failed++
      issues[row.id] = validation.issues
    }
  }

  const avgScore = total > 0 ? totalScore / total : 0

  console.log(
    `[Acquisition Pipeline] Validation source ${sourceId}: ${passed}/${total} docs passés (score moyen: ${avgScore.toFixed(1)})`
  )

  return { total, passed, failed, avgScore, issues }
}

// =============================================================================
// STATISTIQUES D'ACQUISITION
// =============================================================================

/**
 * Récupère les statistiques globales d'acquisition
 *
 * @returns Stats d'acquisition
 */
export async function getAcquisitionStats(): Promise<AcquisitionStats> {
  const targets = ACQUISITION_TARGETS

  // Compter les sources créées par le pipeline
  const sourcesResult = await db.query(`
    SELECT COUNT(*) as count
    FROM web_sources
    WHERE metadata->>'createdByPipeline' = 'true'
  `)
  const completedTargets = parseInt(sourcesResult.rows[0]?.count || '0', 10)

  // Compter les documents acquis
  const docsResult = await db.query(`
    SELECT COUNT(*) as count
    FROM knowledge_base kb
    INNER JOIN web_sources ws ON kb.metadata->>'sourceId' = ws.id::text
    WHERE ws.metadata->>'createdByPipeline' = 'true'
  `)
  const totalDocuments = parseInt(docsResult.rows[0]?.count || '0', 10)

  // Calculer le score qualité moyen
  const qualityResult = await db.query(`
    SELECT AVG(extraction_confidence) as avg_score
    FROM kb_structured_metadata
  `)
  const qualityScoreAvg = parseFloat(qualityResult.rows[0]?.avg_score || '0')

  // Estimation de complétion (basée sur la vitesse moyenne d'acquisition)
  const totalEstimatedDocs = targets.reduce((sum, t) => sum + t.estimatedDocCount, 0)
  const progress = totalDocuments / totalEstimatedDocs
  const avgTimePerDoc = 30000 // 30s par document (estimation)
  const remainingDocs = totalEstimatedDocs - totalDocuments
  const estimatedRemainingTime = remainingDocs * avgTimePerDoc
  const estimatedCompletion = new Date(Date.now() + estimatedRemainingTime)

  return {
    totalTargets: targets.length,
    completedTargets,
    inProgressTargets: targets.length - completedTargets,
    totalDocuments,
    qualityScoreAvg,
    estimatedCompletion,
  }
}

// Les fonctions sont déjà exportées individuellement ci-dessus
