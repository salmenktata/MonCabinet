/**
 * Hiérarchie des normes juridiques tunisiennes (pyramide de Kelsen)
 * 8 niveaux selon la Circulaire n°8/2017 — distinction مرسوم (Fsl.70) vs أوامر (Fsl.94)
 */

// =============================================================================
// TYPES
// =============================================================================

export type NormLevel =
  | 'constitution'
  | 'traite_international'
  | 'loi_organique'
  | 'loi_ordinaire'
  | 'marsoum'               // مرسوم — Fsl.70 : domaine législatif délégué (force de loi)
  | 'ordre_reglementaire'   // أوامر — Fsl.94 : pouvoir réglementaire ordinaire
  | 'arrete_ministeriel'
  | 'acte_local'

// =============================================================================
// CONFIGURATION DES NIVEAUX
// =============================================================================

export interface NormLevelConfig {
  value: NormLevel
  order: number         // 1 = sommet de la pyramide
  labelAr: string
  labelFr: string
  color: string         // Classe Tailwind bg+text
  badgeColor: string    // Classes Tailwind pour Badge
  description: string
}

export const NORM_LEVEL_CONFIG: Record<NormLevel, NormLevelConfig> = {
  constitution: {
    value: 'constitution',
    order: 1,
    labelAr: 'الدستور',
    labelFr: 'Constitution',
    color: 'text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Norme suprême, fondement de l\'ordre juridique',
  },
  traite_international: {
    value: 'traite_international',
    order: 2,
    labelAr: 'معاهدات دولية',
    labelFr: 'Traités internationaux',
    color: 'text-purple-800',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    description: 'Conventions et traités ratifiés par la Tunisie',
  },
  loi_organique: {
    value: 'loi_organique',
    order: 3,
    labelAr: 'قانون أساسي',
    labelFr: 'Loi organique',
    color: 'text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Lois organiques encadrant les institutions',
  },
  loi_ordinaire: {
    value: 'loi_ordinaire',
    order: 4,
    labelAr: 'قانون عادي',
    labelFr: 'Loi ordinaire / Code',
    color: 'text-sky-800',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
    description: 'Lois ordinaires, codes et législation générale',
  },
  marsoum: {
    value: 'marsoum',
    order: 5,
    labelAr: 'مرسوم',
    labelFr: 'Marsoum (force de loi)',
    color: 'text-green-800',
    badgeColor: 'bg-green-100 text-green-800 border-green-300',
    description: 'Décrets dans le domaine législatif (Fsl.70) — force de loi, ratification parlementaire requise',
  },
  ordre_reglementaire: {
    value: 'ordre_reglementaire',
    order: 6,
    labelAr: 'أوامر / نصوص ترتيبية',
    labelFr: 'Ordre réglementaire',
    color: 'text-teal-800',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    description: 'Ordres présidentiels et gouvernementaux + textes des organes constitutionnels (Fsl.94)',
  },
  arrete_ministeriel: {
    value: 'arrete_ministeriel',
    order: 7,
    labelAr: 'قرار وزاري',
    labelFr: 'Arrêté ministériel',
    color: 'text-orange-800',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    description: 'Arrêtés ministériels et circulaires',
  },
  acte_local: {
    value: 'acte_local',
    order: 8,
    labelAr: 'قرار ترابي',
    labelFr: 'Acte local',
    color: 'text-gray-700',
    badgeColor: 'bg-gray-100 text-gray-700 border-gray-300',
    description: 'Actes des collectivités territoriales',
  },
}

// Niveaux triés par ordre hiérarchique (1=Constitution en premier)
export const NORM_LEVELS_ORDERED: NormLevelConfig[] = Object.values(NORM_LEVEL_CONFIG)
  .sort((a, b) => a.order - b.order)

// =============================================================================
// BOOSTS RAG
// =============================================================================

export const NORM_LEVEL_RAG_BOOSTS: Record<NormLevel, number> = {
  constitution: 1.35,
  traite_international: 1.30,
  loi_organique: 1.24,
  loi_ordinaire: 1.19,
  marsoum: 1.15,             // Force de loi (Fsl.70) — rehaussé vs ancien decret_presidentiel
  ordre_reglementaire: 1.10, // Pouvoir réglementaire (Fsl.94)
  arrete_ministeriel: 1.07,
  acte_local: 1.04,
}

// =============================================================================
// MAPPING SUBCATEGORY → NORM LEVEL (source de vérité côté TS)
// =============================================================================

export const SUBCATEGORY_TO_NORM_LEVEL: Record<string, NormLevel> = {
  constitution: 'constitution',
  loi_organique: 'loi_organique',
  coc: 'loi_ordinaire',
  code_penal: 'loi_ordinaire',
  code_commerce: 'loi_ordinaire',
  code_travail: 'loi_ordinaire',
  csp: 'loi_ordinaire',
  code_fiscal: 'loi_ordinaire',
  code_article: 'loi_ordinaire',
  // Niveau 5 — مرسوم (Fsl.70, domaine législatif délégué)
  decret_loi: 'marsoum',
  decret: 'marsoum',
  // Niveau 6 — أوامر (Fsl.94, pouvoir réglementaire ordinaire)
  decret_gouvernemental: 'ordre_reglementaire',
  ordre_presidentiel: 'ordre_reglementaire',
  arrete: 'arrete_ministeriel',
  circulaire: 'arrete_ministeriel',
}

export const CATEGORY_TO_NORM_LEVEL: Record<string, NormLevel> = {
  constitution: 'constitution',
  conventions: 'traite_international',
  legislation: 'loi_ordinaire',
  codes: 'loi_ordinaire',
  jort: 'loi_ordinaire',
}

// =============================================================================
// HELPERS
// =============================================================================

export function getNormLevelLabel(level: NormLevel | string | null | undefined, lang: 'fr' | 'ar' = 'fr'): string {
  if (!level) return ''
  const config = NORM_LEVEL_CONFIG[level as NormLevel]
  if (!config) return level
  return lang === 'ar' ? config.labelAr : config.labelFr
}

export function getNormLevelColor(level: NormLevel | string | null | undefined): string {
  if (!level) return ''
  const config = NORM_LEVEL_CONFIG[level as NormLevel]
  return config?.badgeColor || 'bg-gray-100 text-gray-700 border-gray-300'
}

export function getNormLevelOrder(level: NormLevel | string | null | undefined): number {
  if (!level) return 99
  const config = NORM_LEVEL_CONFIG[level as NormLevel]
  return config?.order ?? 99
}

export function isValidNormLevel(value: string | null | undefined): value is NormLevel {
  if (!value) return false
  return value in NORM_LEVEL_CONFIG
}
