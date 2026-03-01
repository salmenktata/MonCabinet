/**
 * Extracteur d'Amendements JORT
 *
 * Détecte automatiquement dans les textes JORT (Journal Officiel Tunisien)
 * quels articles de quels codes tunisiens sont modifiés/abrogés/ajoutés.
 *
 * Pipeline à 3 phases :
 * 1. Regex rapide (coût 0) — patterns FR + AR standardisés
 * 2. Résolution des codes (tunisian-codes-registry.ts)
 * 3. LLM Ollama qwen3:8b si confidence < REGEX_MIN_CONFIDENCE
 *
 * @module lib/knowledge-base/jort-amendment-extractor
 */

import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'
import {
  detectCodesInText,
  extractArticleNumbers,
  getCodeBySlug,
  type TunisianCode,
} from './tunisian-codes-registry'
import { createLogger } from '@/lib/logger'
import type { KnowledgeBaseDocument } from '@/lib/ai/knowledge-base-service'

const log = createLogger('jort-amendment-extractor')

// =============================================================================
// TYPES
// =============================================================================

export type AmendmentType = 'modification' | 'abrogation' | 'addition' | 'replacement'

/**
 * Un amendement d'article : un code cible + articles concernés + type
 */
export interface ArticleAmendment {
  /** Code cible modifié, ex: 'COC' */
  targetCodeSlug: string
  /** Nom arabe du code cible */
  targetCodeNameAr: string
  /** Numéros des articles affectés, ex: [65, 203] */
  affectedArticles: number[]
  /** Type de modification */
  amendmentType: AmendmentType
  /** Date d'entrée en vigueur si mentionnée */
  effectiveDate?: string
  /** Extrait de contexte (clause d'amendement) */
  context: string
  /** Confiance (0-1) */
  confidence: number
}

/**
 * Résultat complet d'extraction pour un document JORT
 */
export interface JORTAmendmentExtraction {
  /** ID du document JORT source */
  jortKbId: string
  /** Référence officielle : "Loi n° 2023-45 du 15 juillet 2023" */
  jortReference: string
  /** Date de publication JORT (ISO) */
  jortDate: string
  /** Numéro du JORT : "عدد 45" */
  jortIssue: string
  /** Liste des amendements détectés */
  amendments: ArticleAmendment[]
  /** Confiance globale de l'extraction */
  confidence: number
  /** Méthode utilisée */
  extractionMethod: 'regex' | 'llm' | 'hybrid'
  /** Aucun amendement trouvé (document non-modificatif) */
  isAmendingDocument: boolean
}

// =============================================================================
// PATTERNS REGEX DE DÉTECTION
// =============================================================================

const REGEX_MIN_CONFIDENCE = 0.65

/**
 * Patterns pour détecter les clauses de modification/abrogation en arabe
 */
const AR_MODIFICATION_PATTERNS: RegExp[] = [
  // يُنقَّح الفصل X من مجلة ... / تُنقَّح أحكام الفصل X
  /(?:يُنقَّح|تُنقَّح|نُقِّح|يُعدَّل|تُعدَّل|عُدِّل)\s+(?:أحكام\s+)?(?:الفصل|الفصول)\s+([\d\u060c,\s]+(?:[\u0648و]\s*\d+)*)\s+(?:من|بـ|من\s+مجلة)/gmu,
  // الفصل X من مجلة الالتزامات يُنقَّح كالآتي
  /(?:الفصل|الفصول)\s+([\d\u060c,\s]+)\s+(?:من\s+مجل[ةه]\s+[\u0600-\u06FF\s]+?)\s+(?:يُنقَّح|تُنقَّح|يُعدَّل)/gmu,
  // تُستبدل أحكام الفصل X
  /(?:تُستبدل|يُستبدل|استُبدِل)\s+(?:أحكام\s+)?(?:الفصل|الفصول)\s+([\d\u060c,\s]+)/gmu,
  // يُضاف إلى مجلة ... فصل جديد
  /(?:يُضاف|تُضاف|أُضيف)\s+(?:إلى\s+مجل[ةه]\s+[\u0600-\u06FF\s]+?)\s+(?:فصل|أحكام)/gmu,
]

