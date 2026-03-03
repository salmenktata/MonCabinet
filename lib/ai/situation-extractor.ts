/**
 * Extracteur de contexte situationnel client
 *
 * Analyse la question de l'utilisateur pour détecter :
 * - Rôle procédural (défendeur, demandeur, conseil neutre)
 * - Stade procédural (pré-contentieux, instruction, jugement, appel, cassation)
 * - Type de question (fond, procédure, stratégie, modèle)
 *
 * Ce contexte enrichit le prompt LLM pour personnaliser la réponse.
 * Utilise Ollama local (gratuit, rapide) pour ne pas consommer les quotas cloud.
 *
 * @module lib/ai/situation-extractor
 */

import { createLogger } from '@/lib/logger'

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
export type QuestionType = 'fond' | 'procedure' | 'strategie' | 'modele' | 'lookup' | 'comparison' | 'deadline' | 'explanation' | 'summary' | 'inconnu'

export interface SituationContext {
  role: LegalRole
  stage: ProcedureStage
  questionType: QuestionType
  suggestedStance?: 'neutral' | 'defense' // Override du stance par défaut si détecté
  promptInjection: string // Fragment prêt à injecter dans le prompt LLM
}

// Règles heuristiques rapides — évitent un appel LLM pour les cas évidents
const STAGE_PATTERNS: Array<{ pattern: RegExp; stage: ProcedureStage }> = [
  { pattern: /محكم[ةا]\s*الاستئناف|appel|استئناف/i, stage: 'appel' },
  { pattern: /محكم[ةا]\s*التعقيب|تعقيب|cassation|pourvoi/i, stage: 'cassation' },
  { pattern: /تنفيذ\s*الحكم|سند\s*تنفيذي|exécution\s*forcée|huissier/i, stage: 'execution' },
  { pattern: /جلس[ةا]\s*الحكم|يوم\s*الجلس[ةا]|audience\s*de\s*jugement|المرافع[ةا]/i, stage: 'jugement_fond' },
  { pattern: /تحقيق|قاضي\s*التحقيق|instruction|inculp/i, stage: 'instruction' },
  { pattern: /إنذار|mise\s*en\s*demeure|تسوي[ةا]\s*ودي[ةا]|amiable|قبل\s*الدعوى/i, stage: 'pre_contentieux' },
]

