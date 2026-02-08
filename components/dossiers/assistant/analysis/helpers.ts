import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

// === Fonctions utilitaires pour générer l'analyse ===

export function getActionType(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr ? 'دعوى طلاق قضائي' : 'Action en divorce judiciaire (دعوى الطلاق)'
    case 'commercial':
      if (result.donneesSpecifiques.montantPrincipal) {
        return isAr ? 'دعوى استخلاص ديون تجارية' : 'Action en recouvrement de créance commerciale (دعوى استخلاص ديون تجارية)'
      }
      return isAr ? 'دعوى تجارية' : 'Action commerciale'
    case 'civil_premiere_instance':
      return isAr ? 'دعوى مدنية ابتدائية' : 'Action civile en première instance (دعوى مدنية)'
    case 'refere':
      return isAr ? 'القضاء الاستعجالي - إجراء عاجل' : 'Procédure de référé - mesure urgente (القضاء الاستعجالي)'
    default:
      return isAr ? 'دعوى بحاجة إلى تكييف' : 'Action à qualifier'
  }
}

export function getApplicableCode(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr ? 'مجلة الأحوال الشخصية (CSP)' : 'Code du Statut Personnel (CSP) - مجلة الأحوال الشخصية'
    case 'commercial':
      return isAr ? 'المجلة التجارية + مجلة الالتزامات والعقود (COC)' : 'Code de Commerce + Code des Obligations et Contrats (COC) - المجلة التجارية'
    case 'civil_premiere_instance':
      return isAr ? 'مجلة الالتزامات والعقود (COC)' : 'Code des Obligations et Contrats (COC) - مجلة الالتزامات والعقود'
    case 'refere':
      return isAr ? 'مجلة المرافعات المدنية والتجارية' : 'Code de Procédure Civile et Commerciale - مجلة المرافعات المدنية والتجارية'
    default:
      return isAr ? 'يُحدّد حسب الوقائع' : 'À déterminer selon les faits'
  }
}

export function getLegalBasis(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr
        ? `الفصول 30 وما بعدها من مجلة الأحوال الشخصية: الطلاق القضائي بطلب من أحد الزوجين.
              الفصل 31: غرامة المتعة (التعويضية). الفصل 46: النفقة للأطفال.
              الفصول 67 وما بعدها: الحضانة.`
        : `Articles 30 et suivants du CSP: Divorce judiciaire sur demande de l'un des époux.
              Art. 31: Pension Moutaa (compensatoire). Art. 46: Pension alimentaire des enfants.
              Art. 67 et suivants: Garde des enfants (الحضانة).`
    case 'commercial':
      return isAr
        ? `الفصول 278 وما بعدها من مجلة الالتزامات والعقود: المسؤولية التعاقدية وفوائض التأخير.
              الفصل 410 مكرر من المجلة التجارية: التعويض الجزافي عن الشيك بدون رصيد.
              نسبة الفائض القانوني: TMM + 7 نقاط = 14.5% (BCT).`
        : `Art. 278 et suivants COC: Responsabilité contractuelle et intérêts moratoires.
              Art. 410bis Code de Commerce: Indemnité forfaitaire pour chèque impayé.
              Taux d'intérêt légal: TMM + 7 points = 14.5% (BCT).`
    case 'civil_premiere_instance':
      return isAr
        ? `الفصول 82 وما بعدها من مجلة الالتزامات والعقود: المسؤولية المدنية.
              الفصول 242 وما بعدها من مجلة الالتزامات والعقود: تنفيذ الالتزامات.`
        : `Art. 82 et suivants COC: Responsabilité civile.
              Art. 242 et suivants COC: Exécution des obligations.`
    case 'refere':
      return isAr
        ? `الفصول 201 وما بعدها من مجلة المرافعات: شروط القضاء الاستعجالي - الاستعجال وغياب نزاع جدي.`
        : `Art. 201 et suivants CPC: Conditions du référé - urgence et absence de contestation sérieuse.`
    default:
      return isAr ? 'الأساس القانوني يُحدّد بعد تحليل معمّق.' : 'Fondement à préciser après analyse approfondie.'
  }
}

