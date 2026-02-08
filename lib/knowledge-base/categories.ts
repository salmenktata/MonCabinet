/**
 * Définition des catégories et sous-catégories de la base de connaissance
 * Structure hiérarchique adaptée au droit tunisien
 */

export type KnowledgeCategory =
  | 'legislation'
  | 'jurisprudence'
  | 'doctrine'
  | 'modeles'
  | 'procedures'
  | 'jort'
  | 'formulaires'
  // Anciennes catégories (rétrocompatibilité)
  | 'code'
  | 'modele'
  | 'autre';

export type LegislationSubcategory =
  | 'coc'
  | 'code_penal'
  | 'code_commerce'
  | 'code_travail'
  | 'csp'
  | 'code_fiscal'
  | 'constitution'
  | 'loi_organique'
  | 'decret_loi'
  | 'decret'
  | 'arrete'
  | 'circulaire';

export type JurisprudenceSubcategory =
  | 'cassation'
  // Cours d'appel (11 total)
  | 'appel_tunis'
  | 'appel_nabeul'
  | 'appel_bizerte'
  | 'appel_kef'
  | 'appel_sousse'
  | 'appel_monastir'
  | 'appel_kairouan'
  | 'appel_sfax'
  | 'appel_gafsa'
  | 'appel_gabes'
  | 'appel_medenine'
  // Autres tribunaux
  | 'premiere_instance'
  | 'tribunal_immobilier'
  | 'tribunal_administratif'
  | 'tribunal_commerce'
  | 'tribunal_travail'
  | 'conseil_constitutionnel';

export type DoctrineSubcategory =
  | 'article'
  | 'these'
  | 'commentaire'
  | 'ouvrage'
  | 'note_arret'
  | 'revue_juridique';

export type ModelesSubcategory =
  | 'contrat'
  | 'requete'
  | 'conclusions'
  | 'correspondance'
  | 'acte_notarie'
  | 'procuration';

export type ProceduresSubcategory =
  | 'proc_civile'
  | 'proc_penale'
  | 'proc_commerciale'
  | 'proc_administrative'
  | 'proc_immobiliere'
  | 'proc_statut_personnel';

export type JortSubcategory =
  | 'jort_lois'
  | 'jort_decrets'
  | 'jort_arretes'
  | 'jort_avis'
  | 'jort_nominations';

export type FormulairesSubcategory =
  | 'form_tribunal'
  | 'form_recette_finances'
  | 'form_conservation_fonciere'
  | 'form_greffe'
  | 'form_municipalite';

export type KnowledgeSubcategory =
  | LegislationSubcategory
  | JurisprudenceSubcategory
  | DoctrineSubcategory
  | ModelesSubcategory
  | ProceduresSubcategory
  | JortSubcategory
  | FormulairesSubcategory;

export interface CategoryInfo {
  id: KnowledgeCategory;
  labelFr: string;
  labelAr: string;
  icon: string;
  description?: string;
  subcategories: SubcategoryInfo[];
}

export interface SubcategoryInfo {
  id: string;
  labelFr: string;
  labelAr: string;
}

/**
 * Structure complète des catégories avec leurs sous-catégories
 */
