/**
 * Service d'extraction de relations juridiques
 *
 * Détecte et extrait les relations entre documents juridiques :
 * - Citations (un arrêt cite un autre arrêt ou une loi)
 * - Abrogations/remplacements (une loi abroge une autre)
 * - Application (un arrêt applique une loi)
 * - Jurisprudences similaires (même problématique juridique)
 *
 * @module lib/knowledge-base/legal-relations-extractor-service
 */

import { db } from '@/lib/db/postgres'
import { callLLMWithFallback, type LLMMessage } from '@/lib/ai/llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export type RelationType =
  | 'cites'
  | 'cited_by'
  | 'supersedes'
  | 'superseded_by'
  | 'implements'
  | 'interpreted_by'
  | 'commented_by'
  | 'related_case'
  | 'same_topic'
  | 'contradicts'
  // Nouveaux types Phase 4.2 (Tunisie)
  | 'confirms' // Confirmation jurisprudence (يؤكد)
  | 'overrules' // Revirement jurisprudentiel (نقض)
  | 'distinguishes' // Distinction sans renverser (تمييز)
  | 'applies' // Application règle de droit (يطبق القاعدة)
  | 'interprets' // Interprétation texte juridique (يفسر)

export interface LegalRelation {
  sourceKbId: string
  targetKbId: string
  relationType: RelationType
  context: string | null
  confidence: number
  extractedMethod: 'regex' | 'llm' | 'manual'
}

export interface RelationExtractionResult {
  success: boolean
  relations: LegalRelation[]
  errors: string[]
}

// =============================================================================
// PATTERNS REGEX POUR DÉTECTION DE CITATIONS
// =============================================================================

