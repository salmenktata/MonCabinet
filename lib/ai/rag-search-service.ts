/**
 * Service RAG Search - Recherche contextuelle et re-ranking des sources
 *
 * Ce module gère:
 * 1. La recherche vectorielle/hybride dans la base de connaissances
 * 2. Le re-ranking et la diversité des sources
 * 3. La recherche bilingue AR ↔ FR
 * 4. Le quality gate adaptatif
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { NORM_LEVEL_RAG_BOOSTS } from '@/lib/categories/norm-levels'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from './embeddings-service'
import {
  aiConfig,
  RAG_THRESHOLDS,
  SOURCE_BOOST,
  RAG_DIVERSITY,
} from './config'
import {
  getCachedSearchResults,
  setCachedSearchResults,
  SearchScope,
} from '@/lib/cache/search-cache'
import {
  detectLanguage,
  getOppositeLanguage,
  DetectedLanguage,
} from './language-utils'
import { translateQuery, isTranslationAvailable } from './translation-service'
import { filterAbrogatedSources } from './rag-abrogation-filter'
import { RAGLogger } from '@/lib/logging/rag-logger'
import { createLogger } from '@/lib/logger'
import { countTokens } from './token-utils'
import { getDynamicBoostFactors } from './feedback-service'
import {
  rerankDocuments,
  combineScores,
  isRerankerEnabled,
  DocumentToRerank,
} from './reranker-service'
import { recordRAGMetric } from '@/lib/metrics/rag-metrics'
import { searchKnowledgeBase, searchKnowledgeBaseHybrid } from './knowledge-base-service'
import type { LegalStance, PromptContextType } from './legal-reasoning-prompts'
import type { OperationName } from './operations-config'
import type { DocumentType } from '@/lib/categories/doc-types'

const log = createLogger('RAG')

// Configuration Query Expansion
export const ENABLE_QUERY_EXPANSION = process.env.ENABLE_QUERY_EXPANSION !== 'false'

// Timeout global pour la recherche bilingue (30 secondes par défaut)
// Réduit de 60s à 30s : si le search bilingue dure > 30s, il ne reste plus assez de budget
// pour l'appel LLM (timeout action = 44-54s). P1 fix Feb 24, 2026.
export const BILINGUAL_SEARCH_TIMEOUT_MS = parseInt(process.env.BILINGUAL_SEARCH_TIMEOUT_MS || '30000', 10)

// =============================================================================
// TYPES PUBLICS EXPORTÉS
// =============================================================================

export interface ChatSource {
  documentId: string
  documentName: string
  chunkContent: string
  similarity: number
  boostedSimilarity?: number
  metadata?: Record<string, unknown>
}

export interface ChatOptions {
  dossierId?: string
  conversationId?: string
  maxContextChunks?: number
  includeJurisprudence?: boolean
  includeKnowledgeBase?: boolean
  temperature?: number
  /** Type de contexte pour sélectionner le prompt approprié */
  contextType?: PromptContextType
  /** Mode Premium: utiliser cloud providers (Groq/DeepSeek/Anthropic) au lieu d'Ollama */
  usePremiumModel?: boolean
  /** Type d'opération pour configuration spécifique */
  operationName?: OperationName
  /** Logger structuré pour traçabilité (auto-créé si non fourni) */
  logger?: RAGLogger
  /** Filtrer la recherche KB par type de document */
  docType?: DocumentType
  /** Posture stratégique : défense / attaque / neutre */
  stance?: LegalStance
  /** Exclure des catégories de sources (filtre post-retrieval). Ex: ['google_drive'] */
  excludeCategories?: string[]
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// =============================================================================
// TYPES INTERNES
// =============================================================================

// Interface étendue pour le re-ranking
interface RankedSource extends ChatSource {
  boostedScore: number
  sourceType: string
  sourceId: string
}

// Interface pour les métriques de recherche
interface SearchMetrics {
  totalFound: number
  aboveThreshold: number
  scoreRange: {
    min: number
    max: number
    avg: number
  }
  sourceDistribution: Record<string, number>
  searchTimeMs: number
}

// Type de retour pour les recherches avec info de cache
export interface SearchResult {
  sources: ChatSource[]
  cacheHit: boolean
  /** Raison d'un retour vide (P1 fix Feb 24, 2026 — observabilité quality gate) */
  reason?: 'quality_gate' | 'no_results' | 'error' | 'cache_hit'
  /** Query réellement utilisée pour l'embedding (peut différer de la question originale si condensation/expansion) */
  embeddingQuestion?: string
}

// =============================================================================
// RE-RANKING ET DIVERSITÉ DES SOURCES
// =============================================================================

/**
 * Détermine le type de source à partir des métadonnées
 */
function getSourceType(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return 'document'
  const type = metadata.type as string | undefined
  const category = metadata.category as string | undefined
  return category || type || 'document'
}

/**
 * Génère un identifiant unique pour une source
 */
function getSourceId(source: ChatSource): string {
  const meta = source.metadata as Record<string, unknown> | undefined
  const type = getSourceType(meta)
  // Pour les documents, utiliser documentId; pour KB, utiliser le titre
  if (type === 'knowledge_base') {
    return `kb:${source.documentName}`
  }
  return `doc:${source.documentId}`
}

// =============================================================================
// HIÉRARCHIE DES NORMES (BOOST DÉTERMINISTE)
// =============================================================================

type HierarchyClass = 'norme' | 'jurisprudence' | 'doctrine' | 'modeles' | 'autre'

const HIERARCHY_CLASS_BOOST: Record<HierarchyClass, number> = {
  norme: 1.08,
  jurisprudence: 1.04,
  doctrine: 0.97,
  modeles: 0.95,
  autre: 1.0,
}

const NORMATIVE_CATEGORIES = new Set([
  'constitution',
  'conventions',
  'legislation',
  'codes',
  'jort',
])

const JURIS_CATEGORIES = new Set(['jurisprudence'])
const MODEL_CATEGORIES = new Set(['modeles', 'templates', 'procedures', 'formulaires', 'google_drive'])
const DOCTRINE_CATEGORIES = new Set(['doctrine', 'guides', 'lexique', 'actualites', 'autre'])

const NORMATIVE_LEVEL_BOOSTS: Array<{ patterns: RegExp[]; boost: number }> = [
  { patterns: [/constitution|دستور/i], boost: 1.08 },
  { patterns: [/convention|conventions|traite|traité|اتفاقية|اتفاقيات|معاهدة/i], boost: 1.06 },
  { patterns: [/loi[\s_-]?organique|قانون\s*أساسي/i], boost: 1.04 },
  { patterns: [/^loi$|law|legislation|code|code_article|مجلة|قانون(?!\s*أساسي)/i], boost: 1.02 },
  { patterns: [/decret|décret|decree|مرسوم/i], boost: 1.01 },
  { patterns: [/ordre|order|أمر/i], boost: 1.0 },
  { patterns: [/arrete|arrêté|قرار|ministerial|وزاري/i], boost: 0.99 },
]

function normalizeHierarchyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length > 0 ? str.toLowerCase() : null
}

