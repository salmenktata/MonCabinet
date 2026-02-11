/**
 * Service d'extraction de métadonnées juridiques structurées
 *
 * Pipeline hybride :
 * 1. Extraction regex (rapide, déterministe) - dates, numéros, tribunaux
 * 2. Extraction LLM (contextuel, intelligent) - résumés, qualification juridique
 * 3. Validation Zod (schéma strict)
 * 4. Validation taxonomie (FKs vers legal_taxonomy)
 * 5. Stockage avec versioning et audit
 *
 * @module lib/knowledge-base/structured-metadata-extractor-service
 */

import { db } from '@/lib/db/postgres'
import { callLLMWithFallback, type LLMMessage } from '@/lib/ai/llm-fallback-service'
import type {
  JurisprudenceMetadata,
  LegislationMetadata,
  DoctrineMetadata,
} from './metadata-schemas'
import {
  shouldExtractWithLLM,
  getApplicableFields,
  extractEnrichedFields,
  type LLMDecision,
} from './metadata-extraction-intelligent-mode'

// =============================================================================
// TYPES
// =============================================================================

export interface StructuredMetadata {
  // Commun
  documentDate: Date | null
  documentNumber: string | null
  titleOfficial: string | null
  language: 'ar' | 'fr' | 'bi' | null

  // Jurisprudence
  tribunalCode: string | null
  chambreCode: string | null
  decisionNumber: string | null
  decisionDate: Date | null
  parties: Record<string, string> | null
  solution: 'cassation' | 'rejet' | 'renvoi' | 'confirmation' | 'infirmation' | 'autre' | null
  legalBasis: string[] | null
  rapporteur: string | null
  parties_detailed?: Record<string, string> | null

  // Législation
  loiNumber: string | null
  jortNumber: string | null
  jortDate: Date | null
  effectiveDate: Date | null
  ministry: string | null
  codeName: string | null
  articleRange: string | null

  // Doctrine
  author: string | null
  coAuthors: string[] | null
  publicationName: string | null
  publicationDate: Date | null
  university: string | null
  keywords: string[] | null
  abstract: string | null
  keywords_extracted?: string[] | null
  summary_ai?: string | null

  // Extraction metadata
  fieldConfidence: Record<string, number>
  extractionMethod: 'llm' | 'regex' | 'hybrid' | 'manual'
  extractionConfidence: number
  llmProvider: string | null
  llmModel: string | null
  llmSkipped?: boolean
  llmSkipReason?: string
  precedent_value?: number | null
  domain_specific?: Record<string, unknown> | null
}

export interface ExtractionResult {
  success: boolean
  metadata: StructuredMetadata | null
  errors: string[]
  warnings: string[]
}

// =============================================================================
// PATTERNS REGEX PAR CATÉGORIE
// =============================================================================

/**
 * Patterns regex pour extraction déterministe
 */
