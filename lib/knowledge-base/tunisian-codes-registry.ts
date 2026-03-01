/**
 * Registre des Codes Tunisiens
 *
 * Contient la liste exhaustive des codes juridiques tunisiens
 * avec leurs noms officiels (AR + FR), abréviations, et patterns
 * de détection utilisés par l'extracteur d'amendements JORT.
 *
 * Usage principal : identifier quel code est modifié dans un texte JORT.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TunisianCode {
  /** Identifiant normalisé court, ex: 'COC' */
  slug: string
  /** Titre officiel arabe */
  nameAr: string
  /** Titre officiel français */
  nameFr: string
  /** Abréviations arabes courantes */
  shortAr: string[]
  /** Abréviations françaises courantes */
  shortFr: string[]
  /** Regex pour détecter le nom dans un texte (précompilé, ne pas modifier) */
  detectionPattern: RegExp
  /** Pattern pour extraire les numéros d'articles (arabic 'الفصل X' ou français 'Article X') */
  articlePattern: RegExp
  /** Catégorie KB correspondante */
  kbCategory: 'codes' | 'legislation'
  /** Branche juridique */
  legalBranch: string
}

// =============================================================================
// REGISTRE COMPLET
// =============================================================================

export const TUNISIAN_CODES: TunisianCode[] = [
  // --------------------------------------------------------------------------
  // COC — Code des Obligations et Contrats (مجلة الالتزامات والعقود)
  // --------------------------------------------------------------------------
  {
    slug: 'COC',
    nameAr: 'مجلة الالتزامات والعقود',
    nameFr: 'Code des Obligations et Contrats',
    shortAr: ['م.إ.ع', 'م.ا.ع', 'مجلة الالتزامات', 'مجلة الإلتزامات'],
    shortFr: ['COC', 'C.O.C.', 'code des obligations'],
    detectionPattern:
      /مجل[ةه]\s+الالتزامات\s+والعقود|م\.إ\.ع|م\.ا\.ع|code\s+des\s+obligations\s+et\s+(?:des\s+)?contrats|\bCOC\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'civil',
  },

  // --------------------------------------------------------------------------
  // CP — Code Pénal (المجلة الجزائية)
  // --------------------------------------------------------------------------
  {
    slug: 'CP',
    nameAr: 'المجلة الجزائية',
    nameFr: 'Code Pénal',
    shortAr: ['م.ج', 'مجلة جزائية'],
    shortFr: ['CP', 'C.P.', 'code pénal'],
    detectionPattern:
      /المجل[ةه]\s+الجزائي[ةه]|مجل[ةه]\s+الجزائي[ةه]|code\s+p[eé]nal|\bC\.?P\.?\b(?!\s+(?:p|procédure|procedure))/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'pénal',
  },

  // --------------------------------------------------------------------------
  // CPP — Code de Procédure Pénale (مجلة الإجراءات الجزائية)
  // --------------------------------------------------------------------------
  {
    slug: 'CPP',
    nameAr: 'مجلة الإجراءات الجزائية',
    nameFr: 'Code de Procédure Pénale',
    shortAr: ['م.إ.ج', 'مجلة الإجراءات الجزائية'],
    shortFr: ['CPP', 'C.P.P.', 'code de procédure pénale'],
    detectionPattern:
      /مجل[ةه]\s+الإجراءات\s+الجزائي[ةه]|م\.إ\.ج|code\s+de\s+proc[eé]dure\s+p[eé]nale|\bCPP\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'pénal',
  },

  // --------------------------------------------------------------------------
  // CPC — Code de Procédure Civile et Commerciale (مجلة المرافعات المدنية والتجارية)
  // --------------------------------------------------------------------------
  {
    slug: 'CPC',
    nameAr: 'مجلة المرافعات المدنية والتجارية',
    nameFr: 'Code de Procédure Civile et Commerciale',
    shortAr: ['م.م.م.ت', 'مجلة المرافعات'],
    shortFr: ['CPCC', 'CPC', 'code de procédure civile'],
    detectionPattern:
      /مجل[ةه]\s+المرافعات\s+المدني[ةه]\s+والتجاري[ةه]|مجل[ةه]\s+المرافعات|code\s+de\s+proc[eé]dure\s+civile\s+et\s+commerciale|code\s+de\s+proc[eé]dure\s+civile|\bCPCC\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'civil',
  },

  // --------------------------------------------------------------------------
  // CT — Code du Travail (مجلة الشغل)
  // --------------------------------------------------------------------------
  {
    slug: 'CT',
    nameAr: 'مجلة الشغل',
    nameFr: 'Code du Travail',
    shortAr: ['م.ش', 'مجلة الشغل'],
    shortFr: ['CT', 'C.T.', 'code du travail'],
    detectionPattern: /مجل[ةه]\s+الشغل|م\.ش|code\s+du\s+travail|\bC\.?T\.?\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'travail',
  },

  // --------------------------------------------------------------------------
  // CSP — Code du Statut Personnel (مجلة الأحوال الشخصية)
  // --------------------------------------------------------------------------
  {
    slug: 'CSP',
    nameAr: 'مجلة الأحوال الشخصية',
    nameFr: 'Code du Statut Personnel',
    shortAr: ['م.أ.ش', 'م.ا.ش', 'مجلة الأحوال الشخصية'],
    shortFr: ['CSP', 'C.S.P.', 'code du statut personnel'],
    detectionPattern:
      /مجل[ةه]\s+الأحوال\s+الشخصي[ةه]|م\.أ\.ش|م\.ا\.ش|code\s+du\s+statut\s+personnel|\bCSP\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'famille',
  },

  // --------------------------------------------------------------------------
  // MCO — Code de Commerce (المجلة التجارية)
  // --------------------------------------------------------------------------
  {
    slug: 'MCO',
    nameAr: 'المجلة التجارية',
    nameFr: 'Code de Commerce',
    shortAr: ['م.ت', 'المجلة التجارية', 'مجلة تجارية'],
    shortFr: ['CC', 'code de commerce', 'code commercial'],
    detectionPattern:
      /المجل[ةه]\s+التجاري[ةه]|مجل[ةه]\s+التجاري[ةه]|code\s+de\s+commerce|code\s+commercial|\bMCO\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'commercial',
  },

  // --------------------------------------------------------------------------
  // CF — Code Foncier et Immobilier (مجلة الحقوق العينية)
  // --------------------------------------------------------------------------
  {
    slug: 'CF',
    nameAr: 'مجلة الحقوق العينية',
    nameFr: "Code des Droits Réels / Code Foncier",
    shortAr: ['م.ح.ع', 'مجلة الحقوق العينية'],
    shortFr: ['CDR', 'code des droits réels', 'code foncier'],
    detectionPattern:
      /مجل[ةه]\s+الحقوق\s+العيني[ةه]|م\.ح\.ع|code\s+des\s+droits\s+r[eé]els|code\s+foncier/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'immobilier',
  },

  // --------------------------------------------------------------------------
  // COSP — Code de la Protection Sociale (قانون الحماية الاجتماعية)
  // --------------------------------------------------------------------------
  {
    slug: 'COSP',
    nameAr: 'مجلة الحماية الاجتماعية',
    nameFr: 'Code de la Protection Sociale',
    shortAr: ['م.ح.ا', 'مجلة الحماية الاجتماعية', 'الحماية الاجتماعية'],
    shortFr: ['CPS', 'code de la protection sociale'],
    detectionPattern:
      /مجل[ةه]\s+الحماي[ةه]\s+الاجتماعي[ةه]|م\.ح\.ا|code\s+de\s+la\s+protection\s+sociale|\bCPS\b/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'social',
  },

  // --------------------------------------------------------------------------
  // CFA — Code de la Famille (pour les pays voisins — en attente confirmations tunisiennes)
  // --------------------------------------------------------------------------
  {
    slug: 'CF_AGRI',
    nameAr: 'مجلة الأراضي الفلاحية',
    nameFr: 'Code des terres agricoles',
    shortAr: ['م.أ.ف', 'مجلة الأراضي الفلاحية'],
    shortFr: ['code agricole', 'terres agricoles'],
    detectionPattern: /مجل[ةه]\s+الأراضي\s+الفلاحي[ةه]|م\.أ\.ف|code\s+des\s+terres\s+agricoles|code\s+agricole/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'codes',
    legalBranch: 'agricole',
  },

  // --------------------------------------------------------------------------
  // Constitution (cas spécial)
  // --------------------------------------------------------------------------
  {
    slug: 'CONST',
    nameAr: 'الدستور',
    nameFr: 'Constitution',
    shortAr: ['الدستور', 'الدستور التونسي'],
    shortFr: ['constitution', 'const.'],
    detectionPattern: /\bالدستور\b|constitution\s+(?:tunisienne?|de\s+la\s+(?:r[eé]publique\s+)?tunisie)/i,
    articlePattern: /(?:الفصل|فصل)\s+(\d+)|(?:article|art\.?)\s+(\d+)/gi,
    kbCategory: 'legislation',
    legalBranch: 'constitutionnel',
  },
]