function classifyHierarchyType(
  category: string | null,
  docTypeMeta: string | null,
  docTypeRaw: string | null
): HierarchyClass {
  const meta = docTypeMeta || ''
  if (meta === 'textes') return 'norme'
  if (meta === 'juris') return 'jurisprudence'
  if (meta === 'doctrine') return 'doctrine'
  if (meta === 'templates' || meta === 'proc') return 'modeles'

  if (category && NORMATIVE_CATEGORIES.has(category)) return 'norme'
  if (category && JURIS_CATEGORIES.has(category)) return 'jurisprudence'
  if (category && MODEL_CATEGORIES.has(category)) return 'modeles'
  if (category && DOCTRINE_CATEGORIES.has(category)) return 'doctrine'

  if (docTypeRaw) {
    if (/juris|arret|arrêt|jugement|decision|cassation|appel/i.test(docTypeRaw)) return 'jurisprudence'
    if (/modele|formulaire|template|proc/i.test(docTypeRaw)) return 'modeles'
    if (/doctrine|commentaire|guide|lexique/i.test(docTypeRaw)) return 'doctrine'
    if (NORMATIVE_LEVEL_BOOSTS.some(level => level.patterns.some(p => p.test(docTypeRaw)))) return 'norme'
  }

  return 'autre'
}

function getNormativeLevelBoost(value: string | null): number {
  if (!value) return 1.0
  for (const level of NORMATIVE_LEVEL_BOOSTS) {
    if (level.patterns.some(p => p.test(value))) {
      return level.boost
    }
  }
  return 1.01
}

// --- Boost temporel (récence) ---
const CURRENT_YEAR = new Date().getFullYear()
const TEMPORAL_BOOST_CONFIG = {
  baseYear: 1956,
  maxYearRange: 70,
  maxBoost: 0.03,
  enabledClasses: new Set<HierarchyClass>(['norme', 'jurisprudence']),
} as const

const TEMPORAL_BOOST_ENABLED = process.env.ENABLE_TEMPORAL_BOOST !== 'false'

function extractDocumentYear(metadata: Record<string, unknown>): number | null {
  const dateFields = [
    'effective_date', 'jort_date', 'version_date',
    'document_date', 'decision_date', 'publication_date',
  ]
  for (const field of dateFields) {
    const val = metadata[field]
    if (typeof val === 'string' && val.length >= 4) {
      const year = parseInt(val.substring(0, 4), 10)
      if (year >= TEMPORAL_BOOST_CONFIG.baseYear && year <= CURRENT_YEAR) {
        return year
      }
    }
  }
  return null
}

function getTemporalRecencyBoost(
  metadata: Record<string, unknown> | undefined,
  hierarchyClass: HierarchyClass
): number {
  if (!TEMPORAL_BOOST_ENABLED) return 1.0
  if (!metadata || !TEMPORAL_BOOST_CONFIG.enabledClasses.has(hierarchyClass)) return 1.0

  const year = extractDocumentYear(metadata)
  if (year === null) return 1.0

  const { baseYear, maxYearRange, maxBoost } = TEMPORAL_BOOST_CONFIG
  const ratio = Math.min(Math.max((year - baseYear) / maxYearRange, 0), 1)
  return 1.0 + ratio * maxBoost
}

function getHierarchyBoost(metadata: Record<string, unknown> | undefined): number {
  if (!metadata) return 1.0

  // Priorité 1 : norm_level explicite (champ DB synced dans JSONB après migration)
  const normLevel = normalizeHierarchyValue(metadata.norm_level)
  if (normLevel && NORM_LEVEL_RAG_BOOSTS[normLevel as keyof typeof NORM_LEVEL_RAG_BOOSTS]) {
    const classBoost = HIERARCHY_CLASS_BOOST['norme']  // 1.08
    return classBoost * NORM_LEVEL_RAG_BOOSTS[normLevel as keyof typeof NORM_LEVEL_RAG_BOOSTS]
    // ex: Constitution = 1.08 × 1.25 = 1.35
  }

  // Fallback : logique existante basée sur category/doc_type + regex
  const category = normalizeHierarchyValue(metadata.category)
  const docTypeMeta = normalizeHierarchyValue(metadata.doc_type)
  const docTypeRaw = normalizeHierarchyValue(
    (metadata.document_type as string | undefined) ||
    (metadata.documentType as string | undefined) ||
    (metadata.documentNature as string | undefined) ||
    (metadata.document_nature as string | undefined) ||
    (metadata.doc_type as string | undefined)
  )

  const classType = classifyHierarchyType(category, docTypeMeta, docTypeRaw)
  let boost = HIERARCHY_CLASS_BOOST[classType] || 1.0

  if (classType === 'norme') {
    boost *= getNormativeLevelBoost(docTypeRaw || category)
  }

  return boost
}

/**
 * Détecte si la query mentionne un domaine juridique spécifique
 * et retourne les patterns de titre à booster
 */
function detectDomainBoost(query: string): { pattern: string; factor: number }[] | null {
  // ✨ Fix (Feb 2026): factor 1.25→2.5 pour compenser l'écart sémantique entre queries naturelles et textes légaux.
  // Seul le code EXACT attendu reçoit 2.5×. Les mauvais codes reçoivent seulement le CODE_BOOST générique.
  const DOMAIN_KEYWORDS: { keywords: string[]; titlePatterns: string[]; factor: number }[] = [
    // Pénal
    {
      keywords: ['جزائي', 'جزائية', 'جنائي', 'عقوبة', 'عقوبات', 'جريمة', 'القتل', 'السرقة', 'الدفاع الشرعي', 'الرشوة', 'pénal', 'criminel', 'légitime défense'],
      titlePatterns: ['المجلة الجزائية'],
      factor: 2.5,
    },
    // Civil
    {
      keywords: ['مدني', 'التزامات', 'عقود', 'العقد', 'البطلان', 'الفسخ', 'الضمان', 'تعويض', 'مسؤولية مدنية', 'تقادم', 'civil', 'responsabilité', 'délictuel'],
      // Fix Feb 26: formes arabes avec article défini "ال" — 'العقد' (ar_civil_01), 'البطلان' (ar_civil_09), 'الفسخ' (ar_civil_08), 'الضمان' (ar_civil_05)
      titlePatterns: ['مجلة الالتزامات والعقود'],
      factor: 2.5,
    },
    // Famille
    {
      keywords: ['أحوال شخصية', 'طلاق', 'زواج', 'نفقة', 'حضانة', 'ميراث', 'divorce', 'mariage', 'garde', 'famille'],
      titlePatterns: ['مجلة الأحوال الشخصية'],
      factor: 2.5,
    },
    // Travail
    {
      keywords: ['شغل', 'عمل', 'طرد تعسفي', 'إضراب', 'أجر', 'عامل', 'مؤجر', 'travail', 'licenciement', 'grève'],
      titlePatterns: ['مجلة الشغل'],
      factor: 2.5,
    },
    // Commercial: "مجلة الشركات التجارية" retiré (causait des faux positifs car raw score > المجلة التجارية)
    {
      keywords: ['تجاري', 'تجارية', 'شيك', 'إفلاس', 'تفليس', 'كمبيالة', 'commercial', 'chèque', 'faillite'],
      titlePatterns: ['المجلة التجارية'],
      factor: 2.5,
    },
    // Procédure civile
    {
      keywords: ['مرافعات', 'استئناف', 'تعقيب', 'دعوى', 'إجراءات مدنية', 'procédure'],
      titlePatterns: ['مجلة المرافعات المدنية والتجارية'],
      factor: 2.0,
    },
    // Procédure pénale (مجلة الإجراءات الجزائية — CPP)
    // Fix Feb 26 v6 : CPP était absent des DOMAIN_KEYWORDS. penal_easy_01 "prescription action publique"
    // récupérait du contenu fiscal au lieu de CPP art.5.
    {
      // Fix Feb 26 v7 : retiré 'délit' (trop générique — déclenche faux positifs en droit civil)
      keywords: ['إجراءات جزائية', 'تقادم جزائي', 'دعوى عمومية', 'action publique', 'prescription pénale', 'juge d\'instruction', 'جنحة', 'جناية', 'مخالفة', 'contravention'],
      titlePatterns: ['مجلة الإجراءات الجزائية'],
      factor: 2.5,
    },
    // Saisies conservatoires / طرق التنفيذ
    {
      keywords: ['عقلة', 'تحفظي', 'تحفظية', 'طرق التنفيذ', 'اعتراض تحفظي', 'عريضة', 'ضرب عقلة', 'saisie', 'conservatoire'],
      titlePatterns: ['عقلة', 'طرق التنفيذ', 'تحفظ'],
      factor: 2.5,
    },
  ]

  const matches: { pattern: string; factor: number }[] = []

  for (const domain of DOMAIN_KEYWORDS) {
    const queryLower = query.toLowerCase()
    const hasKeyword = domain.keywords.some(kw => query.includes(kw) || queryLower.includes(kw))
    if (hasKeyword) {
      for (const pattern of domain.titlePatterns) {
        matches.push({ pattern, factor: domain.factor })
      }
    }
  }

  return matches.length > 0 ? matches : null
}