function getPrescriptionAnalysis(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr
        ? 'لا تقادم في دعوى الطلاق. مطالب النفقة لا تسقط بالتقادم.'
        : 'Pas de prescription pour l\'action en divorce. Les demandes de pension sont imprescriptibles.'
    case 'commercial':
      return isAr
        ? 'تقادم تجاري بسنة أو 3 سنوات حسب طبيعة الدعوى. يجب التثبت من تاريخ الدين.'
        : 'Prescription commerciale de 1 an ou 3 ans selon la nature. Vérifier la date de la créance.'
    default:
      return isAr
        ? 'تقادم مدني بالقانون العام: 15 سنة. يجب التثبت حسب نوع الدعوى.'
        : 'Prescription civile de droit commun: 15 ans. À vérifier selon le type d\'action.'
  }
}

export function getAdmissibilityChecks(
  result: StructuredDossier
): Array<{
  title: string
  titleAr?: string
  description: string
  status: 'ok' | 'warning' | 'error'
}> {
  const isAr = result.langue === 'ar'
  const checks = []

  checks.push({
    title: isAr ? 'التقادم' : 'Prescription',
    titleAr: isAr ? undefined : 'التقادم',
    description: getPrescriptionAnalysis(result),
    status: 'ok' as const,
  })

  checks.push({
    title: isAr ? 'الصفة' : 'Qualité pour agir',
    titleAr: isAr ? undefined : 'الصفة',
    description: result.client.nom
      ? (isAr
          ? 'تم التعرف على الحريف. يجب التثبت من الوثائق المثبتة لصفته (عقد ملكية، عقد، مضمون من السجل التجاري).'
          : 'Le client est identifié. Vérifier les documents établissant sa qualité (titre de propriété, contrat, extrait RNE).')
      : (isAr
          ? 'لم يتم التعرف على الحريف - يستحيل التثبت من الصفة.'
          : 'Client non identifié - impossible de vérifier la qualité pour agir.'),
    status: result.client.nom ? ('warning' as const) : ('error' as const),
  })

  checks.push({
    title: isAr ? 'المصلحة' : 'Intérêt à agir',
    titleAr: isAr ? undefined : 'المصلحة',
    description: isAr
      ? 'يجب أن تكون المصلحة قائمة وحالّة وشخصية ومشروعة. يُتثبت منها حسب الوثائق.'
      : 'L\'intérêt doit être né, actuel, personnel et légitime. À confirmer selon les pièces.',
    status: 'warning' as const,
  })

  if (result.typeProcedure !== 'refere') {
    checks.push({
      title: isAr ? 'العيوب الشكلية' : 'Vices de forme',
      titleAr: isAr ? undefined : 'العيوب الشكلية',
      description: isAr
        ? 'يجب التثبت من البيانات الوجوبية لعريضة الدعوى (الهوية الكاملة، المحكمة المختصة، موضوع الدعوى، الأساس القانوني).'
        : 'Vérifier les mentions obligatoires de l\'assignation (identité complète, tribunal compétent, objet précis, moyen de droit).',
      status: 'warning' as const,
    })
  }

  return checks
}

export function getTerritorialJurisdiction(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr
        ? 'محكمة الأسرة بمكان المسكن الزوجي أو آخر مسكن مشترك'
        : 'Tribunal de la Famille du domicile conjugal ou du dernier domicile commun'
    case 'commercial':
      return isAr
        ? 'المحكمة الابتدائية ذات الاختصاص التجاري بمقر المدّعى عليه'
        : 'Tribunal de Première Instance à compétence commerciale du siège du défendeur'
    default:
      return isAr
        ? 'محكمة مقر المدّعى عليه (الفصل 27 م.م.م.ت)'
        : 'Tribunal du domicile du défendeur (Art. 27 CPC)'
  }
}