const AR_ABROGATION_PATTERNS: RegExp[] = [
  // يُلغى الفصل X من مجلة ... / تُلغى أحكام الفصل X
  /(?:يُلغى|تُلغى|أُلغي|يُلغ[ىي])\s+(?:أحكام\s+)?(?:الفصل|الفصول)\s+([\d\u060c,\s]+(?:[\u0648و]\s*\d+)*)\s+(?:من|بـ)/gmu,
  // إلغاء الفصل X
  /إلغاء\s+(?:أحكام\s+)?(?:الفصل|الفصول)\s+([\d\u060c,\s]+)\s+(?:من)/gmu,
]

/**
 * Patterns pour détecter les clauses de modification/abrogation en français
 */
const FR_MODIFICATION_PATTERNS: RegExp[] = [
  // modifie l'article 65 du COC / les articles 65 et 66 sont modifiés
  /(?:modifi[eé][es]?\s+(?:l[''']article|les\s+articles)|(?:l[''']article|les\s+articles)\s+[\d,\s]+\s+(?:est|sont)\s+modifi[eé][es]?)\s*([\d,\s]+(?:\s+et\s+\d+)?)\s+(?:du|de\s+la|de\s+l['''])/gi,
  // remplace l'article X
  /remplace\s+(?:l[''']article|les\s+articles)\s+([\d,\s]+)\s+(?:du|de\s+la)/gi,
  // il est ajouté à / inséré un article
  /(?:il\s+est\s+(?:ajouté|inséré)|sont\s+(?:ajoutés|insérés))\s+(?:au|à\s+la|dans\s+la)\s+(?:loi|code|mجلة)/gi,
  // L'article X du [code] est ainsi rédigé / est modifié comme suit
  /l[''']article\s+(\d+)\s+(?:du|de\s+la)\s+(?:loi|code|mجلة)[\s\S]{0,30}?est\s+(?:ainsi\s+rédig[eé]|modifi[eé]|remplacé)/gi,
]

const FR_ABROGATION_PATTERNS: RegExp[] = [
  // est abrogé l'article X / l'article X est abrogé
  /(?:est\s+abrog[eé][es]?\s+l[''']article|l[''']article\s+\d+\s+est\s+abrog[eé]|les\s+articles\s+[\d,\s]+\s+sont\s+abrog[eé]s)\s*([\d,\s]+)?\s+(?:du|de\s+la)/gi,
  // abroge l'article X
  /abroge\s+(?:l[''']article|les\s+articles)\s+([\d,\s]+)\s+(?:du|de\s+la)/gi,
]

// =============================================================================
// PHASE 1 — DÉTECTION REGEX
// =============================================================================

interface RegexDetectionResult {
  amendments: Partial<ArticleAmendment>[]
  confidence: number
  rawMatches: string[]
}

/**
 * Supprime les diacritiques arabes (tashkeel) pour normaliser le texte PDF.
 * Les PDFs tunisiens n'ont généralement pas de tashkeel, mais les patterns regex en ont.
 */
function stripArabicDiacritics(text: string): string {
  // U+064B–U+065F = fathah, dammah, kasrah, tanwin, shadda, sukun, etc.
  // U+0670 = alef superscript (مدة صغيرة)
  return text.replace(/[\u064B-\u065F\u0670]/g, '')
}

/**
 * Tente de détecter les amendements par regex seuls.
 * Retourne confiance 0 si aucun pattern ne correspond.
 */