const CITATION_PATTERNS = {
  // Citations de décisions de justice (français)
  arretFr: [
    /(?:arrêt|décision|jugement)\s+(?:n°|numéro)?\s*(\d+(?:\/\d+)?)/gi,
    /(?:cour de cassation|محكمة التعقيب).*?(?:n°|numéro|عدد)\s*(\d+(?:\/\d+)?)/gi,
    /(?:cour d'appel|محكمة الاستئناف).*?(?:n°|numéro|عدد)\s*(\d+(?:\/\d+)?)/gi,
  ],

  // Citations de décisions (arabe)
  arretAr: [
    /(?:قرار|حكم)\s+(?:عدد)?\s*(\d+(?:\/\d+)?)/gi,
    /(?:محكمة التعقيب|محكمة الاستئناف).*?(?:عدد)\s*(\d+(?:\/\d+)?)/gi,
  ],

  // Citations d'articles de loi (français)
  articlesFr: [
    /(?:article|art\.?)\s+(\d+(?:\s*et\s*\d+)?)\s+(?:du|de la)\s+([A-Za-zÀ-ÿ\s]+)/gi,
    /(?:COC|CSP|CPC)\s+(?:art\.?|article)?\s*(\d+)/gi,
  ],

  // Citations d'articles (arabe)
  articlesAr: [
    /(?:الفصل|فصل)\s+(\d+(?:\s*و\s*\d+)?)\s+(?:من)\s+([\u0600-\u06FF\s]+)/gi,
    /(?:مجلة الالتزامات|مجلة الأحوال).*?(?:الفصل|فصل)\s*(\d+)/gi,
  ],

  // Abrogation/remplacement
  abrogation: [
    /(?:abroge|remplace|annule|révoque)\s+(?:la?\s+)?(?:loi|décret|arrêté)\s+(?:n°|numéro)?\s*(\d+[-\/]\d+)/gi,
    /(?:abrogé|remplacé|annulé|révoqué)\s+par\s+(?:la?\s+)?(?:loi|décret)\s+(?:n°|numéro)?\s*(\d+[-\/]\d+)/gi,
    /(?:ألغى|نسخ)\s+(?:القانون|الأمر)\s+(?:عدد)?\s*(\d+[-\/]\d+)/gi,
  ],

  // Application de loi
  application: [
    /(?:en application|sur le fondement|au titre)\s+(?:de l'|du)\s*(?:article|art\.?)\s+(\d+)/gi,
    /(?:استنادا إلى|بناء على|تطبيقا لـ)\s+(?:الفصل|فصل)\s*(\d+)/gi,
  ],

  // Phase 4.2 - Nouveaux patterns tunisiens

  // Confirmation de jurisprudence (يؤكد)
  confirmation: [
    /(?:confirme|réaffirme|maintient)\s+(?:la?\s+)?(?:jurisprudence|position|solution)\s+(?:de l'arrêt|du jugement)/gi,
    /(?:يؤكد|يثبت|يعيد التأكيد على)\s+(?:الاجتهاد|الموقف|القرار)/gi,
    /(?:en ce sens|dans le même sens|conformément)\s+(?:arrêt|cour de cassation)/gi,
  ],

  // Revirement jurisprudentiel (نقض)
  revirement: [
    /(?:renverse|écarte|abandonne|revient sur)\s+(?:la?\s+)?(?:jurisprudence|position|solution)\s+(?:de l'arrêt|du jugement)/gi,
    /(?:نقض|ألغى|عدل عن|رجع عن)\s+(?:الاجتهاد|الموقف|القرار)/gi,
    /(?:revirement|changement de jurisprudence|nouvelle position)/gi,
  ],

  // Distinction/précision (تمييز)
  distinction: [
    /(?:distingue|se distingue|diffère|précise)\s+(?:l'arrêt|la décision|le cas)\s+(?:de l'affaire)/gi,
    /(?:يميز|يفرق|يختلف عن|يدقق)\s+(?:القرار|الحكم|القضية)/gi,
    /(?:toutefois|cependant|néanmoins),?\s+(?:le présent cas|la présente espèce)\s+(?:se distingue)/gi,
  ],

  // Interprétation texte juridique (يفسر)
  interpretation: [
    /(?:interprète|explicite|précise le sens)\s+(?:de l'|du)\s*(?:article|texte|disposition)/gi,
    /(?:يفسر|يوضح|يشرح|يبين مفهوم)\s+(?:الفصل|النص|الأحكام)/gi,
    /(?:au sens|interprétation)\s+(?:de l'article|du texte)/gi,
  ],
}

// =============================================================================
// EXTRACTION REGEX
// =============================================================================

/**
 * Détecte les citations dans un document avec regex
 */
async function detectCitationsWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  // Récupérer toutes les décisions de justice avec leur numéro
  const decisionsResult = await db.query(
    `SELECT
      kb.id,
      meta.decision_number,
      meta.decision_date,
      kb.title
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE meta.decision_number IS NOT NULL
      AND kb.id != $1
      AND kb.category = 'jurisprudence'`,
    [kbId]
  )

  const decisions = decisionsResult.rows

  // Chercher les citations de décisions dans le contenu
  for (const pattern of [...CITATION_PATTERNS.arretFr, ...CITATION_PATTERNS.arretAr]) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const citedNumber = match[1]
      const context = match[0]

      // Chercher si ce numéro correspond à une décision existante
      const targetDecision = decisions.find((d) =>
        d.decision_number?.includes(citedNumber)
      )

      if (targetDecision) {
        relations.push({
          sourceKbId: kbId,
          targetKbId: targetDecision.id,
          relationType: 'cites',
          context: context.substring(0, 200),
          confidence: 0.85, // Confiance élevée pour regex
          extractedMethod: 'regex',
        })
      }
    }
  }

  return relations
}

/**
 * Détecte les citations d'articles de loi
 */
async function detectLegalBasisWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  // Récupérer tous les codes juridiques
  const codesResult = await db.query(
    `SELECT
      kb.id,
      meta.code_name,
      meta.article_range,
      kb.title
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE meta.code_name IS NOT NULL
      AND kb.id != $1
      AND kb.category IN ('code', 'législation')`,
    [kbId]
  )

  const codes = codesResult.rows

  // Chercher les citations d'articles
  for (const pattern of [...CITATION_PATTERNS.articlesFr, ...CITATION_PATTERNS.articlesAr]) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const context = match[0]

      // Essayer de trouver le code correspondant
      for (const code of codes) {
        if (context.toLowerCase().includes(code.code_name?.toLowerCase() || '')) {
          relations.push({
            sourceKbId: kbId,
            targetKbId: code.id,
            relationType: 'implements',
            context: context.substring(0, 200),
            confidence: 0.75,
            extractedMethod: 'regex',
          })
          break
        }
      }
    }
  }

  return relations
}

