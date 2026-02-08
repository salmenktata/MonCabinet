/**
 * Service de structuration de dossiers juridiques par IA
 *
 * Ce service analyse un récit en langage naturel et extrait:
 * - Type de procédure
 * - Parties impliquées
 * - Faits clés
 * - Calculs juridiques (pension, intérêts)
 * - Timeline proposée
 * - Actions suggérées
 * - Références juridiques
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { db, transaction } from '@/lib/db/postgres'
import { aiConfig, isChatEnabled, getChatProvider } from './config'
import { searchKnowledgeBase } from './knowledge-base-service'
import { STRUCTURATION_SYSTEM_PROMPT } from './prompts/structuration-prompt'
import { createLogger } from '@/lib/logger'
import { callLLMWithFallback } from './llm-fallback-service'

const log = createLogger('AI:Structuration')

// =============================================================================
// CLIENTS IA
// =============================================================================

let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null
let groqClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!aiConfig.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY non configuré')
    }
    anthropicClient = new Anthropic({ apiKey: aiConfig.anthropic.apiKey })
  }
  return anthropicClient
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!aiConfig.openai.apiKey) {
      throw new Error('OPENAI_API_KEY non configuré')
    }
    openaiClient = new OpenAI({ apiKey: aiConfig.openai.apiKey })
  }
  return openaiClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) {
      throw new Error('GROQ_API_KEY non configuré')
    }
    // Groq utilise une API compatible OpenAI
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    if (!aiConfig.deepseek.apiKey) {
      throw new Error('DEEPSEEK_API_KEY non configuré')
    }
    // DeepSeek utilise une API compatible OpenAI
    deepseekClient = new OpenAI({
      apiKey: aiConfig.deepseek.apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

// =============================================================================
// TYPES
// =============================================================================

export type ProcedureType =
  | 'civil_premiere_instance'
  | 'divorce'
  | 'commercial'
  | 'refere'
  | 'autre'

export interface ExtractedParty {
  nom: string
  prenom?: string | null
  role: 'demandeur' | 'defendeur'
  profession?: string | null
  revenus?: number | null
  adresse?: string | null
}

export interface ExtractedFact {
  label: string
  valeur: string
  type: 'date' | 'montant' | 'personne' | 'bien' | 'duree' | 'lieu' | 'autre'
  confidence: number
  source?: string | null // D'où vient l'info
  preuve?: string | null // Document associé
  importance?: 'decisif' | 'important' | 'contexte'
}

export interface ExtractedChild {
  prenom: string
  age: number
  estMineur: boolean
}

export interface LegalCalculation {
  type:
    | 'moutaa'
    | 'pension_alimentaire'
    | 'pension_epouse'
    | 'interets_moratoires'
    | 'indemnite_forfaitaire'
    | 'autre'
  label: string
  montant: number
  formule: string
  reference: string
  details?: string | null
}

export interface TimelineStep {
  etape: string
  delaiJours: number
  dateEstimee: Date
  description: string
  obligatoire: boolean
  alertes?: string[] | null
}

export interface SuggestedAction {
  titre: string
  description?: string | null
  priorite: 'urgent' | 'haute' | 'moyenne' | 'basse'
  delaiJours?: number | null
  checked: boolean
}

export interface LegalReference {
  type: 'code' | 'jurisprudence' | 'doctrine'
  titre: string
  article?: string | null
  extrait?: string | null
  pertinence: number
  // Métadonnées étendues
  metadata?: {
    chunkPosition?: number
    date?: string
    juridiction?: string
    source?: 'KB' | 'Jurisprudence' | 'Cache'
    documentId?: string
  }
}

export interface LegalRisk {
  nature: string
  niveau: 'eleve' | 'moyen' | 'faible'
  description: string
  mitigation?: string | null
}

// =============================================================================
// PHASE 1 - Diagnostic initial enrichi (التكييف الأولي)
// =============================================================================

export interface ClientObjective {
  principal: string // Objectif prioritaire
  secondaires: string[] // Objectifs négociables
  ligneRouge: string // Ce qu'on refuse
}

export interface LegalFields {
  principal: string // Ex: "civil_contractuel"
  satellites: string[] // Ex: ["pénal_abus_confiance", "commercial"]
}

export interface Diagnostic {
  faitsJuridiques: ExtractedFact[] // Faits prouvables
  interpretations: string[] // Hypothèses à vérifier
  ressentis: string[] // Éléments non juridiques (sentiments, opinions)
  objectifClient: ClientObjective
  champsJuridiques: LegalFields
}

// =============================================================================
// PHASE 2 - Analyse factuelle approfondie (التحليل الوقائعي)
// =============================================================================

export interface ChronologyEvent {
  date: string
  evenement: string
  source: string // D'où vient l'info
  preuve: string | null // Document associé
  importance: 'decisif' | 'important' | 'contexte'
}

export interface Actor {
  nom: string
  role: string // Ex: "témoin", "débiteur", "garant"
  interet: 'favorable' | 'defavorable' | 'neutre'
  fiabilite: number // 0-100
}

export interface DecisiveNode {
  point: string // Point qui fait gagner/perdre
  preuveActuelle: string | null // Preuve disponible
  preuveManquante: string | null // Preuve à obtenir
  importance: 'critique' | 'important' | 'secondaire'
}

export interface CoherenceCheck {
  declarations: string
  pieceCorrespondante: string | null
  statut: 'confirme' | 'contredit' | 'non_prouve'
}

export interface AnalyseFaits {
  chronologie: ChronologyEvent[]
  acteurs: Actor[]
  noeudsDecisifs: DecisiveNode[]
  coherence: CoherenceCheck[]
}

// =============================================================================
// PHASE 3 - Qualification juridique enrichie (التحليل القانوني)
// =============================================================================

export interface AlternativeQualification {
  qualification: string
  avantages: string[]
  inconvenients: string[]
}

// =============================================================================
// PHASE 4 - Analyse probatoire enrichie (التحليل الإثباتي)
// =============================================================================

export interface EvidenceHierarchy {
  type: 'ecrit_officiel' | 'ecrit_prive' | 'temoignage' | 'expertise' | 'technique'
  documents: string[]
  forceProbante: 'absolue' | 'forte' | 'moyenne' | 'faible'
  risqueContestation: string | null
}

export interface CounterEvidence {
  risque: string
  mitigation: string
}

// =============================================================================
// PHASE 5 - Analyse stratégique enrichie (التحليل الاستراتيجي)
// =============================================================================

export interface StrategicScenario {
  option: string // Ex: "action_judiciaire", "negociation", "refere"
  probabiliteSucces: number // 0-100
  coutEstime: string
  delaiEstime: string
  risques: string[]
  avantages: string[]
}

export interface PlanB {
  condition: string // Quand basculer
  action: string
}

export interface StrategieGlobale {
  scenarios: StrategicScenario[]
  scenarioRecommande: string
  tempo: 'urgent' | 'rapide' | 'normal' | 'temporiser'
  justificationTempo: string
  planB: PlanB | null
}

// =============================================================================
// PHASE 6 - Argumentation (بناء الحجة)
// =============================================================================

export interface HierarchizedArgument {
  rang: number
  type: 'recevabilite' | 'nullite' | 'fond' | 'quantum'
  moyen: string
  piecesSupportant: string[]
}

export interface AnticipatedObjection {
  objection: string
  reponse: string
  piecesReponse: string[]
}

export interface Argumentation {
  moyensHierarchises: HierarchizedArgument[]
  objectionsAnticipees: AnticipatedObjection[]
}

export interface LegalAnalysis {
  // PHASE 1 - Diagnostic initial enrichi
  diagnostic?: Diagnostic | null

  // PHASE 2 - Analyse factuelle approfondie
  analyseFaits?: AnalyseFaits | null

  // PHASE 3 - Qualification juridique (existant enrichi)
  syllogisme: {
    majeure: string
    mineure: string
    conclusion: string
  }
  qualification: {
    natureAction: string
    codeApplicable: string
    articlesVises: string[]
    fondementJuridique: string
    qualificationsAlternatives?: AlternativeQualification[] | null // NOUVEAU
  }
  recevabilite: {
    prescription: {
      estPrescrit: boolean
      delaiApplicable: string
      analyse: string
    }
    qualitePourAgir: {
      estVerifiee: boolean
      analyse: string
      documentsRequis: string[]
    }
    interetAAgir: {
      estCaracterise: boolean
      analyse: string
    }
  }
  competence: {
    territoriale: string
    materielle: string
    justification: string
  }

  // PHASE 4 - Analyse probatoire enrichie
  strategiePreuve: {
    chargeDeLaPreuve: string
    preuvesDisponibles: string[]
    preuvesManquantes: string[]
    modeDePreuve: string
    hierarchiePreuves?: EvidenceHierarchy[] | null // NOUVEAU
    contrePreuves?: CounterEvidence[] | null // NOUVEAU
  }

  // PHASE 5 - Stratégie globale (NOUVEAU)
  strategieGlobale?: StrategieGlobale | null

  // PHASE 6 - Argumentation (NOUVEAU)
  argumentation?: Argumentation | null

  // Existant
  risques: LegalRisk[]
  recommandationStrategique: string
  prochainesEtapes: string[]
}

export interface SpecificData {
  // Divorce
  dateMarriage?: string | null
  lieuMarriage?: string | null
  regimeMatrimonial?: string | null
  biensCommuns?: { description: string; valeur: number }[] | null
  demandesAdverses?: string[] | null

  // Commercial
  montantPrincipal?: number | null
  dateCreance?: string | null
  tauxInteret?: number | null

  // Civil
  objetLitige?: string | null
  tribunal?: string | null
}

export interface StructuredDossier {
  // Métadonnées analyse
  confidence: number
  langue: 'ar' | 'fr'

  // Type procédure
  typeProcedure: ProcedureType
  sousType?: string | null

  // Analyse juridique complète (logique métier avocat)
  analyseJuridique?: LegalAnalysis | null

  // Parties
  client: ExtractedParty
  partieAdverse: ExtractedParty

  // Faits
  faitsExtraits: ExtractedFact[]
  enfants?: ExtractedChild[] | null

  // Données spécifiques par type
  donneesSpecifiques: SpecificData

  // Calculs
  calculs: LegalCalculation[]

  // Timeline
  timeline: TimelineStep[]

  // Actions
  actionsSuggerees: SuggestedAction[]

  // Références
  references: LegalReference[]

  // Récit original
  narratifOriginal: string

  // Proposition
  titrePropose: string
  resumeCourt: string

  // Tokens utilisés
  tokensUsed?: {
    input: number
    output: number
    total: number
  }

  // Métriques RAG (optionnel)
  ragMetrics?: {
    totalFound: number
    aboveThreshold: number
    scoreRange: {
      min: number
      max: number
      avg: number
    }
    sourceDistribution: Record<string, number>
    searchTimeMs: number
    provider?: string
    cacheHit?: boolean
  }
}

export interface StructuringOptions {
  forcerType?: ProcedureType
  inclureReferences?: boolean
  enrichirKnowledgeBase?: boolean
}

export interface CreateDossierOptions {
  creerActions: boolean
  creerEcheances: boolean
  actionsSelectionnees?: string[]
}

export interface CreateDossierResult {
  dossierId: string
  actionsCreees: number
  echeancesCreees: number
}

// =============================================================================
// CONSTANTES JURIDIQUES TUNISIENNES
// =============================================================================

/**
 * Hiérarchie des juridictions tunisiennes
 */
