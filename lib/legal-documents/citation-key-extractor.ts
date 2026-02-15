/**
 * Citation Key Extractor
 *
 * Génère des clés de citation uniques et stables pour les documents juridiques.
 * Mapping déterministe depuis 9anoun-code-domains.ts pour les codes,
 * pattern générique pour les lois/décrets.
 */

import { NINEANOUN_CODE_DOMAINS, NINEANOUN_KB_SECTIONS } from '@/lib/web-scraper/9anoun-code-domains'

// Mapping slug 9anoun → citation_key canonique
const CODE_SLUG_TO_CITATION: Record<string, string> = {}
for (const [slug, def] of Object.entries(NINEANOUN_CODE_DOMAINS)) {
  // Utiliser le slug tel quel + suffixe "tunisien" pour les codes principaux
  const key = `${slug}-tunisien`
  CODE_SLUG_TO_CITATION[slug] = key
}

// Overrides manuels pour citation_keys plus naturels
const CITATION_OVERRIDES: Record<string, string> = {
  'code-obligations-contrats': 'code-obligations-contrats-tunisien',
  'code-penal': 'code-penal-tunisien',
  'code-procedure-civile-commerciale': 'code-procedure-civile-commerciale-tunisien',
  'code-procedure-penale': 'code-procedure-penale-tunisien',
  'code-statut-personnel': 'code-statut-personnel-tunisien',
  'code-commerce': 'code-commerce-tunisien',
  'code-travail': 'code-travail-tunisien',
  'code-societes-commerciales': 'code-societes-commerciales-tunisien',
}

/**
 * Extraire la citation_key depuis une URL 9anoun.tn
 *
 * Patterns supportés:
 * - /kb/codes/{code-slug}/... → "code-slug-tunisien"
 * - /kb/lois/{loi-slug}/...  → "loi-{numero}"
 * - /kb/jurisprudence/...    → null (pas de document consolidé)
 */
export function extractCitationKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)

    // Pattern codes 9anoun
    const codeMatch = parsed.pathname.match(/\/kb\/codes\/([^/]+)/)
    if (codeMatch) {
      const slug = codeMatch[1]
      return CITATION_OVERRIDES[slug] || CODE_SLUG_TO_CITATION[slug] || null
    }

    // Pattern lois 9anoun
    const loiMatch = parsed.pathname.match(/\/kb\/lois\/([^/]+)/)
    if (loiMatch) {
      return extractCitationKeyFromLawSlug(loiMatch[1])
    }

    return null
  } catch {
    return null
  }
}

/**
 * Extraire la citation_key depuis un slug de code 9anoun
 */
export function extractCitationKeyFromCodeSlug(slug: string): string | null {
  if (!NINEANOUN_CODE_DOMAINS[slug]) return null
  return CITATION_OVERRIDES[slug] || CODE_SLUG_TO_CITATION[slug] || null
}

/**
 * Extraire le numéro d'article depuis une URL 9anoun
 *
 * Pattern: /kb/codes/{code}/{code}-article-{N}
 * Exemples:
 * - code-penal-article-39 → "39"
 * - code-penal-article-226-مكرر → "226 مكرر"
 */
export function extractArticleNumberFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const articleMatch = parsed.pathname.match(/-article-(.+)$/)
    if (!articleMatch) return null

    // Décoder et nettoyer le numéro d'article
    let articleNum = decodeURIComponent(articleMatch[1])
    // Remplacer les tirets par des espaces pour "226-مكرر" → "226 مكرر"
    articleNum = articleNum.replace(/-/g, ' ').trim()
    return articleNum
  } catch {
    return null
  }
}

/**
 * Extraire le slug du code depuis une URL 9anoun
 */
export function extractCodeSlugFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const codeMatch = parsed.pathname.match(/\/kb\/codes\/([^/]+)/)
    return codeMatch ? codeMatch[1] : null
  } catch {
    return null
  }
}

/**
 * Extraire citation_key depuis une référence de loi textuelle
 *
 * Patterns:
 * - "Loi n°2016-36" → "loi-2016-36"
 * - "القانون عدد 36 لسنة 2016" → "loi-2016-36"
 * - "Décret n°2018-417" → "decret-2018-417"
 * - "Loi organique n°2015-26" → "loi-organique-2015-26"
 */
export function extractCitationKeyFromLawReference(text: string): string | null {
  // Pattern français
  const frMatch = text.match(/(?:loi|décret|arrêté)\s*(?:organique\s*)?n°?\s*(\d{4})-(\d+)/i)
  if (frMatch) {
    const type = text.toLowerCase().includes('organique') ? 'loi-organique' :
      text.toLowerCase().startsWith('décret') ? 'decret' :
      text.toLowerCase().startsWith('arrêté') ? 'arrete' : 'loi'
    return `${type}-${frMatch[1]}-${frMatch[2]}`
  }

  // Pattern arabe
  const arMatch = text.match(/القانون\s*(?:الأساسي\s*)?عدد\s*(\d+)\s*لسنة\s*(\d{4})/)
  if (arMatch) {
    const type = text.includes('الأساسي') ? 'loi-organique' : 'loi'
    return `${type}-${arMatch[2]}-${arMatch[1]}`
  }

  return null
}

/**
 * Extraire citation_key depuis un slug de loi 9anoun
 */
function extractCitationKeyFromLawSlug(slug: string): string | null {
  // Pattern: "loi-n-2016-36-du-..." → "loi-2016-36"
  const match = slug.match(/^(loi|decret|arrete)(?:-organique)?-n-(\d{4})-(\d+)/)
  if (match) {
    const hasOrganique = slug.includes('-organique')
    const type = hasOrganique ? `${match[1]}-organique` : match[1]
    return `${type}-${match[2]}-${match[3]}`
  }
  return null
}

/**
 * Obtenir les métadonnées d'un code depuis son slug
 */
export function getCodeMetadata(slug: string) {
  const codeDef = NINEANOUN_CODE_DOMAINS[slug]
  if (!codeDef) return null

  return {
    citationKey: CITATION_OVERRIDES[slug] || CODE_SLUG_TO_CITATION[slug],
    documentType: 'code' as const,
    officialTitleAr: codeDef.nameAr,
    officialTitleFr: codeDef.nameFr,
    primaryCategory: 'codes' as const,
    legalDomains: [codeDef.domain],
  }
}
