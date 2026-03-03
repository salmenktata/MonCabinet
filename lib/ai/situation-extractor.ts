/**
 * Extracteur de contexte situationnel client
 *
 * Analyse la question de l'utilisateur pour détecter :
 * - Rôle procédural (défendeur, demandeur, conseil neutre)
 * - Stade procédural (pré-contentieux, instruction, jugement, appel, cassation)
 * - Type de question (fond, procédure, stratégie, modèle, lookup, comparison, deadline, explanation, summary, ambiguous)
 * - Requêtes ambiguës nécessitant une clarification avant réponse
 *
 * Ce contexte enrichit le prompt LLM pour personnaliser la réponse.
 * Utilise uniquement des heuristiques regex (sans appel LLM, gratuit et rapide).
 *
 * @module lib/ai/situation-extractor
 */

import { createLogger } from '@/lib/logger'
import { stripTashkeel } from '@/lib/web-scraper/arabic-text-utils'

const log = createLogger('SituationExtractor')

export type LegalRole = 'defendeur' | 'demandeur' | 'conseil_neutre' | 'inconnu'
export type ProcedureStage =
  | 'pre_contentieux'
  | 'instruction'
  | 'jugement_fond'
  | 'appel'
  | 'cassation'
  | 'execution'
  | 'inconnu'
export type QuestionType =
  | 'fond'
  | 'procedure'
  | 'strategie'
  | 'modele'
  | 'lookup'
  | 'comparison'
  | 'deadline'
  | 'explanation'
  | 'summary'
  | 'ambiguous'
  | 'inconnu'

export interface SituationContext {
  role: LegalRole
  stage: ProcedureStage
  questionType: QuestionType
  suggestedStance?: 'neutral' | 'defense' // Override du stance par défaut si détecté
  needsClarification?: boolean // Requête trop vague pour répondre utilement
  clarificationQuestion?: string // Question AR pré-générée à poser à l'utilisateur
  promptInjection: string // Fragment prêt à injecter dans le prompt LLM
}

// =============================================================================
// PATTERNS DE DÉTECTION (tous testés sur texte normalisé sans diacritiques)
// =============================================================================

// Règles heuristiques rapides — évitent un appel LLM pour les cas évidents
const STAGE_PATTERNS: Array<{ pattern: RegExp; stage: ProcedureStage }> = [
  { pattern: /محكم[ةا]\s*الاستئناف|appel|استئناف/i, stage: 'appel' },
  { pattern: /محكم[ةا]\s*التعقيب|تعقيب|cassation|pourvoi/i, stage: 'cassation' },
  { pattern: /تنفيذ\s*الحكم|سند\s*تنفيذي|execution\s*forcee|huissier/i, stage: 'execution' },
  { pattern: /جلس[ةا]\s*الحكم|يوم\s*الجلس[ةا]|audience\s*de\s*jugement|المرافع[ةا]/i, stage: 'jugement_fond' },
  { pattern: /تحقيق|قاضي\s*التحقيق|instruction|inculp/i, stage: 'instruction' },
  { pattern: /إنذار|mise\s*en\s*demeure|تسوي[ةا]\s*ودي[ةا]|amiable|قبل\s*الدعوى/i, stage: 'pre_contentieux' },
]