export const JURIDICTIONS_TUNISIENNES = {
  juge_cantonal: {
    seuil: 7000, // TND
    appel: 'tribunal_premiere_instance',
    description_fr: 'Juge Cantonal (قاضي الناحية)',
    description_ar: 'قاضي الناحية',
  },
  tribunal_premiere_instance: {
    nombre: 27,
    chambres: ['civile', 'commerciale', 'famille', 'penale'] as const,
    appel: 'cour_appel',
    description_fr: 'Tribunal de Première Instance (المحكمة الابتدائية)',
    description_ar: 'المحكمة الابتدائية',
  },
  cour_appel: {
    sieges: [
      'Tunis',
      'Nabeul',
      'Bizerte',
      'Kef',
      'Sousse',
      'Monastir',
      'Sfax',
      'Gafsa',
      'Gabes',
      'Medenine',
    ] as const,
    chambres: ['civile', 'commerciale', 'correctionnelle', 'criminelle', 'accusation'] as const,
    cassation: 'cour_cassation',
    description_fr: 'Cour d\'Appel (محكمة الاستئناف)',
    description_ar: 'محكمة الاستئناف',
  },
  cour_cassation: {
    siege: 'Tunis',
    chambres_civiles: 27,
    chambres_penales: 11,
    magistrats_siege: 126,
    magistrats_parquet: 33,
    description_fr: 'Cour de Cassation (محكمة التعقيب)',
    description_ar: 'محكمة التعقيب',
  },
} as const