export function getMaterialJurisdiction(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  const montant = result.donneesSpecifiques.montantPrincipal || 0

  if (result.typeProcedure === 'divorce') {
    return isAr ? 'محكمة الأسرة (دوائر الأحوال الشخصية)' : 'Tribunal de la Famille (chambres de statut personnel)'
  }

  if (result.typeProcedure === 'refere') {
    return isAr ? 'رئيس المحكمة الابتدائية (قاضي الاستعجالي)' : 'Président du Tribunal de Première Instance (juge des référés)'
  }

  if (montant <= 7000) {
    return isAr ? 'قاضي الناحية - حتى 7,000 د.ت' : 'Juge Cantonal (قاضي الناحية) - jusqu\'à 7 000 TND'
  } else {
    return isAr ? 'المحكمة الابتدائية - أكثر من 7,000 د.ت' : 'Tribunal de Première Instance (المحكمة الابتدائية) - au-delà de 7 000 TND'
  }
}

export function getEvidenceStrategy(
  result: StructuredDossier
): Array<{
  icon: string
  document: string
  purpose: string
  priority: 'essential' | 'important' | 'useful'
}> {
  const isAr = result.langue === 'ar'
  const evidence = []

  evidence.push({
    icon: '&#128196;',
    document: isAr ? 'نسخة من بطاقة التعريف الوطنية' : 'Copie CIN du client',
    purpose: isAr ? 'إثبات الهوية والأهلية القانونية' : 'Preuve d\'identité et de capacité juridique',
    priority: 'essential' as const,
  })

  if (result.typeProcedure === 'divorce') {
    evidence.push({
      icon: '&#128141;',
      document: isAr ? 'عقد الزواج الأصلي' : 'Acte de mariage original',
      purpose: isAr ? 'إثبات الرابطة الزوجية' : 'Preuve du lien matrimonial (عقد الزواج)',
      priority: 'essential' as const,
    })
    if (result.enfants && result.enfants.length > 0) {
      evidence.push({
        icon: '&#128118;',
        document: isAr ? 'مضامين ولادة الأطفال' : 'Extraits de naissance des enfants',
        purpose: isAr ? 'إثبات النسب للحضانة' : 'Preuve de la filiation pour la garde',
        priority: 'essential' as const,
      })
    }
    evidence.push({
      icon: '&#128176;',
      document: isAr ? 'بطاقات الخلاص (آخر 3 أشهر)' : 'Fiches de paie (3 derniers mois)',
      purpose: isAr ? 'قاعدة احتساب النفقات' : 'Base de calcul des pensions',
      priority: 'important' as const,
    })
    if (
      result.donneesSpecifiques.biensCommuns &&
      result.donneesSpecifiques.biensCommuns.length > 0
    ) {
      evidence.push({
        icon: '&#127968;',
        document: isAr ? 'رسم الملكية / تقدير العقار' : 'Titre de propriété / estimation bien immobilier',
        purpose: isAr ? 'تقييم الممتلكات المشتركة' : 'Évaluation du patrimoine commun',
        priority: 'important' as const,
      })
    }
  }

  if (result.typeProcedure === 'commercial') {
    evidence.push({
      icon: '&#128203;',
      document: isAr ? 'العقد أو طلب الشراء' : 'Contrat ou bon de commande',
      purpose: isAr ? 'إثبات الالتزام التعاقدي' : 'Preuve de l\'obligation contractuelle',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128181;',
      document: isAr ? 'الفواتير غير المدفوعة' : 'Factures impayées',
      purpose: isAr ? 'إثبات الدين ومبلغه' : 'Preuve de la créance et de son montant',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128231;',
      document: isAr ? 'الإنذار مع وصل الاستلام' : 'Mise en demeure + AR',
      purpose: isAr ? 'إثبات محاولة الاستخلاص بالتراضي' : 'Preuve de la tentative de recouvrement amiable',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#127970;',
      document: isAr ? 'مضمون من السجل التجاري للدائن والمدين' : 'Extrait RNE du créancier et débiteur',
      purpose: isAr ? 'إثبات الصفة التجارية' : 'Preuve de la qualité commerciale',
      priority: 'important' as const,
    })
  }

  if (result.typeProcedure === 'civil_premiere_instance') {
    evidence.push({
      icon: '&#128203;',
      document: isAr ? 'كل عقد أو اتفاقية مكتوبة' : 'Tout contrat ou convention écrite',
      purpose: isAr ? 'الحجة الكتابية أساسية في القانون المدني التونسي' : 'La preuve écrite est primordiale en droit civil tunisien',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128247;',
      document: isAr ? 'محضر معاينة عدل منفذ (عند الحاجة)' : 'Constat d\'huissier (si nécessaire)',
      purpose: isAr ? 'إثبات مادي للوقائع' : 'Preuve matérielle des faits (محضر معاينة)',
      priority: 'important' as const,
    })
  }

  return evidence
}