const REGEX_PATTERNS = {
  jurisprudence: {
    // Numéros de décision
    decisionNumber: [
      /(?:n°|numéro|عدد)\s*(\d+(?:\/\d+)?)/i,
      /(?:arrêt|قرار)\s+(?:n°|numéro|عدد)?\s*(\d+(?:\/\d+)?)/i,
    ],

    // Dates (formats multiples)
    date: [
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/g, // JJ-MM-AAAA ou JJ/MM/AAAA
      /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/g, // AAAA-MM-JJ
      /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
      /(\d{1,2})\s+(جانفي|فيفري|مارس|أفريل|ماي|جوان|جويلية|أوت|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s+(\d{4})/gi,
    ],

    // Tribunaux
    tribunal: [
      /(?:محكمة التعقيب|Cour de [Cc]assation)/i,
      /(?:محكمة الاستئناف|Cour d['']Appel(?:s)?)\s*(?:de|ب)?\s*([A-Za-z\u0600-\u06FF]+)?/i,
      /(?:المحكمة الابتدائية|Tribunal de [Pp]remière [Ii]nstance)\s*(?:de|ب)?\s*([A-Za-z\u0600-\u06FF]+)?/i,
    ],

    // Chambres
    chambre: [
      /(?:Chambre|الغرفة|الدائرة)\s+(civile|commerciale|sociale|pénale|مدنية|تجارية|اجتماعية|جزائية)/i,
    ],

    // Articles de loi cités
    articles: [
      /(?:Article|الفصل|فصل|art\.?)\s+(\d+(?:\s*(?:et|à|و)\s*\d+)?)/gi,
      /(?:COC|CSP|CPC|مجلة الالتزامات|مجلة الأحوال)/gi,
    ],

    // Solution
    solution: [
      /(?:cassation|نقض|casser)/i,
      /(?:rejet|رفض|rejeter)/i,
      /(?:renvoi|إحالة)/i,
      /(?:confirmation|تأييد|confirmer)/i,
      /(?:infirmation|نقض جزئي|إصلاح)/i,
    ],
  },

  legislation: {
    // Numéro de loi
    loiNumber: [
      /(?:Loi|قانون)\s+(?:n°|numéro|عدد)?\s*(\d+[-\/]\d+)/i,
      /(?:Décret|أمر)\s+(?:n°|numéro|عدد)?\s*(\d+[-\/]\d+)/i,
    ],

    // JORT
    jort: [
      /JORT\s+(?:n°|numéro)?\s*(\d+)/i,
      /(?:الرائد الرسمي|الرائد)\s+(?:عدد)?\s*(\d+)/i,
    ],

    // Code
    codeName: [
      /(?:Code|مجلة)\s+(?:des?|de la|du)?\s*([A-Za-z\u0600-\u06FF\s]+)/i,
    ],

    // Plage d'articles
    articleRange: [
      /(?:Articles?|الفصول|من الفصل)\s+(\d+)\s*(?:à|إلى|-)\s*(\d+)/i,
    ],
  },

  doctrine: {
    // Auteur
    author: [
      /(?:Par|المؤلف|Auteur)\s*[:：]\s*([A-Za-z\u0600-\u06FF\s\.-]+)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/m, // Nom Prénom au début
    ],

    // Publication
    publication: [
      /(?:Revue|مجلة|Publication)\s*[:：]\s*([A-Za-z\u0600-\u06FF\s\.-]+)/i,
    ],

    // Université
    university: [
      /(?:Université|جامعة)\s+(?:de|d')?\s*([A-Za-z\u0600-\u06FF\s]+)/i,
    ],
  },
}

// =============================================================================
// EXTRACTION REGEX
// =============================================================================

/**
 * Extrait les métadonnées avec regex (déterministe, rapide)
 */
function extractWithRegex(
  content: string,
  category: string
): Partial<StructuredMetadata> {
  const extracted: Partial<StructuredMetadata> = {
    fieldConfidence: {},
  }

  // Détecter la langue
  const arabicChars = (content.match(/[\u0600-\u06FF]/g) || []).length
  const latinChars = (content.match(/[a-zA-Z]/g) || []).length
  if (arabicChars > latinChars * 2) {
    extracted.language = 'ar'
    extracted.fieldConfidence!['language'] = 1.0
  } else if (latinChars > arabicChars * 2) {
    extracted.language = 'fr'
    extracted.fieldConfidence!['language'] = 1.0
  } else {
    extracted.language = 'bi'
    extracted.fieldConfidence!['language'] = 0.8
  }

  // Extraction spécifique par catégorie
  if (category === 'jurisprudence') {
    return extractJurisprudenceRegex(content, extracted)
  } else if (category === 'code' || category === 'législation') {
    return extractLegislationRegex(content, extracted)
  } else if (category === 'doctrine') {
    return extractDoctrineRegex(content, extracted)
  }

  return extracted
}

/**
 * Extraction regex pour jurisprudence
 */
function extractJurisprudenceRegex(
  content: string,
  extracted: Partial<StructuredMetadata>
): Partial<StructuredMetadata> {
  const patterns = REGEX_PATTERNS.jurisprudence

  // Numéro de décision
  for (const pattern of patterns.decisionNumber) {
    const match = content.match(pattern)
    if (match) {
      extracted.decisionNumber = match[1]
      extracted.fieldConfidence!['decisionNumber'] = 0.9
      break
    }
  }

  // Dates
  const dates = extractDates(content)
  if (dates.length > 0) {
    extracted.decisionDate = dates[0]
    extracted.fieldConfidence!['decisionDate'] = 0.85
  }

  // Tribunal
  for (const pattern of patterns.tribunal) {
    const match = content.match(pattern)
    if (match) {
      const tribunalText = match[0]
      // Mapper vers code taxonomie (approximatif, à valider par LLM)
      if (/cassation|تعقيب/i.test(tribunalText)) {
        extracted.tribunalCode = 'TRIBUNAL_CASSATION'
        extracted.fieldConfidence!['tribunalCode'] = 0.95
      } else if (/appel|استئناف/i.test(tribunalText)) {
        extracted.tribunalCode = 'TRIBUNAL_APPEL'
        extracted.fieldConfidence!['tribunalCode'] = 0.85
      }
      break
    }
  }

  // Chambre
  for (const pattern of patterns.chambre) {
    const match = content.match(pattern)
    if (match) {
      const chambreText = match[1]?.toLowerCase()
      if (/civil|مدني/i.test(chambreText)) {
        extracted.chambreCode = 'CHAMBRE_CIVILE'
        extracted.fieldConfidence!['chambreCode'] = 0.9
      } else if (/commercial|تجاري/i.test(chambreText)) {
        extracted.chambreCode = 'CHAMBRE_COMMERCIALE'
        extracted.fieldConfidence!['chambreCode'] = 0.9
      } else if (/pénal|جزائ/i.test(chambreText)) {
        extracted.chambreCode = 'CHAMBRE_PENALE'
        extracted.fieldConfidence!['chambreCode'] = 0.9
      } else if (/social|اجتماع/i.test(chambreText)) {
        extracted.chambreCode = 'CHAMBRE_SOCIALE'
        extracted.fieldConfidence!['chambreCode'] = 0.9
      }
      break
    }
  }

  // Articles de loi
  const articles: string[] = []
  for (const pattern of patterns.articles) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      articles.push(match[0])
    }
  }
  if (articles.length > 0) {
    extracted.legalBasis = [...new Set(articles)] // Dédupliquer
    extracted.fieldConfidence!['legalBasis'] = 0.8
  }

  // Solution
  for (const pattern of patterns.solution) {
    if (pattern.test(content)) {
      const solutionText = pattern.source
      if (/cassation|نقض|casser/i.test(solutionText)) {
        extracted.solution = 'cassation'
      } else if (/rejet|رفض/i.test(solutionText)) {
        extracted.solution = 'rejet'
      } else if (/renvoi|إحالة/i.test(solutionText)) {
        extracted.solution = 'renvoi'
      } else if (/confirmation|تأييد/i.test(solutionText)) {
        extracted.solution = 'confirmation'
      } else if (/infirmation|نقض جزئي|إصلاح/i.test(solutionText)) {
        extracted.solution = 'infirmation'
      }

      if (extracted.solution) {
        extracted.fieldConfidence!['solution'] = 0.75
        break
      }
    }
  }

  return extracted
}

