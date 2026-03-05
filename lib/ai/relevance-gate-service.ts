/**
 * Service de Relevance Gating — Phase 2 RAG Pipeline v2
 *
 * Empêche les chunks hors-domaine de polluer le contexte LLM.
 * Two-tier gating :
 *   Tier 1 — Lexical (0ms) : Vérification par termes de domaine
 *   Tier 2 — LLM Judge (optionnel, ~300ms) : Pour cas borderline
 *
 * Feature flags :
 *   ENABLE_RELEVANCE_GATING=true  — Active le gating lexical
 *   ENABLE_LLM_RELEVANCE_JUDGE=false — Active le juge LLM (off par défaut)
 */

import type { ChatSource } from './rag-chat-service'
import type { QueryClassification } from './query-classifier-service'

// =============================================================================
// TYPES
// =============================================================================

export interface GatingResult {
  passed: ChatSource[]
  blocked: ChatSource[]
  blockReasons: Map<string, string>
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const ENABLE_RELEVANCE_GATING = process.env.ENABLE_RELEVANCE_GATING !== 'false'
const ENABLE_LLM_RELEVANCE_JUDGE = process.env.ENABLE_LLM_RELEVANCE_JUDGE === 'true'

/**
 * Termes positifs par domaine — un chunk doit contenir au moins un terme
 * pour être considéré "du domaine" quand la classification est haute confiance.
 */
const DOMAIN_POSITIVE_TERMS: Record<string, string[]> = {
  penal: [
    'جزائي', 'جزائية', 'جنائي', 'عقوبة', 'عقوبات', 'جريمة', 'المجلة الجزائية',
    'القتل', 'السرقة', 'الدفاع الشرعي', 'الرشوة', 'التزوير', 'النصب', 'احتيال',
    'خيانة الأمانة', 'اختلاس', 'تدليس', 'التحرش', 'هتك عرض', 'pénal', 'criminel',
    'الحبس', 'السجن', 'الإيداع', 'الإيقاف التحفظي',
  ],
  civil: [
    'مدني', 'التزامات', 'عقود', 'تعويض', 'مسؤولية مدنية', 'تقادم',
    'مجلة الالتزامات والعقود', 'العقد', 'الفسخ', 'الضمان', 'الملكية', 'الحيازة',
    'الرهن', 'الكفالة', 'الوكالة', 'civil', 'responsabilité', 'contrat',
  ],
  commercial: [
    'تجاري', 'تجارية', 'المجلة التجارية', 'شيك', 'إفلاس', 'تفليس', 'كمبيالة',
    'شركة', 'شركات', 'commercial', 'chèque', 'faillite', 'société',
  ],
  famille: [
    'أحوال شخصية', 'مجلة الأحوال الشخصية', 'طلاق', 'زواج', 'نفقة', 'حضانة',
    'ميراث', 'وصية', 'نسب', 'divorce', 'mariage', 'garde', 'famille', 'succession',
  ],
  travail: [
    'شغل', 'عمل', 'مجلة الشغل', 'طرد تعسفي', 'إضراب', 'أجر', 'أجير', 'مؤجر',
    'travail', 'licenciement', 'grève', 'salaire',
  ],
  immobilier: [
    'عقاري', 'عقار', 'immobilier', 'ملكية عقارية', 'تسجيل عقاري', 'رسم عقاري',
  ],
  fiscal: [
    'ضرائب', 'ضريبة', 'جبائي', 'fiscal', 'impôt', 'TVA',
    'ديوانة', 'جمارك', 'douane', 'معلوم ديواني',
  ],
  administratif: [
    'إداري', 'administratif', 'صفقات عمومية', 'marchés publics', 'المحكمة الإدارية',
    // Fix: termes constitutionnels (constitution classée sous domaine 'administratif')
    'دستور', 'دستوري', 'دستورية', 'constitution', 'constitutionnel', 'constitutionnelle',
    'حقوق أساسية', 'droits fondamentaux', 'حقوق وحريات', 'الباب الأول',
  ],
}

/**
 * Termes négatifs par domaine — si un chunk contient ces termes ET ne contient
 * aucun terme positif du domaine classifié, il est bloqué.
 */
const DOMAIN_NEGATIVE_TERMS: Record<string, string[]> = {
  penal: ['douane', 'جمرك', 'إحالة دين', 'cession créance', 'كراء', 'bail'],
  civil: ['جزائي', 'عقوبة', 'جنائي', 'pénal'],
  commercial: ['أحوال شخصية', 'طلاق', 'حضانة', 'famille'],
  famille: ['تجاري', 'المجلة التجارية', 'شيك', 'commercial'],
  travail: ['ميراث', 'طلاق', 'succession', 'divorce'],
}

// =============================================================================
// GATING PRINCIPAL
// =============================================================================

/**
 * Filtre les sources par pertinence domaine.
 *
 * @param query - Question utilisateur
 * @param sources - Sources candidates (post-reranking)
 * @param classification - Classification de la query
 * @param options - Options de strictness
 * @returns Sources filtrées avec raisons de blocage
 */
export async function gateSourceRelevance(
  query: string,
  sources: ChatSource[],
  classification: QueryClassification,
  options?: { strictness?: 'strict' | 'moderate' | 'lenient' }
): Promise<GatingResult> {
  if (!ENABLE_RELEVANCE_GATING || sources.length === 0) {
    return { passed: sources, blocked: [], blockReasons: new Map() }
  }

  const strictness = options?.strictness || 'moderate'
  const domains = classification.domains || []

  // Si pas de domaine classifié ou confiance basse → pas de gating
  if (domains.length === 0 || classification.confidence < 0.7) {
    return { passed: sources, blocked: [], blockReasons: new Map() }
  }

  const passed: ChatSource[] = []
  const blocked: ChatSource[] = []
  const blockReasons = new Map<string, string>()

  for (const source of sources) {
    const content = `${source.documentName} ${source.chunkContent}`.toLowerCase()

    // Tier 1: Lexical gating
    const tier1Result = checkLexicalRelevance(content, domains, strictness)

    if (tier1Result.blocked) {
      blocked.push(source)
      blockReasons.set(source.documentId, tier1Result.reason)
    } else {
      passed.push(source)
    }
  }

  // Tier 2: LLM Judge pour cas borderline (optionnel, off par défaut)
  // Non implémenté dans cette phase — feature-flaggé ENABLE_LLM_RELEVANCE_JUDGE
  if (ENABLE_LLM_RELEVANCE_JUDGE && blocked.length > 0) {
    // TODO: Implémentation LLM judge pour Phase 2 Tier 2
    console.log(`[Relevance Gate] LLM judge désactivé, ${blocked.length} sources bloquées par lexical`)
  }

  // Sécurité : ne jamais bloquer TOUTES les sources (garder au moins le top résultat)
  if (passed.length === 0 && sources.length > 0) {
    const restored = blocked.shift()
    if (restored) {
      passed.push(restored)
      blockReasons.delete(restored.documentId)
      console.log(`[Relevance Gate] Sécurité: restauré 1 source pour éviter contexte vide`)
    }
  }

  if (blocked.length > 0) {
    console.log(`[Relevance Gate] Bloqué ${blocked.length}/${sources.length} sources hors-domaine (domaines: ${domains.join(',')}, strictness: ${strictness})`)
  }

  return { passed, blocked, blockReasons }
}

// =============================================================================
// TIER 1 : LEXICAL GATING
// =============================================================================

interface LexicalResult {
  blocked: boolean
  reason: string
}

/**
 * Vérifie la pertinence lexicale d'un chunk par rapport aux domaines classifiés.
 *
 * Logique :
 * 1. Si le chunk contient au moins un terme positif d'un domaine classifié → PASS
 * 2. Si le chunk contient des termes négatifs (domaine différent) sans aucun positif → BLOCK
 * 3. Sinon → PASS (bénéfice du doute)
 */
function checkLexicalRelevance(
  content: string,
  classifiedDomains: string[],
  strictness: 'strict' | 'moderate' | 'lenient'
): LexicalResult {
  // Vérifier si le chunk contient des termes positifs des domaines classifiés
  let hasPositiveMatch = false
  for (const domain of classifiedDomains) {
    const positiveTerms = DOMAIN_POSITIVE_TERMS[domain]
    if (!positiveTerms) continue

    if (positiveTerms.some(term => content.includes(term.toLowerCase()))) {
      hasPositiveMatch = true
      break
    }
  }

  // Si match positif trouvé → toujours passer
  if (hasPositiveMatch) {
    return { blocked: false, reason: '' }
  }

  // Vérifier termes négatifs (indices d'un AUTRE domaine)
  let hasNegativeMatch = false
  let negativeDomain = ''
  for (const domain of classifiedDomains) {
    const negativeTerms = DOMAIN_NEGATIVE_TERMS[domain]
    if (!negativeTerms) continue

    const matchedNeg = negativeTerms.find(term => content.includes(term.toLowerCase()))
    if (matchedNeg) {
      hasNegativeMatch = true
      negativeDomain = matchedNeg
      break
    }
  }

  // Mode strict : bloquer si aucun positif ET des négatifs
  // Mode moderate : bloquer seulement si négatifs présents
  // Mode lenient : ne bloquer que si clairement hors-domaine (négatifs + aucun positif)
  if (hasNegativeMatch && !hasPositiveMatch) {
    if (strictness === 'lenient') {
      // En mode lenient, on laisse passer — log seulement
      return { blocked: false, reason: '' }
    }
    return {
      blocked: true,
      reason: `Terme hors-domaine détecté: "${negativeDomain}" sans terme positif du domaine classifié`,
    }
  }

  // Pas de match positif ni négatif → bénéfice du doute
  return { blocked: false, reason: '' }
}