function detectAmendmentsByRegex(text: string): RegexDetectionResult {
  const rawMatches: string[] = []
  const amendments: Partial<ArticleAmendment>[] = []

  // Normaliser le texte : supprimer les diacritiques pour matcher les PDFs sans tashkeel
  const normalizedText = stripArabicDiacritics(text)

  // Détecter les codes présents dans le texte
  const codeMatches = detectCodesInText(normalizedText)

  if (codeMatches.length === 0) {
    // Pas de code référencé → document très probablement non modificatif
    return { amendments: [], confidence: 0, rawMatches: [] }
  }

  let found = false

  for (const { code } of codeMatches) {
    // Extraire le contexte autour de chaque occurrence du code (~500 chars)
    const pattern = new RegExp(code.detectionPattern.source, code.detectionPattern.flags)
    let contextMatch: RegExpExecArray | null

    while ((contextMatch = pattern.exec(normalizedText)) !== null) {
      const start = Math.max(0, contextMatch.index - 300)
      const end = Math.min(normalizedText.length, contextMatch.index + 500)
      const excerpt = normalizedText.slice(start, end)

      // Tester patterns arabe — modification
      for (const arPat of AR_MODIFICATION_PATTERNS) {
        const p = new RegExp(arPat.source, arPat.flags)
        const m = p.exec(excerpt)
        if (m) {
          rawMatches.push(excerpt.slice(0, 200))
          const articles = extractArticleNumbers(excerpt)
          if (articles.length > 0) {
            amendments.push({
              targetCodeSlug: code.slug,
              targetCodeNameAr: code.nameAr,
              affectedArticles: articles,
              amendmentType: 'modification',
              context: excerpt.slice(0, 300),
              confidence: 0.72,
            })
            found = true
          }
          break
        }
      }

      // Tester patterns arabe — abrogation
      for (const arPat of AR_ABROGATION_PATTERNS) {
        const p = new RegExp(arPat.source, arPat.flags)
        const m = p.exec(excerpt)
        if (m) {
          rawMatches.push(excerpt.slice(0, 200))
          const articles = extractArticleNumbers(excerpt)
          if (articles.length > 0) {
            amendments.push({
              targetCodeSlug: code.slug,
              targetCodeNameAr: code.nameAr,
              affectedArticles: articles,
              amendmentType: 'abrogation',
              context: excerpt.slice(0, 300),
              confidence: 0.72,
            })
            found = true
          }
          break
        }
      }

      // Tester patterns français — modification
      for (const frPat of FR_MODIFICATION_PATTERNS) {
        const p = new RegExp(frPat.source, frPat.flags)
        const m = p.exec(excerpt)
        if (m) {
          rawMatches.push(excerpt.slice(0, 200))
          const articles = extractArticleNumbers(excerpt)
          if (articles.length > 0) {
            amendments.push({
              targetCodeSlug: code.slug,
              targetCodeNameAr: code.nameAr,
              affectedArticles: articles,
              amendmentType: 'modification',
              context: excerpt.slice(0, 300),
              confidence: 0.68,
            })
            found = true
          }
          break
        }
      }

      // Tester patterns français — abrogation
      for (const frPat of FR_ABROGATION_PATTERNS) {
        const p = new RegExp(frPat.source, frPat.flags)
        const m = p.exec(excerpt)
        if (m) {
          rawMatches.push(excerpt.slice(0, 200))
          const articles = extractArticleNumbers(excerpt)
          if (articles.length > 0) {
            amendments.push({
              targetCodeSlug: code.slug,
              targetCodeNameAr: code.nameAr,
              affectedArticles: articles,
              amendmentType: 'abrogation',
              context: excerpt.slice(0, 300),
              confidence: 0.68,
            })
            found = true
          }
          break
        }
      }

      // Éviter boucle infinie
      if (!pattern.global) break
    }
  }

  // Dédupliquer les amendements (même code + même type)
  const dedupMap = new Map<string, Partial<ArticleAmendment>>()
  for (const amend of amendments) {
    const key = `${amend.targetCodeSlug}:${amend.amendmentType}`
    if (!dedupMap.has(key)) {
      dedupMap.set(key, amend)
    } else {
      // Fusionner les articles
      const existing = dedupMap.get(key)!
      const merged = new Set([...(existing.affectedArticles ?? []), ...(amend.affectedArticles ?? [])])
      existing.affectedArticles = Array.from(merged).sort((a, b) => a - b)
    }
  }

  const finalAmendments = Array.from(dedupMap.values())
  const avgConfidence = finalAmendments.length > 0
    ? finalAmendments.reduce((s, a) => s + (a.confidence ?? 0), 0) / finalAmendments.length
    : 0

  return {
    amendments: finalAmendments,
    confidence: found ? avgConfidence : 0,
    rawMatches,
  }
}

