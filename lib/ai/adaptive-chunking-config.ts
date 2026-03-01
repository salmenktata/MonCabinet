/**
 * Configuration chunking adaptatif par catégorie juridique (Phase 2.3)
 *
 * Optimise la taille des chunks selon le type de document pour améliorer
 * la précision de la recherche sémantique et réduire le bruit.
 *
 * @module lib/ai/adaptive-chunking-config
 */

import type { KnowledgeCategory } from '@/lib/categories/legal-categories'

// =============================================================================
// TYPES
// =============================================================================

export interface ChunkConfig {
  /** Taille du chunk en caractères */
  size: number

  /** Chevauchement entre chunks en caractères */
  overlap: number

  /** Préserver les paragraphes (éviter couper au milieu) */
  preserveParagraphs?: boolean

  /** Préserver les phrases (éviter couper au milieu) */
  preserveSentences?: boolean

  /** Raison de cette configuration */
  rationale?: string
}

// =============================================================================
// CONFIGURATION PAR CATÉGORIE
// =============================================================================

/**
 * Configuration chunking adaptatif par catégorie juridique
 *
 * Basé sur analyse empirique des documents et optimisation scores similarité.
 */
export const ADAPTIVE_CHUNK_CONFIG: Record<KnowledgeCategory, ChunkConfig> = {
  // Jurisprudence : décisions longues, contexte important
  jurisprudence: {
    size: 1800,
    overlap: 300, // Augmenté 200→300 (Mar 2026) : transitions faits/motifs/dispositif longues
    preserveParagraphs: true,
    rationale:
      'Décisions longues nécessitent chunks larges pour conserver contexte (faits + motifs + dispositif). '
      + 'Overlap 300 pour ne pas couper les transitions structurelles des arrêts.',
  },

  // Codes : articles courts, précision maximale
  codes: {
    size: 900, // Augmenté 600→900 (Mar 2026) : articles bilingues AR+FR > 600 chars → split mid-article
    overlap: 120, // Augmenté 100→120
    preserveSentences: true,
    rationale:
      'Articles bilingues AR+FR nécessitent 900 chars pour garder 1 article = 1 chunk. '
      + '600 chars coupait les articles longs au milieu du corps FR ou AR.',
  },

  // Législation : textes moyens
  legislation: {
    size: 1200,
    overlap: 150,
    preserveParagraphs: true,
    rationale: 'Lois/décrets longueur moyenne, balance contexte vs précision',
  },

  // Doctrine : analyses longues
  doctrine: {
    size: 1500,
    overlap: 180,
    preserveParagraphs: true,
    rationale: 'Analyses doctrinales longues nécessitent chunks larges pour arguments complets',
  },

  // JORT : textes officiels moyens
  jort: {
    size: 1200,
    overlap: 150,
    preserveParagraphs: true,
    rationale: 'Textes officiels JORT longueur moyenne',
  },

  // Modèles : templates courts
  modeles: {
    size: 800,
    overlap: 100,
    preserveSentences: true,
    rationale: 'Modèles courts et concis, chunks moyens suffisants',
  },

  // Formulaires : champs courts
  formulaires: {
    size: 700,
    overlap: 80,
    preserveSentences: true,
    rationale: 'Formulaires avec champs courts, chunks courts pour précision',
  },

  // Procédures : étapes structurées
  procedures: {
    size: 1200,
    overlap: 150,
    preserveParagraphs: true,
    rationale: 'Procédures structurées en étapes, chunks moyens pour étapes complètes',
  },

  // Conventions : textes longs
  conventions: {
    size: 1400,
    overlap: 170,
    preserveParagraphs: true,
    rationale: 'Conventions internationales longues, chunks larges pour articles complets',
  },

  // Constitution : texte fondamental long
  constitution: {
    size: 1500,
    overlap: 180,
    preserveParagraphs: true,
    rationale: 'Constitution tunisienne, articles longs nécessitent contexte complet',
  },

  // Guides : documents pratiques moyens
  guides: {
    size: 1100,
    overlap: 130,
    preserveParagraphs: true,
    rationale: 'Guides pratiques moyens, chunks moyens pour sections complètes',
  },

  // Lexique : définitions courtes
  lexique: {
    size: 600,
    overlap: 80,
    preserveSentences: true,
    rationale: 'Définitions courtes, chunks courts pour précision terminologique',
  },

  // Défaut : configuration générique
  autre: {
    size: 1024, // Défaut actuel
    overlap: 100,
    preserveParagraphs: true,
    rationale: 'Configuration par défaut pour documents non catégorisés',
  },
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Récupère la configuration de chunking pour une catégorie
 *
 * @param category - Catégorie du document
 * @returns Configuration chunking adaptée
 */
export function getChunkConfig(category: KnowledgeCategory | string): ChunkConfig {
  // Normalisation catégorie (rétrocompatibilité)
  const normalized = normalizeCategory(category)

  // Retourner config ou fallback
  return ADAPTIVE_CHUNK_CONFIG[normalized] || ADAPTIVE_CHUNK_CONFIG.autre
}

/**
 * Normalise une catégorie pour rétrocompatibilité
 *
 * Exemples : "code" → "codes", "modele" → "modeles"
 */
function normalizeCategory(category: string): KnowledgeCategory {
  const normalized = category.toLowerCase().trim()

  // Mapping rétrocompatibilité
  const mapping: Record<string, KnowledgeCategory> = {
    code: 'codes',
    modele: 'modeles',
    formulaire: 'formulaires',
    procedure: 'procedures',
    convention: 'conventions',
    guide: 'guides',
  }

  return (mapping[normalized] as KnowledgeCategory) || (normalized as KnowledgeCategory)
}

/**
 * Affiche les statistiques de configuration chunking
 */
export function getChunkConfigStats(): {
  categories: number
  avgSize: number
  minSize: number
  maxSize: number
} {
  const configs = Object.values(ADAPTIVE_CHUNK_CONFIG)
  const sizes = configs.map((c) => c.size)

  return {
    categories: configs.length,
    avgSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
  }
}