/**
 * Délais de prescription tunisiens
 */
export const PRESCRIPTIONS_TUNISIENNES = {
  civil: {
    droit_commun: {
      delai: '15 ans',
      article: 'Art. 402 COC',
      description_fr: 'Prescription de droit commun',
      description_ar: 'التقادم العادي',
    },
    responsabilite_delictuelle: {
      delai: '3 ans',
      article: 'Art. 107 COC',
      description_fr: 'Responsabilité délictuelle',
      description_ar: 'المسؤولية التقصيرية',
    },
    creance_periodique: {
      delai: '5 ans',
      article: 'Art. 403 COC',
      description_fr: 'Créances périodiques (loyers, intérêts)',
      description_ar: 'الديون الدورية',
    },
  },
  commercial: {
    effets_commerce: {
      delai: '1 an',
      article: 'Art. 362 C.Com',
      description_fr: 'Actions relatives aux effets de commerce',
      description_ar: 'دعاوى الأوراق التجارية',
    },
    actions_commerciales: {
      delai: '3 ans',
      article: 'Art. 413 COC',
      description_fr: 'Actions commerciales générales',
      description_ar: 'الدعاوى التجارية',
    },
    cheque_impaye: {
      delai: '6 mois',
      article: 'Art. 327 C.Com',
      description_fr: 'Action en paiement chèque impayé',
      description_ar: 'دعوى الشيك بدون رصيد',
    },
  },
  famille: {
    action_divorce: {
      delai: 'imprescriptible',
      article: 'CSP',
      description_fr: 'Action en divorce',
      description_ar: 'دعوى الطلاق',
    },
    pension_alimentaire: {
      delai: 'imprescriptible',
      article: 'Art. 46 CSP',
      description_fr: 'Pension alimentaire',
      description_ar: 'النفقة',
    },
    filiation: {
      delai: '10 ans',
      article: 'Art. 68 CSP',
      description_fr: 'Action en contestation de filiation',
      description_ar: 'دعوى إنكار النسب',
    },
  },
  travail: {
    salaires: {
      delai: '3 ans',
      article: 'Art. 374 C.Travail',
      description_fr: 'Réclamation de salaires',
      description_ar: 'المطالبة بالأجور',
    },
    licenciement_abusif: {
      delai: '1 an',
      article: 'Art. 23 C.Travail',
      description_fr: 'Contestation licenciement',
      description_ar: 'الطعن في الطرد',
    },
  },
} as const

/**
 * Codes juridiques tunisiens de référence
 */