/**
 * Extraction regex pour législation
 */
function extractLegislationRegex(
  content: string,
  extracted: Partial<StructuredMetadata>
): Partial<StructuredMetadata> {
  const patterns = REGEX_PATTERNS.legislation

  // Numéro de loi
  for (const pattern of patterns.loiNumber) {
    const match = content.match(pattern)
    if (match) {
      extracted.loiNumber = match[1]
      extracted.fieldConfidence!['loiNumber'] = 0.9
      break
    }
  }

  // JORT
  for (const pattern of patterns.jort) {
    const match = content.match(pattern)
    if (match) {
      extracted.jortNumber = match[1]
      extracted.fieldConfidence!['jortNumber'] = 0.9
      break
    }
  }

  // Code
  for (const pattern of patterns.codeName) {
    const match = content.match(pattern)
    if (match) {
      extracted.codeName = match[0]
      extracted.fieldConfidence!['codeName'] = 0.85
      break
    }
  }

  // Plage d'articles
  for (const pattern of patterns.articleRange) {
    const match = content.match(pattern)
    if (match) {
      extracted.articleRange = `${match[1]}-${match[2]}`
      extracted.fieldConfidence!['articleRange'] = 0.9
      break
    }
  }

  // Dates
  const dates = extractDates(content)
  if (dates.length > 0) {
    extracted.documentDate = dates[0]
    extracted.fieldConfidence!['documentDate'] = 0.8
  }

  return extracted
}

