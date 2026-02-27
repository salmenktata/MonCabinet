/**
 * Mapping des types de textes IORT (iort.gov.tn) vers les métadonnées
 * de legal_documents correspondants.
 *
 * Source : IORT_TEXT_TYPES dans lib/web-scraper/iort-scraper-utils.ts
 * La clé = valeur arabe du textType (stockée dans web_pages.structured_data->>'textType')
 *
 * Utilisé par :
 * - scripts/process-iort-types.ts (création des legal_documents)
 * - lib/web-scraper/web-indexer-service.ts (pipeline auto)
 */

import type { LegalDomain, DocumentNature } from '@/lib/web-scraper/types'

export interface IortDocumentDef {
  citationKey: string
  domain: LegalDomain
  documentType: DocumentNature
  titleAr: string
  titleFr: string
  primaryCategory: string
  tags: string[]
}

/**
 * Mapping textType (valeur arabe) → définition legal_document
 * Chaque type génère 1 legal_document regroupant tous les textes du même type.
 *
 * NB: les clés correspondent à IORT_TEXT_TYPES[x].value (valeur arabe exacte du site)
 */
export const IORT_DOCUMENT_DOMAINS: Record<string, IortDocumentDef> = {
  'قانون': {
    citationKey: 'jort-lois',
    domain: 'administratif',
    documentType: 'loi',
    titleAr: 'الرائد الرسمي للجمهورية التونسية - قوانين',
    titleFr: 'JORT - Lois',
    primaryCategory: 'legislation',
    tags: ['jort', 'loi', 'legislation', 'officiel', 'tunisie'],
  },
  'مرسوم': {
    citationKey: 'jort-decrets',
    domain: 'administratif',
    documentType: 'decret',
    titleAr: 'الرائد الرسمي للجمهورية التونسية - مراسيم',
    titleFr: 'JORT - Décrets',
    primaryCategory: 'legislation',
    tags: ['jort', 'decret', 'legislation', 'officiel', 'tunisie'],
  },
  'أمر': {
    citationKey: 'jort-ordres',
    domain: 'administratif',
    documentType: 'arrete',
    titleAr: 'الرائد الرسمي للجمهورية التونسية - أوامر',
    titleFr: 'JORT - Ordres/Arrêtés',
    primaryCategory: 'legislation',
    tags: ['jort', 'arrete', 'ordre', 'legislation', 'officiel', 'tunisie'],
  },
  'قرار': {
    citationKey: 'jort-decisions',
    domain: 'administratif',
    documentType: 'arrete_ministeriel',
    titleAr: 'الرائد الرسمي للجمهورية التونسية - قرارات',
    titleFr: 'JORT - Décisions',
    primaryCategory: 'legislation',
    tags: ['jort', 'decision', 'arrete-ministeriel', 'legislation', 'officiel', 'tunisie'],
  },
  'رإي': {
    // NB: valeur exacte du site iort.gov.tn (orthographe non standard)
    citationKey: 'jort-avis',
    domain: 'administratif',
    documentType: 'avis',
    titleAr: 'الرائد الرسمي للجمهورية التونسية - آراء',
    titleFr: 'JORT - Avis',
    primaryCategory: 'legislation',
    tags: ['jort', 'avis', 'legislation', 'officiel', 'tunisie'],
  },
}

/**
 * URL de base de iort.gov.tn (pour identifier la source)
 */
export const IORT_BASE_URLS = [
  'http://www.iort.gov.tn',
  'https://www.iort.gov.tn',
  'http://iort.gov.tn',
  'https://iort.gov.tn',
]
