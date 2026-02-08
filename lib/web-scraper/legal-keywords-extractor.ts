/**
 * Extracteur de mots-clés juridiques sans LLM
 *
 * Utilise un dictionnaire bilingue arabe/français pour identifier
 * les concepts juridiques clés dans le contenu
 */

// =============================================================================
// TYPES
// =============================================================================

export interface KeywordMatch {
  keyword: string           // Mot-clé original (AR ou FR)
  translation: string       // Traduction FR si AR, AR si FR
  domain: string | null     // Domaine juridique suggéré
  type: KeywordType         // Type de concept
  occurrences: number       // Nombre d'occurrences
  positions: number[]       // Positions dans le texte
}

export type KeywordType =
  | 'concept'      // Concept juridique (contrat, obligation)
  | 'document'     // Type de document (arrêt, loi)
  | 'infraction'   // Type d'infraction (délit, crime)
  | 'procedure'    // Terme de procédure (appel, cassation)
  | 'institution'  // Institution (tribunal, cour)
  | 'structure'    // Structure de code (article, chapitre)

interface KeywordDefinition {
  ar: string
  fr: string
  domain: string | null
  type: KeywordType
  weight: number  // Poids pour scoring (1-10)
}

// =============================================================================
// DICTIONNAIRE JURIDIQUE TUNISIEN
// =============================================================================

