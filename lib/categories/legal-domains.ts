// =============================================================================
// Taxonomie des domaines juridiques tunisiens
// Concept UI uniquement — pas de colonne DB correspondante.
// Chaque domaine mappe vers des categories + normLevels existants.
// =============================================================================

import type { NormLevel } from '@/lib/categories/norm-levels'

export interface LegalDomain {
  id: string
  labelFr: string
  labelAr: string
  icon: string
  description?: string
  /** Catégories KB ciblées */
  categories: string[]
  /** Niveaux normatifs ciblés (optionnel — si absent, tous les niveaux) */
  normLevels?: NormLevel[]
  /** Mots-clés dans le titre pour affiner le domaine (utilisé côté UI uniquement) */
  titleKeywords?: string[]
}

export const LEGAL_DOMAINS: LegalDomain[] = [
  {
    id: 'droit_constitutionnel',
    labelFr: 'Droit constitutionnel',
    labelAr: 'القانون الدستوري',
    icon: 'Shield',
    description: 'Constitution 2022, lois organiques fondamentales',
    categories: ['constitution', 'legislation'],
    normLevels: ['constitution', 'loi_organique'],
  },
  {
    id: 'droit_civil',
    labelFr: 'Droit civil',
    labelAr: 'القانون المدني',
    icon: 'Scale',
    description: 'Code civil, obligations, statut personnel, successions',
    categories: ['codes'],
    titleKeywords: ['civil', 'obligations', 'statut personnel', 'successions', 'مدني', 'أحوال شخصية'],
  },
  {
    id: 'droit_commercial',
    labelFr: 'Droit commercial',
    labelAr: 'القانون التجاري',
    icon: 'Briefcase',
    description: 'Code de commerce, sociétés, chèque, faillite, maritime',
    categories: ['codes'],
    titleKeywords: ['commerce', 'sociétés', 'chèque', 'faillite', 'maritime', 'تجاري', 'شركات'],
  },
  {
    id: 'droit_penal',
    labelFr: 'Droit pénal',
    labelAr: 'القانون الجزائي',
    icon: 'Gavel',
    description: 'Code pénal, procédure pénale',
    categories: ['codes'],
    titleKeywords: ['pénal', 'procédure pénale', 'جزائي', 'عقوبات', 'إجراءات جزائية'],
  },
  {
    id: 'droit_fiscal',
    labelFr: 'Droit fiscal',
    labelAr: 'القانون الجبائي',
    icon: 'Calculator',
    description: 'Code fiscal, IRPP, TVA, impôts sur les sociétés',
    categories: ['codes', 'legislation'],
    titleKeywords: ['fiscal', 'IRPP', 'TVA', 'impôt', 'جبائي', 'ضريبة', 'الأداء'],
  },
  {
    id: 'droit_travail',
    labelFr: "Droit du travail",
    labelAr: 'قانون الشغل',
    icon: 'Users',
    description: "Code du travail, emploi, sécurité sociale",
    categories: ['codes'],
    titleKeywords: ['travail', 'emploi', 'شغل', 'عمل', 'ضمان اجتماعي'],
  },
  {
    id: 'conventions_internationales',
    labelFr: 'Conventions internationales',
    labelAr: 'الاتفاقيات الدولية',
    icon: 'Globe',
    description: 'Conventions bilatérales et multilatérales ratifiées par la Tunisie',
    categories: ['conventions'],
    normLevels: ['traite_international'],
  },
  {
    id: 'legislation_generale',
    labelFr: 'Législation générale',
    labelAr: 'التشريع العام',
    icon: 'FileText',
    description: 'Lois ordinaires, décrets, arrêtés ministériels',
    categories: ['legislation', 'jort'],
    normLevels: ['loi_ordinaire', 'decret_presidentiel', 'arrete_ministeriel', 'acte_local'],
  },
]

/** Map id → domain pour lookup rapide */
export const LEGAL_DOMAIN_MAP: Record<string, LegalDomain> = Object.fromEntries(
  LEGAL_DOMAINS.map((d) => [d.id, d])
)

/**
 * Déduit les paramètres API à passer à /api/client/kb/browse
 * à partir d'un domaine juridique.
 * Retourne la première catégorie (ou undefined) + normLevel si unique.
 */
export function getDomainBrowseParams(domainId: string): {
  category?: string
  normLevel?: string
} {
  const domain = LEGAL_DOMAIN_MAP[domainId]
  if (!domain) return {}

  // Pour les domaines avec une seule catégorie dominante
  const category = domain.categories[0]
  // Pour les domaines avec un seul normLevel, on le passe directement
  const normLevel =
    domain.normLevels && domain.normLevels.length === 1
      ? domain.normLevels[0]
      : undefined

  return { category, normLevel }
}