export const KNOWLEDGE_CATEGORIES: CategoryInfo[] = [
  {
    id: 'legislation',
    labelFr: 'Législation',
    labelAr: 'التشريع',
    icon: 'scale',
    description: 'Textes législatifs et réglementaires tunisiens',
    subcategories: [
      { id: 'coc', labelFr: 'Code des Obligations et Contrats', labelAr: 'مجلة الالتزامات والعقود' },
      { id: 'code_penal', labelFr: 'Code Pénal', labelAr: 'المجلة الجزائية' },
      { id: 'code_commerce', labelFr: 'Code de Commerce', labelAr: 'المجلة التجارية' },
      { id: 'code_travail', labelFr: 'Code du Travail', labelAr: 'مجلة الشغل' },
      { id: 'csp', labelFr: 'Code du Statut Personnel', labelAr: 'مجلة الأحوال الشخصية' },
      { id: 'code_fiscal', labelFr: 'Code Fiscal', labelAr: 'مجلة الجباية' },
      { id: 'constitution', labelFr: 'Constitution', labelAr: 'الدستور' },
      { id: 'loi_organique', labelFr: 'Loi Organique', labelAr: 'قانون أساسي' },
      { id: 'decret_loi', labelFr: 'Décret-Loi', labelAr: 'مرسوم' },
      { id: 'decret', labelFr: 'Décret', labelAr: 'أمر' },
      { id: 'arrete', labelFr: 'Arrêté', labelAr: 'قرار' },
      { id: 'circulaire', labelFr: 'Circulaire', labelAr: 'منشور' },
    ],
  },
  {
    id: 'jurisprudence',
    labelFr: 'Jurisprudence',
    labelAr: 'فقه القضاء',
    icon: 'gavel',
    description: 'Décisions de justice tunisiennes',
    subcategories: [
      { id: 'cassation', labelFr: 'Cour de Cassation', labelAr: 'محكمة التعقيب' },

      // Cours d'appel (ordre alphabétique ville)
      { id: 'appel_bizerte', labelFr: "Cour d'Appel de Bizerte", labelAr: 'محكمة الاستئناف ببنزرت' },
      { id: 'appel_gabes', labelFr: "Cour d'Appel de Gabès", labelAr: 'محكمة الاستئناف بقابس' },
      { id: 'appel_gafsa', labelFr: "Cour d'Appel de Gafsa", labelAr: 'محكمة الاستئناف بقفصة' },
      { id: 'appel_kairouan', labelFr: "Cour d'Appel de Kairouan", labelAr: 'محكمة الاستئناف بالقيروان' },
      { id: 'appel_medenine', labelFr: "Cour d'Appel de Médenine", labelAr: 'محكمة الاستئناف بمدنين' },
      { id: 'appel_monastir', labelFr: "Cour d'Appel de Monastir", labelAr: 'محكمة الاستئناف بالمنستير' },
      { id: 'appel_nabeul', labelFr: "Cour d'Appel de Nabeul", labelAr: 'محكمة الاستئناف بنابل' },
      { id: 'appel_sfax', labelFr: "Cour d'Appel de Sfax", labelAr: 'محكمة الاستئناف بصفاقس' },
      { id: 'appel_sousse', labelFr: "Cour d'Appel de Sousse", labelAr: 'محكمة الاستئناف بسوسة' },
      { id: 'appel_tunis', labelFr: "Cour d'Appel de Tunis", labelAr: 'محكمة الاستئناف بتونس' },
      { id: 'appel_kef', labelFr: "Cour d'Appel du Kef", labelAr: 'محكمة الاستئناف بالكاف' },

      // Tribunaux de première instance
      { id: 'premiere_instance', labelFr: 'Première Instance', labelAr: 'المحكمة الابتدائية' },

      // Juridictions spécialisées
      { id: 'tribunal_immobilier', labelFr: 'Tribunal Immobilier', labelAr: 'المحكمة العقارية' },
      { id: 'tribunal_administratif', labelFr: 'Tribunal Administratif', labelAr: 'المحكمة الإدارية' },
      { id: 'tribunal_commerce', labelFr: 'Tribunal de Commerce', labelAr: 'المحكمة التجارية' },
      { id: 'tribunal_travail', labelFr: 'Tribunal du Travail', labelAr: 'محكمة الشغل' },

      // Haute juridiction
      { id: 'conseil_constitutionnel', labelFr: 'Conseil Constitutionnel', labelAr: 'المجلس الدستوري' },
    ],
  },
  {
    id: 'doctrine',
    labelFr: 'Doctrine',
    labelAr: 'الفقه',
    icon: 'book-open',
    description: 'Travaux académiques et commentaires juridiques',
    subcategories: [
      { id: 'article', labelFr: 'Article', labelAr: 'مقال' },
      { id: 'these', labelFr: 'Thèse', labelAr: 'أطروحة' },
      { id: 'commentaire', labelFr: 'Commentaire', labelAr: 'تعليق' },
      { id: 'ouvrage', labelFr: 'Ouvrage', labelAr: 'مؤلف' },
      { id: 'note_arret', labelFr: "Note d'Arrêt", labelAr: 'تعليق على حكم' },
      { id: 'revue_juridique', labelFr: 'Revue Juridique Tunisienne', labelAr: 'المجلة القانونية التونسية' },
    ],
  },
  {
    id: 'modeles',
    labelFr: 'Modèles',
    labelAr: 'النماذج',
    icon: 'file-text',
    description: 'Modèles de documents juridiques',
    subcategories: [
      { id: 'contrat', labelFr: 'Contrat', labelAr: 'عقد' },
      { id: 'requete', labelFr: 'Requête', labelAr: 'مطلب' },
      { id: 'conclusions', labelFr: 'Conclusions', labelAr: 'ملحوظات' },
      { id: 'correspondance', labelFr: 'Correspondance', labelAr: 'مراسلة' },
      { id: 'acte_notarie', labelFr: 'Acte Notarié', labelAr: 'عقد موثق' },
      { id: 'procuration', labelFr: 'Procuration', labelAr: 'توكيل' },
    ],
  },
  {
    id: 'procedures',
    labelFr: 'Procédures',
    labelAr: 'الإجراءات',
    icon: 'clipboard-list',
    description: 'Guides procéduraux par matière',
    subcategories: [
      { id: 'proc_civile', labelFr: 'Procédure Civile', labelAr: 'الإجراءات المدنية' },
      { id: 'proc_penale', labelFr: 'Procédure Pénale', labelAr: 'الإجراءات الجزائية' },
      { id: 'proc_commerciale', labelFr: 'Procédure Commerciale', labelAr: 'الإجراءات التجارية' },
      { id: 'proc_administrative', labelFr: 'Procédure Administrative', labelAr: 'الإجراءات الإدارية' },
      { id: 'proc_immobiliere', labelFr: 'Procédure Immobilière', labelAr: 'الإجراءات العقارية' },
      { id: 'proc_statut_personnel', labelFr: 'Statut Personnel', labelAr: 'الأحوال الشخصية' },
    ],
  },
  {
    id: 'jort',
    labelFr: 'JORT',
    labelAr: 'الرائد الرسمي',
    icon: 'newspaper',
    description: 'Journal Officiel de la République Tunisienne',
    subcategories: [
      { id: 'jort_lois', labelFr: 'Lois', labelAr: 'القوانين' },
      { id: 'jort_decrets', labelFr: 'Décrets', labelAr: 'الأوامر' },
      { id: 'jort_arretes', labelFr: 'Arrêtés', labelAr: 'القرارات' },
      { id: 'jort_avis', labelFr: 'Avis', labelAr: 'الإعلانات' },
      { id: 'jort_nominations', labelFr: 'Nominations', labelAr: 'التسميات' },
    ],
  },
  {
    id: 'formulaires',
    labelFr: 'Formulaires',
    labelAr: 'الاستمارات',
    icon: 'file-input',
    description: 'Formulaires officiels tunisiens',
    subcategories: [
      { id: 'form_tribunal', labelFr: 'Tribunal', labelAr: 'المحكمة' },
      { id: 'form_recette_finances', labelFr: 'Recette des Finances', labelAr: 'القباضة المالية' },
      { id: 'form_conservation_fonciere', labelFr: 'Conservation Foncière', labelAr: 'إدارة الملكية العقارية' },
      { id: 'form_greffe', labelFr: 'Greffe', labelAr: 'كتابة المحكمة' },
      { id: 'form_municipalite', labelFr: 'Municipalité', labelAr: 'البلدية' },
    ],
  },
];

