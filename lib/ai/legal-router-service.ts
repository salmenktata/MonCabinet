/**
 * Service Legal Router — Phase 1 RAG Pipeline v2
 *
 * Remplace classifyQuery() par un appel LLM unique qui fait :
 *   1. Classification (catégories, domaines, confiance)
 *   2. Génération de tracks juridiques ciblées (2-4 pistes × 2-3 queries)
 *
 * Feature flag : ENABLE_LEGAL_ROUTER=true
 * Cache : Redis `qrouter:{hash}` TTL 24h
 * Latence : ~300ms (Groq) — remplace classifyQuery (~300ms), donc +0ms net
 */

import { callLLMWithFallback } from './llm-fallback-service'
import type { QueryClassification, LegalTrack } from './query-classifier-service'
import { classifyQuery, classifyQueryKeywords } from './query-classifier-service'
import { getCategoriesForContext, type KnowledgeCategory } from '@/lib/categories/legal-categories'
import { ALL_DOC_TYPES, type DocumentType } from '@/lib/categories/doc-types'
import { getRedisClient } from '@/lib/cache/redis'
import { createHash } from 'crypto'

// =============================================================================
// TYPES
// =============================================================================

export interface RouterResult {
  /** Classification enrichie avec tracks */
  classification: QueryClassification
  /** Tracks juridiques ciblées */
  tracks: LegalTrack[]
  /** Source du routing (llm, heuristic, fallback) */
  source: 'llm' | 'heuristic' | 'fallback'
  /**
   * Branches juridiques autorisées pour cette query (Sprint 1 RAG Audit-Proof).
   * Si défini et non-vide, les sources d'autres branches reçoivent une pénalité ×0.05.
   * Exemple: question marchés_publics → ['marchés_publics', 'administratif', 'procédure']
   */
  allowedBranches?: string[]
  /**
   * Branches explicitement interdites pour cette query.
   * Sources avec ces branches sont pratiquement éliminées du ranking (×0.05).
   */
  forbiddenBranches?: string[]
}

// =============================================================================
// MAPPING DOMAINES → BRANCHES JURIDIQUES
// =============================================================================

const ALL_BRANCHES = [
  'administratif', 'civil', 'commercial', 'pénal', 'travail',
  'fiscal', 'procédure', 'marchés_publics', 'bancaire', 'immobilier', 'famille',
]

// Branches transversales (ne jamais exclure — applicables à tous les domaines)
const UNIVERSAL_BRANCHES = new Set(['procédure', 'autre'])

const DOMAIN_TO_BRANCHES: Array<{ keywords: string[]; branches: string[] }> = [
  {
    keywords: ['marchés publics', 'صفقات عمومية', 'صفقات', 'commande publique', 'appel d\'offres', 'مناقصة'],
    branches: ['marchés_publics', 'administratif'],
  },
  {
    keywords: ['travail', 'droit du travail', 'شغل', 'عمال', 'عمل', 'licenciement', 'إضراب', 'طرد تعسفي', 'عامل'],
    branches: ['travail'],
  },
  {
    keywords: ['pénal', 'droit pénal', 'جزائي', 'جنائي', 'عقوبات', 'جريمة', 'criminel', 'قضاء جزائي'],
    branches: ['pénal'],
  },
  {
    keywords: ['civil', 'droit civil', 'مدني', 'التزامات', 'عقود', 'مسؤولية مدنية', 'responsabilité civile'],
    branches: ['civil'],
  },
  {
    keywords: ['famille', 'droit de la famille', 'أحوال شخصية', 'statut personnel', 'طلاق', 'زواج', 'حضانة', 'نفقة', 'ميراث'],
    branches: ['famille'],
  },
  {
    keywords: ['commercial', 'droit commercial', 'تجاري', 'شركة', 'إفلاس', 'تفليس', 'شيك', 'كمبيالة'],
    branches: ['commercial'],
  },
  {
    keywords: ['fiscal', 'droit fiscal', 'ضريبي', 'جبائي', 'ضريبة', 'أداء', 'impôt', 'TVA', 'جباية'],
    branches: ['fiscal'],
  },
  {
    keywords: ['administratif', 'droit administratif', 'إداري', 'administration', 'المحكمة الإدارية'],
    branches: ['administratif'],
  },
  {
    keywords: ['bancaire', 'droit bancaire', 'بنك', 'مصرف', 'قرض', 'crédit', 'banque'],
    branches: ['bancaire'],
  },
  {
    keywords: ['immobilier', 'droit immobilier', 'عقار', 'عقارات', 'immobilier', 'عقد بيع'],
    branches: ['immobilier'],
  },
]