export const CODES_TUNISIENS = {
  COC: {
    nom_fr: 'Code des Obligations et Contrats',
    nom_ar: 'مجلة الالتزامات والعقود',
    date: '1907-06-01',
    domaines: ['contrats', 'responsabilite', 'obligations', 'paiement', 'prescription'],
    abreviation: 'COC',
  },
  CSP: {
    nom_fr: 'Code du Statut Personnel',
    nom_ar: 'مجلة الأحوال الشخصية',
    date: '1956-08-13',
    domaines: ['mariage', 'divorce', 'filiation', 'succession', 'garde', 'pension'],
    abreviation: 'CSP',
  },
  CPC: {
    nom_fr: 'Code de Procédure Civile et Commerciale',
    nom_ar: 'مجلة المرافعات المدنية والتجارية',
    date: '1959',
    domaines: ['procedure', 'competence', 'voies_recours', 'delais', 'execution'],
    abreviation: 'CPC',
  },
  CODE_COMMERCE: {
    nom_fr: 'Code de Commerce',
    nom_ar: 'المجلة التجارية',
    date: '1959',
    domaines: ['societes', 'faillite', 'effets_commerce', 'bail_commercial', 'cheques'],
    abreviation: 'C.Com',
  },
  CODE_PENAL: {
    nom_fr: 'Code Pénal',
    nom_ar: 'المجلة الجزائية',
    date: '1913',
    domaines: ['infractions', 'peines', 'responsabilite_penale'],
    abreviation: 'CP',
  },
  CODE_TRAVAIL: {
    nom_fr: 'Code du Travail',
    nom_ar: 'مجلة الشغل',
    date: '1966',
    domaines: ['contrat_travail', 'licenciement', 'salaires', 'syndicats'],
    abreviation: 'C.Travail',
  },
} as const

/**
 * Hiérarchie des preuves en droit tunisien
 */
export const HIERARCHIE_PREUVES_TUNISIE = {
  ecrit_officiel: {
    rang: 1,
    forceProbante: 'absolue' as const,
    description_fr: 'Acte authentique (notarié, huissier)',
    description_ar: 'الحجة الرسمية',
    exemples: ['Acte notarié', 'Procès-verbal huissier', 'Jugement'],
  },
  ecrit_prive: {
    rang: 2,
    forceProbante: 'forte' as const,
    description_fr: 'Acte sous seing privé reconnu',
    description_ar: 'الكتب الخطي',
    exemples: ['Contrat signé', 'Reconnaissance de dette', 'Échanges écrits signés'],
  },
  aveu: {
    rang: 3,
    forceProbante: 'forte' as const,
    description_fr: 'Aveu judiciaire ou extrajudiciaire',
    description_ar: 'الإقرار',
    exemples: ['Déclaration à l\'audience', 'Courrier d\'aveu'],
  },
  expertise: {
    rang: 4,
    forceProbante: 'moyenne' as const,
    description_fr: 'Rapport d\'expert judiciaire',
    description_ar: 'الخبرة',
    exemples: ['Expertise médicale', 'Expertise comptable', 'Expertise technique'],
  },
  temoignage: {
    rang: 5,
    forceProbante: 'moyenne' as const,
    description_fr: 'Témoignage (2 hommes ou 1 homme + 2 femmes en matière civile)',
    description_ar: 'الشهادة',
    exemples: ['Attestation de témoin', 'Témoignage à l\'audience'],
  },
  presomption: {
    rang: 6,
    forceProbante: 'faible' as const,
    description_fr: 'Présomptions et indices',
    description_ar: 'القرائن',
    exemples: ['Faisceau d\'indices', 'Comportement révélateur'],
  },
  serment: {
    rang: 7,
    forceProbante: 'faible' as const,
    description_fr: 'Serment (décisoire ou supplétoire)',
    description_ar: 'اليمين',
    exemples: ['Serment judiciaire'],
  },
} as const

// =============================================================================
// CALCULS JURIDIQUES TUNISIENS
// =============================================================================

/**
 * Calcule la pension Moutaa (compensatoire) selon Art. 31 CSP
 * Formule: durée_mariage × 2 mois × revenus_mensuels_époux
 */
export function calculerMoutaa(
  dureeMarriageAnnees: number,
  revenusMensuelsEpoux: number
): LegalCalculation {
  const montant = dureeMarriageAnnees * 2 * revenusMensuelsEpoux

  return {
    type: 'moutaa',
    label: 'Pension Moutaa (compensatoire)',
    montant,
    formule: `${dureeMarriageAnnees} ans × 2 × ${revenusMensuelsEpoux} TND`,
    reference: 'Art. 31 CSP - Code du Statut Personnel',
    details: `Basé sur ${dureeMarriageAnnees} années de mariage et un revenu mensuel de ${revenusMensuelsEpoux} TND`,
  }
}

/**
 * Calcule la pension alimentaire enfants selon Art. 46 CSP
 * Formule: 25% revenus_père ÷ nombre_enfants
 */
export function calculerPensionEnfants(
  revenusMensuelsPere: number,
  nombreEnfants: number
): LegalCalculation {
  const pourcentage = 0.25
  const montantTotal = revenusMensuelsPere * pourcentage
  const montantParEnfant = montantTotal / nombreEnfants

  return {
    type: 'pension_alimentaire',
    label: 'Pension alimentaire enfants',
    montant: Math.round(montantParEnfant * 100) / 100,
    formule: `25% × ${revenusMensuelsPere} TND ÷ ${nombreEnfants} enfants`,
    reference: 'Art. 46 CSP - Code du Statut Personnel',
    details: `${montantParEnfant.toFixed(2)} TND par enfant par mois (total: ${montantTotal.toFixed(2)} TND)`,
  }
}

/**
 * Calcule la pension épouse (Nafaqa) pendant l'instance
 * Fourchette: 15-25% des revenus de l'époux
 */