const LEGAL_KEYWORDS: KeywordDefinition[] = [
  // ===== DROIT CIVIL =====
  { ar: 'عقد', fr: 'contrat', domain: 'civil', type: 'concept', weight: 8 },
  { ar: 'التزام', fr: 'obligation', domain: 'civil', type: 'concept', weight: 8 },
  { ar: 'التزامات', fr: 'obligations', domain: 'civil', type: 'concept', weight: 8 },
  { ar: 'مسؤولية', fr: 'responsabilité', domain: 'civil', type: 'concept', weight: 7 },
  { ar: 'ضرر', fr: 'dommage', domain: 'civil', type: 'concept', weight: 7 },
  { ar: 'تعويض', fr: 'indemnisation', domain: 'civil', type: 'concept', weight: 7 },
  { ar: 'بيع', fr: 'vente', domain: 'civil', type: 'concept', weight: 6 },
  { ar: 'كراء', fr: 'location', domain: 'civil', type: 'concept', weight: 6 },
  { ar: 'رهن', fr: 'hypothèque', domain: 'immobilier', type: 'concept', weight: 6 },
  { ar: 'ملكية', fr: 'propriété', domain: 'civil', type: 'concept', weight: 6 },

  // ===== DROIT PÉNAL =====
  { ar: 'جنحة', fr: 'délit', domain: 'penal', type: 'infraction', weight: 9 },
  { ar: 'جناية', fr: 'crime', domain: 'penal', type: 'infraction', weight: 9 },
  { ar: 'مخالفة', fr: 'contravention', domain: 'penal', type: 'infraction', weight: 7 },
  { ar: 'عقوبة', fr: 'peine', domain: 'penal', type: 'concept', weight: 8 },
  { ar: 'سجن', fr: 'emprisonnement', domain: 'penal', type: 'concept', weight: 7 },
  { ar: 'خطية', fr: 'amende', domain: 'penal', type: 'concept', weight: 6 },
  { ar: 'قصد جرمي', fr: 'intention criminelle', domain: 'penal', type: 'concept', weight: 8 },

  // ===== DROIT COMMERCIAL =====
  { ar: 'تاجر', fr: 'commerçant', domain: 'commercial', type: 'concept', weight: 8 },
  { ar: 'شركة', fr: 'société', domain: 'commercial', type: 'concept', weight: 8 },
  { ar: 'تجارة', fr: 'commerce', domain: 'commercial', type: 'concept', weight: 7 },
  { ar: 'إفلاس', fr: 'faillite', domain: 'commercial', type: 'concept', weight: 7 },
  { ar: 'سند لأمر', fr: 'billet à ordre', domain: 'commercial', type: 'concept', weight: 6 },
  { ar: 'شيك', fr: 'chèque', domain: 'commercial', type: 'concept', weight: 6 },

  // ===== DROIT DE LA FAMILLE =====
  { ar: 'زواج', fr: 'mariage', domain: 'famille', type: 'concept', weight: 9 },
  { ar: 'طلاق', fr: 'divorce', domain: 'famille', type: 'concept', weight: 9 },
  { ar: 'نفقة', fr: 'pension alimentaire', domain: 'famille', type: 'concept', weight: 8 },
  { ar: 'حضانة', fr: 'garde', domain: 'famille', type: 'concept', weight: 8 },
  { ar: 'ميراث', fr: 'héritage', domain: 'famille', type: 'concept', weight: 8 },
  { ar: 'وصية', fr: 'testament', domain: 'famille', type: 'concept', weight: 7 },

  // ===== DROIT DU TRAVAIL =====
  { ar: 'أجير', fr: 'salarié', domain: 'social', type: 'concept', weight: 8 },
  { ar: 'مؤجر', fr: 'employeur', domain: 'social', type: 'concept', weight: 8 },
  { ar: 'أجر', fr: 'salaire', domain: 'social', type: 'concept', weight: 7 },
  { ar: 'إضراب', fr: 'grève', domain: 'social', type: 'concept', weight: 7 },
  { ar: 'فصل تعسفي', fr: 'licenciement abusif', domain: 'social', type: 'concept', weight: 8 },

  // ===== PROCÉDURE =====
  { ar: 'قرار', fr: 'arrêt', domain: null, type: 'document', weight: 9 },
  { ar: 'حكم', fr: 'jugement', domain: null, type: 'document', weight: 9 },
  { ar: 'أمر', fr: 'ordonnance', domain: null, type: 'document', weight: 7 },
  { ar: 'استئناف', fr: 'appel', domain: null, type: 'procedure', weight: 8 },
  { ar: 'تعقيب', fr: 'cassation', domain: null, type: 'procedure', weight: 8 },
  { ar: 'دعوى', fr: 'action', domain: null, type: 'procedure', weight: 7 },
  { ar: 'مدعي', fr: 'demandeur', domain: null, type: 'procedure', weight: 6 },
  { ar: 'مدعى عليه', fr: 'défendeur', domain: null, type: 'procedure', weight: 6 },

  // ===== INSTITUTIONS =====
  { ar: 'محكمة', fr: 'tribunal', domain: null, type: 'institution', weight: 9 },
  { ar: 'محكمة التعقيب', fr: 'Cour de Cassation', domain: null, type: 'institution', weight: 10 },
  { ar: 'محكمة الاستئناف', fr: "Cour d'Appel", domain: null, type: 'institution', weight: 9 },
  { ar: 'محكمة ابتدائية', fr: 'Tribunal de Première Instance', domain: null, type: 'institution', weight: 8 },

  // ===== STRUCTURE DE CODE =====
  { ar: 'مجلة', fr: 'code', domain: null, type: 'structure', weight: 9 },
  { ar: 'فصل', fr: 'article', domain: null, type: 'structure', weight: 7 },
  { ar: 'باب', fr: 'titre', domain: null, type: 'structure', weight: 5 },
  { ar: 'قسم', fr: 'section', domain: null, type: 'structure', weight: 5 },

  // ===== DROIT IMMOBILIER =====
  { ar: 'عقار', fr: 'immeuble', domain: 'immobilier', type: 'concept', weight: 8 },
  { ar: 'تسجيل عقاري', fr: 'immatriculation foncière', domain: 'immobilier', type: 'concept', weight: 8 },
  { ar: 'رسم عقاري', fr: 'titre foncier', domain: 'immobilier', type: 'concept', weight: 8 },
  { ar: 'إدارة الملكية العقارية', fr: 'Conservation de la Propriété Foncière', domain: 'immobilier', type: 'institution', weight: 7 },
  { ar: 'حق ارتفاق', fr: 'servitude', domain: 'immobilier', type: 'concept', weight: 6 },
  { ar: 'شفعة', fr: 'droit de préemption', domain: 'immobilier', type: 'concept', weight: 7 },
  { ar: 'حق انتفاع', fr: 'usufruit', domain: 'immobilier', type: 'concept', weight: 6 },
  { ar: 'قسمة', fr: 'partage', domain: 'immobilier', type: 'concept', weight: 6 },
  { ar: 'ترسيم', fr: 'inscription', domain: 'immobilier', type: 'procedure', weight: 6 },
  { ar: 'حيازة', fr: 'possession', domain: 'immobilier', type: 'concept', weight: 6 },

  // ===== DROIT FISCAL =====
  { ar: 'ضريبة', fr: 'impôt', domain: 'fiscal', type: 'concept', weight: 9 },
  { ar: 'ضريبة على الدخل', fr: 'impôt sur le revenu', domain: 'fiscal', type: 'concept', weight: 8 },
  { ar: 'ضريبة على الشركات', fr: 'impôt sur les sociétés', domain: 'fiscal', type: 'concept', weight: 8 },
  { ar: 'أداء على القيمة المضافة', fr: 'TVA', domain: 'fiscal', type: 'concept', weight: 8 },
  { ar: 'معلوم', fr: 'taxe', domain: 'fiscal', type: 'concept', weight: 7 },
  { ar: 'تصريح جبائي', fr: 'déclaration fiscale', domain: 'fiscal', type: 'procedure', weight: 7 },
  { ar: 'مراقبة جبائية', fr: 'contrôle fiscal', domain: 'fiscal', type: 'procedure', weight: 7 },
  { ar: 'توظيف إجباري', fr: 'taxation d\'office', domain: 'fiscal', type: 'procedure', weight: 7 },
  { ar: 'إعفاء جبائي', fr: 'exonération fiscale', domain: 'fiscal', type: 'concept', weight: 7 },
  { ar: 'تهرب ضريبي', fr: 'fraude fiscale', domain: 'fiscal', type: 'infraction', weight: 8 },

  // ===== DROIT NUMÉRIQUE / PROTECTION DES DONNÉES =====
  { ar: 'حماية المعطيات الشخصية', fr: 'protection des données personnelles', domain: 'autre', type: 'concept', weight: 8 },
  { ar: 'معطيات شخصية', fr: 'données personnelles', domain: 'autre', type: 'concept', weight: 7 },
  { ar: 'تجارة إلكترونية', fr: 'commerce électronique', domain: 'commercial', type: 'concept', weight: 7 },
  { ar: 'إمضاء إلكتروني', fr: 'signature électronique', domain: 'autre', type: 'concept', weight: 7 },
  { ar: 'جريمة معلوماتية', fr: 'cybercriminalité', domain: 'penal', type: 'infraction', weight: 8 },
  { ar: 'إساءة استعمال الأنظمة المعلوماتية', fr: 'abus des systèmes informatiques', domain: 'penal', type: 'infraction', weight: 7 },

  // ===== DROIT BANCAIRE =====
  { ar: 'بنك', fr: 'banque', domain: 'bancaire', type: 'institution', weight: 7 },
  { ar: 'قرض', fr: 'crédit', domain: 'bancaire', type: 'concept', weight: 7 },
  { ar: 'ضمان', fr: 'garantie', domain: 'bancaire', type: 'concept', weight: 7 },
  { ar: 'كفالة', fr: 'cautionnement', domain: 'bancaire', type: 'concept', weight: 7 },
  { ar: 'فائدة', fr: 'intérêt', domain: 'bancaire', type: 'concept', weight: 6 },
  { ar: 'حساب بنكي', fr: 'compte bancaire', domain: 'bancaire', type: 'concept', weight: 6 },

  // ===== DROIT ADMINISTRATIF =====
  { ar: 'تجاوز السلطة', fr: 'excès de pouvoir', domain: 'administratif', type: 'concept', weight: 8 },
  { ar: 'قرار إداري', fr: 'décision administrative', domain: 'administratif', type: 'document', weight: 8 },
  { ar: 'مرفق عام', fr: 'service public', domain: 'administratif', type: 'concept', weight: 7 },
  { ar: 'صفقة عمومية', fr: 'marché public', domain: 'administratif', type: 'concept', weight: 7 },
  { ar: 'ترخيص', fr: 'autorisation', domain: 'administratif', type: 'procedure', weight: 6 },

  // ===== DROIT DE LA FAMILLE (compléments) =====
  { ar: 'تبني', fr: 'adoption', domain: 'famille', type: 'concept', weight: 7 },
  { ar: 'كفالة', fr: 'kafala', domain: 'famille', type: 'concept', weight: 7 },
  { ar: 'نسب', fr: 'filiation', domain: 'famille', type: 'concept', weight: 7 },
  { ar: 'ولاية', fr: 'tutelle', domain: 'famille', type: 'concept', weight: 7 },
  { ar: 'تقسيم أملاك', fr: 'liquidation du régime', domain: 'famille', type: 'concept', weight: 6 },
]

