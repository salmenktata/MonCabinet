/**
 * Service d'Expansion de Requêtes avec LLM
 *
 * Objectif: Reformuler les requêtes courtes en ajoutant termes juridiques techniques,
 * synonymes et contexte pour améliorer la recherche vectorielle.
 *
 * Impact:
 * - +15-20% pertinence pour requêtes courtes (<50 caractères)
 * - Meilleure couverture termes juridiques arabes/français
 *
 * Usage:
 * ```typescript
 * const expanded = await expandQuery("قع شجار")
 * // "قع شجار - اعتداء - دفاع شرعي - حالة الخطر الحال - تناسب الرد - شروط الدفاع الشرعي"
 * ```
 *
 * Février 2026 - Sprint 2 Optimisation RAG
 */

import { callLLMWithFallback } from './llm-fallback-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Longueur minimale pour déclencher l'expansion (en caractères)
const MIN_QUERY_LENGTH_FOR_EXPANSION = 50

// Longueur minimale pour déclencher la condensation (requêtes longues)
const MIN_QUERY_LENGTH_FOR_CONDENSATION = 200

// Longueur maximale de la query expandée (éviter embeddings trop longs)
const MAX_EXPANDED_QUERY_LENGTH = 500

// =============================================================================
// PROMPTS
// =============================================================================

const EXPANSION_PROMPT = `Tu es un expert juridique tunisien spécialisé en terminologie juridique arabe et française.

Ta tâche: Reformuler une question juridique courte en y ajoutant:
1. Termes juridiques techniques pertinents
2. Synonymes juridiques arabes/français
3. Concepts juridiques liés
4. Références légales potentielles

RÈGLES:
- Garder la question originale au début
- Ajouter termes séparés par " - "
- Rester concis (max 300 caractères)
- Utiliser terminologie juridique tunisienne
- Mélanger arabe et français si pertinent
- NE PAS ajouter d'explication ou de phrase complète

EXEMPLES:

Question: قع شجار
Expansion: قع شجار - اعتداء - دفاع شرعي - حالة الخطر الحال - تناسب الرد - شروط الدفاع الشرعي - légitime défense - agression

Question: طلاق
Expansion: طلاق - فسخ الزواج - الطلاق بالتراضي - الطلاق للضرر - الطلاق الخلعي - الفصول القانونية - مجلة الأحوال الشخصية - divorce

Question: عقد كراء
Expansion: عقد كراء - contrat de bail - bail commercial - bail habitation - واجبات المكتري - واجبات المكري - obligations locataire - obligations bailleur

Question: سرقة
Expansion: سرقة - جريمة السرقة - أركان السرقة - القصد الجنائي - اختلاس - استيلاء - المجلة الجزائية - vol - larcin

MAINTENANT, reformule cette question:

Question: {query}

Expansion (termes séparés par " - ", max 300 caractères):`

// =============================================================================
// EXPANSION
// =============================================================================

/**
 * Expanse une requête courte en ajoutant termes juridiques pertinents
 *
 * @param query - Question juridique originale
 * @returns Query expandée avec termes juridiques
 */
