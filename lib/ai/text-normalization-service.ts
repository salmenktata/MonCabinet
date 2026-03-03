/**
 * Service de normalisation de texte pour le pipeline d'indexation RAG
 *
 * Normalise les numéros d'articles et supprime le boilerplate
 * avant le chunking pour améliorer la qualité des embeddings et du BM25.
 */

// =============================================================================
// NORMALISATION DES NUMÉROS D'ARTICLES
// =============================================================================

/**
 * Unifie les différentes formes de numéros d'articles en format canonique.
 *
 * Transformations :
 * - "Art. 52" / "art 52" / "ART. 52" → "Article 52"
 * - "الفصل 52" / "فصل 52" → "الفصل 52"
 * - Préserve les suffixes : bis/ter/quater (FR), مكرر (AR)
 * - Préserve les tirets : "Article 52-1" reste intact
 */
export function normalizeArticleNumbers(text: string): string {
  let result = text

  // FR: "art." / "Art" / "ART." → "Article" (avec ou sans point)
  result = result.replace(
    /\b(?:art\.?|ART\.?)\s+(\d+(?:\s*[-–]\s*\d+)?(?:\s+(?:bis|ter|quater|quinquies|sexies))?)/gi,
    (match, num) => `Article ${num.trim()}`
  )

  // AR: "فصل" (sans article défini) → "الفصل"
  result = result.replace(
    /(?<!\u0627\u0644)فصل\s+(\d+(?:\s+مكرر)?)/g,
    (match, num) => `الفصل ${num.trim()}`
  )

  return result
}

// =============================================================================
// NORMALISATION DES ORDINAUX
// =============================================================================

/** Mots ordinaux français → chiffre */
const ORDINALS_FR: Record<string, number> = {
  premier: 1, première: 1, premièr: 1,
  deuxième: 2, second: 2, seconde: 2,
  troisième: 3,
  quatrième: 4,
  cinquième: 5,
  sixième: 6,
  septième: 7,
  huitième: 8,
  neuvième: 9,
  dixième: 10,
  onzième: 11,
  douzième: 12,
  treizième: 13,
  quatorzième: 14,
  quinzième: 15,
  seizième: 16,
  'dix-septième': 17,
  'dix-huitième': 18,
  'dix-neuvième': 19,
  vingtième: 20,
  trentième: 30,
  quarantième: 40,
  cinquantième: 50,
  soixantième: 60,
  centième: 100,
}

/** Mots ordinaux arabes → chiffre (avec et sans article défini) */
const ORDINALS_AR: Record<string, number> = {
  أول: 1, الأول: 1,
  ثاني: 2, الثاني: 2,
  ثالث: 3, الثالث: 3,
  رابع: 4, الرابع: 4,
  خامس: 5, الخامس: 5,
  سادس: 6, السادس: 6,
  سابع: 7, السابع: 7,
  ثامن: 8, الثامن: 8,
  تاسع: 9, التاسع: 9,
  عاشر: 10, العاشر: 10,
  'حادي عشر': 11, 'الحادي عشر': 11,
  'ثاني عشر': 12, 'الثاني عشر': 12,
  عشرون: 20, العشرون: 20,
  ثلاثون: 30, الثلاثون: 30,
}

/**
 * Normalise les mots ordinaux en chiffres dans un texte (requête ou chunk).
 *
 * Exemples :
 *   FR : "Article premier" → "Article 1"
 *        "Chapitre deuxième" → "Chapitre 2"
 *   AR : "الفصل الأول" → "الفصل 1"
 *        "الفصل ثاني" → "الفصل 2"
 *
 * La normalisation se fait en deux passes :
 * 1. Contexte article (الفصل/Article/Chapitre suivi d'un ordinal)
 * 2. Ordinal standalone si précédé d'espace ou début de mot
 */
export function normalizeOrdinals(text: string): string {
  let result = text

  // --- Français : contexte article + standalone ---
  const frPattern = new RegExp(
    `\\b(${Object.keys(ORDINALS_FR).join('|')})\\b`,
    'gi'
  )
  result = result.replace(frPattern, (match) => {
    const key = match.toLowerCase()
    const num = ORDINALS_FR[key]
    return num !== undefined ? String(num) : match
  })

  // --- Arabe : contexte article "الفصل X" ou "فصل X" ---
  // Remplace "الفصل الأول" → "الفصل 1", etc.
  const arContextPattern = new RegExp(
    `((?:ال)?فصل|المادة|مادة|الباب|باب|الفقرة|فقرة)\\s+(${Object.keys(ORDINALS_AR).join('|')})`,
    'g'
  )
  result = result.replace(arContextPattern, (match, prefix, ordinal) => {
    const num = ORDINALS_AR[ordinal]
    return num !== undefined ? `${prefix} ${num}` : match
  })

  // --- Arabe standalone (précédé d'espace ou début de chaîne) ---
  const arStandalonePattern = new RegExp(
    `(?<![\\u0621-\\u064A])(${Object.keys(ORDINALS_AR).join('|')})(?![\\u0621-\\u064A])`,
    'g'
  )
  result = result.replace(arStandalonePattern, (match) => {
    const num = ORDINALS_AR[match]
    return num !== undefined ? String(num) : match
  })

  return result
}

// =============================================================================
// SUPPRESSION DU BOILERPLATE
// =============================================================================

/**
 * Supprime le boilerplate courant des documents juridiques tunisiens.
 *
 * Supprime :
 * - En-têtes JORT (Journal Officiel de la République Tunisienne)
 * - Numéros de page isolés
 * - Séquences de points de suspension (tables des matières)
 * - Lignes de séparateurs (----, ====, etc.)
 * - Mentions "Page X sur Y"
 * - En-têtes/pieds de page répétitifs des documents scannés
 */
export function removeDocumentBoilerplate(text: string): string {
  let result = text

  // En-têtes JORT
  result = result.replace(
    /(?:^|\n)\s*(?:Journal Officiel de la R[ée]publique Tunisienne|الرائد الرسمي للجمهورية التونسية)[^\n]*/gi,
    '\n'
  )

  // Numéros de page isolés sur une ligne
  result = result.replace(/(?:^|\n)\s*(?:[-–—]\s*)?\d{1,4}\s*(?:[-–—]\s*)?(?:\n|$)/g, '\n')

  // "Page X sur Y" / "Page X/Y" / "صفحة X"
  result = result.replace(
    /(?:^|\n)\s*(?:page\s+\d+\s*(?:sur|\/|de)\s*\d+|صفحة\s+\d+)[^\n]*/gi,
    '\n'
  )

  // Séquences de points (tables des matières) : "Titre......... 42"
  result = result.replace(/\.{5,}\s*\d*/g, '')

  // Lignes de séparateurs
  result = result.replace(/(?:^|\n)\s*[-=_]{3,}\s*(?:\n|$)/g, '\n')

  // Lignes vides multiples → max 2
  result = result.replace(/\n{4,}/g, '\n\n\n')

  return result.trim()
}