// =============================================================================
// INDEX ET LOOKUP
// =============================================================================

/** Index slug → TunisianCode pour lookup O(1) */
const CODE_BY_SLUG = new Map<string, TunisianCode>(
  TUNISIAN_CODES.map((c) => [c.slug, c])
)

/**
 * Trouve un code tunisien par son slug normalisé.
 * @returns TunisianCode ou undefined si slug inconnu
 */
export function getCodeBySlug(slug: string): TunisianCode | undefined {
  return CODE_BY_SLUG.get(slug.toUpperCase())
}

/**
 * Identifie tous les codes tunisiens référencés dans un texte donné.
 * Retourne la liste des codes détectés avec leur position dans le texte.
 *
 * Utilisé par l'extracteur JORT pour identifier les cibles des amendements.
 *
 * @param text - Texte du document JORT à analyser
 * @returns Array de { code, matchIndex, matchText }
 */
export function detectCodesInText(
  text: string
): Array<{ code: TunisianCode; matchIndex: number; matchText: string }> {
  const results: Array<{ code: TunisianCode; matchIndex: number; matchText: string }> = []

  for (const code of TUNISIAN_CODES) {
    // Réinitialiser lastIndex pour les regex globales
    const pattern = new RegExp(code.detectionPattern.source, code.detectionPattern.flags)
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
      results.push({
        code,
        matchIndex: match.index,
        matchText: match[0],
      })
      // Éviter boucle infinie sur regex non-greedy
      if (!pattern.global) break
    }
  }

  // Dédupliquer par slug (garder la première occurrence)
  const seen = new Set<string>()
  return results.filter(({ code }) => {
    if (seen.has(code.slug)) return false
    seen.add(code.slug)
    return true
  })
}

