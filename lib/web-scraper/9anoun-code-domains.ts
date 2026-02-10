/**
 * Mapping complet des codes juridiques tunisiens (9anoun.tn)
 * vers leur domaine juridique et nature de document.
 *
 * Source : https://9anoun.tn/kb/codes (50 codes, février 2026)
 *
 * Utilisé par :
 * - tryDeterministicClassification() dans legal-classifier-service.ts (fast-path)
 * - TUNISIAN_CODES dans types.ts (re-export enrichi)
 */

import type { LegalDomain, DocumentNature } from './types'

export interface NineAnounCodeDef {
  domain: LegalDomain
  documentType: DocumentNature
  nameAr: string
  nameFr: string
}

/**
 * Mapping slug -> { domain, documentType, nameAr, nameFr }
 * Chaque slug correspond au path /kb/codes/{slug} sur 9anoun.tn
 */
export const NINEANOUN_CODE_DOMAINS: Record<string, NineAnounCodeDef> = {
  // ===== CIVIL =====
  'code-obligations-contrats': {
    domain: 'civil',
    documentType: 'loi',
    nameAr: 'مجلة الالتزامات والعقود',
    nameFr: 'Code des Obligations et des Contrats',
  },
  'code-nationalite': {
    domain: 'civil',
    documentType: 'loi',
    nameAr: 'مجلة الجنسية',
    nameFr: 'Code de la Nationalité',
  },

  // ===== IMMOBILIER =====
  'code-droits-reels': {
    domain: 'immobilier',
    documentType: 'loi',
    nameAr: 'مجلة الحقوق العينية',
    nameFr: 'Code des Droits Réels',
  },
  'code-foncier': {
    domain: 'immobilier',
    documentType: 'loi',
    nameAr: 'مجلة الحقوق العينية',
    nameFr: 'Code Foncier',
  },

  // ===== FAMILLE =====
  'code-statut-personnel': {
    domain: 'famille',
    documentType: 'loi',
    nameAr: 'مجلة الأحوال الشخصية',
    nameFr: 'Code du Statut Personnel',
  },
  'code-protection-enfant': {
    domain: 'famille',
    documentType: 'loi',
    nameAr: 'مجلة حماية الطفل',
    nameFr: "Code de Protection de l'Enfant",
  },

  // ===== COMMERCIAL =====
  'code-commerce': {
    domain: 'commercial',
    documentType: 'loi',
    nameAr: 'المجلة التجارية',
    nameFr: 'Code de Commerce',
  },
  'code-changes-commerce-exterieur': {
    domain: 'commercial',
    documentType: 'loi',
    nameAr: 'مجلة الصرف و التجارة الخارجية',
    nameFr: 'Code des Changes et du Commerce Extérieur',
  },
  'projet-code-des-changes-2024': {
    domain: 'commercial',
    documentType: 'loi',
    nameAr: 'Projet du Code des Changes 2024',
    nameFr: 'Projet du Code des Changes 2024',
  },

  // ===== SOCIETES =====
  'code-societes-commerciales': {
    domain: 'societes',
    documentType: 'loi',
    nameAr: 'مجلة الشركات التجارية',
    nameFr: 'Code des Sociétés Commerciales',
  },

  // ===== MARITIME =====
  'code-commerce-maritime': {
    domain: 'maritime',
    documentType: 'loi',
    nameAr: 'مجلة التجارة البحرية',
    nameFr: 'Code de Commerce Maritime',
  },
  'code-ports-maritimes': {
    domain: 'maritime',
    documentType: 'loi',
    nameAr: 'مجلة الموانئ البحرية',
    nameFr: 'Code des Ports Maritimes',
  },
  'code-organisation-navigation-maritime': {
    domain: 'maritime',
    documentType: 'loi',
    nameAr: 'مجلة التنظيم الإداري للملاحة البحرية',
    nameFr: "Code de l'Organisation Administrative de la Navigation Maritime",
  },
  'code-peche-maritime': {
    domain: 'maritime',
    documentType: 'loi',
    nameAr: 'مجلة الصياد البحري',
    nameFr: 'Code de la Pêche Maritime',
  },

  // ===== PENAL =====
  'code-penal': {
    domain: 'penal',
    documentType: 'loi',
    nameAr: 'المجلة الجزائية',
    nameFr: 'Code Pénal',
  },
  'code-justice-militaire': {
    domain: 'penal',
    documentType: 'loi',
    nameAr: 'مجلة المرافعات والعقوبات العسكرية',
    nameFr: 'Code de Justice Militaire',
  },
  'code-disciplinaire-penal-maritime': {
    domain: 'penal',
    documentType: 'loi',
    nameAr: 'المجلة التأديبية والجزائية البحرية',
    nameFr: 'Code Disciplinaire et Pénal Maritime',
  },

  // ===== PROCEDURE =====
  'code-procedure-civile-commerciale': {
    domain: 'procedure_civile',
    documentType: 'loi',
    nameAr: 'مجلة المرافعات المدنية والتجارية',
    nameFr: 'Code de Procédure Civile et Commerciale',
  },
  'code-procedure-penale': {
    domain: 'procedure_penale',
    documentType: 'loi',
    nameAr: 'مجلة الإجراءات الجزائية',
    nameFr: 'Code de Procédure Pénale',
  },
  'code-arbitrage': {
    domain: 'arbitrage',
    documentType: 'loi',
    nameAr: 'مجلة التحكيم',
    nameFr: "Code de l'Arbitrage",
  },

  // ===== SOCIAL =====
  'code-travail': {
    domain: 'social',
    documentType: 'loi',
    nameAr: 'مجلة الشغل',
    nameFr: 'Code du Travail',
  },
  'code-travail-maritime': {
    domain: 'social',
    documentType: 'loi',
    nameAr: 'مجلة الشغل البحري',
    nameFr: 'Code du Travail Maritime',
  },
  'code-travail-proposition-amendements-2025': {
    domain: 'social',
    documentType: 'loi',
    nameAr: 'مشروع قانون يتعلق بتنظيم عقود الشغل ومنع المناولة',
    nameFr: 'Projet de loi sur les contrats de travail',
  },

  // ===== FISCAL =====
  'code-impot-sur-revenu-personnes-physiques-impot-sur-les-societes': {
    domain: 'fiscal',
    documentType: 'loi',
    nameAr: 'مجلة الضريبة على دخل الأشخاص الطبيعيين والضريبة على الشركات',
    nameFr: "Code de l'Impôt sur le Revenu et sur les Sociétés",
  },
  'code-tva': {
    domain: 'fiscal',
    documentType: 'loi',
    nameAr: 'مجلة الأداء على القيمة المضافة',
    nameFr: 'Code de la TVA',
  },
  'code-droits-procedures-fiscales': {
    domain: 'fiscal',
    documentType: 'loi',
    nameAr: 'مجلة الحقوق والإجراءات الجبائية',
    nameFr: 'Code des Droits et Procédures Fiscales',
  },
  'code-enregistrement-timbre-fiscal': {
    domain: 'fiscal',
    documentType: 'loi',
    nameAr: 'مجلة معاليم التسجيل والطابع الجبائي',
    nameFr: "Code de l'Enregistrement et du Timbre Fiscal",
  },
  'code-fiscalite-locale': {
    domain: 'fiscal',
    documentType: 'loi',
    nameAr: 'مجلة الجباية المحلية',
    nameFr: 'Code de la Fiscalité Locale',
  },

  // ===== DOUANIER =====
  'code-douanes': {
    domain: 'douanier',
    documentType: 'loi',
    nameAr: 'مجلة الديوانة',
    nameFr: 'Code des Douanes',
  },

  // ===== ADMINISTRATIF =====
  'code-comptabilite-publique': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة المحاسبة العمومية',
    nameFr: 'Code de Comptabilité Publique',
  },
  'code-collectivites-locales': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة الجماعات المحلية',
    nameFr: 'Code des Collectivités Locales',
  },
  'code-amenagement-territoire-urbanisme': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة التهيئة الترابية والتعمير',
    nameFr: "Code de l'Aménagement du Territoire et de l'Urbanisme",
  },
  'code-decorations': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة الأوسمة',
    nameFr: 'Code des Décorations',
  },
  'code-presse': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة الصحافة',
    nameFr: 'Code de la Presse',
  },
  'code-patrimoine': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة حماية التراث الأثرى و التاريخى و الفنون التقليدية',
    nameFr: 'Code du Patrimoine',
  },
  'code-cinema': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة تنطيم الصناعة السينمائية',
    nameFr: 'Code du Cinéma',
  },
  'code-route': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة الطرقات',
    nameFr: 'Code de la Route',
  },
  'code-postal': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة البريد',
    nameFr: 'Code Postal',
  },
  'code-deontologie-medicale': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة واجبات الطبيب',
    nameFr: 'Code de Déontologie Médicale',
  },
  'code-deontologie-veterinaire': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة واجبات الطبيب البيطرى',
    nameFr: 'Code de Déontologie Vétérinaire',
  },
  'code-deontologie-architectes': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة الواجبات المهنية للمهندسين المعماريين',
    nameFr: 'Code de Déontologie des Architectes',
  },
  'code-prevention-incendies': {
    domain: 'administratif',
    documentType: 'loi',
    nameAr: 'مجلة السلامة والوقاية من أخطار الحريق والانفجار والفزع بالبنايات',
    nameFr: 'Code de Prévention des Incendies',
  },

  // ===== ASSURANCE =====
  'code-assurances': {
    domain: 'assurance',
    documentType: 'loi',
    nameAr: 'مجلة التأمين',
    nameFr: 'Code des Assurances',
  },

  // ===== INTERNATIONAL PRIVE =====
  'code-droit-international-prive': {
    domain: 'international_prive',
    documentType: 'loi',
    nameAr: 'مجلة القانون الدولي الخاص',
    nameFr: 'Code de Droit International Privé',
  },

  // ===== BANCAIRE / FINANCIER =====
  'code-services-financiers-non-residents': {
    domain: 'bancaire',
    documentType: 'loi',
    nameAr: 'مجلة إسداء الخدمات المالية لغير المقيمين',
    nameFr: 'Code des Services Financiers aux Non-Résidents',
  },
  'code-opcvm': {
    domain: 'bancaire',
    documentType: 'loi',
    nameAr: 'مجلة مؤسسات التوظيف الجماعي',
    nameFr: 'Code des Organismes de Placement Collectif',
  },
  'code-investissements': {
    domain: 'bancaire',
    documentType: 'loi',
    nameAr: 'مجلة تشجيع الإستثمارات',
    nameFr: 'Code des Investissements',
  },

  // ===== ENVIRONNEMENT =====
  'code-forestier': {
    domain: 'environnement',
    documentType: 'loi',
    nameAr: 'مجلة الغابات',
    nameFr: 'Code Forestier',
  },
  'code-eaux': {
    domain: 'environnement',
    documentType: 'loi',
    nameAr: 'مجلة المياه',
    nameFr: 'Code des Eaux',
  },

  // ===== ENERGIE =====
  'code-minier': {
    domain: 'energie',
    documentType: 'loi',
    nameAr: 'مجلة المناجم',
    nameFr: 'Code Minier',
  },
  'code-hydrocarbures': {
    domain: 'energie',
    documentType: 'loi',
    nameAr: 'مجلة المحروقات',
    nameFr: 'Code des Hydrocarbures',
  },

  // ===== AERIEN =====
  'code-aviation-civile': {
    domain: 'aerien',
    documentType: 'loi',
    nameAr: 'مجلة الطيران المدني',
    nameFr: "Code de l'Aviation Civile",
  },

  // ===== TELECOM / NUMERIQUE =====
  'code-telecommunications': {
    domain: 'numerique',
    documentType: 'loi',
    nameAr: 'مجلة الاتصالات',
    nameFr: 'Code des Télécommunications',
  },
}