export function calculerNafaqa(revenusMensuelsEpoux: number): LegalCalculation {
  const pourcentageMin = 0.15
  const pourcentageMax = 0.25
  const montantMin = revenusMensuelsEpoux * pourcentageMin
  const montantMax = revenusMensuelsEpoux * pourcentageMax
  const montantMoyen = (montantMin + montantMax) / 2

  return {
    type: 'pension_epouse',
    label: 'Pension épouse (Nafaqa)',
    montant: Math.round(montantMoyen * 100) / 100,
    formule: `15-25% × ${revenusMensuelsEpoux} TND`,
    reference: 'Art. 38 CSP - Code du Statut Personnel',
    details: `Fourchette: ${montantMin.toFixed(2)} - ${montantMax.toFixed(2)} TND/mois`,
  }
}

/**
 * Calcule les intérêts moratoires selon le droit tunisien
 * Taux: TMM + 7 points = 14.5% annuel
 */
export function calculerInteretsMoratoires(
  principal: number,
  dateCreance: Date,
  dateFin?: Date
): LegalCalculation {
  const taux = 0.145 // TMM + 7 = 14.5%
  const fin = dateFin || new Date()
  const joursRetard = Math.floor(
    (fin.getTime() - dateCreance.getTime()) / (1000 * 60 * 60 * 24)
  )
  const montant = principal * taux * (joursRetard / 365)

  return {
    type: 'interets_moratoires',
    label: 'Intérêts moratoires',
    montant: Math.round(montant * 100) / 100,
    formule: `${principal} TND × 14.5% × (${joursRetard} jours ÷ 365)`,
    reference: 'Art. 278 COC - Code des Obligations et Contrats',
    details: `Taux TMM + 7 points. ${joursRetard} jours de retard depuis le ${dateCreance.toLocaleDateString('fr-TN')}`,
  }
}

/**
 * Calcule l'indemnité forfaitaire pour chèque impayé
 * Montant fixe: 40 TND
 */
export function calculerIndemniteForfaitaire(): LegalCalculation {
  return {
    type: 'indemnite_forfaitaire',
    label: 'Indemnité forfaitaire chèque impayé',
    montant: 40,
    formule: '40 TND (montant fixe)',
    reference: 'Art. 410bis Code de Commerce',
    details: 'Indemnité forfaitaire légale par chèque impayé',
  }
}

// =============================================================================
// GÉNÉRATION DE TIMELINE
// =============================================================================

/**
 * Génère la timeline selon le type de procédure
 */
export function genererTimeline(type: ProcedureType): TimelineStep[] {
  const today = new Date()

  const addDays = (days: number): Date => {
    const date = new Date(today)
    date.setDate(date.getDate() + days)
    return date
  }

  switch (type) {
    case 'divorce':
      return [
        {
          etape: 'Dépôt requête',
          delaiJours: 0,
          dateEstimee: addDays(0),
          description: 'Dépôt de la requête au Tribunal de la Famille',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: '1ère tentative conciliation',
          delaiJours: 15,
          dateEstimee: addDays(15),
          description: 'Première séance de conciliation obligatoire',
          obligatoire: true,
          alertes: ['Obligatoire selon CSP'],
        },
        {
          etape: '2ème tentative conciliation',
          delaiJours: 30,
          dateEstimee: addDays(30),
          description: 'Deuxième séance de conciliation obligatoire',
          obligatoire: true,
          alertes: ['Obligatoire selon CSP'],
        },
        {
          etape: '3ème tentative conciliation',
          delaiJours: 45,
          dateEstimee: addDays(45),
          description: 'Troisième et dernière tentative de conciliation',
          obligatoire: true,
          alertes: ['Obligatoire selon CSP'],
        },
        {
          etape: 'Expertise sociale',
          delaiJours: 60,
          dateEstimee: addDays(60),
          description: 'Enquête sociale si contestation de garde',
          obligatoire: false,
          alertes: ['Si enfants mineurs présents'],
        },
        {
          etape: 'Mesures provisoires',
          delaiJours: 90,
          dateEstimee: addDays(90),
          description: 'Garde provisoire, pension provisoire',
          obligatoire: false,
          alertes: null,
        },
        {
          etape: 'Audience de fond',
          delaiJours: 120,
          dateEstimee: addDays(120),
          description: 'Audience principale devant le juge',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Jugement',
          delaiJours: 150,
          dateEstimee: addDays(150),
          description: 'Prononcé du jugement de divorce',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Transcription état civil',
          delaiJours: 180,
          dateEstimee: addDays(180),
          description: 'Transcription sur les registres',
          obligatoire: true,
          alertes: ['Fin de procédure'],
        },
      ]

    case 'commercial':
      return [
        {
          etape: 'Mise en demeure',
          delaiJours: 0,
          dateEstimee: addDays(0),
          description: 'Envoi de la mise en demeure au débiteur',
          obligatoire: true,
          alertes: ['Préalable obligatoire'],
        },
        {
          etape: 'Délai de réponse',
          delaiJours: 15,
          dateEstimee: addDays(15),
          description: 'Attente de la réponse du débiteur',
          obligatoire: false,
          alertes: null,
        },
        {
          etape: 'Rédaction assignation',
          delaiJours: 30,
          dateEstimee: addDays(30),
          description: 'Préparation de l\'assignation',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Signification',
          delaiJours: 37,
          dateEstimee: addDays(37),
          description: 'Signification par huissier',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Audience',
          delaiJours: 52,
          dateEstimee: addDays(52),
          description: 'Première audience devant le tribunal',
          obligatoire: true,
          alertes: ['Délai de comparution: 15 jours francs'],
        },
        {
          etape: 'Jugement',
          delaiJours: 82,
          dateEstimee: addDays(82),
          description: 'Prononcé du jugement',
          obligatoire: true,
          alertes: null,
        },
      ]

    case 'civil_premiere_instance':
      return [
        {
          etape: 'Rédaction assignation',
          delaiJours: 0,
          dateEstimee: addDays(0),
          description: 'Préparation de l\'assignation',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Signification',
          delaiJours: 7,
          dateEstimee: addDays(7),
          description: 'Signification par huissier',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Délai de comparution',
          delaiJours: 22,
          dateEstimee: addDays(22),
          description: 'Fin du délai de comparution (15 jours francs)',
          obligatoire: true,
          alertes: ['Délai franc: 15 jours'],
        },
        {
          etape: 'Audience',
          delaiJours: 45,
          dateEstimee: addDays(45),
          description: 'Première audience',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Jugement',
          delaiJours: 75,
          dateEstimee: addDays(75),
          description: 'Prononcé du jugement',
          obligatoire: true,
          alertes: null,
        },
      ]

    case 'refere':
      return [
        {
          etape: 'Rédaction requête',
          delaiJours: 0,
          dateEstimee: addDays(0),
          description: 'Préparation de la requête en référé',
          obligatoire: true,
          alertes: ['Procédure d\'urgence'],
        },
        {
          etape: 'Audience référé',
          delaiJours: 3,
          dateEstimee: addDays(3),
          description: 'Audience devant le juge des référés',
          obligatoire: true,
          alertes: ['Délai très court'],
        },
        {
          etape: 'Ordonnance',
          delaiJours: 7,
          dateEstimee: addDays(7),
          description: 'Prononcé de l\'ordonnance de référé',
          obligatoire: true,
          alertes: ['Exécutoire immédiatement'],
        },
      ]

    default:
      return [
        {
          etape: 'Analyse du dossier',
          delaiJours: 0,
          dateEstimee: addDays(0),
          description: 'Étude approfondie du dossier',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Préparation documents',
          delaiJours: 14,
          dateEstimee: addDays(14),
          description: 'Préparation des pièces et actes',
          obligatoire: true,
          alertes: null,
        },
        {
          etape: 'Introduction instance',
          delaiJours: 30,
          dateEstimee: addDays(30),
          description: 'Saisine de la juridiction',
          obligatoire: true,
          alertes: null,
        },
      ]
  }
}