/**
 * Extrait les numéros d'articles référencés dans un texte pour un code donné.
 * Recherche les patterns de forme "الفصل 65" ou "Article 65".
 *
 * @param text - Extrait de texte (souvent la clause d'amendement)
 * @returns Array de numéros d'articles uniques, triés
 */
export function extractArticleNumbers(text: string): number[] {
  const numbers = new Set<number>()

  // Pattern arabe : الفصل 65 / فصل 65
  const arabicPattern = /(?:الفصل|فصل|الفصول)\s+(\d+)(?:\s+(?:و|et|,)\s*(\d+))*/g
  let match: RegExpExecArray | null

  while ((match = arabicPattern.exec(text)) !== null) {
    const n = parseInt(match[1], 10)
    if (!isNaN(n) && n > 0 && n < 10000) numbers.add(n)

    // Captures supplémentaires pour "الفصل 65 و 66"
    for (let i = 2; i < match.length; i++) {
      if (match[i]) {
        const n2 = parseInt(match[i], 10)
        if (!isNaN(n2) && n2 > 0 && n2 < 10000) numbers.add(n2)
      }
    }
  }

  // Pattern français : Article 65 / Art. 65 / articles 65 et 66
  const frenchPattern = /(?:articles?|art\.?)\s+(\d+)(?:(?:\s*,\s*|\s+et\s+|\s+à\s+)(\d+))*/gi

  while ((match = frenchPattern.exec(text)) !== null) {
    const n = parseInt(match[1], 10)
    if (!isNaN(n) && n > 0 && n < 10000) numbers.add(n)

    if (match[2]) {
      const n2 = parseInt(match[2], 10)
      // Si "articles 65 à 70" → ajouter tout l'intervalle
      if (!isNaN(n2) && n2 > n && n2 - n <= 50) {
        for (let i = n + 1; i <= n2; i++) numbers.add(i)
      } else if (!isNaN(n2)) {
        numbers.add(n2)
      }
    }
  }

  return Array.from(numbers).sort((a, b) => a - b)
}

/**
 * Retourne la liste complète des slugs disponibles.
 */
export function getAllCodeSlugs(): string[] {
  return TUNISIAN_CODES.map((c) => c.slug)
}