/**
 * Détecte les abrogations/remplacements
 */
async function detectSupersessionWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  for (const pattern of CITATION_PATTERNS.abrogation) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const loiNumber = match[1]
      const context = match[0]

      // Chercher la loi abrogée
      const targetResult = await db.query(
        `SELECT kb.id
        FROM knowledge_base kb
        INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
        WHERE meta.loi_number = $1 AND kb.id != $2`,
        [loiNumber, kbId]
      )

      if (targetResult.rows.length > 0) {
        relations.push({
          sourceKbId: kbId,
          targetKbId: targetResult.rows[0].id,
          relationType: 'supersedes',
          context: context.substring(0, 200),
          confidence: 0.9,
          extractedMethod: 'regex',
        })
      }
    }
  }

  return relations
}

// =============================================================================
// PHASE 4.2 - NOUVEAUX TYPES RELATIONS TUNISIENNES
// =============================================================================

/**
 * Détecte confirmations de jurisprudence (يؤكد)
 */
async function detectConfirmationsWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  // Récupérer jurisprudence existante
  const decisionsResult = await db.query(
    `SELECT kb.id, meta.decision_number, meta.decision_date, kb.title
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE meta.decision_number IS NOT NULL
      AND kb.id != $1
      AND kb.category = 'jurisprudence'`,
    [kbId]
  )

  const decisions = decisionsResult.rows

  for (const pattern of CITATION_PATTERNS.confirmation) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const context = match[0]

      // Chercher numéros de décision dans le contexte étendu (±200 chars)
      const matchIndex = match.index || 0
      const extendedContext = content.substring(
        Math.max(0, matchIndex - 200),
        Math.min(content.length, matchIndex + 300)
      )

      // Chercher si une décision est citée dans le contexte
      for (const decision of decisions) {
        if (extendedContext.includes(decision.decision_number || '')) {
          relations.push({
            sourceKbId: kbId,
            targetKbId: decision.id,
            relationType: 'confirms',
            context: context.substring(0, 200),
            confidence: 0.82,
            extractedMethod: 'regex',
          })
          break
        }
      }
    }
  }

  return relations
}

/**
 * Détecte revirements jurisprudentiels (نقض)
 */
async function detectRevirementsWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  const decisionsResult = await db.query(
    `SELECT kb.id, meta.decision_number, meta.decision_date, kb.title, meta.tribunal_code
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE meta.decision_number IS NOT NULL
      AND kb.id != $1
      AND kb.category = 'jurisprudence'`,
    [kbId]
  )

  const decisions = decisionsResult.rows

  for (const pattern of CITATION_PATTERNS.revirement) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const context = match[0]
      const matchIndex = match.index || 0
      const extendedContext = content.substring(
        Math.max(0, matchIndex - 200),
        Math.min(content.length, matchIndex + 300)
      )

      // Chercher décision renversée dans contexte
      for (const decision of decisions) {
        if (extendedContext.includes(decision.decision_number || '')) {
          relations.push({
            sourceKbId: kbId,
            targetKbId: decision.id,
            relationType: 'overrules',
            context: context.substring(0, 200),
            confidence: 0.88, // Haute confiance car revirement est explicite
            extractedMethod: 'regex',
          })
          break
        }
      }
    }
  }

  return relations
}

/**
 * Détecte distinctions (تمييز)
 */
async function detectDistinctionsWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  const decisionsResult = await db.query(
    `SELECT kb.id, meta.decision_number, meta.decision_date, kb.title
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE meta.decision_number IS NOT NULL
      AND kb.id != $1
      AND kb.category = 'jurisprudence'`,
    [kbId]
  )

  const decisions = decisionsResult.rows

  for (const pattern of CITATION_PATTERNS.distinction) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const context = match[0]
      const matchIndex = match.index || 0
      const extendedContext = content.substring(
        Math.max(0, matchIndex - 200),
        Math.min(content.length, matchIndex + 300)
      )

      for (const decision of decisions) {
        if (extendedContext.includes(decision.decision_number || '')) {
          relations.push({
            sourceKbId: kbId,
            targetKbId: decision.id,
            relationType: 'distinguishes',
            context: context.substring(0, 200),
            confidence: 0.78,
            extractedMethod: 'regex',
          })
          break
        }
      }
    }
  }

  return relations
}

