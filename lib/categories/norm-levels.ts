/**
 * Hiérarchie des normes juridiques tunisiennes (pyramide de Kelsen)
 * 7 niveaux, du plus haut (Constitution) au plus bas (Actes locaux)
 */

// =============================================================================
// TYPES
// =============================================================================

export type NormLevel =
  | 'constitution'
  | 'traite_international'
  | 'loi_organique'
  | 'loi_ordinaire'
  | 'decret_presidentiel'
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
  decret_presidentiel: {
    value: 'decret_presidentiel',
    order: 5,
    labelAr: 'مرسوم / أمر رئاسي',
    labelFr: 'Décret présidentiel',
    color: 'text-green-800',
    badgeColor: 'bg-green-100 text-green-800 border-green-300',
    description: 'Décrets et ordres présidentiels',
  },
  arrete_ministeriel: {
    value: 'arrete_ministeriel',
    order: 6,
    labelAr: 'قرار وزاري',
    labelFr: 'Arrêté ministériel',
    color: 'text-orange-800',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    description: 'Arrêtés ministériels et circulaires',
  },
  acte_local: {
    value: 'acte_local',
    order: 7,
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
  constitution: 1.25,
  traite_international: 1.20,
  loi_organique: 1.15,
  loi_ordinaire: 1.10,
  decret_presidentiel: 1.05,
  arrete_ministeriel: 1.02,
  acte_local: 1.00,
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
  decret_loi: 'decret_presidentiel',
  decret: 'decret_presidentiel',
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
