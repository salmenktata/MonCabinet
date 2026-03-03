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
export type QuestionType = 'fond' | 'procedure' | 'strategie' | 'modele' | 'inconnu'

export interface SituationContext {
  role: LegalRole
  stage: ProcedureStage
  questionType: QuestionType
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

  const hasContext = parts.length > 0
  const promptInjection = hasContext
    ? `[السياق الإجرائي]\n${parts.join('\n')}`
    : ''

  if (hasContext) {
    log.info(`[SituationExtractor] role=${role}, stage=${stage}, type=${questionType}`)
  }

  return { role, stage, questionType, promptInjection }
}
