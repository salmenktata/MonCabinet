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
  // ينقح / تنقح / يعدل الفصل X من ... (avec ou sans diacritiques)
  /(?:ينقح|تنقح|نقح|يعدل|تعدل|عدل)\s+(?:احكام\s+)?(?:الفصل|الفصول)\s+([\d،,\s]+(?:[و\u0648]\s*\d+)*)\s+(?:من|بـ)/gmu,
  // الفصل X من مجلة ... ينقح كالآتي / كما يلي
  /(?:الفصل|الفصول)\s+([\d،,\s]+)\s+(?:من\s+مجل[ةه]\s+[\u0600-\u06FF\s]+?)\s+(?:ينقح|تنقح|يعدل)/gmu,
  // تستبدل / يستبدل أحكام الفصل X
  /(?:تستبدل|يستبدل|استبدل)\s+(?:احكام\s+)?(?:الفصل|الفصول)\s+([\d،,\s]+)/gmu,
  // يعوض / تعوض الفصل X
  /(?:يعوض|تعوض|عوض)\s+(?:احكام\s+)?(?:الفصل|الفصول)\s+([\d،,\s]+)/gmu,
  // تضاف / يضاف [مطة/فقرة/أحكام] إلى الفقرة/الفصل/مجلة
  /(?:يضاف|تضاف|اضيف|يضم|تضم)\s+[\u0600-\u06FF\s]{0,40}?(?:الى|إلى)\s+(?:الفقرة|الفصل|مجل[ةه])/gmu,
  // الفصل الأول ـ ينقح / تضاف / يلغى (dispositif direct)
  /الفصل\s+(?:الاول|الأول|1)\s+[ـ\-]\s+(?:ينقح|تنقح|يلغى|تلغى|يضاف|تضاف|يعوض|تعوض|تستبدل|يستبدل)/gmu,
]

