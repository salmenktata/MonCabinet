/**
 * Détection automatique de catégorie par page (Options A + B)
 *
 * Priorité :
 *   1. Option B — Règles URL configurées par l'admin (category_rules sur web_sources)
 *   2. Option A — Patterns déterministes basés sur l'URL (~0ms, pas de LLM)
 *   3. Fallback — categories[0] de la source
 */

export interface CategoryRule {
  /** Motif à matcher (chemin URL, regex, préfixe) */
  pattern: string
  /** Catégorie cible si le motif correspond */
  category: string
  /** Mode de matching */
  type: 'prefix' | 'contains' | 'regex'
}

/**
 * Détecte la catégorie appropriée pour une page donnée.
 *
 * @param url - URL complète de la page
 * @param sourceCategories - Catégories de la source web (categories[])
 * @param categoryRules - Règles admin configurées sur la source (category_rules)
 * @param title - Titre de la page (optionnel, utilisé pour affiner la détection IORT)
 */
export function detectPageCategory(
  url: string,
  sourceCategories: string[],
  categoryRules: CategoryRule[],
  title?: string | null
): string {
  // Option B : règles admin en priorité
  for (const rule of categoryRules) {
    if (matchesRule(url, rule)) return rule.category
  }

  // Option A : patterns déterministes
  const auto = detectFromUrlPatterns(url, title)
  if (auto) return auto

  // Fallback : première catégorie de la source
  return sourceCategories[0] || 'autre'
}

/** Mots-clés arabes indiquant une convention/traité international dans le titre */
const CONVENTION_TITLE_KEYWORDS = [
  'اتفاقية',   // convention
  'اتفاق ',    // accord (avec espace pour éviter "اتفاقية")
  'معاهدة',   // traité
  'بروتوكول', // protocole
]

/**
 * Option A — Détection par patterns d'URL connus.
 * Couvre les domaines déjà indexés : 9anoun.tn, iort.gov.tn, cassation.tn.
 */
function detectFromUrlPatterns(url: string, title?: string | null): string | null {
  // 9anoun.tn — sections du knowledge base
  if (url.includes('/kb/codes/')) return 'codes'
  if (url.includes('/kb/constitution')) return 'constitution'
  if (url.includes('/kb/conventions') || url.includes('/kb/traites')) return 'conventions'
  if (url.includes('/modeles/') || url.includes('/formulaires/')) return 'modeles'
  if (url.includes('/jurisprudence/') || url.includes('/arrets/') || url.includes('/decisions/')) return 'jurisprudence'
  if (url.includes('/doctrine/') || url.includes('/articles/')) return 'doctrine'
  if (url.includes('/procedures/')) return 'procedures'
  if (url.includes('/guides/')) return 'guides'
  if (url.includes('/lexique/') || url.includes('/lexi/')) return 'lexique'
  if (url.includes('/actualites/')) return 'actualites'

  // iort.gov.tn — affiner par type d'acte dans l'URL puis par titre
  if (url.includes('iort.gov.tn')) {
    // Textes législatifs détectés par le segment de chemin
    if (url.includes('/قانون/') || url.includes('/مرسوم/') || url.includes('/قانون_أساسي/')) {
      return 'legislation'
    }
    // Conventions/traités détectés par mots-clés dans le titre
    if (title && CONVENTION_TITLE_KEYWORDS.some(kw => title.includes(kw))) {
      return 'conventions'
    }
    // Constitution
    if (url.includes('/دستور/')) return 'constitution'
    return 'jort'
  }

  // cassation.tn — jurisprudence
  if (url.includes('cassation.tn')) return 'jurisprudence'

  return null
}

/**
 * Option B — Vérifie si une URL correspond à une règle admin.
 */
function matchesRule(url: string, rule: CategoryRule): boolean {
  switch (rule.type) {
    case 'contains':
      return url.includes(rule.pattern)
    case 'prefix': {
      // Matcher sur le path uniquement (après le domaine)
      try {
        const path = new URL(url).pathname
        return path.startsWith(rule.pattern)
      } catch {
        return url.includes(rule.pattern)
      }
    }
    case 'regex': {
      try {
        return new RegExp(rule.pattern).test(url)
      } catch {
        return false
      }
    }
    default:
      return false
  }
}