/**
 * Re-rank les sources avec boost par type, cross-encoder et diversité
 * Utilise:
 * 1. Boost factors dynamiques basés sur le feedback utilisateur
 * 2. Cross-encoder pour re-scorer les paires (query, document)
 * 3. Diversité pour limiter les chunks par source
 */
/**
 * Infère la branche juridique d'un document à partir de son titre,
 * utilisé comme fallback quand metadata.branch est null.
 *
 * Ciblé sur les patterns haute-précision pour éviter les faux positifs.
 * Note: 14 339 chunks category='codes' ont branch=null en prod (Feb 25, 2026).
 */
function inferBranchFromTitle(docName: string): string | undefined {
  if (!docName) return undefined
  const n = docName.toLowerCase()

  // Fiscal — patterns très distinctifs
  if (
    n.includes('note-commune') || n.includes('note commune') ||
    n.includes('enregistrement') || n.includes('تسجيل الديون') ||
    /\btva\b/.test(n) || n.includes('أداء على القيمة') ||
    /\birpp\b/.test(n) || /\bdgi\b/.test(n) ||
    n.includes('impôt sur le') || n.includes('جبائي') || n.includes('جباية') ||
    n.includes('fiscal') || n.includes('ضريبي') ||
    n.includes('droits de douane') || n.includes('مجلة الديوانة') ||
    n.includes('timbre fiscal') || n.includes('recouvrement de l') ||
    n.includes('code de la tva') || n.includes('code de l\'irpp')
  ) {
    return 'fiscal'
  }

  // Civil — COC
  if (
    n.includes('الالتزامات والعقود') || n.includes('م.ا.ع') ||
    n.includes('مجلة الالتزامات') ||
    n.includes(' coc') || n.includes('(coc)') ||
    n.includes('code des obligations et des contrats')
  ) {
    return 'civil'
  }

  // Pénal
  if (
    n.includes('مجلة الإجراءات الجزائية') || n.includes('المجلة الجزائية') ||
    n.includes('مجلة الجزائية') ||
    n.includes('code pénal') || n.includes('code de procédures pénales')
  ) {
    return 'pénal'
  }

  // Travail
  if (n.includes('code du travail') || n.includes('مجلة الشغل')) {
    return 'travail'
  }

  // Famille
  if (n.includes('statuts personnels') || n.includes('أحوال شخصية') || n.includes('م.أ.ش')) {
    return 'famille'
  }

  // Commercial
  if (n.includes('code de commerce') || n.includes('مجلة التجارة')) {
    return 'commercial'
  }

  return undefined
}