/**
 * Détecte interprétations de textes juridiques (يفسر)
 */
async function detectInterpretationsWithRegex(
  kbId: string,
  content: string
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  // Récupérer codes et lois
  const codesResult = await db.query(
    `SELECT kb.id, meta.code_name, meta.loi_number, kb.title
    FROM knowledge_base kb
    INNER JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE (meta.code_name IS NOT NULL OR meta.loi_number IS NOT NULL)
      AND kb.id != $1
      AND kb.category IN ('code', 'législation')`,
    [kbId]
  )

  const codes = codesResult.rows

  for (const pattern of CITATION_PATTERNS.interpretation) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const context = match[0]
      const matchIndex = match.index || 0
      const extendedContext = content.substring(
        Math.max(0, matchIndex - 200),
        Math.min(content.length, matchIndex + 300)
      )

      for (const code of codes) {
        if (
          (code.code_name && extendedContext.includes(code.code_name)) ||
          (code.loi_number && extendedContext.includes(code.loi_number))
        ) {
          relations.push({
            sourceKbId: kbId,
            targetKbId: code.id,
            relationType: 'interprets',
            context: context.substring(0, 200),
            confidence: 0.80,
            extractedMethod: 'regex',
          })
          break
        }
      }
    }
  }

  return relations
}

/**
 * Validation croisée : vérifie que les relations sont cohérentes
 * - Target existe en DB
 * - Cohérence temporelle (décision source > décision target pour overrules)
 * - Cohérence hiérarchique (Cassation ne peut pas confirmer Appel d'une date ultérieure)
 */
async function validateRelations(
  relations: LegalRelation[]
): Promise<LegalRelation[]> {
  const validated: LegalRelation[] = []

  for (const relation of relations) {
    // 1. Vérifier que target existe
    const targetResult = await db.query(
      `SELECT kb.id, kb.category, meta.decision_date, meta.tribunal_code
      FROM knowledge_base kb
      LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
      WHERE kb.id = $1`,
      [relation.targetKbId]
    )

    if (targetResult.rows.length === 0) {
      console.warn(`[Legal Relations] Target ${relation.targetKbId} n'existe pas - skip`)
      continue
    }

    const target = targetResult.rows[0]

    // 2. Récupérer métadonnées source
    const sourceResult = await db.query(
      `SELECT meta.decision_date, meta.tribunal_code
      FROM kb_structured_metadata meta
      WHERE meta.knowledge_base_id = $1`,
      [relation.sourceKbId]
    )

    if (sourceResult.rows.length > 0) {
      const source = sourceResult.rows[0]

      // 3. Validation cohérence temporelle pour 'overrules'
      if (relation.relationType === 'overrules') {
        if (source.decision_date && target.decision_date) {
          if (new Date(source.decision_date) <= new Date(target.decision_date)) {
            console.warn(
              `[Legal Relations] Incohérence temporelle pour overrules : source ${source.decision_date} <= target ${target.decision_date} - confiance réduite`
            )
            relation.confidence *= 0.5 // Réduire confiance
          }
        }
      }

      // 4. Validation cohérence hiérarchique pour 'confirms'
      if (relation.relationType === 'confirms') {
        // Cassation (niveau 1) ne peut pas confirmer Appel (niveau 2) d'une date ULTÉRIEURE
        const sourceLevel = getHierarchyLevel(source.tribunal_code)
        const targetLevel = getHierarchyLevel(target.tribunal_code)

        if (
          sourceLevel === 1 &&
          targetLevel === 2 &&
          source.decision_date &&
          target.decision_date &&
          new Date(source.decision_date) < new Date(target.decision_date)
        ) {
          console.warn(
            `[Legal Relations] Incohérence hiérarchique pour confirms : Cassation avant Appel - skip`
          )
          continue
        }
      }
    }

    validated.push(relation)
  }

  console.log(
    `[Legal Relations] Validation : ${validated.length}/${relations.length} relations validées`
  )
  return validated
}