// Note: ROLE_PATTERNS testés sur texte normalisé — les دّ/يُ/ّ sont retirés de q
const ROLE_PATTERNS: Array<{ pattern: RegExp; role: LegalRole }> = [
  { pattern: /انا\s*المدعى\s*عليه|ضدي|يدعى\s*علي|defendeur|poursuivi|j'ai\s*recu\s*une\s*convocation/i, role: 'defendeur' },
  { pattern: /انا\s*المدعي|رفعت\s*دعوى|اريد\s*مقاضاة|demandeur|plaignant|je\s*veux\s*attaquer/i, role: 'demandeur' },
]

const TYPE_PATTERNS: Array<{ pattern: RegExp; type: QuestionType }> = [
  { pattern: /نموذج|عقد\s*جاهز|modele|formulaire|template/i, type: 'modele' },
  { pattern: /كيف\s*اتقدم|الإجراءات|délai|procedure|comment\s*faire/i, type: 'procedure' },
  { pattern: /استراتيجية|افضل\s*طريقة|ما\s*رايك|strategie|conseil\s*sur/i, type: 'strategie' },
]

// --- LOOKUP : texte d'un article / disposition précise ---
const LOOKUP_PATTERNS: RegExp[] = [
  // "الفصل X من Y" — demande directe du texte d'un article
  /(?:الفصل|الفقرة|المادة)\s+(?:\d+|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s*عشر|الثاني\s*عشر)\s+من\s+(?:الدستور|المجلة|القانون|الاتفاقية|الامر|المرسوم)/i,
  // "ما هو/نص/ينص الفصل X"
  /ما\s+(?:هو|نص|هي|ينص)\s+(?:الفصل|الفقرة|المادة)/i,
  // "نص الفصل X"
  /نص\s+(?:الفصل|المادة|الفقرة)\s+\d+/i,
  // "بموجب الفصل X"
  /بموجب\s+(?:الفصل|المادة|الفقرة)/i,
  // "الفصل 123 من..." (chiffre suivi de "من")
  /(?:الفصل|المادة|الفقرة)\s+\d+\s*من\b/i,
  // article N de / du (FR)
  /\barticle\s+\d+\s+(?:de|du|des)\s+\w+/i,
  // "تعريف / ماذا يعني / ما معنى"
  /(?:تعريف|ماذا\s+يعني|ما\s+معنى)\s+\w+/i,
]

// --- COMPARISON : deux concepts face à face ---
const COMPARISON_PATTERNS: RegExp[] = [
  /(?:مقارنة\s+بين|الفرق\s+بين|ما\s+الفرق|فرق\s+بين|قارن\s+بين|تمييز\s+بين|الاختلاف\s+بين)/i,
  /(?:comparaison|difference\s+entre|comparer|versus|\bvs\b)/i,
]

// --- DEADLINE : délai légal précis ---
const DEADLINE_PATTERNS: RegExp[] = [
  // Formes singulier + pluriel + dates
  /(?:اجل\s+(?:الطعن|التقادم|الرفع|التقديم|الدفع|الجواب)|اجال\s+|ميعاد|متى\s+(?:ينقضي|تنقضي|تنتهي|ينتهي)|حساب\s+الاجل)/i,
  // "كم مدة/وقت/يوم/شهر..."
  /(?:كم\s+(?:مدة|وقت|يوما|يوم|شهرا|شهر)\s*(?:للطعن|للتقادم|للرفع)?|ما\s+(?:مدة|اجل|اجال))/i,
  /(?:dans\s+quel\s+delai|delai\s+de\s+(?:recours|prescription|forclusion)|combien\s+de\s+(?:jours|mois)\s+pour)/i,
]

// --- EXPLANATION : pourquoi / comment fonctionne ---
const EXPLANATION_PATTERNS: RegExp[] = [
  // Formes masculines + féminines, sans diacritiques
  /(?:لماذا\s+(?:يشترط|تشترط|يلزم|توجب|يعد|تعد|يوجب|تستلزم))/i,
  /(?:كيف\s+(?:يعمل|تعمل|يتم|يطبق|تطبق|يحسب|تحسب|يسري|تسري))/i,
  /(?:ما\s+(?:هي\s+)?الية|شرح\s+(?:مفهوم|نظام|مبدا|الية))/i,
  /(?:expliquer?\s+(?:le\s+)?(?:concept|mecanisme|principe|fonctionnement)|pourquoi\s+(?:le\s+droit|la\s+loi|le\s+code))/i,
]

// --- SUMMARY : résumé / synthèse ---
const SUMMARY_PATTERNS: RegExp[] = [
  /(?:ملخص\s+(?:حقوق|احكام|قواعد)|باختصار|النقاط\s+الاساسية|اعطني\s+نقاط|نقاط\s+اساسية)/i,
  /(?:resume\s+(?:des\s+)?(?:droits|regles|dispositions)|en\s+bref|points\s+essentiels|synthese\s+(?:des\s+)?(?:droits|regles))/i,
]

// --- AMBIGUOUS : requêtes vagues nécessitant clarification ---
// Patterns avec questions de clarification pré-générées en arabe
const AMBIGUOUS_PATTERNS: Array<{ pattern: RegExp; question: string }> = [
  {
    pattern: /^(?:ماذا|ما)\s+(?:افعل|اعمل|نفعل)\s*[؟?]?\s*$/,
    question:
      '❓ **بحاجة إلى توضيح**\n\nما هي الوضعية القانونية التي تواجهها؟\n- نزاع عقاري أو إيجار\n- قضية جنائية أو مخالفة\n- مشكل عمالي\n- نزاع عائلي أو ميراث\n- دين مالي',
  },
  {
    pattern: /^(?:هل\s+(?:يحق\s+لي|يمكنني|لدي\s+الحق|لي\s+الحق)|ما\s+(?:هو\s+حقي|حقوقي))\s*[؟?]?\s*$/,
    question:
      '❓ **بحاجة إلى توضيح**\n\nحول أي موضوع تريد معرفة حقوقك؟\n- في عقد عمل أو مع صاحب العمل\n- في نزاع مع المالك أو المستاجر\n- في مطالبة بتعويض\n- في شأن عائلي (طلاق، ميراث، حضانة)',
  },
  {
    pattern: /^(?:ما\s+(?:هو\s+)?(?:الحل|الوضع|الوضعية)|كيف\s+(?:الحل|نحل|اتصرف))\s*[؟?]?\s*$/,
    question:
      '❓ **بحاجة إلى توضيح**\n\nأرجو وصف وضعك القانوني بإيجاز:\n- ما الذي حدث؟\n- ما الذي تحتاج لمعرفته أو فعله؟',
  },
  {
    pattern: /^(?:ساعدني|ساعد|مساعدة)\s*[؟?]?\s*$/,
    question:
      '❓ **بحاجة إلى توضيح**\n\nبكل سرور. ما هو سؤالك القانوني؟ أرجو وصف وضعك باختصار.',
  },
]

// Mots-clés juridiques — présence = requête ancrée (pas besoin de clarification)
const LEGAL_ANCHOR_PATTERN =
  /(?:الفصل|المادة|المجلة|القانون|العقد|الدعوى|الحكم|الطعن|التقادم|المحكمة|الاستئناف|الإيجار|الطلاق|الشغل|التعويض|الجنحة|الجناية|الدستور|المرسوم|الاتفاقية|مجلة|مطلب|عريضة|عدل|موثق)/

// =============================================================================
// INSTRUCTIONS DE FORMAT PAR INTENTION
// =============================================================================

const INTENT_FORMAT_INSTRUCTIONS: Partial<Record<QuestionType, string>> = {
  lookup: `🚨 [FORMAT REQUIS — PRIORITÉ ABSOLUE]
La question porte sur le texte d'un article ou d'une disposition précise.
1. Cite le texte exact entre guillemets « » en commençant par la source [KB-X].
2. Ajoute 2-3 phrases de contexte juridique uniquement si utile.
3. N'utilise PAS la structure en 6 blocs. Pas de diagnostic stratégique, pas de scénarios, pas de plan d'action.`,

  comparison: `🚨 [FORMAT REQUIS — PRIORITÉ ABSOLUE]
La question demande une comparaison entre deux éléments juridiques.
Réponds sous forme de tableau Markdown :
| Critère | [Élément A] | [Élément B] |
|---------|------------|------------|
| ...     | ...        | ...        |
Termine par 2-3 lignes de conclusion. N'utilise PAS la structure en 6 blocs.`,

  deadline: `🚨 [FORMAT REQUIS — PRIORITÉ ABSOLUE]
La question porte sur un délai légal précis. Structure ta réponse ainsi :
1. **الأجل القانوني** : durée exacte + événement déclencheur
2. **حساب الميعاد** : méthode de calcul si applicable
3. **عواقب الإخلال** : conséquences du dépassement (irrecevabilité, forclusion...)
4. **استثناءات** : cas particuliers ou suspensions éventuels
N'utilise PAS la structure en 6 blocs.`,

  explanation: `🚨 [FORMAT REQUIS — PRIORITÉ ABSOLUE]
La question demande une explication pédagogique. Structure ta réponse ainsi :
1. **التعريف** : définition concise du concept
2. **السياق القانوني** : fondement en droit tunisien (texte, ratio legis)
3. **التطبيق العملي** : comment ça s'applique concrètement
4. **مثال** : un exemple concret en 1-2 phrases
N'utilise PAS la structure en 6 blocs stratégiques.`,

  summary: `🚨 [FORMAT REQUIS — PRIORITÉ ABSOLUE]
La question demande une synthèse. Réponds par une liste de 3 à 5 points essentiels :
- Chaque point = 1 phrase courte et directe
- Commence par le point le plus important
- Pas de développement, pas de scénarios, pas de plan d'action
N'utilise PAS la structure en 6 blocs.`,
}

// =============================================================================
// INSTRUCTIONS PROCÉDURALES PAR STADE ET RÔLE
// =============================================================================

const STAGE_INSTRUCTIONS: Record<ProcedureStage, string> = {
  pre_contentieux:
    'التركيز على: محاولة التسوية الودية، الإنذار بالدفع، الآجال القانونية قبل رفع الدعوى، وسائل الإثبات اللازمة قبل التقاضي.',
  instruction:
    'التركيز على: الحقوق خلال مرحلة التحقيق، الاطلاع على ملف القضية، طلبات إجراء الخبرات، ضمانات حقوق الدفاع.',
  jugement_fond:
    'التركيز على: بناء الحجج القانونية للمرافعة، ترتيب أولويات الدفوع (شكلية ثم موضوعية)، الرد على ما يحتمل أن يطرحه الطرف الآخر.',
  appel:
    'التركيز على: أسباب الاستئناف الجوهرية، ما يمكن مراجعته في مرحلة الاستئناف، نطاق تدخل محكمة الاستئناف، المستجدات الواقعية والقانونية.',
  cassation:
    'التركيز على: أوجه التعقيب المقبولة (خرق القانون، إساءة تطبيقه، انعدام الأساس القانوني)، الصياغة التقنية الدقيقة المطلوبة أمام محكمة التعقيب.',
  execution:
    'التركيز على: إجراءات تنفيذ الحكم، صلاحيات العدل المنفذ، طرق الطعن في إجراءات التنفيذ، الأموال غير القابلة للحجز.',
  inconnu: '',
}

const ROLE_INSTRUCTIONS: Record<LegalRole, string> = {
  defendeur:
    'المستفسر في موقف الدفاع — اعتمد أسلوب الدفاع القانوني: الدفوع الشكلية أولاً، ثم دفوع الموضوع، ثم طلبات مقابلة إن اقتضى الحال.',
  demandeur:
    'المستفسر في موقف المطالبة — اعتمد أسلوب المطالبة القانونية: تقدير شروط القبول، بناء الأدلة، تحديد الطلبات.',
  conseil_neutre:
    'المستفسر يطلب تحليلاً محايداً — قدّم الوضع من الجانبين ثم استخلص التقييم القانوني الموضوعي.',
  inconnu: '',
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Détecte le contexte situationnel à partir du texte de la question.
 * Utilise des règles heuristiques (sans appel LLM pour économiser les ressources).
 *
 * La question est normalisée (stripTashkeel) avant matching pour couvrir
 * les requêtes sans diacritiques (cas réel 100% du temps).
 */
export function extractSituationContext(question: string): SituationContext {
  // Normalisation : supprimer diacritiques arabes pour matching robuste
  // يُلزم → يلزم | فرّق → فرق | تُوجب → توجب
  const q = stripTashkeel(question)

  // -------------------------------------------------------------------------
  // ÉTAPE 0 — Détection prioritaire : requête vague / ambiguë
  // Court-circuit avant tout autre traitement (évite search+LLM inutiles)
  // -------------------------------------------------------------------------

  // A) Patterns explicitement ambigus avec question pré-générée
  for (const { pattern, question: clarQ } of AMBIGUOUS_PATTERNS) {
    if (pattern.test(q)) {
      log.info(`[SituationExtractor] type=ambiguous (pattern match)`)
      return {
        role: 'inconnu',
        stage: 'inconnu',
        questionType: 'ambiguous',
        needsClarification: true,
        clarificationQuestion: clarQ,
        suggestedStance: 'neutral',
        promptInjection: '',
      }
    }
  }

  // B) Failsafe : requête < 4 mots ET aucun ancrage légal reconnu
  const wordCount = q.trim().split(/\s+/).length
  if (wordCount < 4 && !LEGAL_ANCHOR_PATTERN.test(q)) {
    log.info(`[SituationExtractor] type=ambiguous (wordCount=${wordCount}, no legal anchor)`)
    return {
      role: 'inconnu',
      stage: 'inconnu',
      questionType: 'ambiguous',
      needsClarification: true,
      clarificationQuestion:
        '❓ **بحاجة إلى توضيح**\n\nأرجو تقديم تفاصيل أكثر حول سؤالك القانوني.\nما هو الموضوع أو الوضعية التي تواجهها؟',
      suggestedStance: 'neutral',
      promptInjection: '',
    }
  }

  // -------------------------------------------------------------------------
  // ÉTAPE 1 — Détection rôle, stade, type général
  // -------------------------------------------------------------------------

  let role: LegalRole = 'inconnu'
  let stage: ProcedureStage = 'inconnu'
  let questionType: QuestionType = 'fond'

  for (const { pattern, role: r } of ROLE_PATTERNS) {
    if (pattern.test(q)) {
      role = r
      break
    }
  }

  for (const { pattern, stage: s } of STAGE_PATTERNS) {
    if (pattern.test(q)) {
      stage = s
      break
    }
  }

  for (const { pattern, type } of TYPE_PATTERNS) {
    if (pattern.test(q)) {
      questionType = type
      break
    }
  }

  // -------------------------------------------------------------------------
  // ÉTAPE 2 — Détection fine de l'intention (lookup, comparison, deadline…)
  // Seulement si le type général n'a pas encore été identifié
  // -------------------------------------------------------------------------

  let suggestedStance: 'neutral' | 'defense' | undefined = undefined
  if (questionType === 'fond' || questionType === 'inconnu') {
    const INTENT_DETECTORS: Array<{ patterns: RegExp[]; type: QuestionType }> = [
      { patterns: LOOKUP_PATTERNS, type: 'lookup' },
      { patterns: COMPARISON_PATTERNS, type: 'comparison' },
      { patterns: DEADLINE_PATTERNS, type: 'deadline' },
      { patterns: EXPLANATION_PATTERNS, type: 'explanation' },
      { patterns: SUMMARY_PATTERNS, type: 'summary' },
    ]
    outer: for (const { patterns, type } of INTENT_DETECTORS) {
      for (const pattern of patterns) {
        if (pattern.test(q)) {
          questionType = type
          suggestedStance = 'neutral'
          break outer
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // ÉTAPE 3 — Construction du fragment à injecter dans le prompt
  // -------------------------------------------------------------------------

  const parts: string[] = []

  if (role !== 'inconnu') {
    parts.push(ROLE_INSTRUCTIONS[role])
  }
  if (stage !== 'inconnu' && STAGE_INSTRUCTIONS[stage]) {
    parts.push(STAGE_INSTRUCTIONS[stage])
  }
  if (questionType === 'modele') {
    parts.push('المطلوب: تقديم نموذج أو صيغة قانونية جاهزة مع شرح موجز لكل بند.')
  } else if (questionType === 'procedure') {
    parts.push('المطلوب: شرح الإجراءات العملية والآجال والجهة المختصة خطوة بخطوة.')
  }

  // Injection des instructions de format spécifiques à l'intention détectée
  const formatInstruction = INTENT_FORMAT_INSTRUCTIONS[questionType]
  if (formatInstruction) {
    parts.push(formatInstruction)
  }

  const hasContext = parts.length > 0
  const promptInjection = hasContext ? `[السياق الإجرائي]\n${parts.join('\n')}` : ''

  if (hasContext || suggestedStance) {
    log.info(
      `[SituationExtractor] role=${role}, stage=${stage}, type=${questionType}, suggestedStance=${suggestedStance ?? 'none'}`
    )
  }

  return { role, stage, questionType, suggestedStance, promptInjection }
}