export function getRisks(
  result: StructuredDossier
): Array<{
  title: string
  description: string
  level: 'high' | 'medium' | 'low'
  mitigation?: string
}> {
  const isAr = result.langue === 'ar'
  const risks = []

  risks.push({
    title: isAr ? 'عدم سماع الدعوى شكلاً' : 'Fin de non-recevoir pour vice de forme',
    description: isAr
      ? 'يمكن للقاضي التونسي رفض الدعوى لعيب إجرائي قبل النظر في الأصل.'
      : 'Le juge tunisien peut rejeter la demande pour irrégularité de procédure (عدم سماع الدعوى شكلاً) avant même d\'examiner le fond.',
    level: 'high' as const,
    mitigation: isAr
      ? 'التثبت بدقة من جميع البيانات الوجوبية وآجال التبليغ.'
      : 'Vérifier minutieusement toutes les mentions obligatoires et les délais de signification.',
  })

  if (result.typeProcedure === 'divorce') {
    risks.push({
      title: isAr ? 'فشل محاولات الصلح' : 'Échec des conciliations',
      description: isAr
        ? 'محاولات الصلح الثلاث إجبارية. إذا لم يحضر الحريف، قد تُرفض الدعوى.'
        : 'Les 3 tentatives de conciliation sont obligatoires. Si le client ne se présente pas, l\'action peut être rejetée.',
      level: 'medium' as const,
      mitigation: isAr
        ? 'تحضير الحريف لجلسات الصلح والتأكد من حضوره.'
        : 'Préparer le client aux séances de conciliation et s\'assurer de sa présence.',
    })
  }

  if (result.typeProcedure === 'commercial') {
    if (!result.donneesSpecifiques.dateCreance) {
      risks.push({
        title: isAr ? 'خطر التقادم' : 'Risque de prescription',
        description: isAr
          ? 'بدون تاريخ دقيق للدين، يستحيل التثبت من عدم سقوط الدعوى بالتقادم (سنة أو 3 سنوات في المادة التجارية).'
          : 'Sans date de créance précise, impossible de vérifier si l\'action n\'est pas prescrite (1 an ou 3 ans en commercial).',
        level: 'high' as const,
        mitigation: isAr
          ? 'الحصول على الوثائق المؤرخة المثبتة للدين.'
          : 'Obtenir les documents datés établissant la créance.',
      })
    }
  }

  risks.push({
    title: isAr ? 'قصور في الأدلة' : 'Insuffisance de preuves',
    description: isAr
      ? 'في القانون التونسي، "البيّنة سيّدة المعارك". دعوى ضعيفة التوثيق سيُرفض طلبها.'
      : 'En droit tunisien, "la preuve est la reine des batailles". Une demande mal documentée sera rejetée.',
    level: 'medium' as const,
    mitigation: isAr
      ? 'تكوين ملف مؤيدات كامل قبل رفع الدعوى.'
      : 'Constituer un bordereau de pièces complet avant l\'introduction de l\'instance.',
  })

  return risks
}