// =============================================================================
// PHASE 3 — LLM (Ollama qwen3:8b)
// =============================================================================

const LLM_AMENDMENT_PROMPT = `Tu es un juriste expert en droit tunisien spécialisé dans l'analyse du Journal Officiel de la République Tunisienne (JORT).

Ta mission : Identifier les modifications apportées aux codes juridiques tunisiens dans un texte JORT.

Codes juridiques tunisiens disponibles :
- COC : مجلة الالتزامات والعقود (Code des Obligations et Contrats)
- CP : المجلة الجزائية (Code Pénal)
- CPP : مجلة الإجراءات الجزائية (Code de Procédure Pénale)
- CPC : مجلة المرافعات المدنية والتجارية (Code de Procédure Civile)
- CT : مجلة الشغل (Code du Travail)
- CSP : مجلة الأحوال الشخصية (Code du Statut Personnel)
- MCO : المجلة التجارية (Code de Commerce)
- CF : مجلة الحقوق العينية (Code des Droits Réels)
- CONST : الدستور (Constitution)

Analyse le texte ci-dessous et retourne un JSON structuré :

\`\`\`json
{
  "isAmendingDocument": true,
  "amendments": [
    {
      "targetCodeSlug": "COC",
      "affectedArticles": [65, 203],
      "amendmentType": "modification",
      "effectiveDate": "2023-07-15",
      "context": "Extrait textuel de la clause d'amendement (max 200 chars)"
    }
  ],
  "confidence": 0.9,
  "jortReference": "Loi n° 2023-45 du 15 juillet 2023"
}
\`\`\`

Règles strictes :
- amendmentType : "modification" | "abrogation" | "addition" | "replacement"
- Si le document ne modifie AUCUN code connu → isAmendingDocument=false, amendments=[]
- affectedArticles : numéros entiers uniquement (ex: [65, 203])
- effectiveDate : format ISO YYYY-MM-DD si disponible, sinon null
- Ne retourne QUE le JSON, sans aucun texte avant ou après.`

interface LLMAmendmentResult {
  isAmendingDocument: boolean
  amendments: Array<{
    targetCodeSlug: string
    affectedArticles: number[]
    amendmentType: AmendmentType
    effectiveDate?: string
    context: string
  }>
  confidence: number
  jortReference?: string
}

/**
 * Extrait les amendements via LLM (Ollama qwen3:8b).
 * Plus précis mais plus lent (~5-15s).
 */
async function detectAmendmentsByLLM(
  text: string,
  documentTitle?: string
): Promise<{ result: LLMAmendmentResult; success: boolean }> {
  try {
    // Limiter à 3000 chars (début du document = clauses modificatives)
    const truncated = text.slice(0, 3000)

    const prompt = `${LLM_AMENDMENT_PROMPT}

**Texte JORT à analyser** :
${documentTitle ? `Titre : ${documentTitle}\n\n` : ''}${truncated}`

    const response = await callLLMWithFallback(
      [{ role: 'user', content: prompt }],
      {
        operationName: 'kb-quality-analysis',
        temperature: 0.05,
        maxTokens: 1200,
      },
      false
    )

    const raw = response.answer?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log.warn('[JORT] LLM ne retourne pas de JSON valide')
      return { result: { isAmendingDocument: false, amendments: [], confidence: 0 }, success: false }
    }

    const parsed = JSON.parse(jsonMatch[0]) as LLMAmendmentResult

    // Valider la structure minimale
    if (!Array.isArray(parsed.amendments)) {
      parsed.amendments = []
    }

    // Valider chaque amendement
    parsed.amendments = parsed.amendments.filter((a) => {
      const code = getCodeBySlug(a.targetCodeSlug)
      return (
        code !== undefined &&
        Array.isArray(a.affectedArticles) &&
        a.affectedArticles.length > 0 &&
        ['modification', 'abrogation', 'addition', 'replacement'].includes(a.amendmentType)
      )
    })

    return { result: parsed, success: true }
  } catch (err) {
    log.error('[JORT] Erreur LLM extraction amendments:', err)
    return { result: { isAmendingDocument: false, amendments: [], confidence: 0 }, success: false }
  }
}

