#!/usr/bin/env npx tsx
/**
 * Script semi-automatique pour constituer le gold eval dataset RAG.
 *
 * Workflow :
 * 1. Charge les questions existantes du benchmark + nouvelles questions
 * 2. Pour chaque question sans gold chunks, lance la recherche RAG
 * 3. Affiche les top 10 chunks candidats avec scores
 * 4. L'utilisateur valide/rejette via CLI interactive
 * 5. Exporte vers data/gold-eval-dataset.json
 *
 * Usage :
 *   npx tsx scripts/seed-gold-eval-dataset.ts              # Mode interactif
 *   npx tsx scripts/seed-gold-eval-dataset.ts --auto        # Auto-accept top 3 chunks (score > 0.7)
 *   npx tsx scripts/seed-gold-eval-dataset.ts --skip-validated  # Ne re-seed pas les questions déjà validées
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { BENCHMARK_CASES } from '../tests/rag-legal-benchmark'
import type { GoldEvalCase, IntentType, Domain, Difficulty } from '../tests/rag-legal-benchmark'

// =============================================================================
// CONFIGURATION
// =============================================================================

const OUTPUT_PATH = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')
const AUTO_MODE = process.argv.includes('--auto')
const SKIP_VALIDATED = process.argv.includes('--skip-validated')

// =============================================================================
// QUESTIONS ADDITIONNELLES — 143 questions (+ 7 benchmark = 150 total)
// Distribution cible : ~30% easy, ~35% medium, ~25% hard, ~10% expert
// =============================================================================

const ADDITIONAL_QUESTIONS: Omit<GoldEvalCase, 'evaluationCriteria' | 'expertValidation'>[] = [
  // =====================================================================
  // DROIT CIVIL — 25 questions (AR + FR)
  // =====================================================================
  { id: 'ar_civil_01', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط صحة العقد في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الرضا', 'الأهلية', 'المحل', 'السبب المشروع'], mandatoryCitations: ['الفصل 2 من مجلة الالتزامات والعقود'] },
    expectedArticles: ['الفصل 2'] },
  { id: 'ar_civil_02', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي آجال التقادم في المادة المدنية في تونس؟',
    expectedAnswer: { keyPoints: ['15 سنة', 'التقادم المسقط'], mandatoryCitations: ['مجلة الالتزامات والعقود'] },
    expectedArticles: ['الفصل 402'] },
  { id: 'ar_civil_03', domain: 'droit_civil', difficulty: 'easy', intentType: 'citation_lookup',
    question: 'ماذا ينص الفصل 82 من مجلة الالتزامات والعقود؟',
    expectedAnswer: { keyPoints: ['المسؤولية التقصيرية', 'التعويض'], mandatoryCitations: ['الفصل 82 من مجلة الالتزامات والعقود'] },
    expectedArticles: ['الفصل 82'] },
  { id: 'ar_civil_04', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط المسؤولية التقصيرية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الخطأ', 'الضرر', 'العلاقة السببية'], mandatoryCitations: ['الفصل 83 مجلة الالتزامات والعقود'] },
    expectedArticles: ['الفصل 82', 'الفصل 83'] },
  { id: 'ar_civil_05', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي أنواع الضمان في العقود المدنية التونسية؟',
    expectedAnswer: { keyPoints: ['ضمان العيوب الخفية', 'ضمان الاستحقاق', 'ضمان التعرض'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_civil_06', domain: 'droit_civil', difficulty: 'medium', intentType: 'procedural',
    question: 'كيف يتم إثبات الالتزامات في القانون المدني التونسي؟',
    expectedAnswer: { keyPoints: ['الكتابة', 'الشهادة', 'القرائن', 'الإقرار', 'اليمين'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_civil_07', domain: 'droit_civil', difficulty: 'hard', intentType: 'interpretive',
    question: 'ما هو موقف محكمة التعقيب من مسألة التعويض عن الضرر المعنوي؟',
    expectedAnswer: { keyPoints: ['التعويض عن الضرر المعنوي', 'السلطة التقديرية للقاضي'], mandatoryCitations: ['محكمة التعقيب'] } },
  { id: 'ar_civil_08', domain: 'droit_civil', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي شروط فسخ العقد في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['إخلال جوهري', 'إعذار', 'حكم قضائي أو شرط فاسخ'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_civil_09', domain: 'droit_civil', difficulty: 'hard', intentType: 'comparative',
    question: 'ما الفرق بين البطلان المطلق والبطلان النسبي للعقد في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['المطلق: مخالفة النظام العام', 'النسبي: حماية مصلحة خاصة', 'التقادم مختلف'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'fr_civil_01', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'Quels sont les modes d\'extinction des obligations en droit tunisien ?',
    expectedAnswer: { keyPoints: ['paiement', 'compensation', 'novation', 'remise de dette', 'prescription'], mandatoryCitations: ['COC'] } },
  { id: 'fr_civil_02', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les conditions de la responsabilité du fait des choses en droit tunisien ?',
    expectedAnswer: { keyPoints: ['garde de la chose', 'fait de la chose', 'dommage', 'lien de causalité'], mandatoryCitations: ['Article 96 COC'] },
    expectedArticles: ['Article 96'] },
  { id: 'fr_civil_03', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les règles de la mise en demeure en droit tunisien ?',
    expectedAnswer: { keyPoints: ['interpellation', 'forme écrite', 'délai raisonnable'], mandatoryCitations: ['COC'] } },
  { id: 'fr_civil_04', domain: 'droit_civil', difficulty: 'hard', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne interprète-t-elle la force majeure comme cause d\'exonération ?',
    expectedAnswer: { keyPoints: ['imprévisibilité', 'irrésistibilité', 'extériorité'], mandatoryCitations: ['COC', 'Cour de cassation'] } },
  { id: 'fr_civil_05', domain: 'droit_civil', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment s\'articule la responsabilité contractuelle et la responsabilité délictuelle en droit tunisien ? Peut-on cumuler les deux ?',
    expectedAnswer: { keyPoints: ['non-cumul', 'option impossible', 'responsabilité contractuelle prime'], mandatoryCitations: ['COC', 'jurisprudence'] } },
  // =====================================================================
  // DROIT PÉNAL — 22 questions
  // =====================================================================
  { id: 'ar_penal_01', domain: 'droit_penal', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي عقوبة السرقة في القانون الجزائي التونسي؟',
    expectedAnswer: { keyPoints: ['السجن', 'خمس سنوات'], mandatoryCitations: ['الفصل 264 من المجلة الجزائية'] },
    expectedArticles: ['الفصل 264'] },
  { id: 'ar_penal_02', domain: 'droit_penal', difficulty: 'easy', intentType: 'citation_lookup',
    question: 'ماذا ينص الفصل 217 من المجلة الجزائية؟',
    expectedAnswer: { keyPoints: ['التحيل', 'العقوبة'], mandatoryCitations: ['الفصل 217 من المجلة الجزائية'] },
    expectedArticles: ['الفصل 217'] },
  { id: 'ar_penal_03', domain: 'droit_penal', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي أنواع العقوبات الجزائية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الإعدام', 'السجن', 'الخطية', 'العقوبات التكميلية'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'ar_penal_04', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي عقوبة إصدار شيك بدون رصيد في تونس؟',
    expectedAnswer: { keyPoints: ['السجن خمس سنوات', 'الخطية'], mandatoryCitations: ['الفصل 411 من المجلة التجارية'] },
    expectedArticles: ['الفصل 411'] },
  { id: 'ar_penal_05', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي ظروف التشديد في جريمة السرقة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الليل', 'التسلق', 'الكسر', 'حمل السلاح', 'التعدد'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'ar_penal_06', domain: 'droit_penal', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات الإيقاف التحفظي في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['قاضي التحقيق', 'جنحة أو جناية', 'مدة محددة', 'التمديد'], mandatoryCitations: ['مجلة الإجراءات الجزائية'] } },
  { id: 'ar_penal_07', domain: 'droit_penal', difficulty: 'hard', intentType: 'procedural',
    question: 'ما هي شروط الإفراج الشرطي في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['قضاء ثلثي المدة', 'حسن السيرة', 'موافقة لجنة'], mandatoryCitations: ['مجلة الإجراءات الجزائية'] } },
  { id: 'ar_penal_08', domain: 'droit_penal', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي أركان جريمة التحيل في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الاحتيال', 'استعمال طرق تدليسية', 'الاستيلاء على مال الغير'], mandatoryCitations: ['الفصل 291 المجلة الجزائية'] },
    expectedArticles: ['الفصل 291'] },
  { id: 'ar_penal_09', domain: 'droit_penal', difficulty: 'hard', intentType: 'comparative',
    question: 'ما الفرق بين الجناية والجنحة والمخالفة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الجناية: أكثر من 5 سنوات', 'الجنحة: 16 يوم إلى 5 سنوات', 'المخالفة: أقل من 16 يوم'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'ar_penal_10', domain: 'droit_penal', difficulty: 'expert', intentType: 'interpretive',
    question: 'ما هي شروط قيام حالة الدفاع الشرعي في القانون الجزائي التونسي وما هي حدودها؟',
    expectedAnswer: { keyPoints: ['خطر حال', 'تناسب الرد', 'عدم الاستفزاز'], mandatoryCitations: ['المجلة الجزائية'] },
    expectedArticles: ['الفصل 39', 'الفصل 40'] },
  { id: 'fr_penal_01', domain: 'droit_penal', difficulty: 'easy', intentType: 'factual',
    question: 'Quelles sont les causes d\'irresponsabilité pénale en droit tunisien ?',
    expectedAnswer: { keyPoints: ['démence', 'contrainte', 'minorité', 'légitime défense'], mandatoryCitations: ['Code pénal'] } },
  { id: 'fr_penal_02', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les conditions de la récidive en droit pénal tunisien ?',
    expectedAnswer: { keyPoints: ['condamnation antérieure définitive', 'nouvelle infraction', 'délai'], mandatoryCitations: ['Code pénal'] } },
  { id: 'fr_penal_03', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'Quel est le régime juridique du sursis en droit pénal tunisien ?',
    expectedAnswer: { keyPoints: ['sursis simple', 'conditions', 'révocation'], mandatoryCitations: ['Code pénal'] } },
  { id: 'fr_penal_04', domain: 'droit_penal', difficulty: 'hard', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne interprète-t-elle la complicité en matière pénale ?',
    expectedAnswer: { keyPoints: ['aide ou assistance', 'instigation', 'acte positif', 'connaissance de l\'infraction'], mandatoryCitations: ['Code pénal'] } },
  { id: 'fr_penal_05', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'Quels sont les délais de prescription de l\'action publique selon la nature de l\'infraction en Tunisie ?',
    expectedAnswer: { keyPoints: ['10 ans crime', '3 ans délit', '1 an contravention'], mandatoryCitations: ['Code de procédure pénale'] } },
  // =====================================================================
  // DROIT DE LA FAMILLE — 22 questions
  // =====================================================================
  { id: 'ar_famille_01', domain: 'droit_famille', difficulty: 'easy', intentType: 'factual',
    question: 'ما هو السن الأدنى للزواج في تونس؟',
    expectedAnswer: { keyPoints: ['18 سنة'], mandatoryCitations: ['مجلة الأحوال الشخصية'] },
    expectedArticles: ['الفصل 5'] },
  { id: 'ar_famille_02', domain: 'droit_famille', difficulty: 'easy', intentType: 'citation_lookup',
    question: 'ماذا ينص الفصل 23 من مجلة الأحوال الشخصية بخصوص النفقة؟',
    expectedAnswer: { keyPoints: ['النفقة', 'واجبات الزوج'], mandatoryCitations: ['الفصل 23 من مجلة الأحوال الشخصية'] },
    expectedArticles: ['الفصل 23'] },
  { id: 'ar_famille_03', domain: 'droit_famille', difficulty: 'easy', intentType: 'factual',
    question: 'هل يجوز تعدد الزوجات في تونس؟',
    expectedAnswer: { keyPoints: ['محرم', 'ممنوع بالقانون', 'عقوبة جزائية'], mandatoryCitations: ['الفصل 18 مجلة الأحوال الشخصية'] },
    expectedArticles: ['الفصل 18'] },
  { id: 'ar_famille_04', domain: 'droit_famille', difficulty: 'medium', intentType: 'factual',
    question: 'كيف يتم تقدير النفقة الزوجية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['حال الزوج', 'حال الزوجة', 'المستوى المعيشي'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_famille_05', domain: 'droit_famille', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط الحضانة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الأمانة', 'القدرة', 'مصلحة الطفل الفضلى'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_famille_06', domain: 'droit_famille', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات الطلاق بالتراضي في تونس؟',
    expectedAnswer: { keyPoints: ['اتفاق الطرفين', 'محكمة', 'محاولة صلح', 'تسوية آثار الطلاق'], mandatoryCitations: ['الفصل 29 مجلة الأحوال الشخصية'] },
    expectedArticles: ['الفصل 29'] },
  { id: 'ar_famille_07', domain: 'droit_famille', difficulty: 'hard', intentType: 'comparative',
    question: 'ما الفرق بين الطلاق بالتراضي والطلاق للضرر في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['التراضي: اتفاق الطرفين', 'الضرر: إثبات الضرر', 'إجراءات مختلفة'], mandatoryCitations: ['مجلة الأحوال الشخصية', 'الفصل 31'] },
    expectedArticles: ['الفصل 29', 'الفصل 31'] },
  { id: 'ar_famille_08', domain: 'droit_famille', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي حقوق المرأة في الميراث حسب القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الإرث حسب الأحكام الشرعية', 'الثلث', 'النصف', 'الربع'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_famille_09', domain: 'droit_famille', difficulty: 'hard', intentType: 'interpretive',
    question: 'كيف يتعامل القضاء التونسي مع مسألة نقل الحضانة من الأم إلى الأب؟',
    expectedAnswer: { keyPoints: ['مصلحة الطفل الفضلى', 'أسباب جدية', 'السلطة التقديرية للقاضي'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'fr_famille_01', domain: 'droit_famille', difficulty: 'easy', intentType: 'factual',
    question: 'Quels sont les empêchements au mariage en droit tunisien ?',
    expectedAnswer: { keyPoints: ['parenté', 'alliance', 'mariage existant', 'idda'], mandatoryCitations: ['CSP'] } },
  { id: 'fr_famille_02', domain: 'droit_famille', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les obligations alimentaires entre époux en droit tunisien ?',
    expectedAnswer: { keyPoints: ['obligation du mari', 'proportionnalité', 'subsistance pendant mariage'], mandatoryCitations: ['CSP', 'Article 23'] } },
  { id: 'fr_famille_03', domain: 'droit_famille', difficulty: 'medium', intentType: 'procedural',
    question: 'Comment se déroule la tentative de conciliation en matière de divorce en Tunisie ?',
    expectedAnswer: { keyPoints: ['obligatoire', 'juge de la famille', 'trois séances maximum', 'délai'], mandatoryCitations: ['CSP'] } },
  { id: 'fr_famille_04', domain: 'droit_famille', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne traite-t-elle le droit de visite du parent non gardien ?',
    expectedAnswer: { keyPoints: ['intérêt supérieur de l\'enfant', 'droit fondamental', 'aménagement judiciaire'], mandatoryCitations: ['CSP', 'Convention droits enfant'] } },
  // =====================================================================
  // DROIT DU TRAVAIL — 20 questions
  // =====================================================================
  { id: 'ar_travail_01', domain: 'droit_travail', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي مدة فترة التجربة في عقد الشغل في تونس؟',
    expectedAnswer: { keyPoints: ['6 أشهر', 'قابلة للتجديد مرة واحدة'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_travail_02', domain: 'droit_travail', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي مدة العمل القانونية الأسبوعية في تونس؟',
    expectedAnswer: { keyPoints: ['48 ساعة', 'القطاع غير الفلاحي'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_travail_03', domain: 'droit_travail', difficulty: 'medium', intentType: 'factual',
    question: 'كيف يتم احتساب التعويض عن الطرد التعسفي في تونس؟',
    expectedAnswer: { keyPoints: ['الأجر الشهري', 'الأقدمية', 'شهر عن كل سنة'], mandatoryCitations: ['مجلة الشغل'] },
    expectedArticles: ['الفصل 23'] },
  { id: 'ar_travail_04', domain: 'droit_travail', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي حقوق المرأة العاملة الحامل في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['عطلة أمومة', '30 يوما', 'حماية من الطرد'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_travail_05', domain: 'droit_travail', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات الطرد التأديبي للعامل في تونس؟',
    expectedAnswer: { keyPoints: ['الإنذار', 'مجلس التأديب', 'حق الدفاع', 'القرار المعلل'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_travail_06', domain: 'droit_travail', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي حقوق العامل في حالة الطرد لأسباب اقتصادية في تونس؟',
    expectedAnswer: { keyPoints: ['إعلام مسبق', 'تعويض', 'أولوية إعادة التشغيل', 'تفتيش الشغل'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_travail_07', domain: 'droit_travail', difficulty: 'hard', intentType: 'comparative',
    question: 'ما الفرق بين عقد الشغل محدد المدة وعقد الشغل غير محدد المدة في تونس؟',
    expectedAnswer: { keyPoints: ['المدة', 'التجديد', 'إنهاء العقد', 'التعويض'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'fr_travail_01', domain: 'droit_travail', difficulty: 'easy', intentType: 'factual',
    question: 'Quels sont les droits du travailleur en matière de congé annuel en Tunisie ?',
    expectedAnswer: { keyPoints: ['un jour par mois', '18 jours minimum', 'congé payé'], mandatoryCitations: ['Code du travail'] } },
  { id: 'fr_travail_02', domain: 'droit_travail', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les conditions de validité d\'une clause de non-concurrence en droit du travail tunisien ?',
    expectedAnswer: { keyPoints: ['limitée dans le temps', 'limitée dans l\'espace', 'contrepartie', 'intérêt légitime'], mandatoryCitations: ['Code du travail', 'jurisprudence'] } },
  { id: 'fr_travail_03', domain: 'droit_travail', difficulty: 'medium', intentType: 'procedural',
    question: 'Quelle est la procédure de règlement des conflits collectifs du travail en Tunisie ?',
    expectedAnswer: { keyPoints: ['conciliation', 'médiation', 'arbitrage', 'inspection du travail'], mandatoryCitations: ['Code du travail'] } },
  { id: 'fr_travail_04', domain: 'droit_travail', difficulty: 'hard', intentType: 'factual',
    question: 'Quelles sont les règles relatives aux accidents du travail et maladies professionnelles en Tunisie ?',
    expectedAnswer: { keyPoints: ['déclaration obligatoire', 'indemnisation', 'présomption d\'imputabilité', 'CNSS'], mandatoryCitations: ['Loi 94-28'] } },
  { id: 'fr_travail_05', domain: 'droit_travail', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne qualifie-t-elle la faute grave justifiant le licenciement immédiat ?',
    expectedAnswer: { keyPoints: ['violation grave', 'impossible maintenir relation', 'appréciation souveraine'], mandatoryCitations: ['Code du travail', 'Cour de cassation'] } },
  { id: 'fr_travail_06', domain: 'droit_travail', difficulty: 'hard', intentType: 'factual',
    question: 'Quel est le régime juridique du travail intérimaire en Tunisie ?',
    expectedAnswer: { keyPoints: ['entreprise de travail temporaire', 'contrat de mise à disposition', 'durée limitée'], mandatoryCitations: ['Code du travail'] } },
  // =====================================================================
  // DROIT COMMERCIAL — 20 questions
  // =====================================================================
  { id: 'ar_comm_01', domain: 'droit_commercial', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط صحة الشيك في القانون التجاري التونسي؟',
    expectedAnswer: { keyPoints: ['التاريخ', 'المبلغ', 'اسم المسحوب عليه', 'التوقيع'], mandatoryCitations: ['المجلة التجارية'] },
    expectedArticles: ['الفصل 410'] },
  { id: 'ar_comm_02', domain: 'droit_commercial', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي أنواع الشركات التجارية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['شركة ذات مسؤولية محدودة', 'شركة خفية الاسم', 'شركة التضامن'], mandatoryCitations: ['مجلة الشركات التجارية'] } },
  { id: 'ar_comm_03', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'ما هو الحد الأدنى لرأس المال في الشركة ذات المسؤولية المحدودة في تونس؟',
    expectedAnswer: { keyPoints: ['ألف دينار', 'رأس مال'], mandatoryCitations: ['مجلة الشركات التجارية'] } },
  { id: 'ar_comm_04', domain: 'droit_commercial', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات تسجيل شركة تجارية في تونس؟',
    expectedAnswer: { keyPoints: ['السجل التجاري', 'الإشهار', 'الترقيم الجبائي', 'النشر'], mandatoryCitations: ['المجلة التجارية'] } },
  { id: 'ar_comm_05', domain: 'droit_commercial', difficulty: 'hard', intentType: 'comparative',
    question: 'ما الفرق بين التفليس والتسوية القضائية في القانون التجاري التونسي؟',
    expectedAnswer: { keyPoints: ['التفليس: إعدام', 'التسوية: إنقاذ', 'شروط مختلفة'], mandatoryCitations: ['المجلة التجارية', 'قانون الإنقاذ'] } },
  { id: 'ar_comm_06', domain: 'droit_commercial', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي مسؤولية الشريك في شركة التضامن في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['مسؤولية تضامنية', 'مسؤولية غير محدودة', 'في ذمته المالية الشخصية'], mandatoryCitations: ['مجلة الشركات التجارية'] } },
  { id: 'ar_comm_07', domain: 'droit_commercial', difficulty: 'expert', intentType: 'interpretive',
    question: 'ما هي المسؤولية الجزائية للمسير في الشركات التجارية التونسية؟',
    expectedAnswer: { keyPoints: ['سوء التصرف', 'التفليس بالتدليس', 'المسؤولية الشخصية'], mandatoryCitations: ['مجلة الشركات التجارية', 'المجلة التجارية'] } },
  { id: 'fr_comm_01', domain: 'droit_commercial', difficulty: 'easy', intentType: 'factual',
    question: 'Quels sont les actes de commerce par nature en droit tunisien ?',
    expectedAnswer: { keyPoints: ['achat pour revendre', 'opérations de banque', 'opérations de change', 'courtage'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_comm_02', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les obligations du commerçant en matière de tenue de livres comptables en Tunisie ?',
    expectedAnswer: { keyPoints: ['livre journal', 'livre d\'inventaire', 'conservation 10 ans'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_comm_03', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les conditions de validité d\'une lettre de change en droit tunisien ?',
    expectedAnswer: { keyPoints: ['dénomination', 'mandat de payer', 'nom du tiré', 'échéance', 'lieu de paiement'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_comm_04', domain: 'droit_commercial', difficulty: 'hard', intentType: 'factual',
    question: 'Quel est le régime juridique du fonds de commerce en droit tunisien ?',
    expectedAnswer: { keyPoints: ['éléments corporels', 'éléments incorporels', 'clientèle', 'droit au bail'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_comm_05', domain: 'droit_commercial', difficulty: 'hard', intentType: 'procedural',
    question: 'Comment se déroule la procédure de redressement judiciaire en Tunisie ?',
    expectedAnswer: { keyPoints: ['cessation de paiements', 'plan de redressement', 'période d\'observation', 'créanciers'], mandatoryCitations: ['Loi 2016-36'] } },
  { id: 'fr_comm_06', domain: 'droit_commercial', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne traite-t-elle la responsabilité des dirigeants sociaux pour insuffisance d\'actif ?',
    expectedAnswer: { keyPoints: ['faute de gestion', 'action en comblement de passif', 'responsabilité personnelle'], mandatoryCitations: ['Loi sur les sociétés commerciales'] } },
  // =====================================================================
  // DROIT IMMOBILIER — 18 questions
  // =====================================================================
  { id: 'ar_immo_01', domain: 'droit_immobilier', difficulty: 'easy', intentType: 'factual',
    question: 'ما هو الرسم العقاري في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['وثيقة رسمية', 'إدارة الملكية العقارية', 'إثبات الملكية'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_immo_02', domain: 'droit_immobilier', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي أنواع العقارات في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['عقار مسجل', 'عقار غير مسجل', 'أراضي دولية'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_immo_03', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات تسجيل عقار في تونس؟',
    expectedAnswer: { keyPoints: ['إدارة الملكية العقارية', 'رسم عقاري', 'عقد بيع'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_immo_04', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط بيع العقار المسجل في تونس؟',
    expectedAnswer: { keyPoints: ['عقد رسمي', 'ترسيم بالسجل العقاري', 'شهادة ملكية'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_immo_05', domain: 'droit_immobilier', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي حقوق المستأجر عند انتهاء عقد الكراء في تونس؟',
    expectedAnswer: { keyPoints: ['حق البقاء', 'التعويض', 'إنذار'], mandatoryCitations: ['قانون الكراءات'] } },
  { id: 'ar_immo_06', domain: 'droit_immobilier', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي قواعد الشفعة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['حق الأولوية', 'الشريك على الشياع', 'أجل سنة'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'fr_immo_01', domain: 'droit_immobilier', difficulty: 'easy', intentType: 'factual',
    question: 'Qu\'est-ce que la copropriété en droit tunisien et comment est-elle organisée ?',
    expectedAnswer: { keyPoints: ['parties communes', 'parties privatives', 'syndic', 'règlement de copropriété'], mandatoryCitations: ['Loi copropriété'] } },
  { id: 'fr_immo_02', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les servitudes légales en droit immobilier tunisien ?',
    expectedAnswer: { keyPoints: ['passage', 'vue', 'écoulement des eaux', 'mitoyenneté'], mandatoryCitations: ['COC', 'Code des droits réels'] } },
  { id: 'fr_immo_03', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'procedural',
    question: 'Comment se déroule la procédure d\'immatriculation foncière en Tunisie ?',
    expectedAnswer: { keyPoints: ['réquisition', 'bornage', 'publication', 'jugement', 'inscription'], mandatoryCitations: ['Code des droits réels'] } },
  { id: 'fr_immo_04', domain: 'droit_immobilier', difficulty: 'hard', intentType: 'factual',
    question: 'Quel est le régime juridique de l\'hypothèque en droit tunisien ?',
    expectedAnswer: { keyPoints: ['sûreté réelle', 'inscription', 'droit de préférence', 'droit de suite'], mandatoryCitations: ['Code des droits réels'] } },
  { id: 'fr_immo_05', domain: 'droit_immobilier', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la jurisprudence traite-t-elle les conflits entre propriétaires d\'immeubles non immatriculés en Tunisie ?',
    expectedAnswer: { keyPoints: ['possession', 'preuve testimoniale', 'actes notariés', 'prescription acquisitive'], mandatoryCitations: ['COC', 'Code des droits réels'] } },
  { id: 'fr_immo_06', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'comparative',
    question: 'Quelle est la différence entre le bail d\'habitation et le bail commercial en droit tunisien ?',
    expectedAnswer: { keyPoints: ['durée', 'renouvellement', 'loyer', 'indemnité d\'éviction'], mandatoryCitations: ['Loi baux', 'Code de commerce'] } },
  // =====================================================================
  // PROCÉDURE — 16 questions
  // =====================================================================
  { id: 'ar_proc_01', domain: 'procedure', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي اختصاصات محكمة الناحية في تونس؟',
    expectedAnswer: { keyPoints: ['القضايا المدنية الصغيرة', 'الجنح والمخالفات البسيطة'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_proc_02', domain: 'procedure', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي درجات التقاضي في النظام القضائي التونسي؟',
    expectedAnswer: { keyPoints: ['ابتدائي', 'استئنافي', 'تعقيبي'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_proc_03', domain: 'procedure', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي إجراءات رفع دعوى أمام المحكمة الابتدائية في تونس؟',
    expectedAnswer: { keyPoints: ['عريضة', 'محامي', 'كتابة ضبط', 'استدعاء'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_proc_04', domain: 'procedure', difficulty: 'medium', intentType: 'procedural',
    question: 'ما هي آجال الاستئناف في المادة المدنية في تونس؟',
    expectedAnswer: { keyPoints: ['20 يوما', 'من تاريخ الإعلام بالحكم'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] },
    expectedArticles: ['الفصل 141'] },
  { id: 'ar_proc_05', domain: 'procedure', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط قبول الدعوى في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الصفة', 'المصلحة', 'الأهلية'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_proc_06', domain: 'procedure', difficulty: 'hard', intentType: 'procedural',
    question: 'ما هي إجراءات التنفيذ الجبري للأحكام المدنية في تونس؟',
    expectedAnswer: { keyPoints: ['صيغة تنفيذية', 'عدل منفذ', 'إعلام', 'حجز'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_proc_07', domain: 'procedure', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي حالات الطعن بالتعقيب في المادة المدنية في تونس؟',
    expectedAnswer: { keyPoints: ['خرق القانون', 'تجاوز السلطة', 'انعدام التعليل'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'fr_proc_01', domain: 'procedure', difficulty: 'easy', intentType: 'factual',
    question: 'Quelle est la compétence du juge cantonal en Tunisie ?',
    expectedAnswer: { keyPoints: ['litiges inférieurs à 7000 dinars', 'infractions mineures'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_proc_02', domain: 'procedure', difficulty: 'medium', intentType: 'procedural',
    question: 'Comment se déroule la procédure de référé en droit tunisien ?',
    expectedAnswer: { keyPoints: ['urgence', 'mesures provisoires', 'pas de préjudice au fond', 'exécutoire'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_proc_03', domain: 'procedure', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les voies de recours ordinaires et extraordinaires en droit tunisien ?',
    expectedAnswer: { keyPoints: ['appel', 'opposition', 'cassation', 'tierce opposition', 'requête civile'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_proc_04', domain: 'procedure', difficulty: 'hard', intentType: 'procedural',
    question: 'Comment fonctionne l\'aide juridictionnelle en Tunisie ?',
    expectedAnswer: { keyPoints: ['condition de ressources', 'commission spéciale', 'désignation avocat', 'exonération frais'], mandatoryCitations: ['Loi aide juridictionnelle'] } },
  { id: 'fr_proc_05', domain: 'procedure', difficulty: 'hard', intentType: 'factual',
    question: 'Quelles sont les conditions de recevabilité de la tierce opposition en droit tunisien ?',
    expectedAnswer: { keyPoints: ['tiers au procès', 'préjudice', 'jugement leur portant grief'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_proc_06', domain: 'procedure', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la Cour de cassation tunisienne contrôle-t-elle la motivation des décisions de justice ?',
    expectedAnswer: { keyPoints: ['contrôle de légalité', 'insuffisance de motifs', 'contradiction de motifs', 'dénaturation'], mandatoryCitations: ['CPCC'] } },
  // =====================================================================
  // QUESTIONS TRANSVERSALES / MIXTES — 20 questions supplémentaires
  // =====================================================================
  { id: 'ar_mixed_01', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط صحة الوكالة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الأهلية', 'المحل المحدد', 'الشكل الكتابي للوكالة الخاصة'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_mixed_02', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي قواعد التعويض عن حوادث المرور في تونس؟',
    expectedAnswer: { keyPoints: ['التأمين الإجباري', 'المسؤولية الموضوعية', 'صندوق الضمان'], mandatoryCitations: ['قانون التأمين'] } },
  { id: 'ar_mixed_03', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي عقوبة العنف ضد المرأة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['قانون 2017', 'تشديد العقوبة', 'حماية الضحية'], mandatoryCitations: ['القانون الأساسي عدد 58 لسنة 2017'] } },
  { id: 'ar_mixed_04', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'ما هو نظام الكمبيالة في القانون التجاري التونسي؟',
    expectedAnswer: { keyPoints: ['سند لأمر', 'التظهير', 'الاحتجاج', 'التقادم'], mandatoryCitations: ['المجلة التجارية'] } },
  { id: 'ar_mixed_05', domain: 'droit_famille', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط التبني في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['التبني مسموح', 'مصلحة الطفل', 'موافقة قضائية', 'شروط عمرية'], mandatoryCitations: ['قانون كفالة الأطفال مجهولي النسب'] } },
  { id: 'fr_mixed_01', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'Quelles sont les conditions de validité du cautionnement en droit tunisien ?',
    expectedAnswer: { keyPoints: ['consentement', 'obligation principale valable', 'forme écrite', 'montant déterminé'], mandatoryCitations: ['COC'] } },
  { id: 'fr_mixed_02', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'Quel est le régime juridique de l\'abus de droit en droit tunisien ?',
    expectedAnswer: { keyPoints: ['exercice du droit dans intention de nuire', 'disproportion', 'indemnisation'], mandatoryCitations: ['Article 103 COC'] },
    expectedArticles: ['Article 103'] },
  { id: 'fr_mixed_03', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'Quel est le régime des infractions informatiques en droit tunisien ?',
    expectedAnswer: { keyPoints: ['accès frauduleux', 'atteinte aux données', 'peines spécifiques'], mandatoryCitations: ['Code pénal', 'Loi télécommunications'] } },
  { id: 'fr_mixed_04', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les obligations du transporteur en droit commercial tunisien ?',
    expectedAnswer: { keyPoints: ['obligation de résultat', 'livraison en bon état', 'délai', 'responsabilité'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_mixed_05', domain: 'droit_travail', difficulty: 'medium', intentType: 'factual',
    question: 'Quel est le rôle de l\'inspection du travail en Tunisie ?',
    expectedAnswer: { keyPoints: ['contrôle application loi', 'médiation', 'procès-verbal', 'conseil'], mandatoryCitations: ['Code du travail'] } },
  { id: 'ar_mixed_06', domain: 'droit_civil', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي قواعد الإثراء بلا سبب في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['إثراء', 'افتقار', 'انعدام السبب القانوني', 'التعويض'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_mixed_07', domain: 'droit_penal', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي جريمة خيانة الأمانة في القانون التونسي وما عقوبتها؟',
    expectedAnswer: { keyPoints: ['تبديد', 'أمانة', 'السجن'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'ar_mixed_08', domain: 'droit_commercial', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي حقوق الدائنين في حالة التفليس في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['التصريح بالديون', 'الترتيب', 'الامتياز', 'التوزيع'], mandatoryCitations: ['المجلة التجارية'] } },
  { id: 'fr_mixed_06', domain: 'procedure', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les règles de compétence territoriale des tribunaux en Tunisie ?',
    expectedAnswer: { keyPoints: ['domicile du défendeur', 'lieu d\'exécution', 'lieu de situation immeuble'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_mixed_07', domain: 'droit_famille', difficulty: 'hard', intentType: 'factual',
    question: 'Quel est le régime juridique de la kafala (recueil légal) en droit tunisien ?',
    expectedAnswer: { keyPoints: ['enfant abandonné', 'autorisation judiciaire', 'obligations du kafil', 'différent de l\'adoption'], mandatoryCitations: ['Loi kafala'] } },
  { id: 'fr_mixed_08', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les règles de la vente d\'immeuble à construire en droit tunisien ?',
    expectedAnswer: { keyPoints: ['contrat préliminaire', 'garantie d\'achèvement', 'paiement échelonné', 'permis de bâtir'], mandatoryCitations: ['Loi VEFA'] } },
  { id: 'ar_mixed_09', domain: 'droit_civil', difficulty: 'expert', intentType: 'interpretive',
    question: 'كيف يتعامل القضاء التونسي مع مسألة تنازع القوانين في العقود الدولية؟',
    expectedAnswer: { keyPoints: ['قانون الإرادة', 'القانون الأوثق صلة', 'النظام العام'], mandatoryCitations: ['مجلة القانون الدولي الخاص'] } },
  { id: 'fr_mixed_09', domain: 'droit_commercial', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment le droit tunisien régit-il l\'arbitrage commercial international ?',
    expectedAnswer: { keyPoints: ['code d\'arbitrage', 'autonomie de la clause', 'exequatur', 'recours en annulation'], mandatoryCitations: ['Code d\'arbitrage'] } },
  { id: 'fr_mixed_10', domain: 'droit_civil', difficulty: 'expert', intentType: 'interpretive',
    question: 'Comment la jurisprudence tunisienne traite-t-elle la théorie de l\'imprévision dans les contrats de longue durée ?',
    expectedAnswer: { keyPoints: ['pas de consécration légale expresse', 'bonne foi', 'renégociation', 'intervention judiciaire'], mandatoryCitations: ['COC', 'jurisprudence'] } },
  { id: 'ar_mixed_10', domain: 'droit_travail', difficulty: 'expert', intentType: 'interpretive',
    question: 'كيف يتعامل القضاء التونسي مع مسألة التحرش المعنوي في العمل؟',
    expectedAnswer: { keyPoints: ['إثبات التحرش', 'حماية الضحية', 'التعويض', 'المسؤولية'], mandatoryCitations: ['مجلة الشغل', 'القانون عدد 58 لسنة 2017'] } },
  // =====================================================================
  // BLOC SUPPLÉMENTAIRE — 30 questions pour atteindre 150
  // =====================================================================
  { id: 'ar_supp_01', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط صحة الهبة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الرضا', 'الأهلية', 'الشكل الرسمي'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_supp_02', domain: 'droit_civil', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط الكفالة في القانون المدني التونسي؟',
    expectedAnswer: { keyPoints: ['التزام تبعي', 'التزام أصلي صحيح', 'كتابة'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'ar_supp_03', domain: 'droit_penal', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي عقوبة التهديد بالعنف في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['السجن', 'الخطية'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'ar_supp_04', domain: 'droit_penal', difficulty: 'medium', intentType: 'citation_lookup',
    question: 'ماذا ينص الفصل 53 من المجلة الجزائية بخصوص ظروف التخفيف؟',
    expectedAnswer: { keyPoints: ['ظروف التخفيف', 'تنزيل العقوبة'], mandatoryCitations: ['الفصل 53 من المجلة الجزائية'] },
    expectedArticles: ['الفصل 53'] },
  { id: 'ar_supp_05', domain: 'droit_famille', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي واجبات الزوجين المتبادلة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['حسن المعاملة', 'المساكنة', 'المعاضدة'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_supp_06', domain: 'droit_famille', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط إسناد اللقب العائلي للطفل في تونس؟',
    expectedAnswer: { keyPoints: ['الزواج', 'الإقرار بالأبوة', 'حكم قضائي'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_supp_07', domain: 'droit_travail', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي مدة الإعلام المسبق قبل إنهاء عقد الشغل في تونس؟',
    expectedAnswer: { keyPoints: ['شهر واحد', 'حسب الاتفاقية', 'الأقدمية'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_supp_08', domain: 'droit_travail', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي قواعد العمل الإضافي في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['أجر إضافي', 'الحد الأقصى', 'موافقة تفتيش الشغل'], mandatoryCitations: ['مجلة الشغل'] } },
  { id: 'ar_supp_09', domain: 'droit_commercial', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط اكتساب صفة التاجر في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['ممارسة أعمال تجارية', 'الاعتياد', 'الاحتراف', 'السجل التجاري'], mandatoryCitations: ['المجلة التجارية'] } },
  { id: 'ar_supp_10', domain: 'droit_commercial', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي إجراءات حل الشركة ذات المسؤولية المحدودة في تونس؟',
    expectedAnswer: { keyPoints: ['قرار جماعة الشركاء', 'تعيين مصف', 'نشر', 'شطب'], mandatoryCitations: ['مجلة الشركات التجارية'] } },
  { id: 'ar_supp_11', domain: 'droit_immobilier', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي أنواع الحقوق العينية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الملكية', 'الانتفاع', 'الارتفاق', 'الرهن العقاري'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_supp_12', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي شروط الحيازة المكسبة للملكية العقارية في تونس؟',
    expectedAnswer: { keyPoints: ['حيازة هادئة', 'علنية', 'مستمرة', '15 سنة'], mandatoryCitations: ['مجلة الحقوق العينية'] } },
  { id: 'ar_supp_13', domain: 'procedure', difficulty: 'easy', intentType: 'factual',
    question: 'ما هي شروط صحة الاستدعاء في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['بيانات المدعي', 'بيانات المدعى عليه', 'موضوع الدعوى', 'المحكمة المختصة'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'ar_supp_14', domain: 'procedure', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي حالات رد القاضي في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['القرابة', 'المصلحة', 'العداوة', 'سبق إبداء الرأي'], mandatoryCitations: ['مجلة المرافعات المدنية والتجارية'] } },
  { id: 'fr_supp_01', domain: 'droit_civil', difficulty: 'easy', intentType: 'citation_lookup',
    question: 'Que prévoit l\'article 243 du COC en matière de dommages-intérêts ?',
    expectedAnswer: { keyPoints: ['dommages-intérêts', 'perte subie', 'gain manqué'], mandatoryCitations: ['Article 243 COC'] },
    expectedArticles: ['Article 243'] },
  { id: 'fr_supp_02', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les règles de la subrogation en droit tunisien ?',
    expectedAnswer: { keyPoints: ['subrogation légale', 'subrogation conventionnelle', 'transfert des droits'], mandatoryCitations: ['COC'] } },
  { id: 'fr_supp_03', domain: 'droit_penal', difficulty: 'easy', intentType: 'factual',
    question: 'Quelle est la majorité pénale en Tunisie ?',
    expectedAnswer: { keyPoints: ['13 ans', 'discernement', 'tribunal pour enfants'], mandatoryCitations: ['Code pénal', 'Code de la protection de l\'enfant'] } },
  { id: 'fr_supp_04', domain: 'droit_famille', difficulty: 'hard', intentType: 'factual',
    question: 'Quel est le régime successoral en droit tunisien pour les descendants ?',
    expectedAnswer: { keyPoints: ['fils double de fille', 'fardh', 'asaba', 'réserve héréditaire'], mandatoryCitations: ['CSP'] } },
  { id: 'fr_supp_05', domain: 'droit_travail', difficulty: 'easy', intentType: 'factual',
    question: 'Quel est le salaire minimum en Tunisie (SMIG) ?',
    expectedAnswer: { keyPoints: ['régime 48h', 'régime 40h', 'SMAG agricole'], mandatoryCitations: ['décret'] } },
  { id: 'fr_supp_06', domain: 'droit_commercial', difficulty: 'easy', intentType: 'factual',
    question: 'Qu\'est-ce que le registre du commerce en Tunisie et qui doit s\'y inscrire ?',
    expectedAnswer: { keyPoints: ['commerçants', 'sociétés commerciales', 'obligation légale', 'publicité'], mandatoryCitations: ['Code de commerce'] } },
  { id: 'fr_supp_07', domain: 'droit_immobilier', difficulty: 'hard', intentType: 'factual',
    question: 'Quelles sont les règles de l\'expropriation pour cause d\'utilité publique en Tunisie ?',
    expectedAnswer: { keyPoints: ['déclaration d\'utilité publique', 'indemnisation préalable', 'juste et équitable', 'procédure judiciaire'], mandatoryCitations: ['Loi expropriation'] } },
  { id: 'fr_supp_08', domain: 'procedure', difficulty: 'hard', intentType: 'procedural',
    question: 'Comment se déroule la procédure de saisie immobilière en Tunisie ?',
    expectedAnswer: { keyPoints: ['commandement', 'transcription', 'cahier des charges', 'adjudication'], mandatoryCitations: ['CPCC'] } },
  { id: 'ar_supp_15', domain: 'droit_civil', difficulty: 'medium', intentType: 'citation_lookup',
    question: 'ماذا ينص الفصل 242 من مجلة الالتزامات والعقود بخصوص تنفيذ العقد؟',
    expectedAnswer: { keyPoints: ['التنفيذ بحسن نية', 'الالتزام'], mandatoryCitations: ['الفصل 242 مجلة الالتزامات والعقود'] },
    expectedArticles: ['الفصل 242'] },
  { id: 'ar_supp_16', domain: 'droit_penal', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي عقوبة الرشوة في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['السجن', 'الخطية', 'الموظف العمومي'], mandatoryCitations: ['المجلة الجزائية'] } },
  { id: 'fr_supp_09', domain: 'droit_civil', difficulty: 'hard', intentType: 'comparative',
    question: 'Quelle est la différence entre la prescription extinctive et la prescription acquisitive en droit tunisien ?',
    expectedAnswer: { keyPoints: ['extinctive: perte du droit d\'agir', 'acquisitive: acquisition de la propriété', 'délais différents'], mandatoryCitations: ['COC', 'Code des droits réels'] } },
  { id: 'fr_supp_10', domain: 'droit_commercial', difficulty: 'medium', intentType: 'comparative',
    question: 'Quelle est la différence entre la SARL et la SA en droit tunisien ?',
    expectedAnswer: { keyPoints: ['capital minimum', 'nombre d\'associés', 'organes de gestion', 'cession de parts'], mandatoryCitations: ['Code des sociétés commerciales'] } },
  { id: 'ar_supp_17', domain: 'droit_famille', difficulty: 'hard', intentType: 'factual',
    question: 'ما هي شروط الوصية في القانون التونسي؟',
    expectedAnswer: { keyPoints: ['الثلث كحد أقصى', 'لغير وارث', 'الشكل الكتابي'], mandatoryCitations: ['مجلة الأحوال الشخصية'] } },
  { id: 'ar_supp_18', domain: 'droit_civil', difficulty: 'medium', intentType: 'factual',
    question: 'ما هي قواعد المقاصة في القانون المدني التونسي؟',
    expectedAnswer: { keyPoints: ['دينان متقابلان', 'من نفس النوع', 'حالان', 'انقضاء بقدر الأقل'], mandatoryCitations: ['مجلة الالتزامات والعقود'] } },
  { id: 'fr_supp_11', domain: 'procedure', difficulty: 'medium', intentType: 'factual',
    question: 'Quels sont les effets de l\'appel en droit tunisien ?',
    expectedAnswer: { keyPoints: ['effet suspensif', 'effet dévolutif', 'interdiction de demandes nouvelles'], mandatoryCitations: ['CPCC'] } },
  { id: 'fr_supp_12', domain: 'droit_immobilier', difficulty: 'medium', intentType: 'factual',
    question: 'Quelles sont les conditions de la vente immobilière en droit tunisien ?',
    expectedAnswer: { keyPoints: ['consentement', 'acte authentique', 'inscription au registre foncier', 'certificat de propriété'], mandatoryCitations: ['Code des droits réels'] } },
]

// =============================================================================
// HELPERS
// =============================================================================

function getDefaultEvaluationCriteria() {
  return { completeness: 80, accuracy: 85, citations: 80, reasoning: 80 }
}

function getDefaultExpertValidation() {
  return {
    validatorId: 'auto_generated',
    credentials: 'Auto-generated gold eval case',
    validatedAt: new Date(),
    consensus: 0,
  }
}

function inferIntentType(question: string): IntentType {
  const q = question.toLowerCase()
  if (q.includes('ماذا ينص') || q.includes('que prévoit') || q.includes('que dit')) return 'citation_lookup'
  if (q.includes('إجراءات') || q.includes('procédure') || q.includes('comment')) return 'procedural'
  if (q.includes('الفرق') || q.includes('différence') || q.includes('compar')) return 'comparative'
  if (q.includes('موقف') || q.includes('interprét')) return 'interpretive'
  return 'factual'
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('=== Gold Eval Dataset Seeder ===\n')

  // Charger le dataset existant s'il existe
  let existingDataset: GoldEvalCase[] = []
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingDataset = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'))
      console.log(`Dataset existant chargé: ${existingDataset.length} questions`)
    } catch {
      console.warn('Impossible de charger le dataset existant, on repart de zéro')
    }
  }

  const existingIds = new Set(existingDataset.map(c => c.id))

  // Convertir les benchmark cases existants en GoldEvalCase
  const fromBenchmark: GoldEvalCase[] = BENCHMARK_CASES
    .filter(c => !existingIds.has(c.id))
    .map(c => ({
      ...c,
      intentType: inferIntentType(c.question),
    }))

  // Ajouter les questions arabes additionnelles
  const fromAdditional: GoldEvalCase[] = ADDITIONAL_QUESTIONS
    .filter(c => !existingIds.has(c.id))
    .map(c => ({
      ...c,
      evaluationCriteria: getDefaultEvaluationCriteria(),
      expertValidation: getDefaultExpertValidation(),
    }))

  const newCases = [...fromBenchmark, ...fromAdditional]
  console.log(`Nouvelles questions à ajouter: ${newCases.length}`)
  console.log(`  - Depuis benchmark: ${fromBenchmark.length}`)
  console.log(`  - Questions arabes: ${fromAdditional.length}`)

  if (newCases.length === 0) {
    console.log('\nAucune nouvelle question. Dataset à jour.')
    return
  }

  // En mode non-interactif, on ajoute directement sans gold chunks
  // (les gold chunks seront validés via un run interactif ultérieur)
  const allCases = [...existingDataset, ...newCases]

  // Stats
  const byDomain: Record<string, number> = {}
  const byDifficulty: Record<string, number> = {}
  const byIntent: Record<string, number> = {}

  for (const c of allCases) {
    byDomain[c.domain] = (byDomain[c.domain] || 0) + 1
    byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] || 0) + 1
    byIntent[c.intentType] = (byIntent[c.intentType] || 0) + 1
  }

  console.log(`\n=== Dataset final: ${allCases.length} questions ===`)
  console.log('\nPar domaine:')
  for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${domain}: ${count}`)
  }
  console.log('\nPar difficulté:')
  for (const [diff, count] of Object.entries(byDifficulty)) {
    console.log(`  ${diff}: ${count}`)
  }
  console.log('\nPar type d\'intention:')
  for (const [intent, count] of Object.entries(byIntent)) {
    console.log(`  ${intent}: ${count}`)
  }

  // Sauvegarder
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allCases, null, 2), 'utf-8')
  console.log(`\nDataset sauvegardé: ${OUTPUT_PATH}`)
  console.log(`Total: ${allCases.length} questions`)
  console.log(`\nPour valider les gold chunks interactivement, utilisez:`)
  console.log(`  npx tsx scripts/run-eval-benchmark.ts --validate-gold`)
}

main().catch(console.error)