export function getStrategicRecommendation(result: StructuredDossier): string {
  const isAr = result.langue === 'ar'
  switch (result.typeProcedure) {
    case 'divorce':
      return isAr
        ? `بناءً على المعطيات المستخرجة، يُوصى برفع دعوى طلاق قضائي أمام محكمة الأسرة. مع وجود ${result.enfants?.length || 0} طفل/أطفال قُصّر، ستكون مسائل الحضانة والنفقة محورية. غرامة المتعة المقدّرة والنفقات تمثل قاعدة تفاوض متينة.`
        : `Compte tenu des éléments extraits, il est recommandé d'engager une procédure de divorce judiciaire
              devant le Tribunal de la Famille. Avec ${result.enfants?.length || 0} enfant(s) mineur(s),
              les questions de garde (حضانة) et de pension alimentaire seront centrales.
              La Moutaa estimée et les pensions alimentaires constituent une base de négociation solide.`
    case 'commercial':
      return isAr
        ? `قبل أي إجراء قضائي، يجب إرسال إنذار رسمي بمكتوب مضمون الوصول مع الإعلام بالبلوغ. هذا يُفعّل سريان فوائض التأخير (14.5%) ويُثبت للقاضي حسن نية الدائن. إذا كان المبلغ يبرر ذلك، يمكن تقديم عريضة أمر بالدفع لتسريع الإجراءات.`
        : `Avant toute action judiciaire, envoyer une mise en demeure formelle par lettre recommandée avec AR.
              Cela fait courir les intérêts moratoires (14.5%) et démontre au juge la bonne foi du créancier.
              Si le montant le justifie, envisager une requête en injonction de payer pour accélérer la procédure.`
    case 'refere':
      return isAr
        ? `إجراء الاستعجالي مناسب إذا ثبت الاستعجال ولم يوجد نزاع جدي في الحق. يجب إعداد عريضة تُثبت هذين الشرطين بوضوح.`
        : `La procédure de référé est appropriée si l'urgence est caractérisée et qu'il n'y a pas
              de contestation sérieuse du droit. Préparer une requête démontrant clairement ces deux conditions.`
    default:
      return isAr
        ? `بعد تحليل الوقائع، يجب تكوين ملف مؤيدات متين والتثبت من قبول الدعوى قبل رفعها. يُوصى باستشارة معمّقة.`
        : `Après analyse des faits, constituer un dossier de pièces solide et vérifier la recevabilité
              de l'action avant d'engager la procédure. Une consultation approfondie est recommandée.`
  }
}

export function getNextSteps(result: StructuredDossier): string[] {
  const isAr = result.langue === 'ar'
  const steps = []

  steps.push(isAr ? 'جمع جميع المؤيدات الأساسية المحددة' : 'Collecter toutes les pièces essentielles identifiées')
  steps.push(isAr ? 'تحرير وإمضاء اتفاقية الأتعاب' : 'Rédiger et faire signer la Convention d\'Honoraires')

  if (result.typeProcedure === 'commercial') {
    steps.push(isAr ? 'إرسال الإنذار بمكتوب مضمون الوصول مع الإعلام بالبلوغ' : 'Envoyer la mise en demeure par lettre recommandée avec AR')
    steps.push(isAr ? 'انتظار 15 يوم أجل الرد' : 'Attendre 15 jours le délai de réponse')
  }

  if (result.typeProcedure === 'divorce') {
    steps.push(isAr ? 'تحضير الحريف لجلسات الصلح الإجبارية' : 'Préparer le client aux séances de conciliation obligatoires')
  }

  steps.push(isAr ? 'تحرير مذكرة التحليل القانوني الداخلية' : 'Rédiger la Note d\'Analyse Juridique interne')
  steps.push(isAr ? 'تكوين جدول المؤيدات المرقّم' : 'Constituer le bordereau de pièces numéroté')
  steps.push(isAr ? 'تحرير عريضة افتتاح الدعوى' : 'Rédiger l\'acte introductif d\'instance')

  return steps
}