const AR_ABROGATION_PATTERNS: RegExp[] = [
  // يلغى / تلغى أحكام الفصل X من ...
  /(?:يلغى|تلغى|الغي|يلغ[ىي])\s+(?:احكام\s+)?(?:الفصل|الفصول)\s+([\d،,\s]+(?:[و\u0648]\s*\d+)*)\s+(?:من|بـ)/gmu,
  // إلغاء الفصل X
  /الغاء\s+(?:احكام\s+)?(?:الفصل|الفصول)\s+([\d،,\s]+)\s+(?:من)/gmu,
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
 * Normalise le texte arabe pour permettre le matching regex sur textes PDF.
 *
 * Les PDFs IORT utilisent deux formes problématiques :
 * 1. Tashkeel (diacritiques) : يُنقَّح → ينقح
 * 2. Formes de présentation Unicode (ligatures PDF) : اﻷول (U+FEF7) → الأول
 *    Les ligatures comme ﻷ (lam+alef-hamza) doivent être décomposées via NFKC.
 */
function stripArabicDiacritics(text: string): string {
  return text
    .normalize('NFKC') // Décompose les formes de présentation (ﻷ→لأ, ﻻ→لا, etc.)
    .replace(/[\u064B-\u065F\u0670]/g, '') // Supprime tashkeel résiduel
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
              confidence: 0.60,
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
              confidence: 0.60,
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
 * Extrait la section "dispositif" du texte JORT (الفصل الأول ـ ...).
 * Les clauses d'amendement sont dans le dispositif, pas dans le préambule.
 * Skipping les références légales du préambule ("وعلى القانون عدد X...").
 */
function extractDispositif(text: string): string {
  const normalized = stripArabicDiacritics(text)
  // Chercher le début du dispositif : "الفصل الأول ـ" ou "الفصل 1 ـ"
  const match = normalized.match(/الفصل\s+(?:الاول|الأول|1)\s+[ـ\-]/)
  if (match?.index) {
    const start = Math.max(0, match.index - 150) // un peu de contexte avant
    return text.slice(start, start + 4500) // 4500 chars couvre la plupart des dispositifs
  }
  // Fallback : si pas de الفصل الأول, chercher juste après le dernier "وعلى"
  const lastWaala = normalized.lastIndexOf('وعلى')
  if (lastWaala > 200) {
    const afterRefs = lastWaala + 200
    return text.slice(afterRefs, afterRefs + 4500)
  }
  return text.slice(0, 3500)
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
    // Extraire le dispositif (section des articles d'amendement, pas le préambule)
    const truncated = extractDispositif(text)

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

const ARABIC_MONTH_MAP: Record<string, string> = {
  'جانفي': '01', 'يناير': '01',
  'فيفري': '02', 'فبراير': '02',
  'مارس': '03',
  'أفريل': '04', 'افريل': '04', 'إبريل': '04', 'نيسان': '04',
  'ماي': '05', 'مايو': '05',
  'جوان': '06', 'يونيو': '06',
  'جويلية': '07', 'يوليو': '07',
  'أوت': '08', 'اوت': '08', 'أغسطس': '08',
  'سبتمبر': '09',
  'أكتوبر': '10', 'اكتوبر': '10',
  'نوفمبر': '11',
  'ديسمبر': '12',
}

function extractDateFromTitle(title: string): string {
  // Pattern : "مؤرّخ في DD شهر YYYY" ou "مؤرخ في DD شهر YYYY"
  const m = title.match(
    /مؤرّ?خ\s+في\s+(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})/u
  )
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = ARABIC_MONTH_MAP[m[2].trim()]
    const year = m[3]
    if (month) return `${year}-${month}-${day}`
  }
  return ''
}

function extractJortDate(metadata: Record<string, unknown>, title?: string): string {
  const sd = metadata.structured_data as Record<string, unknown> | undefined
  if (sd?.date) return String(sd.date)
  if (metadata.publishedAt) return String(metadata.publishedAt).slice(0, 10)
  if (metadata.jort_date) return String(metadata.jort_date)
  // Fallback : extraire depuis le titre du document (ex: "مؤرخ في 13 ديسمبر 2021")
  if (title) {
    const fromTitle = extractDateFromTitle(title)
    if (fromTitle) return fromTitle
  }
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
  const jortDate = extractJortDate(metadata, kbDoc.title)
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
 *
 * Stratégie en 3 niveaux :
 * 1. Exclure immédiatement les docs où "تنقيح" n'apparaît QUE dans le préambule
 *    (pattern "كما تم تنقيحه" = référence à une loi précédemment modifiée, pas d'amendement)
 * 2. Indicateurs FORTS : dispositif "الفصل الأول ـ [verbe d'action]"
 * 3. Indicateurs complémentaires : verbes d'amendement directs
 */
export function isLikelyAmendingDocument(text: string, title?: string): boolean {
  const normalized = stripArabicDiacritics(text)

  // ─── Exclure immédiatement les rectifications de données cadastrales (expropriation)
  // "تنقح البيانات المتعلقة بقطعة" = correction de coordonnées d'emprise foncière, pas un amendement législatif
  if (/تنقح\s+البيانات\s+المتعلقة\s+بقطع|تنقح\s+البيانات\s+المتعلقة\s+بالقطع/u.test(normalized)) {
    return false
  }

  // ─── Niveau 1 : Dispositif direct (الفصل الأول ـ ينقح / تضاف / يلغى...)
  // C'est l'indicateur le plus fiable d'un texte modificatif
  if (/الفصل\s+(?:الاول|الاول|1)\s+[ـ\-]\s+(?:ينقح|تنقح|يلغى|تلغى|يضاف|تضاف|يعوض|تعوض|تستبدل|يستبدل)/u.test(normalized)) {
    return true
  }

  // ─── Niveau 2 : Titre explicite "يتعلق بتنقيح" ou "تنقيح مجلة / إلغاء أحكام"
  if (/يتعلق\s+بتنقيح|تنقيح\s+مجل[ةه]|تعديل\s+مجل[ةه]|الغاء\s+احكام\s+الفصل/u.test(normalized)) {
    return true
  }

  // ─── Filtre Lois de Finances : exiger Level 1 ou Level 2 (déjà testés ci-dessus)
  // Les LF contiennent souvent des verbes d'amendement hors-contexte (cavaliers législatifs
  // citant des articles sans les modifier). Level 3 seul est insuffisant en contexte juridique.
  if (title && /قانون\s+المالية|loi\s+de\s+finances/i.test(title)) {
    return false
  }

  // ─── Niveau 3 : Verbes d'amendement sans être dans "كما تم تنقيحه" (faux positif préambule)
  // Exclure le pattern "كما تم تنقيحه / تنقيحها" qui = référence à une loi antérieurement modifiée
  const falsePositivePattern = /كما\s+تم\s+تنقيحه|كما\s+تم\s+تنقيحها|كما\s+نقحته|كما\s+نقحتها/gu
  const withoutFalsePositives = normalized.replace(falsePositivePattern, '')

  const directVerbs = [
    'ينقح', 'تنقح', 'يلغى', 'تلغى', 'إلغاء الفصل', 'الغاء الفصل',
    // Français
    'est modifié', 'est abrogé', 'sont modifiés', 'sont abrogés',
    'modifie l\'article', 'abroge l\'article', 'il est ajouté',
    'ainsi rédigé', 'modifié comme suit', 'remplacé comme suit',
  ]

  const lower = withoutFalsePositives.toLowerCase()
  return directVerbs.some((v) => lower.includes(v.toLowerCase()))
}