const ROLE_PATTERNS: Array<{ pattern: RegExp; role: LegalRole }> = [
  { pattern: /أنا\s*المدّعى\s*عليه|ضدي|يُدّعى\s*علي|défendeur|poursuivi|j'ai\s*reçu\s*une\s*convocation/i, role: 'defendeur' },
  { pattern: /أنا\s*المدّعي|رفعت\s*دعوى|أريد\s*مقاضاة|demandeur|plaignant|je\s*veux\s*attaquer/i, role: 'demandeur' },
]

const TYPE_PATTERNS: Array<{ pattern: RegExp; type: QuestionType }> = [
  { pattern: /نموذج|عقد\s*جاهز|modèle|formulaire|template/i, type: 'modele' },
  { pattern: /كيف\s*أتقدم|الإجراءات|أجال|délai|procédure|comment\s*faire/i, type: 'procedure' },
  { pattern: /استراتيجية|أفضل\s*طريقة|ما\s*رأيك|stratégie|conseil\s*sur/i, type: 'strategie' },
]

// Détecte les requêtes de consultation pure (texte légal, article, définition)
// → force stance 'neutral' pour éviter l'analyse stratégique défense
const LOOKUP_PATTERNS: RegExp[] = [
  // "الفصل X من الدستور/المجلة/القانون..." — demande directe du texte d'un article
  /(?:الفصل|الفقرة|المادة)\s+(?:\d+|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s*عشر|الثاني\s*عشر|\w+)\s+من\s+(?:الدستور|المجلة|القانون|الاتفاقية|الأمر|المرسوم)/i,
  // "ما هو/نص الفصل X"
  /ما\s+(?:هو|نص|هي)\s+(?:الفصل|الفقرة|المادة)/i,
  // "نص الفصل X"
  /نص\s+(?:الفصل|المادة|الفقرة)\s+\d+/i,
  // article N de / du (FR)
  /\barticle\s+\d+\s+(?:de|du|des)\s+\w+/i,
  // "تعريف / ماذا يعني / ما معنى"
  /(?:تعريف|ماذا\s+يعني|ما\s+معنى)\s+\w+/i,
]

// Requêtes de comparaison entre deux concepts/textes
const COMPARISON_PATTERNS: RegExp[] = [
  /(?:مقارنة\s+بين|الفرق\s+بين|ما\s+الفرق|فرّق\s+بين)/i,
  /(?:comparaison|différence\s+entre|comparer|versus|\bvs\b)/i,
]

// Requêtes sur un délai légal spécifique
const DEADLINE_PATTERNS: RegExp[] = [
  /(?:أجل\s+(?:الطعن|التقادم|الرفع|التقديم)|ميعاد|متى\s+ينقضي|كم\s+(?:يوماً|يوم|شهراً|شهر)\s+(?:للطعن|للتقادم))/i,
  /(?:dans\s+quel\s+délai|délai\s+de\s+(?:recours|prescription|forclusion)|combien\s+de\s+(?:jours|mois)\s+pour)/i,
]

// Requêtes de type "pourquoi / comment fonctionne / expliquer"
const EXPLANATION_PATTERNS: RegExp[] = [
  /(?:لماذا\s+(?:يشترط|يُلزم|تُوجب|يُعدّ)|كيف\s+(?:يعمل|تعمل|يتم|يُطبّق)|شرح\s+(?:مفهوم|نظام|مبدأ))/i,
  /(?:expliquer?\s+(?:le\s+)?(?:concept|mécanisme|principe|fonctionnement)|pourquoi\s+(?:le\s+droit|la\s+loi|le\s+code))/i,
]

// Requêtes de résumé / synthèse
const SUMMARY_PATTERNS: RegExp[] = [
  /(?:ملخص\s+(?:حقوق|أحكام|قواعد)|باختصار|النقاط\s+الأساسية|أعطني\s+نقاط)/i,
  /(?:résumé\s+(?:des\s+)?(?:droits|règles|dispositions)|en\s+bref|points\s+essentiels|synthèse\s+(?:des\s+)?(?:droits|règles))/i,
]

// Instructions de format injectées dans le prompt selon l'intention détectée
// Elles sont ajoutées en fin de system prompt pour overrider la structure par défaut
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

/**
 * Instructions LLM adaptées au stade procédural
 */
const STAGE_INSTRUCTIONS: Record<ProcedureStage, string> = {
  pre_contentieux: 'التركيز على: محاولة التسوية الودية، الإنذار بالدفع، الآجال القانونية قبل رفع الدعوى، وسائل الإثبات اللازمة قبل التقاضي.',
  instruction: 'التركيز على: الحقوق خلال مرحلة التحقيق، الاطلاع على ملف القضية، طلبات إجراء الخبرات، ضمانات حقوق الدفاع.',
  jugement_fond: 'التركيز على: بناء الحجج القانونية للمرافعة، ترتيب أولويات الدفوع (شكلية ثم موضوعية)، الرد على ما يحتمل أن يطرحه الطرف الآخر.',
  appel: 'التركيز على: أسباب الاستئناف الجوهرية، ما يمكن مراجعته في مرحلة الاستئناف، نطاق تدخل محكمة الاستئناف، المستجدات الواقعية والقانونية.',
  cassation: 'التركيز على: أوجه التعقيب المقبولة (خرق القانون، إساءة تطبيقه، انعدام الأساس القانوني)، الصياغة التقنية الدقيقة المطلوبة أمام محكمة التعقيب.',
  execution: 'التركيز على: إجراءات تنفيذ الحكم، صلاحيات العدل المنفذ، طرق الطعن في إجراءات التنفيذ، الأموال غير القابلة للحجز.',
  inconnu: '',
}

const ROLE_INSTRUCTIONS: Record<LegalRole, string> = {
  defendeur: 'المستفسر في موقف الدفاع — اعتمد أسلوب الدفاع القانوني: الدفوع الشكلية أولاً، ثم دفوع الموضوع، ثم طلبات مقابلة إن اقتضى الحال.',
  demandeur: 'المستفسر في موقف المطالبة — اعتمد أسلوب المطالبة القانونية: تقدير شروط القبول، بناء الأدلة، تحديد الطلبات.',
  conseil_neutre: 'المستفسر يطلب تحليلاً محايداً — قدّم الوضع من الجانبين ثم استخلص التقييم القانوني الموضوعي.',
  inconnu: '',
}

/**
 * Détecte le contexte situationnel à partir du texte de la question.
 * Utilise des règles heuristiques (sans appel LLM pour économiser les ressources).
 */
export function extractSituationContext(question: string): SituationContext {
  let role: LegalRole = 'inconnu'
  let stage: ProcedureStage = 'inconnu'
  let questionType: QuestionType = 'fond'

  // Détection rôle
  for (const { pattern, role: r } of ROLE_PATTERNS) {
    if (pattern.test(question)) {
      role = r
      break
    }
  }

  // Détection stade procédural
  for (const { pattern, stage: s } of STAGE_PATTERNS) {
    if (pattern.test(question)) {
      stage = s
      break
    }
  }

  // Détection type de question
  for (const { pattern, type } of TYPE_PATTERNS) {
    if (pattern.test(question)) {
      questionType = type
      break
    }
  }

  // Détection fine de l'intention — lookup, comparaison, délai, explication, résumé
  // → bypass le mode défense stratégique par défaut + injecte un format adapté
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
        if (pattern.test(question)) {
          questionType = type
          suggestedStance = 'neutral'
          break outer
        }
      }
    }
  }

  // Construction du fragment à injecter dans le prompt
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
  const promptInjection = hasContext
    ? `[السياق الإجرائي]\n${parts.join('\n')}`
    : ''

  if (hasContext || suggestedStance) {
    log.info(`[SituationExtractor] role=${role}, stage=${stage}, type=${questionType}, suggestedStance=${suggestedStance ?? 'none'}`)
  }

  return { role, stage, questionType, suggestedStance, promptInjection }
}