/**
 * Hiérarchie juridictionnelle tunisienne (1 = le plus haut)
 */
function getHierarchyLevel(tribunalCode: string | null): number {
  if (!tribunalCode) return 5
  if (tribunalCode.includes('cassation') || tribunalCode.includes('تعقيب')) return 1
  if (tribunalCode.includes('appel') || tribunalCode.includes('استئناف')) return 2
  if (tribunalCode.includes('instance') || tribunalCode.includes('ابتدائية')) return 3
  if (tribunalCode.includes('doctrine') || tribunalCode.includes('فقه')) return 4
  return 5
}

// =============================================================================
// EXTRACTION LLM
// =============================================================================

/**
 * Utilise un LLM pour détecter les relations plus complexes
 */
async function detectRelationsWithLLM(
  kbId: string,
  content: string,
  candidateDocuments: Array<{ id: string; title: string; category: string; content: string }>
): Promise<LegalRelation[]> {
  const relations: LegalRelation[] = []

  const prompt = `Tu es un expert juridique tunisien.

Analyse ce document juridique et identifie les relations avec d'autres documents.

Document source (extrait):
---
${content.substring(0, 2000)}
---

Documents candidats:
${candidateDocuments.slice(0, 5).map((doc, i) => `
[${i + 1}] ${doc.title} (${doc.category})
${doc.content.substring(0, 300)}
`).join('\n---\n')}

Identifie les relations suivantes:
- "cites": Le document cite explicitement un autre document
- "implements": Le document applique une loi/code
- "related_case": Jurisprudences similaires (même problématique)
- "contradicts": Contradiction juridique entre décisions

Réponds UNIQUEMENT avec un JSON:
{
  "relations": [
    {
      "targetIndex": 1,
      "relationType": "cites",
      "context": "extrait montrant la relation",
      "confidence": 0.85
    }
  ]
}`

  try {
    const messages: LLMMessage[] = [
      { role: 'user', content: prompt },
    ]

    const response = await callLLMWithFallback(messages, {
      temperature: 0.1,
      maxTokens: 1000,
    })

    // Parser la réponse
    const jsonMatch = response.answer.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.relations && Array.isArray(parsed.relations)) {
        for (const rel of parsed.relations) {
          const targetDoc = candidateDocuments[rel.targetIndex - 1]
          if (targetDoc) {
            relations.push({
              sourceKbId: kbId,
              targetKbId: targetDoc.id,
              relationType: rel.relationType,
              context: rel.context,
              confidence: rel.confidence || 0.7,
              extractedMethod: 'llm',
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('[Legal Relations] Erreur LLM:', error)
  }

  return relations
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Extrait toutes les relations juridiques pour un document KB
 *
 * @param kbId - ID du document KB source
 * @param options - Options d'extraction
 * @returns Résultat avec relations détectées
 */
export async function extractLegalRelations(
  kbId: string,
  options: {
    useRegexOnly?: boolean
    useLLMOnly?: boolean
  } = {}
): Promise<RelationExtractionResult> {
  const errors: string[] = []
  const allRelations: LegalRelation[] = []

  try {
    // 1. Récupérer le document source
    const kbResult = await db.query(
      `SELECT id, title, category, full_text FROM knowledge_base WHERE id = $1`,
      [kbId]
    )

    if (kbResult.rows.length === 0) {
      return {
        success: false,
        relations: [],
        errors: ['Document KB introuvable'],
      }
    }

    const kb = kbResult.rows[0]
    const content = kb.full_text

    if (!content) {
      return {
        success: false,
        relations: [],
        errors: ['Document sans contenu texte'],
      }
    }

    // 2. Extraction regex (rapide) - TOUS les types
    if (!options.useLLMOnly) {
      const citationsRegex = await detectCitationsWithRegex(kbId, content)
      const legalBasisRegex = await detectLegalBasisWithRegex(kbId, content)
      const supersessionRegex = await detectSupersessionWithRegex(kbId, content)

      // Phase 4.2 - Nouveaux types tunisiens
      const confirmationsRegex = await detectConfirmationsWithRegex(kbId, content)
      const revirementsRegex = await detectRevirementsWithRegex(kbId, content)
      const distinctionsRegex = await detectDistinctionsWithRegex(kbId, content)
      const interpretationsRegex = await detectInterpretationsWithRegex(kbId, content)

      allRelations.push(
        ...citationsRegex,
        ...legalBasisRegex,
        ...supersessionRegex,
        ...confirmationsRegex,
        ...revirementsRegex,
        ...distinctionsRegex,
        ...interpretationsRegex
      )

      console.log(`[Legal Relations] Regex extraction: ${allRelations.length} relations détectées`)
    }

    // 3. Pipeline intelligent : skip LLM si regex confiant >0.8 ET >=3 relations
    const avgConfidence =
      allRelations.length > 0
        ? allRelations.reduce((sum, r) => sum + r.confidence, 0) / allRelations.length
        : 0

    const shouldActivateLLM =
      options.useLLMOnly ||
      (!options.useRegexOnly &&
        (allRelations.length < 3 || avgConfidence < 0.8))

    console.log(
      `[Legal Relations] Pipeline intelligent : ${allRelations.length} relations regex, confiance moyenne ${avgConfidence.toFixed(2)} → ${shouldActivateLLM ? 'ACTIVER' : 'SKIP'} LLM`
    )

    // 4. Extraction LLM (précise mais lente) - optionnel
    if (shouldActivateLLM) {
      // Récupérer documents similaires comme candidats
      const candidatesResult = await db.query(
        `SELECT kb.id, kb.title, kb.category, kb.full_text AS content
        FROM knowledge_base kb
        WHERE kb.id != $1
          AND kb.category = $2
          AND kb.is_indexed = true
        LIMIT 10`,
        [kbId, kb.category]
      )

      if (candidatesResult.rows.length > 0) {
        const llmRelations = await detectRelationsWithLLM(
          kbId,
          content,
          candidatesResult.rows
        )
        allRelations.push(...llmRelations)
        console.log(`[Legal Relations] LLM extraction: ${llmRelations.length} relations supplémentaires`)
      }
    }

    // 5. Validation croisée (Phase 4.2)
    const validatedRelations = await validateRelations(allRelations)

    // 6. Dédupliquer et stocker
    const uniqueRelations = deduplicateRelations(validatedRelations)

    for (const relation of uniqueRelations) {
      await upsertLegalRelation(relation)
    }

    console.log(`[Legal Relations] Extraction réussie: ${uniqueRelations.length} relations uniques pour KB ${kbId}`)

    return {
      success: true,
      relations: uniqueRelations,
      errors,
    }
  } catch (error) {
    console.error('[Legal Relations] Erreur extraction:', error)
    return {
      success: false,
      relations: [],
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Déduplique les relations détectées
 */
function deduplicateRelations(relations: LegalRelation[]): LegalRelation[] {
  const seen = new Set<string>()
  const unique: LegalRelation[] = []

  for (const relation of relations) {
    const key = `${relation.sourceKbId}:${relation.targetKbId}:${relation.relationType}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(relation)
    }
  }

  return unique
}

/**
 * Stocke ou met à jour une relation juridique
 */
async function upsertLegalRelation(relation: LegalRelation): Promise<void> {
  await db.query(
    `INSERT INTO kb_legal_relations (
      source_kb_id,
      target_kb_id,
      relation_type,
      context,
      confidence,
      extracted_method
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (source_kb_id, target_kb_id, relation_type) DO UPDATE SET
      context = EXCLUDED.context,
      confidence = EXCLUDED.confidence,
      extracted_method = EXCLUDED.extracted_method`,
    [
      relation.sourceKbId,
      relation.targetKbId,
      relation.relationType,
      relation.context,
      relation.confidence,
      relation.extractedMethod,
    ]
  )
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  detectCitationsWithRegex,
  detectLegalBasisWithRegex,
  detectSupersessionWithRegex,
  // Phase 4.2 - Nouveaux types tunisiens
  detectConfirmationsWithRegex,
  detectRevirementsWithRegex,
  detectDistinctionsWithRegex,
  detectInterpretationsWithRegex,
  validateRelations,
  getHierarchyLevel,
}