/**
 * Extraction regex pour doctrine
 */
function extractDoctrineRegex(
  content: string,
  extracted: Partial<StructuredMetadata>
): Partial<StructuredMetadata> {
  const patterns = REGEX_PATTERNS.doctrine

  // Auteur
  for (const pattern of patterns.author) {
    const match = content.match(pattern)
    if (match) {
      extracted.author = match[1]?.trim()
      extracted.fieldConfidence!['author'] = 0.75
      break
    }
  }

  // Publication
  for (const pattern of patterns.publication) {
    const match = content.match(pattern)
    if (match) {
      extracted.publicationName = match[1]?.trim()
      extracted.fieldConfidence!['publicationName'] = 0.8
      break
    }
  }

  // Université
  for (const pattern of patterns.university) {
    const match = content.match(pattern)
    if (match) {
      extracted.university = match[1]?.trim()
      extracted.fieldConfidence!['university'] = 0.85
      break
    }
  }

  // Dates
  const dates = extractDates(content)
  if (dates.length > 0) {
    extracted.publicationDate = dates[0]
    extracted.fieldConfidence!['publicationDate'] = 0.7
  }

  return extracted
}

/**
 * Extrait toutes les dates d'un texte
 */
function extractDates(content: string): Date[] {
  const dates: Date[] = []
  const patterns = REGEX_PATTERNS.jurisprudence.date

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      try {
        let dateStr: string
        if (match[0].includes('/') || match[0].includes('-')) {
          // Format JJ-MM-AAAA ou AAAA-MM-JJ
          const parts = match[0].split(/[-\/]/)
          if (parts[0].length === 4) {
            // AAAA-MM-JJ
            dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          } else {
            // JJ-MM-AAAA
            dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          }
        } else {
          // Format textuel (ignorer pour l'instant)
          continue
        }

        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          dates.push(date)
        }
      } catch {
        // Ignorer dates invalides
      }
    }
  }

  return dates
}

// =============================================================================
// EXTRACTION LLM
// =============================================================================

/**
 * Extrait les métadonnées avec LLM (contextuel, intelligent)
 */
async function extractWithLLM(
  content: string,
  category: string,
  regexHints: Partial<StructuredMetadata>
): Promise<Partial<StructuredMetadata>> {
  const prompt = buildExtractionPrompt(content, category, regexHints)

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.system,
    },
    {
      role: 'user',
      content: prompt.user,
    },
  ]

  try {
    const response = await callLLMWithFallback(messages, {
      temperature: 0.1, // Très précis pour extraction
      maxTokens: 2000,
    })

    // Parser la réponse JSON
    const jsonMatch = response.answer.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Réponse LLM ne contient pas de JSON valide')
    }

    const extracted = JSON.parse(jsonMatch[0])

    // Ajouter métadonnées LLM
    extracted.llmProvider = response.provider
    extracted.llmModel = response.modelUsed

    return extracted
  } catch (error) {
    console.error('[Metadata Extractor] Erreur extraction LLM:', error)
    return {}
  }
}

/**
 * Construit le prompt pour extraction LLM
 */
