/**
 * Système unifié de catégories juridiques
 * Utilisé partout dans l'application : RAG, KB, Web Sources, Classification, Filtres
 */

/**
 * Type central pour les catégories juridiques
 * Aligné entre tous les systèmes de l'application
 */
export type LegalCategory =
  // Catégories principales
  | 'legislation'      // التشريع - Législation
  | 'jurisprudence'    // فقه القضاء - Jurisprudence
  | 'doctrine'         // الفقه - Doctrine
  | 'jort'             // الرائد الرسمي - JORT
  | 'modeles'          // النماذج - Modèles
  | 'procedures'       // الإجراءات - Procédures
  | 'formulaires'      // الاستمارات - Formulaires
  // Catégories spécifiques sources web
  | 'codes'            // المجلات القانونية - Codes juridiques
  | 'constitution'     // الدستور - Constitution
  | 'conventions'      // الاتفاقيات الدولية - Conventions internationales
  | 'guides'           // الأدلة - Guides pratiques
  | 'lexique'          // المصطلحات - Lexique juridique
  | 'actualites'       // الأخبار - Actualités
  | 'google_drive'     // مستندات جوجل درايف - Google Drive
  // Autres
  | 'autre'            // أخرى - Autres

/**
 * Alias pour les différents systèmes
 */
export type WebSourceCategory = LegalCategory
export type KnowledgeCategory = Exclude<LegalCategory, 'google_drive' | 'actualites'>
export type LegalContentCategory = Exclude<LegalCategory, 'codes' | 'constitution' | 'conventions' | 'guides' | 'lexique' | 'google_drive'>

/**
 * Sous-catégories spécifiques à la Knowledge Base
 * Réexportées depuis le module knowledge-base pour éviter la duplication
 */
export type { KnowledgeSubcategory } from '@/lib/knowledge-base/categories'

/**
 * Traductions unifiées pour toutes les catégories
 */
export const LEGAL_CATEGORY_TRANSLATIONS: Record<LegalCategory, { ar: string; fr: string }> = {
  legislation: { ar: 'التشريع', fr: 'Législation' },
  jurisprudence: { ar: 'فقه القضاء', fr: 'Jurisprudence' },
  doctrine: { ar: 'الفقه', fr: 'Doctrine' },
  jort: { ar: 'الرائد الرسمي', fr: 'JORT' },
  modeles: { ar: 'النماذج', fr: 'Modèles' },
  procedures: { ar: 'الإجراءات', fr: 'Procédures' },
  formulaires: { ar: 'الاستمارات', fr: 'Formulaires' },
  codes: { ar: 'المجلات القانونية', fr: 'Codes juridiques' },
  constitution: { ar: 'الدستور', fr: 'Constitution' },
  conventions: { ar: 'الاتفاقيات الدولية', fr: 'Conventions internationales' },
  guides: { ar: 'الأدلة', fr: 'Guides pratiques' },
  lexique: { ar: 'المصطلحات', fr: 'Lexique juridique' },
  actualites: { ar: 'الأخبار', fr: 'Actualités' },
  google_drive: { ar: 'مستندات جوجل درايف', fr: 'Google Drive' },
  autre: { ar: 'أخرى', fr: 'Autres' },
}

/**
 * Couleurs unifiées pour toutes les catégories (format Tailwind)
 */