// =============================================================================
// FONCTION PRINCIPALE: STRUCTURER UN DOSSIER
// =============================================================================

/**
 * Analyse un récit en langage naturel et retourne un dossier structuré
 */
export async function structurerDossier(
  narratif: string,
  userId: string,
  options: StructuringOptions = {}
): Promise<StructuredDossier> {
  // Détecter la langue approximativement
  const arabicRegex = /[\u0600-\u06FF]/
  const langue = arabicRegex.test(narratif) ? 'ar' : 'fr'

  // Construire le prompt utilisateur
  let userPrompt = `Analyse le récit suivant et extrait toutes les informations structurées au format JSON.

Récit:
"""
${narratif}
"""

Date d'aujourd'hui: ${new Date().toISOString().split('T')[0]}
Langue détectée: ${langue}`

  if (options.forcerType) {
    userPrompt += `\n\nType de procédure forcé: ${options.forcerType}`
  }

  if (langue === 'ar') {
    userPrompt += `

تعليمات اللغة الصارمة: اللغة المكتشفة عربية.
يجب أن تكون جميع القيم النصية في JSON باللغة العربية حصرياً.
هذا يشمل: التسميات، الأوصاف، التحليلات، التوصيات، الملخصات، العناوين، المراحل، المخاطر، الأسس القانونية — كل شيء بالعربية.
الاستثناءات الوحيدة: أسماء الأشخاص الأعلام، أرقام مواد القانون (مثل Art. 31 CSP)، واختصارات المجلات (COC, CSP, CPC).
لا تخلط أبداً بين العربية والفرنسية في نفس القيمة النصية.`
  }

  userPrompt += `

IMPORTANT: Retourne UNIQUEMENT le JSON, sans texte avant ou après.`

  // Utiliser le service de fallback automatique pour plus de résilience
  log.info('[Structuration] Appel LLM avec fallback automatique')
  const llmResponse = await callLLMWithFallback(
    [
      { role: 'system', content: STRUCTURATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 4000,
    }
  )

  if (llmResponse.fallbackUsed) {
    log.info(
      `[Structuration] Fallback utilisé: ${llmResponse.originalProvider} → ${llmResponse.provider}`
    )
  }

  let jsonStr = llmResponse.answer.trim()
  const tokensUsed = llmResponse.tokensUsed

  // Nettoyer la réponse si elle contient des marqueurs de code
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('Erreur parsing JSON IA:', jsonStr.substring(0, 500))
    throw new Error('Erreur de parsing de la réponse IA')
  }

  // Convertir la timeline avec les dates calculées
  const timeline: TimelineStep[] = Array.isArray(parsed.timeline)
    ? (parsed.timeline as Array<Record<string, unknown>>).map((step) => {
        const delaiJours =
          typeof step.delaiJours === 'number' ? step.delaiJours : 0
        const dateEstimee = new Date()
        dateEstimee.setDate(dateEstimee.getDate() + delaiJours)

        return {
          etape: String(step.etape || ''),
          delaiJours,
          dateEstimee,
          description: String(step.description || ''),
          obligatoire: Boolean(step.obligatoire),
          alertes: Array.isArray(step.alertes)
            ? (step.alertes as string[])
            : null,
        }
      })
    : genererTimeline(parsed.typeProcedure as ProcedureType)

  // Construire le résultat final
  const result: StructuredDossier = {
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    langue: (parsed.langue as 'ar' | 'fr') || langue,
    typeProcedure: (parsed.typeProcedure as ProcedureType) || 'autre',
    sousType: (parsed.sousType as string) || null,
    analyseJuridique: parsed.analyseJuridique as LegalAnalysis || null,
    client: {
      nom: String((parsed.client as Record<string, unknown>)?.nom || ''),
      prenom:
        ((parsed.client as Record<string, unknown>)?.prenom as string) || null,
      role:
        ((parsed.client as Record<string, unknown>)?.role as
          | 'demandeur'
          | 'defendeur') || 'demandeur',
      profession:
        ((parsed.client as Record<string, unknown>)?.profession as string) ||
        null,
      revenus:
        ((parsed.client as Record<string, unknown>)?.revenus as number) || null,
      adresse:
        ((parsed.client as Record<string, unknown>)?.adresse as string) || null,
    },
    partieAdverse: {
      nom: String(
        (parsed.partieAdverse as Record<string, unknown>)?.nom || 'Non identifié'
      ),
      prenom:
        ((parsed.partieAdverse as Record<string, unknown>)?.prenom as string) ||
        null,
      role:
        ((parsed.partieAdverse as Record<string, unknown>)?.role as
          | 'demandeur'
          | 'defendeur') || 'defendeur',
      profession:
        ((parsed.partieAdverse as Record<string, unknown>)
          ?.profession as string) || null,
      revenus:
        ((parsed.partieAdverse as Record<string, unknown>)?.revenus as number) ||
        null,
      adresse:
        ((parsed.partieAdverse as Record<string, unknown>)?.adresse as string) ||
        null,
    },
    faitsExtraits: Array.isArray(parsed.faitsExtraits)
      ? (parsed.faitsExtraits as ExtractedFact[])
      : [],
    enfants: Array.isArray(parsed.enfants)
      ? (parsed.enfants as ExtractedChild[])
      : null,
    donneesSpecifiques:
      (parsed.donneesSpecifiques as SpecificData) || {},
    calculs: Array.isArray(parsed.calculs)
      ? (parsed.calculs as LegalCalculation[])
      : [],
    timeline,
    actionsSuggerees: Array.isArray(parsed.actionsSuggerees)
      ? (parsed.actionsSuggerees as SuggestedAction[])
      : [],
    references: Array.isArray(parsed.references)
      ? (parsed.references as LegalReference[])
      : [],
    narratifOriginal: narratif,
    titrePropose:
      (parsed.titrePropose as string) || 'Nouveau dossier',
    resumeCourt: (parsed.resumeCourt as string) || '',
    tokensUsed,
  }

  // Enrichir avec la base de connaissances si activé
  if (options.enrichirKnowledgeBase !== false) {
    try {
      const enriched = await enrichirAvecKnowledgeBase(result)
      return enriched
    } catch (error) {
      console.error('Erreur enrichissement KB:', error)
      // Continuer sans enrichissement
    }
  }

  return result
}