// Index inversé pour recherche rapide
const KEYWORD_INDEX = new Map<string, KeywordDefinition>()
LEGAL_KEYWORDS.forEach(kw => {
  KEYWORD_INDEX.set(kw.ar.toLowerCase(), kw)
  KEYWORD_INDEX.set(kw.fr.toLowerCase(), kw)
})

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Extrait les mots-clés juridiques d'un texte
 */
export function extractLegalKeywords(
  text: string,
  options: {
    minOccurrences?: number
    maxKeywords?: number
    includePositions?: boolean
  } = {}
): KeywordMatch[] {
  const {
    minOccurrences = 1,
    maxKeywords = 20,
    includePositions = false,
  } = options

  const matches = new Map<string, KeywordMatch>()
  const textLower = text.toLowerCase()

  // Rechercher chaque mot-clé
  for (const kw of LEGAL_KEYWORDS) {
    // Recherche en arabe
    const arMatches = findOccurrences(textLower, kw.ar.toLowerCase(), includePositions)
    if (arMatches.count > 0) {
      addOrMergeMatch(matches, kw.ar, kw, arMatches, 'ar')
    }

    // Recherche en français
    const frMatches = findOccurrences(textLower, kw.fr.toLowerCase(), includePositions)
    if (frMatches.count > 0) {
      addOrMergeMatch(matches, kw.fr, kw, frMatches, 'fr')
    }
  }

  // Filtrer et trier
  let results = Array.from(matches.values())
    .filter(m => m.occurrences >= minOccurrences)
    .sort((a, b) => {
      // Trier par score (occurrences * weight)
      const scoreA = a.occurrences * getKeywordWeight(a.keyword)
      const scoreB = b.occurrences * getKeywordWeight(b.keyword)
      return scoreB - scoreA
    })
    .slice(0, maxKeywords)

  return results
}