export const LEGAL_CATEGORY_COLORS: Record<LegalCategory, string> = {
  legislation: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  jurisprudence: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  doctrine: 'bg-green-500/20 text-green-400 border-green-500/30',
  jort: 'bg-red-500/20 text-red-400 border-red-500/30',
  modeles: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  procedures: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  formulaires: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  codes: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  constitution: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  conventions: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  guides: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  lexique: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  actualites: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  google_drive: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  autre: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

/**
 * Couleurs pour badges simples (sans transparence)
 */
export const LEGAL_CATEGORY_BADGE_COLORS: Record<LegalCategory, string> = {
  legislation: 'bg-blue-500',
  jurisprudence: 'bg-purple-500',
  doctrine: 'bg-green-500',
  jort: 'bg-red-500',
  modeles: 'bg-orange-500',
  procedures: 'bg-cyan-500',
  formulaires: 'bg-yellow-500',
  codes: 'bg-indigo-500',
  constitution: 'bg-pink-500',
  conventions: 'bg-teal-500',
  guides: 'bg-lime-500',
  lexique: 'bg-emerald-500',
  actualites: 'bg-amber-500',
  google_drive: 'bg-violet-500',
  autre: 'bg-slate-500',
}

/**
 * Icônes Lucide pour chaque catégorie
 */
export const LEGAL_CATEGORY_ICONS: Record<LegalCategory, string> = {
  legislation: 'scale',
  jurisprudence: 'gavel',
  doctrine: 'book-open',
  jort: 'newspaper',
  modeles: 'file-text',
  procedures: 'clipboard-list',
  formulaires: 'file-input',
  codes: 'book',
  constitution: 'scroll',
  conventions: 'handshake',
  guides: 'compass',
  lexique: 'book-a',
  actualites: 'rss',
  google_drive: 'cloud',
  autre: 'file',
}

/**
 * Descriptions pour chaque catégorie
 */
export const LEGAL_CATEGORY_DESCRIPTIONS: Record<LegalCategory, { ar: string; fr: string }> = {
  legislation: {
    ar: 'النصوص التشريعية والتنظيمية التونسية',
    fr: 'Textes législatifs et réglementaires tunisiens',
  },
  jurisprudence: {
    ar: 'قرارات وأحكام المحاكم التونسية',
    fr: 'Décisions de justice tunisiennes',
  },
  doctrine: {
    ar: 'الأعمال الأكاديمية والتعليقات القانونية',
    fr: 'Travaux académiques et commentaires juridiques',
  },
  jort: {
    ar: 'الرائد الرسمي للجمهورية التونسية',
    fr: 'Journal Officiel de la République Tunisienne',
  },
  modeles: {
    ar: 'نماذج الوثائق القانونية',
    fr: 'Modèles de documents juridiques',
  },
  procedures: {
    ar: 'أدلة الإجراءات القضائية',
    fr: 'Guides procéduraux',
  },
  formulaires: {
    ar: 'الاستمارات الرسمية التونسية',
    fr: 'Formulaires officiels tunisiens',
  },
  codes: {
    ar: 'المجلات القانونية التونسية',
    fr: 'Codes juridiques tunisiens',
  },
  constitution: {
    ar: 'دستور الجمهورية التونسية',
    fr: 'Constitution de la République Tunisienne',
  },
  conventions: {
    ar: 'الاتفاقيات والمعاهدات الدولية',
    fr: 'Conventions et traités internationaux',
  },
  guides: {
    ar: 'أدلة عملية للمحامين',
    fr: 'Guides pratiques pour avocats',
  },
  lexique: {
    ar: 'قاموس المصطلحات القانونية',
    fr: 'Lexique des termes juridiques',
  },
  actualites: {
    ar: 'الأخبار والتحديثات القانونية',
    fr: 'Actualités et mises à jour juridiques',
  },
  google_drive: {
    ar: 'مستندات من جوجل درايف',
    fr: 'Documents depuis Google Drive',
  },
  autre: {
    ar: 'فئات أخرى',
    fr: 'Autres catégories',
  },
}

/**
 * Récupérer le label traduit d'une catégorie
 */
export function getLegalCategoryLabel(category: LegalCategory, locale: 'fr' | 'ar' = 'fr'): string {
  return LEGAL_CATEGORY_TRANSLATIONS[category]?.[locale] || category
}

/**
 * Récupérer la description traduite d'une catégorie
 */
export function getLegalCategoryDescription(category: LegalCategory, locale: 'fr' | 'ar' = 'fr'): string {
  return LEGAL_CATEGORY_DESCRIPTIONS[category]?.[locale] || ''
}

/**
 * Récupérer la couleur d'une catégorie
 */
export function getLegalCategoryColor(category: LegalCategory, withOpacity = true): string {
  return withOpacity
    ? LEGAL_CATEGORY_COLORS[category] || LEGAL_CATEGORY_COLORS.autre
    : LEGAL_CATEGORY_BADGE_COLORS[category] || LEGAL_CATEGORY_BADGE_COLORS.autre
}

/**
 * Récupérer l'icône d'une catégorie
 */
export function getLegalCategoryIcon(category: LegalCategory): string {
  return LEGAL_CATEGORY_ICONS[category] || LEGAL_CATEGORY_ICONS.autre
}

/**
 * Liste de toutes les catégories pour les selects/filtres
 */
export function getAllLegalCategories(
  locale: 'fr' | 'ar' = 'fr',
  options: {
    includeAll?: boolean
    excludeCategories?: LegalCategory[]
    onlyCategories?: LegalCategory[]
  } = {}
) {
  const { includeAll = false, excludeCategories = [], onlyCategories } = options

  const categories: Array<{ value: string; label: string; description?: string }> = []

  // Option "Toutes les catégories"
  if (includeAll) {
    categories.push({
      value: 'all',
      label: locale === 'ar' ? 'جميع الفئات' : 'Toutes les catégories',
    })
  }

  // Liste des catégories à afficher
  const categoriesToShow = onlyCategories || Object.keys(LEGAL_CATEGORY_TRANSLATIONS) as LegalCategory[]

  // Ajouter chaque catégorie
  categoriesToShow.forEach((cat) => {
    if (!excludeCategories.includes(cat)) {
      categories.push({
        value: cat,
        label: getLegalCategoryLabel(cat, locale),
        description: getLegalCategoryDescription(cat, locale),
      })
    }
  })

  return categories
}

/**
 * Mapping pour rétrocompatibilité avec les anciennes catégories
 */
export const LEGACY_CATEGORY_MAPPING: Record<string, LegalCategory> = {
  // Anciennes catégories KB
  'code': 'codes',
  'modele': 'modeles',

  // Variantes orthographiques
  'legislation': 'legislation',
  'jurisprudence': 'jurisprudence',
  'doctrine': 'doctrine',
}

/**
 * Normaliser une catégorie (gérer les anciennes valeurs)
 */
export function normalizeLegalCategory(category: string): LegalCategory {
  return (LEGACY_CATEGORY_MAPPING[category] as LegalCategory) || (category as LegalCategory)
}

/**
 * Vérifier si une catégorie est valide
 */
export function isValidLegalCategory(category: string): category is LegalCategory {
  return category in LEGAL_CATEGORY_TRANSLATIONS
}

/**
 * Filtrer les catégories par contexte
 */
export function getCategoriesForContext(
  context: 'web_sources' | 'knowledge_base' | 'classification' | 'all',
  locale: 'fr' | 'ar' = 'fr',
  includeAll = false
) {
  const excludeMap: Partial<Record<typeof context, LegalCategory[]>> = {
    knowledge_base: ['google_drive', 'actualites'],
    classification: ['codes', 'constitution', 'conventions', 'guides', 'lexique', 'google_drive'],
  }

  return getAllLegalCategories(locale, {
    includeAll,
    excludeCategories: excludeMap[context] || [],
  })
}