// =============================================================================
// ENRICHISSEMENT AVEC LA BASE DE CONNAISSANCES
// =============================================================================

/**
 * Enrichit l'analyse avec les références de la base de connaissances
 */
async function enrichirAvecKnowledgeBase(
  structure: StructuredDossier
): Promise<StructuredDossier> {
  // Construire une requête de recherche pertinente
  const searchTerms = [
    structure.typeProcedure,
    structure.sousType,
    ...structure.faitsExtraits.map((f) => f.label),
    ...structure.calculs.map((c) => c.type),
  ]
    .filter(Boolean)
    .join(' ')

  if (!searchTerms) return structure

  try {
    const startTime = Date.now()
    const kbResults = await searchKnowledgeBase(searchTerms, {
      limit: 5,
      threshold: 0.6,
    })
    const searchTimeMs = Date.now() - startTime

    if (kbResults.length > 0) {
      // Ajouter les références trouvées
      const newReferences: LegalReference[] = kbResults.map((result, index) => ({
        type: mapCategoryToRefType(result.category),
        titre: result.title,
        article: null,
        extrait:
          result.chunkContent.substring(0, 200) +
          (result.chunkContent.length > 200 ? '...' : ''),
        pertinence: Math.round(result.similarity * 100),
        metadata: {
          chunkPosition: result.chunkIndex,
          source: 'KB',
          documentId: result.knowledgeBaseId,
        },
      }))

      // Fusionner avec les références existantes, éviter les doublons
      const existingTitles = new Set(structure.references.map((r) => r.titre))
      const uniqueNewRefs = newReferences.filter(
        (r) => !existingTitles.has(r.titre)
      )

      structure.references = [...structure.references, ...uniqueNewRefs]

      // Augmenter légèrement la confiance si des références ont été trouvées
      structure.confidence = Math.min(
        structure.confidence + kbResults.length * 2,
        100
      )

      // Collecter les métriques RAG
      const scores = kbResults.map((r) => r.similarity)
      const sourceDistribution: Record<string, number> = {}
      kbResults.forEach((r) => {
        const type = mapCategoryToRefType(r.category)
        sourceDistribution[type] = (sourceDistribution[type] || 0) + 1
      })

      structure.ragMetrics = {
        totalFound: kbResults.length,
        aboveThreshold: kbResults.filter((r) => r.similarity >= 0.6).length,
        scoreRange: {
          min: Math.min(...scores),
          max: Math.max(...scores),
          avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        },
        sourceDistribution,
        searchTimeMs,
        provider: 'knowledge-base',
        cacheHit: false,
      }
    }
  } catch (error) {
    console.error('Erreur recherche knowledge base:', error)
  }

  return structure
}