/**
 * Suggère un domaine juridique basé sur les mots-clés
 */
export function suggestDomainFromKeywords(keywords: KeywordMatch[]): {
  domain: string | null
  confidence: number
  evidence: string
} {
  if (keywords.length === 0) {
    return { domain: null, confidence: 0, evidence: 'Aucun mot-clé trouvé' }
  }

  // Compter les occurrences par domaine (pondérées)
  const domainScores = new Map<string, number>()

  for (const kw of keywords) {
    if (kw.domain) {
      const weight = getKeywordWeight(kw.keyword)
      const score = kw.occurrences * weight
      domainScores.set(kw.domain, (domainScores.get(kw.domain) || 0) + score)
    }
  }

  if (domainScores.size === 0) {
    return { domain: null, confidence: 0, evidence: 'Pas de domaine détecté' }
  }

  // Trouver le domaine dominant
  const sorted = Array.from(domainScores.entries())
    .sort((a, b) => b[1] - a[1])

  const [topDomain, topScore] = sorted[0]
  const totalScore = Array.from(domainScores.values()).reduce((a, b) => a + b, 0)
  const confidence = Math.min(0.95, topScore / totalScore)

  const topKeywords = keywords
    .filter(kw => kw.domain === topDomain)
    .slice(0, 3)
    .map(kw => kw.keyword)
    .join(', ')

  return {
    domain: topDomain,
    confidence,
    evidence: `Mots-clés ${topDomain}: ${topKeywords}`,
  }
}

/**
 * Analyse la densité de termes juridiques
 */
export function analyzeLegalDensity(text: string): {
  totalWords: number
  legalKeywords: number
  density: number
  isLegalDocument: boolean
} {
  const words = text.split(/\s+/).filter(w => w.length > 2)
  const keywords = extractLegalKeywords(text, { minOccurrences: 1 })

  const totalOccurrences = keywords.reduce((sum, kw) => sum + kw.occurrences, 0)
  const density = words.length > 0 ? totalOccurrences / words.length : 0

  return {
    totalWords: words.length,
    legalKeywords: totalOccurrences,
    density,
    // Considérer comme document juridique si > 2% de termes juridiques
    isLegalDocument: density > 0.02,
  }
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

function findOccurrences(
  text: string,
  keyword: string,
  includePositions: boolean
): { count: number; positions: number[] } {
  const positions: number[] = []
  let count = 0
  let index = 0

  // Recherche avec limites de mots (word boundaries)
  const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'g')
  let match

  while ((match = regex.exec(text)) !== null) {
    count++
    if (includePositions) {
      positions.push(match.index)
    }
  }

  return { count, positions }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addOrMergeMatch(
  matches: Map<string, KeywordMatch>,
  keyword: string,
  definition: KeywordDefinition,
  occurrence: { count: number; positions: number[] },
  lang: 'ar' | 'fr'
): void {
  const translation = lang === 'ar' ? definition.fr : definition.ar
  const key = keyword.toLowerCase()

  if (matches.has(key)) {
    const existing = matches.get(key)!
    existing.occurrences += occurrence.count
    existing.positions.push(...occurrence.positions)
  } else {
    matches.set(key, {
      keyword,
      translation,
      domain: definition.domain,
      type: definition.type,
      occurrences: occurrence.count,
      positions: occurrence.positions,
    })
  }
}

function getKeywordWeight(keyword: string): number {
  const kw = KEYWORD_INDEX.get(keyword.toLowerCase())
  return kw?.weight || 5
}

/**
 * Exporte le dictionnaire pour référence
 */
export function getKeywordDictionary(): KeywordDefinition[] {
  return [...LEGAL_KEYWORDS]
}

/**
 * Statistiques du dictionnaire
 */
export function getDictionaryStats(): {
  total: number
  byDomain: Record<string, number>
  byType: Record<KeywordType, number>
} {
  const byDomain: Record<string, number> = {}
  const byType: Record<KeywordType, number> = {} as Record<KeywordType, number>

  for (const kw of LEGAL_KEYWORDS) {
    const domain = kw.domain || 'neutre'
    byDomain[domain] = (byDomain[domain] || 0) + 1
    byType[kw.type] = (byType[kw.type] || 0) + 1
  }

  return {
    total: LEGAL_KEYWORDS.length,
    byDomain,
    byType,
  }
}