/**
 * Map des labels pour lookup rapide
 */
export const CATEGORY_LABELS: Record<string, { fr: string; ar: string }> = {
  // Nouvelles catégories
  legislation: { fr: 'Législation', ar: 'التشريع' },
  jurisprudence: { fr: 'Jurisprudence', ar: 'فقه القضاء' },
  doctrine: { fr: 'Doctrine', ar: 'الفقه' },
  modeles: { fr: 'Modèles', ar: 'النماذج' },
  procedures: { fr: 'Procédures', ar: 'الإجراءات' },
  jort: { fr: 'JORT', ar: 'الرائد الرسمي' },
  formulaires: { fr: 'Formulaires', ar: 'الاستمارات' },
  // Anciennes catégories (rétrocompatibilité)
  code: { fr: 'Code', ar: 'مجلة' },
  modele: { fr: 'Modèle', ar: 'نموذج' },
  autre: { fr: 'Autre', ar: 'أخرى' },
};

/**
 * Map des sous-catégories pour lookup rapide
 */
export const SUBCATEGORY_LABELS: Record<string, { fr: string; ar: string }> = {};

// Peupler SUBCATEGORY_LABELS
KNOWLEDGE_CATEGORIES.forEach((cat) => {
  cat.subcategories.forEach((sub) => {
    SUBCATEGORY_LABELS[sub.id] = { fr: sub.labelFr, ar: sub.labelAr };
  });
});