function mapCategoryToRefType(
  category: string
): 'code' | 'jurisprudence' | 'doctrine' {
  switch (category) {
    case 'jurisprudence':
      return 'jurisprudence'
    case 'code':
      return 'code'
    case 'doctrine':
      return 'doctrine'
    default:
      return 'doctrine'
  }
}

// =============================================================================
// CRÉATION DE DOSSIER DEPUIS STRUCTURE
// =============================================================================

/**
 * Crée un dossier complet à partir d'une structure analysée
 *
 * Utilise une transaction pour garantir l'atomicité:
 * - Création du dossier
 * - Création des actions
 * - Création des échéances
 * Si une étape échoue, tout est annulé.
 */
export async function creerDossierDepuisStructure(
  structure: StructuredDossier,
  userId: string,
  clientId: string,
  options: CreateDossierOptions
): Promise<CreateDossierResult> {
  log.info('Création dossier depuis structure', {
    userId,
    clientId,
    type: structure.typeProcedure,
  })

  return await transaction(async (client) => {
    // Générer un numéro de dossier
    const year = new Date().getFullYear()
    const countResult = await client.query(
      `SELECT COUNT(*) FROM dossiers WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
      [userId, year]
    )
    const count = parseInt(countResult.rows[0].count) + 1
    const numero = `${year}/${count.toString().padStart(3, '0')}`

    // Créer le dossier
    const dossierResult = await client.query(
      `INSERT INTO dossiers (
        user_id, client_id, numero, type_procedure, objet,
        partie_adverse, tribunal, statut, montant_litige,
        date_ouverture, notes, workflow_etape_actuelle
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        userId,
        clientId,
        numero,
        structure.typeProcedure,
        structure.titrePropose,
        structure.partieAdverse.nom +
          (structure.partieAdverse.prenom
            ? ` ${structure.partieAdverse.prenom}`
            : ''),
        structure.donneesSpecifiques.tribunal || null,
        'ACTIF',
        structure.donneesSpecifiques.montantPrincipal || null,
        new Date().toISOString().split('T')[0],
        `${structure.resumeCourt}\n\n---\nRécit original:\n${structure.narratifOriginal}`,
        getInitialWorkflowStep(structure.typeProcedure),
      ]
    )

    const dossierId = dossierResult.rows[0].id
    let actionsCreees = 0
    let echeancesCreees = 0

    // Créer les actions si demandé
    if (options.creerActions && structure.actionsSuggerees.length > 0) {
      const actionsToCreate = options.actionsSelectionnees
        ? structure.actionsSuggerees.filter(
            (a, i) =>
              options.actionsSelectionnees?.includes(i.toString()) || a.checked
          )
        : structure.actionsSuggerees.filter((a) => a.checked)

      for (const action of actionsToCreate) {
        const dateLimit = action.delaiJours
          ? new Date(Date.now() + action.delaiJours * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0]
          : null

        await client.query(
          `INSERT INTO actions_dossier (
            dossier_id, titre, description, type, priorite, date_limite, statut
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dossierId,
            action.titre,
            action.description || null,
            'AUTRE',
            mapPriorite(action.priorite),
            dateLimit,
            'A_FAIRE',
          ]
        )
        actionsCreees++
      }
    }

    // Créer les échéances si demandé
    if (options.creerEcheances && structure.timeline.length > 0) {
      for (const step of structure.timeline) {
        if (step.obligatoire) {
          await client.query(
            `INSERT INTO echeances (
              dossier_id, user_id, titre, description, date_evenement,
              type_delai, rappel_j_moins_7, rappel_j_moins_3, rappel_j_moins_1
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              dossierId,
              userId,
              step.etape,
              step.description,
              step.dateEstimee.toISOString().split('T')[0],
              'calendaire',
              true,
              true,
              true,
            ]
          )
          echeancesCreees++
        }
      }
    }

    log.info('Dossier créé avec succès', {
      dossierId,
      numero,
      actionsCreees,
      echeancesCreees,
    })

    return {
      dossierId,
      actionsCreees,
      echeancesCreees,
    }
  })
}

function getInitialWorkflowStep(type: ProcedureType): string {
  switch (type) {
    case 'divorce':
      return 'REQUETE'
    case 'commercial':
      return 'MISE_EN_DEMEURE'
    case 'refere':
      return 'REQUETE'
    default:
      return 'ASSIGNATION'
  }
}

function mapPriorite(
  priorite: 'urgent' | 'haute' | 'moyenne' | 'basse'
): string {
  switch (priorite) {
    case 'urgent':
      return 'URGENTE'
    case 'haute':
      return 'HAUTE'
    case 'moyenne':
      return 'NORMALE'
    case 'basse':
      return 'BASSE'
    default:
      return 'NORMALE'
  }
}