async function rerankSources(
  sources: ChatSource[],
  query?: string,
  boostFactors?: Record<string, number>,
  branchOptions?: { forbiddenBranches?: string[]; allowedBranches?: string[]; routerConfidence?: number },
  stance?: LegalStance
): Promise<ChatSource[]> {
  if (sources.length === 0) return sources

  // Récupérer les boosts dynamiques si non fournis (avec fallback sur valeurs statiques)
  let boosts: Record<string, number>
  if (boostFactors) {
    boosts = boostFactors
  } else {
    try {
      boosts = (await getDynamicBoostFactors()).factors
    } catch (err) {
      log.warn('[RAG] Erreur getDynamicBoostFactors, utilisation valeurs statiques:', err)
      boosts = SOURCE_BOOST
    }
  }

  // 1. Appliquer boost par type (dynamique ou statique) + boost sémantique par domaine
  const domainBoost = query ? detectDomainBoost(query) : null
  let rankedSources: RankedSource[] = sources.map((s) => {
    const sourceType = getSourceType(s.metadata as Record<string, unknown>)
    let boost = boosts[sourceType] || boosts.autre || SOURCE_BOOST.autre || 1.0

    // Boost sémantique: si la query mentionne un domaine, booster les résultats correspondants
    if (domainBoost && s.documentName) {
      for (const { pattern, factor } of domainBoost) {
        if (s.documentName.includes(pattern)) {
          boost *= factor
          break
        }
      }
    }

    // Sprint 1 RAG Audit-Proof: pénalité douce pour branches hors-scope
    // ×0.4 uniforme : inférence titre ou branche DB explicite
    // Gate confiance : pas de pénalité si routeur peu confiant (<0.70)
    if (branchOptions?.forbiddenBranches && branchOptions.forbiddenBranches.length > 0) {
      const routerConfidence = branchOptions.routerConfidence ?? 1.0
      if (routerConfidence >= 0.70) {
        const explicitBranch = s.metadata?.branch as string | undefined
        const inferredBranch = explicitBranch ? undefined : inferBranchFromTitle(s.documentName || '')
        const branch = explicitBranch || inferredBranch
        if (branch && branch !== 'autre' && branchOptions.forbiddenBranches.includes(branch)) {
          boost *= 0.4
          log.info(`[RAG Branch] Pénalité 0.4× sur "${s.documentName}" (branch=${branch}, inferred=${!explicitBranch}, confidence=${routerConfidence.toFixed(2)})`)
        }
      }
    }

    // Boost hiérarchique (normes > jurisprudence > doctrine > modèles)
    const _meta = s.metadata as Record<string, unknown> | undefined
    boost *= getHierarchyBoost(_meta)

    // Boost temporel (récence) : +0% à +3% selon l'année du document (norme/jurisprudence uniquement)
    const _hierarchyClass = classifyHierarchyType(
      (_meta?.category as string | null) ?? null,
      normalizeHierarchyValue(_meta?.doc_type),
      normalizeHierarchyValue(
        (_meta?.document_type as string | undefined) ||
        (_meta?.documentType as string | undefined) ||
        (_meta?.doc_type as string | undefined)
      )
    )
    boost *= getTemporalRecencyBoost(_meta, _hierarchyClass)

    // Boost stance-aware : favoriser les types de documents pertinents à la posture
    // Fix 4 : fallback sur category si doc_type absent (évite boost nul silencieux)
    if (stance === 'defense' || stance === 'attack') {
      const CATEGORY_TO_DOCTYPE: Record<string, string> = {
        codes: 'TEXTES', legislation: 'TEXTES', lois: 'TEXTES',
        jurisprudence: 'JURIS', cassation: 'JURIS',
        procedure: 'PROC', modeles: 'TEMPLATES', doctrine: 'DOCTRINE',
      }
      const rawDocType = s.metadata?.doc_type as string | undefined
      const rawCategory = s.metadata?.category as string | undefined
      const docType = rawDocType ?? (rawCategory ? CATEGORY_TO_DOCTYPE[rawCategory] : undefined)

      if (stance === 'defense') {
        if (docType === 'JURIS') boost *= 1.3
        if (docType === 'PROC') boost *= 1.2
      } else {
        if (docType === 'TEXTES') boost *= 1.3
        if (docType === 'JURIS') boost *= 1.2
      }
    }

    // Malus OCR low-confidence : chunks issus d'OCR dégradé pénalisés 0.85×
    // Fix Feb 24, 2026 — flag stocké en metadata mais non utilisé dans le scoring
    if (_meta?.ocr_low_confidence === true) {
      boost *= 0.85
      log.info(`[RAG Rerank] Malus OCR 0.85× sur "${s.documentName}" (conf=${(_meta.ocr_page_confidence as number | undefined)?.toFixed(0) ?? '?'}%)`)
    }

    // Malus qualité faible document : sources avec quality_score bas pénalisées 0.5×
    // Le quality_score (0-100) est stocké dans metadata et reflète la fiabilité du contenu.
    // Seuil 40 = cohérent avec MIN_QUALITY_SCORE_FOR_INDEXING. Soft (×0.5) plutôt que hard exclusion.
    const qualityScore = _meta?.quality_score as number | undefined
    if (qualityScore !== undefined && qualityScore < 40) {
      boost *= 0.5
      log.info(`[RAG Rerank] Malus qualité 0.5× sur "${s.documentName}" (quality_score=${qualityScore})`)
    }

    // P4 fix Feb 25, 2026 : boost spécifique مجلة الالتزامات والعقود (COC)
    // Les articles COC en arabe classique ont une similarité sémantique intrinsèquement
    // basse (~0.15-0.20) vs doctrine (~0.55-0.65) à cause du style archaïque.
    // Boost 1.25× pour rééquilibrer sans dépasser le cap global 2.0×.
    const docName = s.documentName || ''
    const isCocArticle = (_meta?.category === 'codes' || _meta?.doc_type === 'TEXTES') &&
      (docName.includes('مجلة الالتزامات') || docName.includes('م.ا.ع') || docName.includes('COC'))
    if (isCocArticle) {
      boost *= 1.25
    }

    // Fix Feb 26 v6 : boost article exact — si la query mentionne "الفصل X" ou "article X",
    // booster les chunks contenant ce numéro d'article ×1.8.
    // Impact : ar_penal_02 — query "ماذا ينص الفصل 217" → chunk art.217 remonte au rang 1.
    const articleNumMatch = (query || '').match(/(?:الفصل|article|art\.?)\s+(\d+)/i)
    if (articleNumMatch) {
      const artNum = articleNumMatch[1]
      const chunkText = s.chunkContent || ''
      if (chunkText.includes(`الفصل ${artNum}`) || chunkText.toLowerCase().includes(`article ${artNum}`)) {
        boost *= 1.8
      }
    }

    // P0 fix Feb 24, 2026 : plafonner le boost cumulatif à 2.0×
    // Sans cap : domain(2.5×) × hierarchy(1.35×) × temporal × stance(1.3×) → ~5.5×
    // Un chunk médiocre avec tous les boosts peut dépasser un chunk très pertinent
    const cappedBoost = Math.min(boost, 2.0)

    return {
      ...s,
      boostedScore: s.similarity * cappedBoost,
      sourceType,
      sourceId: getSourceId(s),
    }
  })

  // 2. Appliquer cross-encoder re-ranking si activé et query fournie
  if (isRerankerEnabled() && query && rankedSources.length > 1) {
    try {
      const docsToRerank: DocumentToRerank[] = rankedSources.map((s) => ({
        content: s.chunkContent,
        originalScore: s.boostedScore,
        metadata: s.metadata as Record<string, unknown>,
      }))

      const rerankedResults = await rerankDocuments(query, docsToRerank, undefined, { useCrossEncoder: true })

      // Combiner scores cross-encoder avec boosts existants
      rankedSources = rerankedResults.map((result) => {
        const original = rankedSources[result.index]
        const finalScore = combineScores(result.score, original.boostedScore)
        return {
          ...original,
          boostedScore: finalScore,
        }
      })

      // Re-trier par score combiné
      rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
    } catch (error) {
      log.error('[RAG] Erreur cross-encoder, fallback boost simple:', error)
      // Continuer avec le tri par boost simple
      rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
    }
  } else {
    // Trier par score boosté décroissant
    rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
  }

  // 3. Appliquer diversité : limiter chunks par source
  const sourceCount = new Map<string, number>()
  const diversifiedSources: ChatSource[] = []

  for (const source of rankedSources) {
    const count = sourceCount.get(source.sourceId) || 0
    if (count < RAG_DIVERSITY.maxChunksPerSource) {
      sourceCount.set(source.sourceId, count + 1)
      // Retourner ChatSource sans les champs internes, mais exposer boostedSimilarity
      const { boostedScore, sourceType, sourceId, ...originalSource } = source
      diversifiedSources.push({ ...originalSource, boostedSimilarity: boostedScore })
    }
  }

  return diversifiedSources
}

/**
 * Compte les sources par type
 */
function countSourcesByType(sources: ChatSource[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const source of sources) {
    const type = getSourceType(source.metadata as Record<string, unknown>)
    counts[type] = (counts[type] || 0) + 1
  }
  return counts
}

/**
 * Log les métriques de recherche RAG
 */
function logSearchMetrics(metrics: SearchMetrics): void {
  log.info('[RAG Search]', JSON.stringify({
    totalFound: metrics.totalFound,
    aboveThreshold: metrics.aboveThreshold,
    scores: {
      min: metrics.scoreRange.min.toFixed(3),
      max: metrics.scoreRange.max.toFixed(3),
      avg: metrics.scoreRange.avg.toFixed(3),
    },
    sources: metrics.sourceDistribution,
    timeMs: metrics.searchTimeMs,
  }))
}

// =============================================================================
// QUALITY GATE ADAPTATIF (P3 fix Feb 24, 2026)
// =============================================================================

/**
 * Calcule un seuil de quality gate dynamique selon le contexte.
 * Remplace les seuils statiques (0.30/0.50) par une fonction adaptative.
 *
 * Axes d'ajustement :
 * - Langue : arabe (scores embedding plus bas) → seuil plus bas
 * - Complexité query : query courte → plus souple (chercher coûte que coûte)
 * - Nb sources : peu de sources → plus souple (éviter abstention injustifiée)
 * - Type résultat : vecteur réel vs BM25-only → seuil différent
 */