// =============================================================================
// HELPERS — Extraction métadonnées JORT
// =============================================================================

function extractJortReference(text: string, metadata: Record<string, unknown>): string {
  // Depuis les metadata structured_data
  const sd = metadata.structured_data as Record<string, unknown> | undefined
  if (sd?.textType && sd?.year) {
    const typeMap: Record<string, string> = {
      'قانون': 'Loi',
      'قانون أساسي': 'Loi organique',
      'مرسوم': 'Décret',
      'أمر': 'Ordre',
      'قرار': 'Arrêté',
    }
    const type = typeMap[sd.textType as string] ?? String(sd.textType)
    const num = sd.textNumber ?? sd.issueNumber ?? ''
    const year = sd.year ?? ''
    if (num) return `${type} n° ${num} de ${year}`
  }

  // Fallback : regex dans le texte
  const refPatterns = [
    /(?:loi|décret|arrêté)\s+n°\s*(\d{4}-\d+)\s+du\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    /(?:القانون|الأمر|المرسوم)\s+عدد\s*(\d+)\s+لسنة\s+(\d{4})/u,
  ]
  for (const p of refPatterns) {
    const m = text.match(p)
    if (m) return m[0]
  }

  return (metadata.title as string) ?? 'Document JORT'
}

function extractJortDate(metadata: Record<string, unknown>): string {
  const sd = metadata.structured_data as Record<string, unknown> | undefined
  if (sd?.date) return String(sd.date)
  if (metadata.publishedAt) return String(metadata.publishedAt).slice(0, 10)
  if (metadata.jort_date) return String(metadata.jort_date)
  return ''
}