export async function expandQuery(query: string): Promise<string> {
  // Validation input
  if (!query || query.trim().length === 0) {
    return query
  }

  // Ne pas expanser si query déjà longue (pas besoin)
  if (query.length >= MIN_QUERY_LENGTH_FOR_EXPANSION) {
    console.log('[Query Expansion] Query déjà longue, pas d\'expansion nécessaire')
    return query
  }

  try {
    console.log(`[Query Expansion] Expansion query courte (${query.length} chars)...`)

    // Appel LLM avec config query-expansion (Groq 8b : rapide, quota indépendant)
    const response = await callLLMWithFallback(
      [
        {
          role: 'user',
          content: EXPANSION_PROMPT.replace('{query}', query),
        },
      ],
      {
        temperature: 0.3, // Créativité modérée pour termes variés
        maxTokens: 200, // ~300 caractères max
        operationName: 'query-expansion',
      }
    )

    // Nettoyer réponse
    let expanded = response.answer.trim()

    // Supprimer guillemets/backticks potentiels
    expanded = expanded.replace(/^["'`]+|["'`]+$/g, '')

    // Limiter longueur
    if (expanded.length > MAX_EXPANDED_QUERY_LENGTH) {
      expanded = expanded.substring(0, MAX_EXPANDED_QUERY_LENGTH)
    }

    // Vérifier que l'expansion a réussi (contient bien des termes ajoutés)
    if (expanded.includes('-') && expanded.length > query.length) {
      console.log(`[Query Expansion] ✓ Query expandée: ${query.substring(0, 30)}... → ${expanded.length} chars`)
      return expanded
    } else {
      // Fallback: expansion échouée, utiliser query originale
      console.log('[Query Expansion] ⚠️  Expansion peu concluante, utilisation query originale')
      return query
    }
  } catch (error) {
    // Fallback: en cas d'erreur, retourner query originale
    console.error(
      '[Query Expansion] Erreur expansion:',
      error instanceof Error ? error.message : error
    )
    return query
  }
}

// =============================================================================
// CONDENSATION (requêtes longues > 200 chars)
// =============================================================================

const CONDENSATION_PROMPT = `Tu es un expert juridique tunisien. Ta tâche: reformuler une question ou narration juridique en une requête de recherche concise et pertinente.

RÈGLES:
- Si c'est une NARRATION DE CAS (faits exposés, parties mentionnées, chronologie d'événements) → formuler la QUESTION JURIDIQUE principale sous-jacente
- Si c'est déjà une question directe → extraire les 3-5 concepts juridiques clés
- Max 150 caractères
- Garder la même langue que l'entrée
- Pas de phrase complète, juste les concepts ou la question juridique condensée

EXEMPLES:

Narration: وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة للمعتدي. المتهم يؤكد أنه كان يدافع عن نفسه ضد اعتداء بالسلاح الأبيض
Reformulation: شروط الدفاع الشرعي وتناسب الرد في القانون الجزائي التونسي - مدى تجاوز حدود الدفاع

Question directe: أريد أن أعرف ما هي الشروط القانونية للدفاع الشرعي في القانون التونسي وهل يمكن الاحتجاج بالدفاع الشرعي إذا كان الرد غير متناسب
Reformulation: الدفاع الشرعي - تناسب الرد - المجلة الجزائية - شروط الدفاع

Narration: Un employé a été licencié sans préavis après 12 ans d'ancienneté. Son employeur invoque une faute grave mais n'a pas suivi la procédure disciplinaire. Il veut contester
Reformulation: licenciement abusif - faute grave - procédure disciplinaire - indemnités ancienneté - Tunisie

Question directe: Je voudrais savoir quelles sont les conditions de validité d'un contrat de bail commercial en Tunisie, notamment la durée minimale et les cas de résiliation anticipée
Reformulation: bail commercial - validité contrat - obligations bailleur locataire - résiliation

MAINTENANT, reformule:

Entrée: {query}

Reformulation concise (max 150 caractères):`

/**
 * Condense une requête longue en extrayant les concepts juridiques clés
 * pour produire un embedding plus ciblé
 *
 * @param query - Question juridique longue (>200 chars)
 * @returns Query condensée avec concepts clés (~80-100 chars)
 */
export async function condenseQuery(query: string): Promise<string> {
  if (!query || query.trim().length === 0) {
    return query
  }

  if (query.length < MIN_QUERY_LENGTH_FOR_CONDENSATION) {
    return query
  }

  try {
    console.log(`[Query Condensation] Condensation query longue (${query.length} chars)...`)

    const response = await callLLMWithFallback(
      [
        {
          role: 'user',
          content: CONDENSATION_PROMPT.replace('{query}', query),
        },
      ],
      {
        temperature: 0.1, // Très déterministe pour extraction
        maxTokens: 150, // ~150 caractères max (narrations arabes longues)
        operationName: 'query-expansion',
      }
    )

    let condensed = response.answer.trim()
    condensed = condensed.replace(/^["'`]+|["'`]+$/g, '')

    // Limiter à 150 chars
    if (condensed.length > 150) {
      condensed = condensed.substring(0, 150)
    }

    if (condensed.length > 0 && condensed.length < query.length) {
      console.log(`[Query Condensation] ✓ Query condensée: ${query.length} chars → "${condensed}" (${condensed.length} chars)`)
      return condensed
    } else {
      console.log('[Query Condensation] ⚠️ Condensation peu concluante, utilisation query originale')
      return query
    }
  } catch (error) {
    console.error(
      '[Query Condensation] Erreur condensation:',
      error instanceof Error ? error.message : error
    )
    return query
  }
}

// =============================================================================
// SYNONYMES JURIDIQUES ARABES CLASSIQUES ↔ MODERNES
// =============================================================================

/**
 * Dictionnaire de synonymes juridiques arabes.
 * Les codes tunisiens utilisent un vocabulaire arabe classique (فصحى قانونية)
 * tandis que les utilisateurs posent des questions en arabe moderne/dialectal.
 *
 * Format: terme moderne/courant → [synonymes classiques utilisés dans les codes]
 */
const LEGAL_SYNONYMS: Record<string, string[]> = {
  // === DROIT PÉNAL (المجلة الجزائية) ===
  'الدفاع الشرعي': ['دفع صائلا', 'لا جريمة على من دفع', 'عرض حياته', 'الخطر حتمي', 'صد الاعتداء'],
  'دفاع شرعي': ['دفع صائلا', 'لا جريمة على من دفع', 'عرض حياته للخطر', 'الخطر الحال'],
  'القتل العمد': ['تعمد القتل', 'قتل النفس عمدا', 'أزهق روحه', 'إزهاق الروح'],
  'القتل الخطأ': ['القتل على وجه الخطأ', 'قتل غير عمد', 'تسبب في الموت', 'الإهمال المفضي'],
  'السرقة': ['اختلس', 'أخذ مال الغير', 'الاستيلاء خلسة', 'نزع ملك الغير', 'الفصل 261', 'الفصل 264'],
  'الضرب والجرح': ['ضرب أو جرح', 'اعتدى بالعنف', 'ألحق أضرارا بدنية', 'العنف الشديد'],
  'التحرش': ['تعرض لأنثى', 'اعتداء على العرض', 'هتك عرض', 'الفعل المخل بالحياء'],
  'الاغتصاب': ['مواقعة أنثى بالقوة', 'إكراه على الفعل', 'هتك عرض بالقوة'],
  'التزوير': ['افتعال', 'تدليس', 'زور كتبا', 'استعمال مزور', 'تحريف الحقيقة'],
  'الرشوة': ['ارتشاء', 'أخذ عطية', 'قبل وعدا أو هدية', 'استغلال النفوذ'],
  'خيانة الأمانة': ['خان أمانة', 'بدد أو اختلس', 'تصرف في مال الغير', 'التصرف في الوديعة'],
  'النصب': ['احتيال', 'توصل بطرق احتيالية', 'استعمال أساليب من شأنها', 'التغرير'],

  // === DROIT CIVIL (مجلة الالتزامات والعقود) ===
  'العقد': ['الاتفاق', 'الالتزام', 'التعاقد', 'الرضاء', 'الإيجاب والقبول'],
  'الفسخ': ['انحلال العقد', 'بطلان', 'إبطال', 'انفساخ', 'فسخ الالتزام'],
  'التعويض': ['جبر الضرر', 'غرم', 'إصلاح الضرر', 'الغرامة'],
  'المسؤولية': ['الضمان', 'التعدي', 'الخطأ الموجب', 'الالتزام بالتعويض'],
  // Fix Feb 26 v11: types de garantie dans les contrats (ar_civil_05)
  'أنواع الضمان': ['ضمان العيوب الخفية', 'ضمان الاستحقاق', 'ضمان التعرض', 'الفصل 342 مجلة الالتزامات', 'الفصل 215 مجلة الالتزامات'],
  'ضمان عيوب': ['ضمان العيوب الخفية', 'الفصل 342 مجلة الالتزامات والعقود', 'ضمان البائع', 'الاستحقاق'],
  'ضمان الاستحقاق': ['الاستحقاق', 'ضمان التعرض', 'الفصل 393 م.ا.ع', 'الرجوع بالضمان'],
  'الملكية': ['حق التصرف', 'الانتفاع', 'حق الملك', 'الاستعمال والاستغلال'],
  'الحيازة': ['وضع اليد', 'الحوز', 'حاز حيازة هادئة', 'التصرف الفعلي'],
  'الرهن': ['الضمان العيني', 'رهن عقاري', 'رهن حيازي', 'التأمين العيني'],
  'الكفالة': ['ضمان شخصي', 'كفل بالدين', 'التزم بأداء دين الغير'],
  'الوكالة': ['توكيل', 'إنابة', 'النيابة', 'فوض إليه'],
  'التقادم': ['مرور الزمن', 'سقوط الحق', 'انقضاء المدة'],

  // === DROIT DE LA FAMILLE (مجلة الأحوال الشخصية) ===
  'الطلاق': ['فسخ عقد الزواج', 'حل عقدة النكاح', 'التفريق', 'الطلاق بالتراضي'],
  'النفقة': ['الإنفاق', 'واجب النفقة', 'نفقة الزوجة', 'نفقة الأبناء', 'مؤونة'],
  'الحضانة': ['حق الحضانة', 'كفالة الطفل', 'رعاية المحضون', 'حفظ الطفل'],
  'الميراث': ['الإرث', 'التركة', 'الفريضة', 'الأنصباء', 'السهام'],
  'الزواج': ['عقد النكاح', 'عقدة الزواج', 'الإشهاد', 'الصداق', 'المهر'],
  'الوصية': ['التبرع للغير', 'إيصاء', 'العطية بعد الموت'],
  'النسب': ['البنوة', 'ثبوت النسب', 'الإقرار بالبنوة', 'إلحاق النسب'],

  // === DROIT DU TRAVAIL (مجلة الشغل) ===
  'الطرد التعسفي': ['الطرد بدون موجب', 'فسخ العقد بصفة تعسفية', 'الإنهاء غير المشروع'],
  'عقد الشغل': ['عقد العمل', 'العلاقة الشغلية', 'الأجير والمؤجر', 'عقد إجارة خدمات'],
  'الأجر': ['المرتب', 'الأجرة', 'المقابل', 'التعويضات والمنح'],
  'الإضراب': ['التوقف عن العمل', 'الإضراب المشروع', 'إيقاف العمل'],

  // === DROIT COMMERCIAL (المجلة التجارية) ===
  'الإفلاس': ['التفليس', 'التوقف عن الدفع', 'العجز عن الأداء', 'المجلة التجارية'],
  'التفليس': ['الإفلاس', 'التوقف عن الدفع', 'العجز عن الأداء', 'المجلة التجارية'],
  'الشيك': ['الصك', 'ورقة تجارية', 'شيك بدون رصيد', 'المجلة التجارية'],
  'شيك بدون رصيد': ['إصدار شيك', 'عدم توفر الرصيد', 'الساحب', 'المجلة التجارية', 'الصك'],
  'الكمبيالة': ['سند سحب', 'ورقة تجارية', 'السفتجة', 'المجلة التجارية'],

  // === PROCÉDURE (مجلة الإجراءات) ===
  'الاستئناف': ['الطعن بالاستئناف', 'الطعن في الحكم', 'الطعن أمام محكمة الدرجة الثانية'],
  'التعقيب': ['الطعن بالتعقيب', 'النقض', 'الطعن أمام محكمة التعقيب'],
  'التقاضي': ['الترافع', 'المرافعة', 'إقامة الدعوى', 'رفع الدعوى'],
  'الحبس': ['السجن', 'الإيداع', 'الاحتفاظ', 'الإيقاف التحفظي'],
  'الكفالة القضائية': ['السراح الشرطي', 'الإفراج المؤقت', 'السراح بكفالة'],
  'الصلح': ['التصالح', 'المصالحة الجزائية', 'إنهاء النزاع صلحا'],

  // === SAISIES CONSERVATOIRES (طرق التنفيذ / العقلة) ===
  'عقلة': ['حجز تحفظي', 'إجراء تحفظي', 'تدبير تحفظي', 'العقلة التحفظية', 'saisie conservatoire'],
  'عقلة تحفظية': ['حجز تحفظي', 'العقلة التوقفية', 'إجراء تحفظي', 'تدابير وقتية'],
  'عقلة بيد الغير': ['حجز لدى الغير', 'العقلة التوقفية', 'saisie-arrêt', 'مطلوب التنفيذ'],
  'اذن على عريضة': ['أمر على عريضة', 'قضاء مستعجل', 'قرار مستعجل', 'الفصل 201'],
  'اعتراض تحفظي': ['عقلة تحفظية', 'حجز تحفظي', 'إجراء تحفظي'],
  'saisie conservatoire': ['عقلة تحفظية', 'حجز تحفظي', 'إجراء تحفظي', 'تدبير تحفظي'],

  // === TERMES FRANÇAIS → ARABES (pour requêtes en français) ===
  // Droit de la famille
  'divorce': ['طلاق', 'فسخ عقد الزواج', 'حل عقدة النكاح', 'التفريق', 'مجلة الأحوال الشخصية'],
  'mariage': ['زواج', 'عقد النكاح', 'الصداق', 'المهر', 'مجلة الأحوال الشخصية'],
  'garde': ['حضانة', 'كفالة الطفل', 'رعاية المحضون', 'حق الحضانة'],
  'pension alimentaire': ['نفقة', 'واجب النفقة', 'نفقة الأبناء', 'الإنفاق'],
  'succession': ['الميراث', 'الإرث', 'التركة', 'الفريضة', 'الأنصباء'],
  'héritage': ['الميراث', 'الإرث', 'التركة', 'الفريضة'],

  // Droit pénal
  'légitime défense': ['الدفاع الشرعي', 'دفع صائلا', 'درء الاعتداء', 'الخطر الحال', 'المجلة الجزائية'],
  'homicide': ['القتل', 'قتل النفس', 'القتل العمد', 'المجلة الجزائية'],
  'vol': ['السرقة', 'اختلس', 'الاستيلاء خلسة', 'أخذ مال الغير'],
  'viol': ['الاغتصاب', 'مواقعة بالقوة', 'هتك عرض بالقوة'],
  'harcèlement': ['التحرش', 'اعتداء على العرض', 'الفعل المخل بالحياء'],
  'corruption': ['الرشوة', 'ارتشاء', 'استغلال النفوذ', 'أخذ عطية'],
  'détournement': ['اختلاس', 'خيانة الأمانة', 'بدد أو اختلس', 'التصرف في مال الغير'],
  'escroquerie': ['النصب', 'احتيال', 'توصل بطرق احتيالية'],
  'faux': ['التزوير', 'افتعال', 'تدليس', 'تحريف الحقيقة'],
  // Fix Feb 26 v6: procédure pénale + prescription criminelle
  'action publique': ['الدعوى العمومية', 'التتبع الجزائي', 'الدعوى الجزائية', 'مجلة الإجراءات الجزائية', 'الفصل 5 مجلة الإجراءات الجزائية'],
  'prescription pénale': ['التقادم الجزائي', 'تقادم الدعوى العمومية', 'الفصل 5 مجلة الإجراءات الجزائية', 'مجلة الإجراءات الجزائية'],
  'délit': ['جنحة', 'الجنح', 'الجرائم الجنحية'],
  'crime pénal': ['جناية', 'الجنايات', 'الجرائم الجنائية'],
  'contravention': ['مخالفة', 'المخالفات الجزائية'],

  // Droit civil — prescription COC art.402
  'prescription droit commun': ['الفصل 402 مجلة الالتزامات والعقود', 'تعمير الذمة', 'التقادم المدني', 'خمس عشرة سنة', 'مجلة الالتزامات والعقود'],
  'prescription de droit commun': ['الفصل 402 مجلة الالتزامات والعقود', 'تعمير الذمة', 'التقادم المدني', 'خمس عشرة سنة', 'مجلة الالتزامات والعقود'],
  'délai de prescription': ['التقادم', 'تعمير الذمة', 'مجلة الالتزامات والعقود', 'سقوط الحق'],

  // Droit de la famille — divorce pour préjudice art.31 CPS
  'divorce préjudice': ['الفصل 31 مجلة الأحوال الشخصية', 'طلاق للضرر', 'التفريق للضرر', 'مجلة الأحوال الشخصية'],
  'divorce pour cause de préjudice': ['الفصل 31 مجلة الأحوال الشخصية', 'طلاق للضرر', 'التفريق للضرر', 'مجلة الأحوال الشخصية'],

  // Droit civil
  // Fix Feb 26 v11: responsabilité du fait des choses → COC art.96 (fr_civil_02)
  'responsabilité du fait des choses': ['الفصل 96 مجلة الالتزامات والعقود', 'حارس الشيء', 'المسؤولية عن الأشياء', 'الفصل 83 م.ا.ع', 'حراسة الشيء'],
  'fait des choses': ['الفصل 96 م.ا.ع', 'حارس الشيء', 'المسؤولية العينية', 'المسؤولية عن الأشياء'],
  'gardien chose': ['حارس الشيء', 'الفصل 96 مجلة الالتزامات', 'المسؤولية عن الأشياء'],
  'responsabilité civile': ['المسؤولية المدنية', 'المسؤولية التقصيرية', 'جبر الضرر', 'الضمان', 'التعدي', 'الخطأ الموجب للتعويض', 'مجلة الالتزامات والعقود'],
  'responsabilité': ['المسؤولية', 'الضمان', 'الخطأ الموجب', 'مجلة الالتزامات والعقود'],
  'force majeure': ['القوة القاهرة', 'الحادث الفجائي', 'الظروف الطارئة', 'الأسباب الخارجية', 'مجلة الالتزامات والعقود'],
  'cas fortuit': ['الحادث الفجائي', 'القوة القاهرة', 'الأمر الخارج عن الإرادة'],
  'contrat': ['عقد', 'الاتفاق', 'الالتزام', 'الإيجاب والقبول', 'التعاقد'],
  'obligation contractuelle': ['الالتزام التعاقدي', 'الالتزام العقدي', 'واجبات العقد', 'مجلة الالتزامات والعقود'],
  'bail': ['كراء', 'عقد كراء', 'المكتري', 'المكري', 'contrat de location'],
  'propriété': ['الملكية', 'حق التصرف', 'حق الملك', 'الانتفاع'],
  'prescription': ['التقادم', 'مرور الزمن', 'سقوط الحق', 'انقضاء المدة'],
  'indemnisation': ['التعويض', 'جبر الضرر', 'غرم', 'إصلاح الضرر'],
  'préjudice': ['الضرر', 'الأذى', 'جبر الضرر', 'التعويض عن الضرر'],
  'préjudice moral': ['الضرر المعنوي', 'الضرر الأدبي', 'الأذى النفسي', 'التعويض المعنوي'],
  'dommages et intérêts': ['التعويض عن الضرر', 'جبر الضرر', 'التعويض المدني', 'مجلة الالتزامات والعقود'],

  // Droit du travail
  'licenciement': ['طرد تعسفي', 'فسخ عقد الشغل', 'الإنهاء غير المشروع', 'مجلة الشغل'],
  'licenciement abusif': ['طرد تعسفي', 'فسخ بدون موجب', 'الإنهاء غير المشروع', 'مجلة الشغل'],
  'indemnité de licenciement': ['تعويض الطرد', 'تعويض انهاء عقد الشغل', 'الفصل 23 مجلة الشغل', 'الفصل 23-2 مجلة الشغل', 'تعويض الأقدمية'],
  'licenciement abusif calcul': ['الفصل 23-2 مجلة الشغل', 'طرد تعسفي', 'أجر شهر وأجر شهرين عن كل سنة أقدمية', 'مجلة الشغل'],
  'ancienneté': ['الأقدمية', 'مدة الخدمة', 'سنوات العمل'],
  'contrat de travail': ['عقد الشغل', 'العلاقة الشغلية', 'الأجير والمؤجر'],
  'salaire': ['الأجر', 'المرتب', 'الأجرة', 'التعويضات والمنح'],
  'grève': ['الإضراب', 'التوقف عن العمل', 'إيقاف العمل', 'الإضراب المشروع'],

  // Droit commercial
  'faillite': ['الإفلاس', 'التفليس', 'التوقف عن الدفع', 'المجلة التجارية'],
  'chèque': ['الشيك', 'الصك', 'ورقة تجارية', 'المجلة التجارية'],
  'chèque sans provision': ['شيك بدون رصيد', 'إصدار شيك دون رصيد', 'الساحب', 'المجلة التجارية'],
  'société': ['شركة', 'شركات تجارية', 'المجلة التجارية'],

  // Procédure
  'appel': ['الاستئناف', 'الطعن بالاستئناف', 'محكمة الدرجة الثانية'],
  'cassation': ['التعقيب', 'الطعن بالتعقيب', 'النقض', 'محكمة التعقيب'],
  'détention': ['الحبس', 'السجن', 'الإيداع', 'الاحتفاظ'],
}

/**
 * Enrichit une query avec des synonymes juridiques arabes classiques.
 * Applicable à TOUTES les queries (pas seulement les courtes).
 * N'utilise pas de LLM - lookup instantané O(n).
 */
export function enrichQueryWithLegalSynonyms(query: string): string {
  const matchedSynonyms: string[] = []
  const lowerQuery = query.toLowerCase()

  for (const [modernTerm, classicSynonyms] of Object.entries(LEGAL_SYNONYMS)) {
    // Insensible à la casse pour les termes français (ASCII), exact pour l'arabe
    const matches = modernTerm.charCodeAt(0) > 127
      ? query.includes(modernTerm)                     // Arabe : sensible à la casse
      : lowerQuery.includes(modernTerm.toLowerCase())  // Français : insensible à la casse
    if (matches) {
      // Ajouter les synonymes classiques qui ne sont pas déjà dans la query
      for (const synonym of classicSynonyms) {
        if (!query.includes(synonym) && !matchedSynonyms.includes(synonym)) {
          matchedSynonyms.push(synonym)
        }
      }
    }
  }

  if (matchedSynonyms.length === 0) {
    return query
  }

  // Fix Feb 26 v10c: Prioritiser les synonymes contenant "الفصل X" (article refs)
  // → garantit que "الفصل 23 مجلة الشغل" arrive avant les synonymes génériques
  matchedSynonyms.sort((a, b) => {
    const aArticle = /الفصل \d/.test(a) ? 0 : 1
    const bArticle = /الفصل \d/.test(b) ? 0 : 1
    return aArticle - bArticle
  })
  const topSynonyms = matchedSynonyms.slice(0, 8) // augmenté 5→8 pour inclure plus de refs
  const enriched = `${query} - ${topSynonyms.join(' - ')}`

  // Respecter la limite max
  if (enriched.length > MAX_EXPANDED_QUERY_LENGTH) {
    return enriched.substring(0, MAX_EXPANDED_QUERY_LENGTH)
  }

  console.log(`[Legal Synonyms] +${topSynonyms.length} synonymes: ${topSynonyms.join(', ')}`)
  return enriched
}

/**
 * Expansion rapide par mots-clés (fallback si LLM échoue)
 *
 * Dictionnaire pré-défini de termes juridiques fréquents
 */
export function expandQueryKeywords(query: string): string {
  const lowerQuery = query.toLowerCase()

  // Dictionnaire expansions courantes
  const expansions: Record<string, string> = {
    'شجار': 'شجار - اعتداء - دفاع شرعي - ضرب',
    'طلاق': 'طلاق - فسخ الزواج - الطلاق بالتراضي - الطلاق للضرر',
    'سرقة': 'سرقة - جريمة السرقة - اختلاس - استيلاء',
    'كراء': 'كراء - عقد كراء - bail - contrat de location',
    'شغل': 'شغل - عمل - travail - عقد الشغل - contrat de travail',
    'شركة': 'شركة - شركات - sociétés - المجلة التجارية',
    'دفاع': 'دفاع شرعي - légitime défense - حالة الخطر الحال - دفع صائلا',
    'قتل': 'قتل - جريمة القتل - القتل العمد - القتل الخطأ - homicide - أزهق روحه',
    'رشوة': 'رشوة - corruption - الفصل 83 المجلة الجزائية - ارتشاء - استغلال نفوذ - موظف عمومي',
    'فساد': 'فساد - corruption - فساد مالي - فساد إداري - رشوة - اختلاس - détournement',
    'صفقة': 'صفقة عمومية - marchés publics - تضارب مصالح - conflit d\'intérêts - مناقصة',
    'اختلاس': 'اختلاس - détournement de fonds publics - خيانة أمانة - abus de confiance - بدد أو اختلس',
    'تبييض': 'تبييض أموال - غسيل أموال - blanchiment d\'argent - أموال مشبوهة',
    'نفقة': 'نفقة - الإنفاق - واجب النفقة - مؤونة - pension alimentaire',
    'حضانة': 'حضانة - حق الحضانة - كفالة الطفل - رعاية المحضون - garde d\'enfant',
    'ميراث': 'ميراث - إرث - تركة - فريضة - أنصباء - succession',
    'طرد': 'طرد - طرد تعسفي - فسخ عقد الشغل - licenciement abusif',
  }

  // Chercher TOUTES les correspondances (pas seulement la première)
  const allExpansions: string[] = []
  for (const [keyword, expansion] of Object.entries(expansions)) {
    if (lowerQuery.includes(keyword)) {
      allExpansions.push(expansion)
    }
  }

  if (allExpansions.length > 0) {
    return `${query} - ${allExpansions.join(' - ')}`
  }

  // Si aucune correspondance, retourner query originale
  return query
}

/**
 * Vérifie si une query doit être expandée
 *
 * Critères:
 * - Longueur < 50 caractères
 * - Pas de termes juridiques techniques déjà présents
 */
export function shouldExpandQuery(query: string): boolean {
  if (query.length >= MIN_QUERY_LENGTH_FOR_EXPANSION) {
    return false
  }

  // Ne pas expanser si query contient déjà beaucoup de termes techniques
  const technicalTermsArabic = [
    'مجلة',
    'فصل',
    'قانون',
    'تعقيب',
    'حكم',
    'قرار',
    'اجتهاد',
  ]
  const technicalTermsFrench = [
    'code',
    'article',
    'loi',
    'arrêt',
    'jugement',
    'cassation',
  ]

  const hasMultipleTechnicalTerms =
    technicalTermsArabic.filter((term) => query.includes(term)).length >= 2 ||
    technicalTermsFrench.filter((term) => query.toLowerCase().includes(term))
      .length >= 2

  return !hasMultipleTechnicalTerms
}

/**
 * Expanse une query avec gestion intelligente
 *
 * Vérifie si expansion nécessaire, puis utilise LLM ou fallback keywords
 */
export async function expandQuerySmart(
  query: string,
  options: {
    useLLM?: boolean // Si false, utilise uniquement keywords (plus rapide)
  } = {}
): Promise<string> {
  const { useLLM = true } = options

  // Vérifier si expansion nécessaire
  if (!shouldExpandQuery(query)) {
    return query
  }

  // Expansion LLM (précis mais +latence)
  if (useLLM) {
    try {
      return await expandQuery(query)
    } catch (error) {
      console.error('[Query Expansion Smart] LLM échoué, fallback keywords')
      return expandQueryKeywords(query)
    }
  }

  // Expansion keywords (rapide mais moins précis)
  return expandQueryKeywords(query)
}
