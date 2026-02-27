/**
 * Mapping des 17 thèmes de cassation.tn vers les métadonnées
 * de legal_documents correspondants.
 *
 * Source : CASSATION_THEMES dans lib/web-scraper/typo3-csrf-utils.ts
 *
 * Utilisé par :
 * - scripts/backfill-cassation-themes.ts (backfill structured_data.theme)
 * - scripts/process-cassation-themes.ts (création des legal_documents)
 * - lib/web-scraper/web-indexer-service.ts (pipeline auto)
 */

import type { LegalDomain, DocumentNature } from '@/lib/web-scraper/types'

export interface CassationDocumentDef {
  citationKey: string
  domain: LegalDomain
  documentType: DocumentNature
  titleAr: string
  titleFr: string
  primaryCategory: string
  tags: string[]
}

/**
 * Mapping themeCode (TA/TB/...) → définition legal_document
 * Chaque thème génère 1 legal_document regroupant toutes les décisions du thème.
 */
export const CASSATION_DOCUMENT_DOMAINS: Record<string, CassationDocumentDef> = {
  'TA': {
    citationKey: 'cassation-civil-general',
    domain: 'civil',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - مدني عام',
    titleFr: 'Cour de Cassation - Civil Général',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'civil', 'jurisprudence', 'tunisie'],
  },
  'TB': {
    citationKey: 'cassation-commercial',
    domain: 'commercial',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - تجاري',
    titleFr: 'Cour de Cassation - Commercial',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'commercial', 'jurisprudence', 'tunisie'],
  },
  'TC': {
    citationKey: 'cassation-statut-personnel',
    domain: 'famille',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - شخصي',
    titleFr: 'Cour de Cassation - Statut Personnel',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'famille', 'statut-personnel', 'jurisprudence', 'tunisie'],
  },
  'TD': {
    citationKey: 'cassation-social',
    domain: 'social',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - اجتماعي',
    titleFr: 'Cour de Cassation - Social',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'social', 'travail', 'jurisprudence', 'tunisie'],
  },
  'TF': {
    citationKey: 'cassation-penal',
    domain: 'penal',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - جزائي',
    titleFr: 'Cour de Cassation - Pénal',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'penal', 'jurisprudence', 'tunisie'],
  },
  'TG': {
    citationKey: 'cassation-procedure-penale',
    domain: 'procedure_penale',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - اجراءات جزائية',
    titleFr: 'Cour de Cassation - Procédures Pénales',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'procedure-penale', 'jurisprudence', 'tunisie'],
  },
  'TH': {
    citationKey: 'cassation-procedure-civile',
    domain: 'procedure_civile',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - اجراءات مدنية',
    titleFr: 'Cour de Cassation - Procédures Civiles',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'procedure-civile', 'jurisprudence', 'tunisie'],
  },
  'TI': {
    citationKey: 'cassation-arbitrage',
    domain: 'arbitrage',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - تحكيم',
    titleFr: 'Cour de Cassation - Arbitrage',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'arbitrage', 'jurisprudence', 'tunisie'],
  },
  'VT': {
    citationKey: 'cassation-vente',
    domain: 'commercial',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - بيع',
    titleFr: 'Cour de Cassation - Vente',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'vente', 'commercial', 'jurisprudence', 'tunisie'],
  },
  'LC': {
    citationKey: 'cassation-baux',
    domain: 'immobilier',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - أكرية',
    titleFr: 'Cour de Cassation - Baux',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'baux', 'immobilier', 'jurisprudence', 'tunisie'],
  },
  'MR': {
    citationKey: 'cassation-droits-reels',
    domain: 'immobilier',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - عيني',
    titleFr: 'Cour de Cassation - Droits Réels',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'droits-reels', 'immobilier', 'jurisprudence', 'tunisie'],
  },
  'UR': {
    citationKey: 'cassation-refere',
    domain: 'procedure_civile',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - استعجالي',
    titleFr: 'Cour de Cassation - Référé',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'refere', 'procedure-civile', 'jurisprudence', 'tunisie'],
  },
  'AS': {
    citationKey: 'cassation-assurance-accidents',
    domain: 'assurance',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - تأمين وحوادث مرور',
    titleFr: 'Cour de Cassation - Assurance & Accidents',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'assurance', 'accidents', 'jurisprudence', 'tunisie'],
  },
  'MS': {
    citationKey: 'cassation-procedures-collectives',
    domain: 'commercial',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - إجراءات جماعية',
    titleFr: 'Cour de Cassation - Procédures Collectives',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'faillite', 'procedures-collectives', 'jurisprudence', 'tunisie'],
  },
  'TJ': {
    citationKey: 'cassation-dip',
    domain: 'international_prive',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - قانون دولي خاص',
    titleFr: 'Cour de Cassation - DIP',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'droit-international-prive', 'jurisprudence', 'tunisie'],
  },
  'CR': {
    citationKey: 'cassation-chambres-reunies',
    domain: 'civil',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - الدوائر المجتمعة',
    titleFr: 'Cour de Cassation - Chambres Réunies',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'chambres-reunies', 'jurisprudence', 'tunisie'],
  },
  'PC': {
    citationKey: 'cassation-proportionnalite',
    domain: 'civil',
    documentType: 'arret_cassation',
    titleAr: 'قضاء النقض - التناسب - الفصل 49',
    titleFr: 'Cour de Cassation - Proportionnalité Art. 49',
    primaryCategory: 'jurisprudence',
    tags: ['cassation', 'proportionnalite', 'constitutionnel', 'jurisprudence', 'tunisie'],
  },
}

/**
 * URL de base de cassation.tn (pour identifier la source)
 */
export const CASSATION_BASE_URLS = [
  'http://www.cassation.tn',
  'https://www.cassation.tn',
  'http://cassation.tn',
  'https://cassation.tn',
]