/**
 * Calcule les branches autorisées/interdites à partir des domaines classifiés.
 * Retourne {} si les domaines sont trop généraux (pas de restriction).
 */
export function computeBranchesFromDomains(domains: string[]): {
  allowedBranches: string[] | undefined
  forbiddenBranches: string[] | undefined
} {
  if (domains.length === 0) return { allowedBranches: undefined, forbiddenBranches: undefined }

  const allowed = new Set<string>()

  for (const domain of domains) {
    const domainLower = domain.toLowerCase()
    for (const entry of DOMAIN_TO_BRANCHES) {
      const match = entry.keywords.some(kw =>
        domainLower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(domainLower)
      )
      if (match) {
        entry.branches.forEach(b => allowed.add(b))
      }
    }
  }

  // Toujours inclure 'procédure' (transversal)
  allowed.add('procédure')

  if (allowed.size <= 1) {
    // Trop générique — pas de restriction
    return { allowedBranches: undefined, forbiddenBranches: undefined }
  }

  const forbidden = ALL_BRANCHES.filter(b => !allowed.has(b) && !UNIVERSAL_BRANCHES.has(b))

  return {
    allowedBranches: Array.from(allowed),
    forbiddenBranches: forbidden.length > 0 ? forbidden : undefined,
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const ENABLE_LEGAL_ROUTER = process.env.ENABLE_LEGAL_ROUTER !== 'false'
const ROUTER_CACHE_TTL = 86400 // 24h
const KB_CATEGORIES = getCategoriesForContext('knowledge_base').map(c => c.value).join(', ')
const DOC_TYPES = ALL_DOC_TYPES.join(', ')

// =============================================================================
// PROMPT
// =============================================================================

const ROUTER_PROMPT = `Tu es un expert juridique tunisien. Analyse cette question et génère un plan de recherche multi-pistes.

TÂCHES:
1. Classifie la question (catégories parmi: ${KB_CATEGORIES}, domaines, confiance 0-1)
2. Génère 2-4 PISTES juridiques distinctes. Chaque piste = un angle de recherche différent.
3. Pour chaque piste, génère 2-3 requêtes de recherche ciblées (mélange arabe + français)

RÈGLES:
- Chaque piste doit couvrir un aspect DIFFÉRENT (ex: texte de loi, jurisprudence, doctrine)
- Les requêtes doivent être COURTES (5-15 mots) et SPÉCIFIQUES
- Inclure des requêtes en arabe ET en français pour chaque piste
- Priorité 1.0 = piste principale, 0.5 = secondaire

FORMAT JSON STRICT:
{
  "categories": ["cat1", "cat2"],
  "docTypes": ["TEXTES", "JURIS"],
  "domains": ["domain1"],
  "confidence": 0.9,
  "reasoning": "explication courte",
  "tracks": [
    {
      "label": "label de la piste",
      "searchQueries": ["requête 1", "requête 2"],
      "targetDocTypes": ["TEXTES"],
      "priority": 1.0
    }
  ],
  "needsClarification": []
}

IMPORTANT: Réponds UNIQUEMENT en JSON valide.`

// =============================================================================
// ROUTING PRINCIPAL
// =============================================================================

/**
 * Route une question juridique vers des tracks de recherche ciblées.
 *
 * Un seul appel LLM Groq (~300ms) qui REMPLACE classifyQuery().
 * Fait classification + génération de tracks en un appel.
 *
 * @param query - Question juridique
 * @param options - maxTracks (défaut 4), maxQueriesPerTrack (défaut 3)
 * @returns RouterResult avec classification enrichie et tracks
 */
export async function routeQuery(
  query: string,
  options?: { maxTracks?: number; maxQueriesPerTrack?: number }
): Promise<RouterResult> {
  const maxTracks = options?.maxTracks || 4
  const maxQueriesPerTrack = options?.maxQueriesPerTrack || 3

  if (!ENABLE_LEGAL_ROUTER) {
    // Feature flag off → fallback sur classifyQuery classique
    const classification = await classifyQuery(query)
    return {
      classification,
      tracks: routeQueryFromClassification(classification, query),
      source: 'fallback',
    }
  }

  // Validation input
  if (!query || query.trim().length < 5) {
    return {
      classification: { categories: [], domains: [], confidence: 0 },
      tracks: [],
      source: 'fallback',
    }
  }

  // Cache Redis
  const queryHash = createHash('md5').update(query.trim().toLowerCase()).digest('hex')
  const cacheKey = `qrouter:${queryHash}`
  const redis = await getRedisClient()
  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached as string) as RouterResult
        console.log('[Legal Router] Cache hit:', { query: query.substring(0, 50) })
        return parsed
      }
    } catch { /* cache miss */ }
  }

  try {
    const response = await callLLMWithFallback(
      [{ role: 'user', content: `${ROUTER_PROMPT}\n\nQuestion: ${query}\n\nRéponse (JSON uniquement):` }],
      {
        temperature: 0.1,
        maxTokens: 600,
        operationName: 'assistant-ia', // Groq ultra-rapide
      }
    )

    const cleanedAnswer = response.answer
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')

    const parsed = JSON.parse(cleanedAnswer)

    // Construire classification
    const classification: QueryClassification = {
      categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 3) : [],
      docTypes: Array.isArray(parsed.docTypes) ? parsed.docTypes : undefined,
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || '',
      needsClarification: Array.isArray(parsed.needsClarification) ? parsed.needsClarification : undefined,
    }

    // Construire tracks
    const tracks: LegalTrack[] = Array.isArray(parsed.tracks)
      ? parsed.tracks.slice(0, maxTracks).map((t: Record<string, unknown>) => ({
          label: String(t.label || ''),
          searchQueries: Array.isArray(t.searchQueries) ? (t.searchQueries as string[]).slice(0, maxQueriesPerTrack) : [],
          targetDocTypes: Array.isArray(t.targetDocTypes) ? t.targetDocTypes as DocumentType[] : undefined,
          priority: typeof t.priority === 'number' ? t.priority : 0.5,
        }))
      : []

    // Garantir que la query originale est présente dans au moins un track.
    // Le LLM génère des queries courtes/arabes qui peuvent avoir moins d'affinité
    // embedding avec les gold chunks que la query originale elle-même.
    const queryAlreadyPresent = tracks.some(t => t.searchQueries.includes(query))
    if (!queryAlreadyPresent) {
      if (tracks.length > 0) {
        // Ajouter en tête du track prioritaire (highest priority)
        const topTrack = tracks.reduce((a, b) => (b.priority > a.priority ? b : a))
        topTrack.searchQueries.unshift(query)
      } else {
        tracks.push({ label: 'Recherche directe', searchQueries: [query], priority: 1.0 })
      }
    }

    // Attacher tracks à la classification
    classification.legalTracks = tracks

    // Sprint 1 RAG Audit-Proof : calculer branches depuis domaines classifiés
    const { allowedBranches, forbiddenBranches } = computeBranchesFromDomains(classification.domains)

    const result: RouterResult = {
      classification,
      tracks,
      source: 'llm',
      allowedBranches,
      forbiddenBranches,
    }

    console.log('[Legal Router] Routing:', {
      query: query.substring(0, 50),
      domains: classification.domains,
      tracksCount: tracks.length,
      confidence: classification.confidence,
      allowedBranches: allowedBranches || 'unrestricted',
      forbiddenBranches: forbiddenBranches || 'none',
    })

    // Cache Redis
    if (redis) {
      redis.set(cacheKey, JSON.stringify(result), { EX: ROUTER_CACHE_TTL }).catch(() => {})
    }

    return result
  } catch (error) {
    console.error('[Legal Router] Erreur LLM, fallback heuristique:', error instanceof Error ? error.message : error)

    // Fallback heuristique
    const classification = classifyQueryKeywords(query)
    const { allowedBranches, forbiddenBranches } = computeBranchesFromDomains(classification.domains)
    return {
      classification,
      tracks: routeQueryFromClassification(classification, query),
      source: 'heuristic',
      allowedBranches,
      forbiddenBranches,
    }
  }
}

// =============================================================================
// FALLBACK HEURISTIQUE
// =============================================================================

/**
 * Convertit une classification existante en tracks de recherche.
 * Utilisé comme fallback si le LLM router échoue.
 */
export function routeQueryFromClassification(
  classification: QueryClassification,
  query: string
): LegalTrack[] {
  const tracks: LegalTrack[] = []

  // Track 1 : Recherche directe avec la query originale
  tracks.push({
    label: 'Recherche directe',
    searchQueries: [query],
    priority: 1.0,
  })

  // Track 2 : Par domaines classifiés (si disponibles)
  if (classification.domains.length > 0) {
    const domainQueries = classification.domains.slice(0, 2).map(d => `${query} ${d}`)
    tracks.push({
      label: `Domaines: ${classification.domains.join(', ')}`,
      searchQueries: domainQueries,
      targetDocTypes: classification.docTypes,
      priority: 0.8,
    })
  }

  // Track 3 : Codes et textes de loi (si pertinent)
  if (classification.categories.includes('codes') || classification.categories.includes('legislation')) {
    tracks.push({
      label: 'Textes législatifs',
      searchQueries: [query],
      targetDocTypes: ['TEXTES'],
      priority: 0.7,
    })
  }

  return tracks.slice(0, 4)
}