function computeAdaptiveQualityGate(
  lang: string,
  query: string,
  sourcesFound: number,
  hasVectorResults: boolean
): number {
  // IMPORTANT: ce seuil doit être STRICTEMENT INFÉRIEUR au seuil SQL (p_threshold=0.35 par défaut).
  // Si gate >= threshold SQL, les sources qui passent juste le SQL threshold seront toutes rejetées.
  // Comportement attendu (gate progressif Feb 23):
  //   - Abstention dure seulement si TOUTES les sources < 0.25 (FR) ou < 0.18 (AR)
  //   - Sources dans la zone 0.25-0.40 = acceptées (borderline mais utiles)
  //   - Sources ≥ 0.40 = normales
  let base = lang === 'ar'
    ? (hasVectorResults ? 0.18 : 0.22)  // AR: seuils bas (embeddings arabes scoring plus faible)
    : (hasVectorResults ? 0.25 : 0.30)  // FR: base 0.25 << seuil SQL 0.35 (marge de sécurité)

  // Ajustement selon complexité query (proxy : longueur en mots)
  const queryWords = query.trim().split(/\s+/).length
  if (queryWords <= 3) {
    // Query très courte (ex: "droits ?") → baisser le seuil
    base *= 0.85
  }
  // NB: Pas de hausse du gate selon nb de sources ni longueur query.
  //     Ces ajustements à la hausse causaient des abstentions injustifiées
  //     pour des sources légales avec scores 0.35-0.40 (Feb 24 regression).

  // Peu de résultats → assouplir légèrement
  if (sourcesFound <= 2) {
    base *= 0.90
  }

  // Borner entre valeurs raisonnables (jamais > 0.30 pour ne pas dépasser le SQL threshold)
  return Math.max(0.12, Math.min(base, 0.30))
}

// =============================================================================
// RECHERCHE CONTEXTUELLE
// =============================================================================

/**
 * Helper pour créer une promesse avec timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, context: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${context} (${ms}ms)`)), ms)
    ),
  ])
}

/**
 * Recherche les documents pertinents pour une question
 * Avec cache Redis pour les recherches répétées.
 *
 * @exported Pour tests unitaires
 */