function buildExtractionPrompt(
  content: string,
  category: string,
  regexHints: Partial<StructuredMetadata>
): { system: string; user: string } {
  const system = `Tu es un expert en extraction de métadonnées juridiques tunisiennes.

Ta mission est d'extraire des métadonnées structurées à partir d'un document juridique.

IMPORTANT:
- Réponds UNIQUEMENT avec un JSON valide
- N'invente JAMAIS d'information non présente dans le document
- Si une information est absente ou incertaine, utilise null
- Inclus un score de confiance (0-1) pour chaque champ extrait

Format JSON attendu:
{
  "documentDate": "AAAA-MM-JJ" ou null,
  "documentNumber": "string" ou null,
  "titleOfficial": "string" ou null,
  ...autres champs selon catégorie...,
  "fieldConfidence": {
    "documentDate": 0.95,
    "documentNumber": 0.88,
    ...
  }
}`

  let categorySpecificFields = ''
  if (category === 'jurisprudence') {
    categorySpecificFields = `
Champs spécifiques jurisprudence:
- tribunalCode: Code du tribunal (ex: "TRIBUNAL_CASSATION", "TRIBUNAL_APPEL")
- chambreCode: Code de la chambre (ex: "CHAMBRE_CIVILE", "CHAMBRE_COMMERCIALE")
- decisionNumber: Numéro de décision
- decisionDate: Date de la décision (AAAA-MM-JJ)
- parties: {appellant: "...", appellee: "...", ...}
- solution: "cassation" | "rejet" | "renvoi" | "confirmation" | "infirmation" | "autre"
- legalBasis: ["Art. 1 COC", "Art. 242 CPC", ...]
- rapporteur: Nom du rapporteur si mentionné`
  } else if (category === 'code' || category === 'législation') {
    categorySpecificFields = `
Champs spécifiques législation:
- loiNumber: Numéro de loi (ex: "2023-45")
- jortNumber: Numéro JORT
- jortDate: Date publication JORT (AAAA-MM-JJ)
- effectiveDate: Date d'entrée en vigueur (AAAA-MM-JJ)
- ministry: Ministère émetteur
- codeName: Nom du code (ex: "Code des Obligations et Contrats")
- articleRange: Plage d'articles (ex: "1-100")`
  } else if (category === 'doctrine') {
    categorySpecificFields = `
Champs spécifiques doctrine:
- author: Auteur principal
- coAuthors: ["Co-auteur 1", "Co-auteur 2"]
- publicationName: Nom de la publication/revue
- publicationDate: Date de publication (AAAA-MM-JJ)
- university: Université si thèse/mémoire
- keywords: ["Mot-clé 1", "Mot-clé 2", ...]
- abstract: Résumé si disponible (max 200 mots)`
  }

  const hintsText = Object.keys(regexHints).length > 0
    ? `\n\nIndices déjà extraits par regex (à valider):\n${JSON.stringify(regexHints, null, 2)}`
    : ''

  const user = `Catégorie du document: ${category}

${categorySpecificFields}

${hintsText}

Document à analyser (extrait):
---
${content.substring(0, 3000)}
---

Réponds UNIQUEMENT avec un JSON valide contenant les métadonnées extraites.`

  return { system, user }
}

// =============================================================================
// VALIDATION TAXONOMIE
// =============================================================================

/**
 * Valide les codes taxonomie (FKs vers legal_taxonomy)
 */