function extractJortIssue(metadata: Record<string, unknown>): string {
  const sd = metadata.structured_data as Record<string, unknown> | undefined
  if (sd?.issueNumber) return `عدد ${sd.issueNumber}`
  if (metadata.jort_number) return String(metadata.jort_number)
  return ''
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Extrait les amendements JORT d'un document KB IORT.
 *
 * Processus :
 * 1. Vérification que c'est bien un document IORT
 * 2. Phase 1 : Regex rapide
 * 3. Si confidence < seuil → Phase 3 : LLM
 * 4. Fusion des résultats
 *
 * @param kbDoc - Document KB (doit avoir fullText et metadata)
 * @returns JORTAmendmentExtraction
 */
export async function extractAmendmentsFromJORT(
  kbDoc: KnowledgeBaseDocument
): Promise<JORTAmendmentExtraction> {
  const text = kbDoc.fullText ?? ''
  const metadata = kbDoc.metadata ?? {}

  const jortReference = extractJortReference(text, metadata)
  const jortDate = extractJortDate(metadata)
  const jortIssue = extractJortIssue(metadata)

  // Si texte vide → impossible d'analyser
  if (!text.trim()) {
    log.warn(`[JORT] Document ${kbDoc.id} sans texte — skip extraction`)
    return {
      jortKbId: kbDoc.id,
      jortReference,
      jortDate,
      jortIssue,
      amendments: [],
      confidence: 0,
      extractionMethod: 'regex',
      isAmendingDocument: false,
    }
  }

  // Phase 1 — Regex
  const regexResult = detectAmendmentsByRegex(text)
  log.info(
    `[JORT] Regex: ${regexResult.amendments.length} amendements, confidence=${regexResult.confidence.toFixed(2)} sur "${kbDoc.title}"`
  )

  // Si confidence suffisante → pas besoin de LLM
  if (regexResult.confidence >= REGEX_MIN_CONFIDENCE && regexResult.amendments.length > 0) {
    const finalAmendments = regexResult.amendments.map((a) => ({
      targetCodeSlug: a.targetCodeSlug!,
      targetCodeNameAr: a.targetCodeNameAr!,
      affectedArticles: a.affectedArticles!,
      amendmentType: a.amendmentType!,
      effectiveDate: a.effectiveDate,
      context: a.context!,
      confidence: a.confidence!,
    }))

    return {
      jortKbId: kbDoc.id,
      jortReference,
      jortDate,
      jortIssue,
      amendments: finalAmendments,
      confidence: regexResult.confidence,
      extractionMethod: 'regex',
      isAmendingDocument: finalAmendments.length > 0,
    }
  }

  // Phase 3 — LLM (si regex insuffisante)
  log.info(`[JORT] Regex insuffisante (conf=${regexResult.confidence.toFixed(2)}) — passage au LLM`)
  const { result: llmResult, success } = await detectAmendmentsByLLM(text, kbDoc.title)

  if (!success || !llmResult.isAmendingDocument) {
    // Ni regex ni LLM n'ont trouvé d'amendements
    return {
      jortKbId: kbDoc.id,
      jortReference: llmResult.jortReference ?? jortReference,
      jortDate,
      jortIssue,
      amendments: [],
      confidence: llmResult.confidence,
      extractionMethod: 'llm',
      isAmendingDocument: false,
    }
  }

  // Convertir résultats LLM en ArticleAmendment[]
  const llmAmendments: ArticleAmendment[] = llmResult.amendments.map((a) => {
    const code = getCodeBySlug(a.targetCodeSlug)
    return {
      targetCodeSlug: a.targetCodeSlug,
      targetCodeNameAr: code?.nameAr ?? a.targetCodeSlug,
      affectedArticles: a.affectedArticles,
      amendmentType: a.amendmentType,
      effectiveDate: a.effectiveDate,
      context: a.context ?? '',
      confidence: llmResult.confidence,
    }
  })

  // Fusion : si regex avait aussi trouvé des résultats, combiner (méthode hybrid)
  const method = regexResult.amendments.length > 0 ? 'hybrid' : 'llm'

  if (regexResult.amendments.length > 0) {
    // Fusionner regex + LLM : LLM est prioritaire, regex complète si codes absents
    const llmCodes = new Set(llmAmendments.map((a) => a.targetCodeSlug))
    for (const ra of regexResult.amendments) {
      if (!llmCodes.has(ra.targetCodeSlug!)) {
        llmAmendments.push({
          targetCodeSlug: ra.targetCodeSlug!,
          targetCodeNameAr: ra.targetCodeNameAr!,
          affectedArticles: ra.affectedArticles!,
          amendmentType: ra.amendmentType!,
          context: ra.context!,
          confidence: ra.confidence!,
        })
      }
    }
  }

  return {
    jortKbId: kbDoc.id,
    jortReference: llmResult.jortReference ?? jortReference,
    jortDate,
    jortIssue,
    amendments: llmAmendments,
    confidence: llmResult.confidence,
    extractionMethod: method,
    isAmendingDocument: llmAmendments.length > 0,
  }
}

/**
 * Vérifie rapidement si un document IORT est susceptible d'être modificatif.
 * Test léger basé sur les indicateurs textuels de surface.
 *
 * Permet de skip l'analyse complète pour les JORT non-modificatifs (>60% des cas).
 */
export function isLikelyAmendingDocument(text: string): boolean {
  const indicators = [
    // Arabe
    'يُنقَّح', 'تُنقَّح', 'يُعدَّل', 'تُعدَّل', 'يُلغى', 'تُلغى', 'يُضاف', 'تُضاف', 'تُستبدل',
    'تنقيح', 'إلغاء الفصل', 'إضافة فصل',
    // Français
    'est modifié', 'est abrogé', 'sont modifiés', 'sont abrogés',
    'modifie l\'article', 'abroge l\'article', 'il est ajouté',
    'ainsi rédigé', 'modifié comme suit', 'remplacé comme suit',
    // Bilingue
    'كالآتي:', 'comme suit :', 'كما يلي:',
  ]

  const textLower = text.toLowerCase()
  return indicators.some((ind) => textLower.includes(ind.toLowerCase()))
}