export async function searchRelevantContext(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<SearchResult> {
  const startTime = Date.now()
  const {
    dossierId,
    maxContextChunks = aiConfig.rag.maxResults,
    includeJurisprudence = false,
    includeKnowledgeBase = true, // Activé par défaut
  } = options

  // Phase 1: Legal Router — remplace classifyQuery par routeQuery (classification + tracks en 1 appel)
  // Lancé en parallèle avec l'expansion/embedding pour recouvrir la latence
  const _earlyRouterPromise = includeKnowledgeBase
    ? import('./legal-router-service').then(m => m.routeQuery(question, { maxTracks: 4 }))
    : null

  // ✨ OPTIMISATION RAG - Sprint 2 (Feb 2026) + Fix requêtes longues (Feb 16, 2026)
  // 1. Query Expansion pour requêtes courtes / Condensation pour requêtes longues
  let embeddingQuestion = question // Question utilisée pour l'embedding
  if (ENABLE_QUERY_EXPANSION) {
    if (question.length < 50) {
      // Requêtes courtes : expansion LLM (ajouter termes juridiques)
      const { expandQuery } = await import('./query-expansion-service')
      try {
        embeddingQuestion = await expandQuery(question)
        if (embeddingQuestion !== question) {
          log.info(`[RAG Search] Query expandée: ${question} → ${embeddingQuestion.substring(0, 80)}...`)
        }
      } catch (error) {
        log.error('[RAG Search] Erreur expansion query:', error)
        embeddingQuestion = question
      }
    } else if (question.length > 200) {
      // Requêtes longues : condensation (extraire concepts clés pour embedding ciblé)
      const { condenseQuery } = await import('./query-expansion-service')
      try {
        // Timeout 5s : condenseQuery appelle un LLM → peut bloquer si lent
        embeddingQuestion = await withTimeout(condenseQuery(question), 5000, 'condenseQuery')
          .catch(() => question) // Fallback silencieux : question originale
        if (embeddingQuestion !== question) {
          log.info(`[RAG Search] Query condensée: ${question.length} chars → "${embeddingQuestion}" (${embeddingQuestion.length} chars)`)
        }
      } catch (error) {
        log.error('[RAG Search] Erreur condensation query:', error)
        embeddingQuestion = question
      }
    }
  }

  // 2. Enrichissement synonymes juridiques arabes (applicable à toutes les queries)
  // Lookup instantané O(n) - pas de LLM, pas de latence ajoutée
  try {
    const { enrichQueryWithLegalSynonyms } = await import('./query-expansion-service')
    const enriched = enrichQueryWithLegalSynonyms(embeddingQuestion)
    if (enriched !== embeddingQuestion) {
      log.info(`[RAG Search] Synonymes juridiques: ${embeddingQuestion.substring(0, 50)}... → +synonymes`)
      embeddingQuestion = enriched
    }
  } catch (error) {
    // Non-bloquant : si enrichissement échoue, on continue avec la query existante
  }

  // Enrichissement stance-aware : ajout de termes spécifiques à la posture juridique
  // Fix 2 : uniquement pour les requêtes arabes (évite pollution embedding FR)
  const stanceTerms: Record<string, string> = {
    defense: 'بطلان دفع رفض عدم قبول تقادم عدم الاختصاص',
    attack: 'مسؤولية تعويض إخلال التزام ضرر مطالبة',
  }
  if (options.stance && options.stance !== 'neutral' && stanceTerms[options.stance]) {
    const embeddingLang = detectLanguage(embeddingQuestion)
    if (embeddingLang === 'ar') {
      embeddingQuestion = `${embeddingQuestion} ${stanceTerms[options.stance]}`
    }
  }

  // Générer l'embedding de la question transformée (expandée ou condensée)
  const queryEmbedding = await generateEmbedding(embeddingQuestion, {
    operationName: options.operationName,
  })
  const embeddingStr = formatEmbeddingForPostgres(queryEmbedding.embedding)

  // Vérifier le cache de recherche
  const searchScope: SearchScope = { userId, dossierId }
  const cachedResults = await getCachedSearchResults(queryEmbedding.embedding, searchScope)
  if (cachedResults) {
    log.info(`[RAG Search] Cache HIT - ${cachedResults.length} sources (${Date.now() - startTime}ms)`)
    return { sources: cachedResults as ChatSource[], cacheHit: true }
  }

  const allSources: ChatSource[] = []

  // Recherche dans les documents du dossier ou de l'utilisateur
  // Skip si userId n'est pas un UUID valide (ex: 'eval-system' dans les benchmarks)
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
  let docSql: string
  let docParams: (string | number)[]

  if (!isValidUUID) {
    // Skip document_embeddings search for non-UUID userIds (eval, system, etc.)
    docSql = 'SELECT 1 WHERE false'
    docParams = []
  } else if (dossierId) {
    docSql = `
      SELECT
        de.document_id,
        d.nom as document_name,
        de.content_chunk,
        (1 - (de.embedding <=> $1::vector)) as similarity,
        de.metadata
      FROM document_embeddings de
      JOIN documents d ON de.document_id = d.id
      WHERE de.user_id = $2
        AND d.dossier_id = $3
        AND (1 - (de.embedding <=> $1::vector)) >= $4
      ORDER BY de.embedding <=> $1::vector
      LIMIT $5
    `
    docParams = [
      embeddingStr,
      userId,
      dossierId,
      RAG_THRESHOLDS.documents,
      maxContextChunks * 2, // Récupérer plus pour le re-ranking
    ]
  } else {
    docSql = `
      SELECT
        de.document_id,
        d.nom as document_name,
        de.content_chunk,
        (1 - (de.embedding <=> $1::vector)) as similarity,
        de.metadata
      FROM document_embeddings de
      JOIN documents d ON de.document_id = d.id
      WHERE de.user_id = $2
        AND (1 - (de.embedding <=> $1::vector)) >= $3
      ORDER BY de.embedding <=> $1::vector
      LIMIT $4
    `
    docParams = [
      embeddingStr,
      userId,
      RAG_THRESHOLDS.documents,
      maxContextChunks * 2, // Récupérer plus pour le re-ranking
    ]
  }

  const docResult = await db.query(docSql, docParams)

  for (const row of docResult.rows) {
    allSources.push({
      documentId: row.document_id,
      documentName: row.document_name,
      chunkContent: row.content_chunk,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
    })
  }

  // Optionnel: Recherche dans la jurisprudence
  if (includeJurisprudence) {
    const juriSql = `
      SELECT
        j.id as document_id,
        j.decision_number || ' - ' || j.court as document_name,
        COALESCE(j.summary, LEFT(j.full_text, 800)) as content_chunk,
        (1 - (j.embedding <=> $1::vector)) as similarity,
        jsonb_build_object(
          'type', 'jurisprudence',
          'court', j.court,
          'chamber', j.chamber,
          'domain', j.domain,
          'date', j.decision_date,
          'articles', j.articles_cited
        ) as metadata
      FROM jurisprudence j
      WHERE j.embedding IS NOT NULL
        AND (1 - (j.embedding <=> $1::vector)) >= $2
      ORDER BY j.embedding <=> $1::vector
      LIMIT $3
    `

    const juriResult = await db.query(juriSql, [
      embeddingStr,
      RAG_THRESHOLDS.jurisprudence,
      Math.ceil(maxContextChunks / 2), // Plus de jurisprudence pour le re-ranking
    ])

    for (const row of juriResult.rows) {
      allSources.push({
        documentId: row.document_id,
        documentName: row.document_name,
        chunkContent: row.content_chunk,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata,
      })
    }
  }

  // Détection langue pour seuils adaptatifs (arabe → scores plus bas)
  const queryLangForSearch = detectLanguage(question)

  // Résoudre le router une seule fois (hissé pour réutilisation par relevance gating + multi-track)
  // Si le routeur échoue (rate limit, timeout), on continue sans classification → recherche KB globale
  let routerResult: Awaited<ReturnType<typeof import('./legal-router-service').routeQuery>> | null = null
  if (includeKnowledgeBase) {
    try {
      routerResult = _earlyRouterPromise
        ? await _earlyRouterPromise
        : await (await import('./legal-router-service')).routeQuery(question, { maxTracks: 4 })
    } catch (routerError) {
      log.warn('[RAG Search] Router échoué, fallback recherche KB sans classification:', routerError instanceof Error ? routerError.message : routerError)
      // P2 fix Feb 24, 2026 : log structuré pour observabilité (détectable par monitoring)
      log.warn('[RAG Metrics] router_failed=true reason=' + (routerError instanceof Error ? routerError.message.substring(0, 80) : String(routerError)).replace(/\s+/g, '_'))
    }
  }
  const classification = routerResult?.classification || null

  // Recherche dans la base de connaissances partagée
  // Note: si classification est null (routeQuery échoué/rate limited), on fait quand même une recherche globale
  if (includeKnowledgeBase) {
    try {

      let kbResults: Array<{
        knowledgeBaseId: string
        title: string
        chunkContent: string
        similarity: number
        category: string
        metadata: Record<string, unknown>
      }> = []

      // Recherche globale hybride + multi-track si tracks disponibles
      const globalThreshold = queryLangForSearch === 'ar'
        ? Math.min(RAG_THRESHOLDS.knowledgeBase, 0.30)
        : RAG_THRESHOLDS.knowledgeBase

      // Phase 1: Multi-track retrieval si le router a généré plusieurs tracks ET classification disponible
      const tracks = routerResult?.tracks || []
      if (tracks.length > 1 && classification) {
        log.info(
          `[RAG Search] Multi-track: ${tracks.length} tracks, ${tracks.reduce((a, t) => a + t.searchQueries.length, 0)} queries (source: ${routerResult?.source}, confiance: ${(classification.confidence * 100).toFixed(1)}%)`
        )
        const { searchMultiTrack } = await import('./knowledge-base-service')
        // Fix Feb 26 v11: lancer en parallèle multi-track + recherche directe avec embeddingQuestion enrichie
        // Les queries multi-track sont générées par LLM (ex: "التقادم الجزائي") sans référence d'article
        // → la recherche directe garantit que les article-text matches (sim=1.05) sont dans le pool
        const [multiTrackResults, directResults] = await Promise.all([
          searchMultiTrack(tracks, {
            topKPerQuery: 5,
            threshold: globalThreshold,
            operationName: options.operationName,
            limit: maxContextChunks,
          }),
          searchKnowledgeBaseHybrid(embeddingQuestion, {
            limit: 5,
            threshold: globalThreshold,
            operationName: options.operationName,
          }),
        ])
        // Merge: dédupliquer par chunkId, garder meilleure similarité
        const mergedSeen = new Map<string, (typeof multiTrackResults)[0]>()
        for (const r of multiTrackResults) {
          const key = r.chunkId || `${r.knowledgeBaseId}:${r.chunkContent.substring(0, 50)}`
          mergedSeen.set(key, r)
        }
        for (const r of directResults) {
          const key = r.chunkId || `${r.knowledgeBaseId}:${r.chunkContent.substring(0, 50)}`
          if (!mergedSeen.has(key) || r.similarity > (mergedSeen.get(key)?.similarity ?? 0)) {
            mergedSeen.set(key, r)
          }
        }
        kbResults = Array.from(mergedSeen.values()).sort((a, b) => b.similarity - a.similarity)
      } else {
        // Fallback: recherche globale hybride classique (aussi utilisé si classification null)
        if (!classification) {
          log.warn('[RAG Search] Classification null (routeQuery échoué?), fallback recherche KB globale')
        } else {
          log.info(
            `[RAG Search] Recherche KB globale hybride (classifieur: ${classification.categories.join(', ')}, domaines: ${classification.domains.join(',') || 'aucun'}, confiance: ${(classification.confidence * 100).toFixed(1)}%, seuil: ${globalThreshold})`
          )
        }
        kbResults = await searchKnowledgeBaseHybrid(embeddingQuestion, {
          limit: maxContextChunks,
          threshold: globalThreshold,
          operationName: options.operationName,
          docType: options.docType,
        })
      }

      // Fix v16 (Feb 27): Recherche JURIS parallèle pour diversifier avec cassation.tn
      // Problème: codes-forced search cible uniquement category='codes' → jurisprudence absente
      // Solution: recherche supplémentaire docType=JURIS (297 chunks cassation.tn) avec seuil permissif
      // Résultat attendu: dossiers pénaux/civils complexes → ≥1 arrêt de cassation dans le pool
      if (kbResults.length > 0) { // Ne lancer que si la recherche principale a réussi
        try {
          const jurisResults = await searchKnowledgeBaseHybrid(embeddingQuestion, {
            docType: 'JURIS' as const,
            limit: 3,
            threshold: globalThreshold * 0.8, // Seuil 20% plus permissif pour la jurisprudence
            operationName: options.operationName,
          })
          if (jurisResults.length > 0) {
            // Dédup via knowledgeBaseId+contenu (kbResults n'a pas de chunkId dans son type inline)
            const seenKeys = new Set(kbResults.map(r => `${r.knowledgeBaseId}:${r.chunkContent.substring(0, 50)}`))
            const newJuris = jurisResults.filter(r => {
              const key = `${r.knowledgeBaseId}:${r.chunkContent.substring(0, 50)}`
              return !seenKeys.has(key)
            })
            if (newJuris.length > 0) {
              kbResults = [...kbResults, ...newJuris]
              log.info(`[RAG Search] +${newJuris.length} chunks JURIS (cassation.tn) ajoutés au pool`)
            }
          }
        } catch {
          // Non-bloquant: si JURIS search échoue, continuer avec kbResults existants
        }
      }

      // Filtrer les catégories exclues (post-retrieval)
      if (options.excludeCategories && options.excludeCategories.length > 0) {
        const before = kbResults.length
        kbResults = kbResults.filter(
          r => !options.excludeCategories!.includes(r.category as string)
        )
        const excluded = before - kbResults.length
        if (excluded > 0) {
          log.info(`[RAG Search] excludeCategories: ${excluded} chunks exclus (${options.excludeCategories.join(', ')})`)
        }
      }

      // Ajouter résultats KB aux sources
      for (const result of kbResults) {
        allSources.push({
          documentId: result.knowledgeBaseId,
          documentName: `[قاعدة المعرفة] ${result.title}`,
          chunkContent: result.chunkContent,
          similarity: result.similarity,
          metadata: {
            type: 'knowledge_base',
            category: result.category,
            ...result.metadata,
          },
        })
      }
    } catch (error) {
      // CRITIQUE: Ne PAS avaler silencieusement les erreurs KB
      // Si la KB search échoue, le chat retournera "pas de documents" → mauvaise UX
      const errMsg = error instanceof Error ? error.message : String(error)
      log.error('[RAG Search] ❌ ERREUR CRITIQUE recherche knowledge base:', errMsg)
      log.error('[RAG Search] Stack:', error instanceof Error ? error.stack : 'N/A')
      // Propager l'erreur pour déclencher le mode dégradé au lieu de retourner 0 sources
      throw error
    }
  }

  // Filtrer par seuil minimum absolu (plus bas pour l'arabe: embeddings produisent des scores plus faibles)
  const queryLangForThreshold = detectLanguage(question)
  const effectiveMinimum = queryLangForThreshold === 'ar'
    ? Math.min(RAG_THRESHOLDS.minimum, 0.30)
    : RAG_THRESHOLDS.minimum
  const aboveThreshold = allSources.filter(
    (s) => s.similarity >= effectiveMinimum
  )

  // Sprint 1 RAG Audit-Proof: branches issues du routeur pour pénaliser sources hors-domaine
  const branchOptions = routerResult
    ? {
        forbiddenBranches: routerResult.forbiddenBranches,
        allowedBranches: routerResult.allowedBranches,
        routerConfidence: routerResult.classification.confidence,
      }
    : undefined

  // Appliquer re-ranking avec boost dynamique, cross-encoder et diversité
  let rerankedSources = await rerankSources(aboveThreshold, question, undefined, branchOptions, options.stance)

  // Seuils adaptatifs: si moins de 3 résultats, baisser le seuil de 20% (une seule fois)
  // Plancher plus bas pour l'arabe (embeddings arabes produisent des scores plus faibles)
  const queryLang = detectLanguage(question)
  const ADAPTIVE_FLOOR = queryLang === 'ar' ? 0.35 : 0.45
  if (rerankedSources.length < 3 && allSources.length > rerankedSources.length) {
    const adaptiveThreshold = Math.max(RAG_THRESHOLDS.minimum * 0.8, ADAPTIVE_FLOOR)
    if (adaptiveThreshold < RAG_THRESHOLDS.minimum) {
      const adaptiveResults = allSources.filter(
        (s) => s.similarity >= adaptiveThreshold
      )
      if (adaptiveResults.length > rerankedSources.length) {
        log.info(`[RAG Search] Seuil adaptatif: ${rerankedSources.length} → ${adaptiveResults.length} résultats (seuil ${adaptiveThreshold.toFixed(2)}, plancher ${ADAPTIVE_FLOOR})`)
        rerankedSources = await rerankSources(adaptiveResults, question, undefined, branchOptions, options.stance)
      }
    }
  }

  // Phase 2: Relevance Gating — bloquer sources hors-domaine
  if (classification && classification.confidence >= 0.7 && classification.domains.length > 0) {
    try {
      const { gateSourceRelevance } = await import('./relevance-gate-service')
      const gating = await gateSourceRelevance(question, rerankedSources, classification)
      if (gating.blocked.length > 0) {
        log.info(`[RAG Gate] Bloqué ${gating.blocked.length} sources hors-domaine`)
        rerankedSources = gating.passed
      }
    } catch (error) {
      log.error('[RAG Gate] Erreur gating, skip:', error instanceof Error ? error.message : error)
    }
  }

  // FILTRAGE ABROGATIONS : Exclure documents abrogés/suspendus
  const filteredResult = await filterAbrogatedSources(rerankedSources, {
    enableFilter: true,
    warnOnModified: true,
    logExclusions: true,
  })

  // Si trop de sources filtrées, logger pour monitoring
  if (filteredResult.filteredCount > 0) {
    log.info(`[RAG Filter] ⚠️  ${filteredResult.filteredCount} source(s) filtrée(s) (abrogées/suspendues)`)
  }

  // Limiter au nombre demandé (sur sources valides filtrées)
  let finalSources = filteredResult.validSources.slice(0, maxContextChunks)

  // Hard quality gate adaptatif (P3 fix Feb 24, 2026)
  // Seuil dynamique f(langue, complexité_query, nb_sources_trouvées) remplace les seuils statiques
  // Logique : query courte + peu de sources = seuil plus bas (chercher coûte que coûte)
  //            query longue + plusieurs sources = seuil plus haut (exiger la pertinence)
  const hasVectorResults = finalSources.some(s => s.metadata?.searchType === 'vector' || s.metadata?.searchType === 'hybrid')
  const effectiveGate = computeAdaptiveQualityGate(queryLang, question, finalSources.length, hasVectorResults)
  const queryWords = question.trim().split(/\s+/).length
  log.info(`[RAG QGate] seuil adaptatif=${effectiveGate.toFixed(3)} lang=${queryLang} queryWords=${queryWords} sources=${finalSources.length} hasVector=${hasVectorResults}`)
  if (finalSources.length > 0 && finalSources.every(s => s.similarity < effectiveGate)) {
    const bestScore = Math.max(...finalSources.map(s => s.similarity))
    log.warn(`[RAG Search] ⚠️ Hard quality gate`, {
      effectiveGate,
      lang: queryLang,
      bestScore: bestScore.toFixed(3),
      sourcesCount: finalSources.length,
      condensationOccurred: embeddingQuestion !== question,
      embeddingQueryLength: embeddingQuestion.length,
      queryWords,
    })
    return { sources: [], cacheHit: false, reason: 'quality_gate', embeddingQuestion }
  }

  // Calculer et logger les métriques
  const scores = allSources.map((s) => s.similarity)
  const searchTimeMs = Date.now() - startTime

  if (scores.length > 0) {
    const metrics: SearchMetrics = {
      totalFound: allSources.length,
      aboveThreshold: aboveThreshold.length,
      scoreRange: {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      },
      sourceDistribution: countSourcesByType(finalSources),
      searchTimeMs,
    }
    logSearchMetrics(metrics)
  } else {
    log.info('[RAG Search]', JSON.stringify({
      totalFound: 0,
      aboveThreshold: 0,
      timeMs: searchTimeMs,
    }))
  }

  // Mettre en cache les résultats
  if (finalSources.length > 0) {
    await setCachedSearchResults(queryEmbedding.embedding, finalSources, searchScope)
  }

  return { sources: finalSources, cacheHit: false, embeddingQuestion }
}

/**
 * Recherche bilingue avec query expansion AR ↔ FR
 * Traduit la question et fusionne les résultats des deux langues.
 * Applique un timeout global pour éviter les latences excessives.
 */
export async function searchRelevantContextBilingual(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<SearchResult> {
  const startTime = Date.now()

  // Détecter la langue de la question
  const detectedLang = detectLanguage(question)
  log.info(`[RAG Bilingual] Langue détectée: ${detectedLang}`)

  // ========================================
  // PARALLÉLISATION Phase 2.1 : Recherche primaire + Traduction en parallèle
  // ========================================
  const targetLang = getOppositeLanguage(detectedLang)
  const canTranslate = ENABLE_QUERY_EXPANSION && isTranslationAvailable()

  // Lancer recherche primaire ET traduction en PARALLÈLE
  const [primaryResult, translationResult] = await Promise.allSettled([
    // Recherche primaire avec timeout global
    withTimeout(
      searchRelevantContext(question, userId, options),
      BILINGUAL_SEARCH_TIMEOUT_MS,
      'recherche primaire'
    ),

    // Traduction parallèle (ou reject si désactivé)
    canTranslate
      ? withTimeout(
          translateQuery(question, detectedLang === 'mixed' ? 'fr' : detectedLang, targetLang),
          5000, // 5s max pour traduction (augmenté de 3s pour éviter timeouts)
          'traduction'
        )
      : Promise.reject(new Error('Translation disabled')),
  ])

  // Vérifier résultat recherche primaire — fallback KB search simple si timeout
  if (primaryResult.status === 'rejected') {
    const errMsg = primaryResult.reason instanceof Error ? primaryResult.reason.message : String(primaryResult.reason)
    log.error('[RAG Bilingual] Erreur recherche primaire:', errMsg)

    // Fallback : recherche KB simple (sans router/expansion) pour éviter 0 résultats
    try {
      log.info('[RAG Bilingual] Fallback recherche KB simple...')
      const fallbackResults = await withTimeout(
        searchKnowledgeBaseHybrid(question, { limit: 10 }),
        15000,
        'fallback KB search'
      )
      if (fallbackResults.length > 0) {
        const fallbackSources: ChatSource[] = fallbackResults.slice(0, 5).map(r => ({
          documentId: r.knowledgeBaseId,
          documentName: r.title || 'Document',
          chunkContent: r.chunkContent,
          similarity: r.similarity || 0,
          metadata: r.metadata,
        }))
        log.info(`[RAG Bilingual] Fallback: ${fallbackSources.length} sources récupérées`)
        return { sources: fallbackSources, cacheHit: false }
      }
    } catch (fallbackErr) {
      log.error('[RAG Bilingual] Fallback KB search échoué:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
    }

    return { sources: [], cacheHit: false }
  }

  // Si traduction non disponible ou échouée, retourner résultats primaires seuls
  if (!canTranslate || translationResult.status === 'rejected') {
    log.info(
      `[RAG Bilingual] Traduction ${!canTranslate ? 'désactivée' : 'échouée'}, retour résultats primaires seuls`
    )
    return primaryResult.value
  }

  // Vérifier temps restant pour recherche secondaire
  const elapsed = Date.now() - startTime
  const remaining = BILINGUAL_SEARCH_TIMEOUT_MS - elapsed

  // Si moins de 15s restantes, ne pas lancer la recherche secondaire
  if (remaining < 15000) {
    log.info(
      `[RAG Bilingual] Temps restant insuffisant (${remaining}ms < 15s), skip recherche secondaire`
    )
    return primaryResult.value
  }

  // Vérifier validité traduction
  const translation = translationResult.value
  if (!translation.success || translation.translatedText === question) {
    log.info('[RAG Bilingual] Traduction identique ou invalide, retour résultats primaires')
    return primaryResult.value
  }

  log.info(`[RAG Bilingual] Question traduite: "${translation.translatedText.substring(0, 50)}..."`)

  // ========================================
  // Recherche secondaire avec timeout adaptatif
  // ========================================
  let secondaryResult: SearchResult = { sources: [], cacheHit: false }

  try {
    secondaryResult = await withTimeout(
      searchRelevantContext(translation.translatedText, userId, options),
      Math.max(15000, remaining), // Au moins 15s pour recherche secondaire
      'recherche secondaire'
    )
  } catch (error) {
    log.warn(
      '[RAG Bilingual] Timeout recherche secondaire, retour résultats primaires seuls:',
      error instanceof Error ? error.message : error
    )
    return primaryResult.value
  }

  // ========================================
  // Fusion résultats primaires + secondaires
  // ========================================
  const primarySources = primaryResult.value.sources
  const secondarySources = secondaryResult.sources

  // Poids: primaire 0.7, secondaire 0.3
  const PRIMARY_WEIGHT = 0.7
  const SECONDARY_WEIGHT = 0.3

  const mergedSources: ChatSource[] = []
  const seenChunks = new Set<string>()

  // Ajouter les sources primaires avec poids ajusté
  for (const source of primarySources) {
    const key = `${source.documentId}:${source.chunkContent.substring(0, 100)}`
    if (!seenChunks.has(key)) {
      seenChunks.add(key)
      mergedSources.push({
        ...source,
        similarity: source.similarity * PRIMARY_WEIGHT + (1 - source.similarity) * 0.1,
      })
    }
  }

  // Ajouter les sources secondaires avec poids ajusté
  for (const source of secondarySources) {
    const key = `${source.documentId}:${source.chunkContent.substring(0, 100)}`
    if (!seenChunks.has(key)) {
      seenChunks.add(key)
      mergedSources.push({
        ...source,
        similarity: source.similarity * SECONDARY_WEIGHT,
      })
    }
  }

  // Re-trier par similarité ajustée
  mergedSources.sort((a, b) => b.similarity - a.similarity)

  // Limiter au nombre demandé
  const maxResults = options.maxContextChunks || aiConfig.rag.maxResults
  const finalSources = mergedSources.slice(0, maxResults)

  const totalTimeMs = Date.now() - startTime
  log.info(
    `[RAG Bilingual PARALLEL] Fusion: ${primarySources.length} primaires + ${secondarySources.length} secondaires → ${finalSources.length} finaux (${totalTimeMs}ms, -${Math.round((1 - totalTimeMs / BILINGUAL_SEARCH_TIMEOUT_MS) * 100)}% vs timeout)`
  )

  // Cache hit si au moins une des deux recherches était en cache
  return {
    sources: finalSources,
    cacheHit: primaryResult.value.cacheHit || secondaryResult.cacheHit,
  }
}