async function validateTaxonomyCodes(
  metadata: Partial<StructuredMetadata>
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // Vérifier tribunal_code
  if (metadata.tribunalCode) {
    const result = await db.query(
      'SELECT code FROM legal_taxonomy WHERE code = $1 AND type = $2',
      [metadata.tribunalCode, 'tribunal']
    )
    if (result.rows.length === 0) {
      errors.push(`Code tribunal invalide: ${metadata.tribunalCode}`)
      metadata.tribunalCode = null // Réinitialiser
    }
  }

  // Vérifier chambre_code
  if (metadata.chambreCode) {
    const result = await db.query(
      'SELECT code FROM legal_taxonomy WHERE code = $1 AND type = $2',
      [metadata.chambreCode, 'chambre']
    )
    if (result.rows.length === 0) {
      errors.push(`Code chambre invalide: ${metadata.chambreCode}`)
      metadata.chambreCode = null // Réinitialiser
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// =============================================================================
// STOCKAGE
// =============================================================================

/**
 * Upsert métadonnées structurées avec versioning
 */
async function upsertStructuredMetadata(
  knowledgeBaseId: string,
  metadata: StructuredMetadata
): Promise<void> {
  const query = `
    INSERT INTO kb_structured_metadata (
      knowledge_base_id,
      document_date, document_number, title_official, language,
      tribunal_code, chambre_code, decision_number, decision_date,
      parties, solution, legal_basis, rapporteur,
      loi_number, jort_number, jort_date, effective_date,
      ministry, code_name, article_range,
      author, co_authors, publication_name, publication_date,
      university, keywords, abstract,
      field_confidence, extraction_method, extraction_confidence,
      llm_provider, llm_model,
      parties_detailed, summary_ai, keywords_extracted, precedent_value, domain_specific
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37
    )
    ON CONFLICT (knowledge_base_id) DO UPDATE SET
      document_date = EXCLUDED.document_date,
      document_number = EXCLUDED.document_number,
      title_official = EXCLUDED.title_official,
      language = EXCLUDED.language,
      tribunal_code = EXCLUDED.tribunal_code,
      chambre_code = EXCLUDED.chambre_code,
      decision_number = EXCLUDED.decision_number,
      decision_date = EXCLUDED.decision_date,
      parties = EXCLUDED.parties,
      solution = EXCLUDED.solution,
      legal_basis = EXCLUDED.legal_basis,
      rapporteur = EXCLUDED.rapporteur,
      loi_number = EXCLUDED.loi_number,
      jort_number = EXCLUDED.jort_number,
      jort_date = EXCLUDED.jort_date,
      effective_date = EXCLUDED.effective_date,
      ministry = EXCLUDED.ministry,
      code_name = EXCLUDED.code_name,
      article_range = EXCLUDED.article_range,
      author = EXCLUDED.author,
      co_authors = EXCLUDED.co_authors,
      publication_name = EXCLUDED.publication_name,
      publication_date = EXCLUDED.publication_date,
      university = EXCLUDED.university,
      keywords = EXCLUDED.keywords,
      abstract = EXCLUDED.abstract,
      field_confidence = EXCLUDED.field_confidence,
      extraction_method = EXCLUDED.extraction_method,
      extraction_confidence = EXCLUDED.extraction_confidence,
      llm_provider = EXCLUDED.llm_provider,
      llm_model = EXCLUDED.llm_model,
      parties_detailed = EXCLUDED.parties_detailed,
      summary_ai = EXCLUDED.summary_ai,
      keywords_extracted = EXCLUDED.keywords_extracted,
      precedent_value = EXCLUDED.precedent_value,
      domain_specific = EXCLUDED.domain_specific,
      updated_at = NOW(),
      version = kb_structured_metadata.version + 1
  `

  const values = [
    knowledgeBaseId,
    metadata.documentDate,
    metadata.documentNumber,
    metadata.titleOfficial,
    metadata.language,
    metadata.tribunalCode,
    metadata.chambreCode,
    metadata.decisionNumber,
    metadata.decisionDate,
    metadata.parties ? JSON.stringify(metadata.parties) : null,
    metadata.solution,
    metadata.legalBasis,
    metadata.rapporteur,
    metadata.loiNumber,
    metadata.jortNumber,
    metadata.jortDate,
    metadata.effectiveDate,
    metadata.ministry,
    metadata.codeName,
    metadata.articleRange,
    metadata.author,
    metadata.coAuthors,
    metadata.publicationName,
    metadata.publicationDate,
    metadata.university,
    metadata.keywords,
    metadata.abstract,
    JSON.stringify(metadata.fieldConfidence),
    metadata.extractionMethod,
    metadata.extractionConfidence,
    metadata.llmProvider,
    metadata.llmModel,
    // Nouveaux champs Phase 1.2
    metadata.parties_detailed ? JSON.stringify(metadata.parties_detailed) : null,
    metadata.summary_ai,
    metadata.keywords_extracted,
    metadata.precedent_value,
    metadata.domain_specific ? JSON.stringify(metadata.domain_specific) : null,
  ]

  await db.query(query, values)
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Extrait les métadonnées structurées d'un document KB (pipeline complet)
 *
 * @param knowledgeBaseId - ID du document KB
 * @param options - Options d'extraction
 * @returns Résultat de l'extraction
 */
export async function extractStructuredMetadataV2(
  knowledgeBaseId: string,
  options: {
    forceReextract?: boolean
    useRegexOnly?: boolean
    useLLMOnly?: boolean
  } = {}
): Promise<ExtractionResult> {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    // 1. Récupérer le document KB
    const kbResult = await db.query(
      `SELECT id, title, category, full_text FROM knowledge_base WHERE id = $1`,
      [knowledgeBaseId]
    )

    if (kbResult.rows.length === 0) {
      return {
        success: false,
        metadata: null,
        errors: ['Document KB introuvable'],
        warnings: [],
      }
    }

    const kb = kbResult.rows[0]
    const { category, full_text } = kb

    if (!full_text) {
      return {
        success: false,
        metadata: null,
        errors: ['Document sans contenu texte'],
        warnings: [],
      }
    }

    // 2. Vérifier si métadonnées déjà extraites
    if (!options.forceReextract) {
      const existingResult = await db.query(
        'SELECT * FROM kb_structured_metadata WHERE knowledge_base_id = $1',
        [knowledgeBaseId]
      )
      if (existingResult.rows.length > 0) {
        warnings.push('Métadonnées déjà extraites (utiliser forceReextract pour ré-extraire)')
      }
    }

    // 3. Extraction regex (rapide, déterministe)
    let regexMetadata: Partial<StructuredMetadata> = {}
    if (!options.useLLMOnly) {
      regexMetadata = extractWithRegex(full_text, category)
      console.log(`[Metadata Extractor] Regex extraction: ${Object.keys(regexMetadata.fieldConfidence || {}).length} champs extraits`)
    }

    // 3.5. Décision intelligente : utiliser LLM ou non ? (MODE INTELLIGENT - Phase 1.2)
    const llmDecision: LLMDecision = shouldExtractWithLLM(category, regexMetadata, options)
    console.log(`[Metadata Extractor] Décision LLM: ${llmDecision.shouldUseLLM ? 'OUI' : 'NON'} - ${llmDecision.reason}`)

    // 4. Extraction LLM (contextuel, intelligent) - CONDITIONNEL selon décision
    let llmMetadata: Partial<StructuredMetadata> = {}
    if (!options.useRegexOnly && llmDecision.shouldUseLLM) {
      llmMetadata = await extractWithLLM(full_text, category, regexMetadata)
      console.log(`[Metadata Extractor] LLM extraction: ${Object.keys(llmMetadata.fieldConfidence || {}).length} champs extraits`)
    } else if (!llmDecision.shouldUseLLM) {
      // LLM skipped - enregistrer la raison
      llmMetadata.llmSkipped = true
      llmMetadata.llmSkipReason = llmDecision.reason
      console.log(`[Metadata Extractor] LLM skipped - Économie: $${llmDecision.estimatedCost.toFixed(3)}`)
    }

    // 4.5. Extraction champs enrichis (keywords_extracted, parties_detailed) - Phase 1.2
    const enrichedMetadata = extractEnrichedFields(full_text, category, regexMetadata)
    console.log(`[Metadata Extractor] Champs enrichis: ${Object.keys(enrichedMetadata).length} champs`)


    // 5. Fusionner résultats (LLM prioritaire si confiance > regex, puis champs enrichis)
    const merged: Partial<StructuredMetadata> = {
      ...regexMetadata,
      ...enrichedMetadata,
      ...llmMetadata,
      fieldConfidence: {
        ...regexMetadata.fieldConfidence,
        ...enrichedMetadata.fieldConfidence,
        ...llmMetadata.fieldConfidence,
      },
    }

    // Déterminer méthode d'extraction
    if (options.useRegexOnly) {
      merged.extractionMethod = 'regex'
    } else if (options.useLLMOnly) {
      merged.extractionMethod = 'llm'
    } else {
      merged.extractionMethod = 'hybrid'
    }

    // Calculer confiance globale
    const confidenceValues = Object.values(merged.fieldConfidence || {})
    merged.extractionConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length
      : 0

    // 6. Validation taxonomie
    const taxonomyValidation = await validateTaxonomyCodes(merged)
    if (!taxonomyValidation.valid) {
      errors.push(...taxonomyValidation.errors)
    }

    // 7. Validation Zod (schéma strict)
    // TODO: Implémenter validation Zod avec les schémas existants

    // 8. Stockage avec versioning
    await upsertStructuredMetadata(knowledgeBaseId, merged as StructuredMetadata)

    console.log(`[Metadata Extractor] Extraction réussie pour KB ${knowledgeBaseId} (confiance: ${Math.round(merged.extractionConfidence! * 100)}%)`)

    return {
      success: true,
      metadata: merged as StructuredMetadata,
      errors,
      warnings,
    }
  } catch (error) {
    console.error('[Metadata Extractor] Erreur extraction:', error)
    return {
      success: false,
      metadata: null,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { extractWithRegex, extractWithLLM, validateTaxonomyCodes, upsertStructuredMetadata }