/**
 * Récupérer la catégorie parente d'une sous-catégorie
 */
export function getParentCategory(subcategoryId: string): KnowledgeCategory | null {
  for (const cat of KNOWLEDGE_CATEGORIES) {
    if (cat.subcategories.some((sub) => sub.id === subcategoryId)) {
      return cat.id;
    }
  }
  return null;
}

/**
 * Récupérer les sous-catégories d'une catégorie
 */
export function getSubcategories(categoryId: KnowledgeCategory): SubcategoryInfo[] {
  const category = KNOWLEDGE_CATEGORIES.find((c) => c.id === categoryId);
  return category?.subcategories || [];
}

/**
 * Récupérer le label d'une catégorie
 */
export function getCategoryLabel(categoryId: string, lang: 'fr' | 'ar' = 'fr'): string {
  const labels = CATEGORY_LABELS[categoryId];
  return labels ? labels[lang] : categoryId;
}

/**
 * Récupérer le label d'une sous-catégorie
 */
export function getSubcategoryLabel(subcategoryId: string, lang: 'fr' | 'ar' = 'fr'): string {
  const labels = SUBCATEGORY_LABELS[subcategoryId];
  return labels ? labels[lang] : subcategoryId;
}

/**
 * Vérifier si une sous-catégorie appartient à une catégorie
 */
export function isValidSubcategory(categoryId: string, subcategoryId: string): boolean {
  const category = KNOWLEDGE_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return false;
  return category.subcategories.some((sub) => sub.id === subcategoryId);
}

/**
 * Liste plate de toutes les catégories pour les selects
 */
export function getAllCategoriesFlat(): Array<{ value: string; labelFr: string; labelAr: string; isSubcategory: boolean; parent?: string }> {
  const result: Array<{ value: string; labelFr: string; labelAr: string; isSubcategory: boolean; parent?: string }> = [];

  KNOWLEDGE_CATEGORIES.forEach((cat) => {
    result.push({
      value: cat.id,
      labelFr: cat.labelFr,
      labelAr: cat.labelAr,
      isSubcategory: false,
    });

    cat.subcategories.forEach((sub) => {
      result.push({
        value: sub.id,
        labelFr: sub.labelFr,
        labelAr: sub.labelAr,
        isSubcategory: true,
        parent: cat.id,
      });
    });
  });

  return result;
}

/**
 * Couleurs des catégories pour les badges
 */
export const CATEGORY_COLORS: Record<string, string> = {
  legislation: 'bg-blue-500',
  jurisprudence: 'bg-purple-500',
  doctrine: 'bg-green-500',
  modeles: 'bg-orange-500',
  procedures: 'bg-cyan-500',
  jort: 'bg-red-500',
  formulaires: 'bg-yellow-500',
  // Anciennes catégories
  code: 'bg-blue-500',
  modele: 'bg-orange-500',
  autre: 'bg-gray-500',
};

/**
 * Icônes Lucide pour les catégories
 */
export const CATEGORY_ICONS: Record<string, string> = {
  legislation: 'Scale',
  jurisprudence: 'Gavel',
  doctrine: 'BookOpen',
  modeles: 'FileText',
  procedures: 'ClipboardList',
  jort: 'Newspaper',
  formulaires: 'FileInput',
  code: 'BookOpen',
  modele: 'FileText',
  autre: 'File',
};