/**
 * Sections non-code du KB de 9anoun.tn
 * Pattern URL : /kb/{section}/...
 */
export const NINEANOUN_KB_SECTIONS: Record<string, {
  primaryCategory: string
  domain: LegalDomain | null
  documentNature: DocumentNature
}> = {
  'jurisprudence': {
    primaryCategory: 'jurisprudence',
    domain: null,
    documentNature: 'arret',
  },
  'doctrine': {
    primaryCategory: 'doctrine',
    domain: null,
    documentNature: 'article_doctrine',
  },
  'jorts': {
    primaryCategory: 'jort',
    domain: null,
    documentNature: 'jort_publication',
  },
  'constitutions': {
    primaryCategory: 'legislation',
    domain: 'constitutionnel',
    documentNature: 'constitution',
  },
  'conventions': {
    primaryCategory: 'legislation',
    domain: 'international_public',
    documentNature: 'convention',
  },
  'lois': {
    primaryCategory: 'legislation',
    domain: null,
    documentNature: 'loi',
  },
}

/**
 * Sections hors /kb/ de 9anoun.tn
 */
export const NINEANOUN_OTHER_SECTIONS: Record<string, {
  primaryCategory: string
  domain: LegalDomain | null
  documentNature: DocumentNature
}> = {
  'modeles': {
    primaryCategory: 'modeles',
    domain: null,
    documentNature: 'modele_contrat',
  },
  'formulaires': {
    primaryCategory: 'formulaires',
    domain: null,
    documentNature: 'formulaire',
  },
}
