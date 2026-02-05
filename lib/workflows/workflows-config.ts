/**
 * Configuration des workflows pour différents types de procédures juridiques tunisiennes
 */

export interface WorkflowEtape {
  id: string
  libelle: string
  description: string
  delai_moyen_jours?: number // Délai moyen pour cette étape
  documents_requis?: string[] // Documents généralement nécessaires
  ordre: number
}

export interface WorkflowTemplate {
  id: string
  nom: string
  description: string
  categorie: 'CIVIL' | 'DIVORCE' | 'COMMERCIAL' | 'PENAL' | 'ADMINISTRATIF' | 'AUTRE'
  etapes: WorkflowEtape[]
}

/**
 * WORKFLOW CIVIL - Procédure civile de première instance
 */
export const WORKFLOW_CIVIL: WorkflowTemplate = {
  id: 'civil_premiere_instance',
  nom: 'Procédure civile de première instance',
  description: 'Workflow standard pour une procédure civile devant le tribunal de première instance',
  categorie: 'CIVIL',
  etapes: [
    {
      id: 'ASSIGNATION',
      libelle: 'Assignation',
      description: 'Rédaction et signification de l\'assignation à la partie adverse',
      delai_moyen_jours: 7,
      documents_requis: ['Assignation', 'Pièces justificatives'],
      ordre: 1,
    },
    {
      id: 'CONSTITUTION',
      libelle: 'Constitution avocat adverse',
      description: 'Attente de la constitution de l\'avocat de la partie adverse',
      delai_moyen_jours: 15,
      documents_requis: ['Constitution d\'avocat adverse'],
      ordre: 2,
    },
    {
      id: 'ECHANGE_CONCLUSIONS',
      libelle: 'Échange de conclusions',
      description: 'Échange des conclusions écrites entre les parties',
      delai_moyen_jours: 30,
      documents_requis: ['Conclusions demandeur', 'Conclusions défendeur'],
      ordre: 3,
    },
    {
      id: 'MISE_EN_ETAT',
      libelle: 'Mise en état',
      description: 'Instruction du dossier par le juge de la mise en état',
      delai_moyen_jours: 60,
      documents_requis: [],
      ordre: 4,
    },
    {
      id: 'CLOTURE',
      libelle: 'Clôture',
      description: 'Clôture de l\'instruction - dossier prêt pour plaidoirie',
      delai_moyen_jours: 15,
      documents_requis: [],
      ordre: 5,
    },
    {
      id: 'AUDIENCE_PLAIDOIRIE',
      libelle: 'Audience de plaidoirie',
      description: 'Plaidoirie devant le tribunal',
      delai_moyen_jours: 30,
      documents_requis: [],
      ordre: 6,
    },
    {
      id: 'DELIBERE',
      libelle: 'Mis en délibéré',
      description: 'Affaire mise en délibéré - en attente du jugement',
      delai_moyen_jours: 30,
      documents_requis: [],
      ordre: 7,
    },
    {
      id: 'JUGEMENT',
      libelle: 'Jugement',
      description: 'Prononcé du jugement',
      delai_moyen_jours: 0,
      documents_requis: ['Jugement'],
      ordre: 8,
    },
    {
      id: 'EXECUTION',
      libelle: 'Exécution',
      description: 'Exécution du jugement',
      delai_moyen_jours: 60,
      documents_requis: ['Commandement', 'Saisie'],
      ordre: 9,
    },
  ],
}

/**
 * WORKFLOW DIVORCE - Procédure de divorce en Tunisie (Code Statut Personnel)
 *
 * 4 TYPES DE DIVORCE CSP (Article 31):
 * 1. Consentement mutuel - Accord des deux époux
 * 2. Préjudice (Darar) - Divorce pour préjudice subi
 * 3. Unilatéral époux - Volonté unilatérale du mari
 * 4. Unilatéral épouse (Khol') - Rachat par l'épouse
 *
 * PARTICULARITÉS CSP:
 * - 3 tentatives conciliation OBLIGATOIRES
 * - Délai réflexion 2 mois minimum
 * - Mesures provisoires: pension alimentaire + garde enfants
 * - Expertise sociale si enfants mineurs
 * - Transcription état civil OBLIGATOIRE
 * - Pension compensatoire (Moutaa) selon durée mariage
 */
export const WORKFLOW_DIVORCE: WorkflowTemplate = {
  id: 'divorce',
  nom: 'Procédure de divorce (Code Statut Personnel)',
  description: 'Workflow divorce CSP - 4 types (consentement mutuel, préjudice, unilatéral) - 3 conciliations obligatoires',
  categorie: 'DIVORCE',
  etapes: [
    {
      id: 'DEPOT_REQUETE',
      libelle: 'Dépôt de la requête',
      description: 'Dépôt de la requête en divorce auprès du tribunal',
      delai_moyen_jours: 3,
      documents_requis: ['Requête en divorce', 'Acte de mariage', 'CIN époux'],
      ordre: 1,
    },
    {
      id: 'TENTATIVE_CONCILIATION',
      libelle: 'Tentative de conciliation',
      description: 'Première audience de tentative de conciliation',
      delai_moyen_jours: 30,
      documents_requis: [],
      ordre: 2,
    },
    {
      id: 'ECHEC_CONCILIATION',
      libelle: 'Échec de la conciliation',
      description: 'Constat de l\'échec de la tentative de conciliation',
      delai_moyen_jours: 0,
      documents_requis: ['PV d\'échec de conciliation'],
      ordre: 3,
    },
    {
      id: 'EXPERTISE_SOCIALE',
      libelle: 'Expertise sociale (si enfants)',
      description: 'Expertise sociale pour évaluer l\'intérêt des enfants',
      delai_moyen_jours: 60,
      documents_requis: ['Rapport d\'expertise sociale'],
      ordre: 4,
    },
    {
      id: 'MESURES_PROVISOIRES',
      libelle: 'Mesures provisoires',
      description: 'Fixation des mesures provisoires (pension, garde, visite)',
      delai_moyen_jours: 15,
      documents_requis: ['Ordonnance mesures provisoires'],
      ordre: 5,
    },
    {
      id: 'CONCLUSIONS',
      libelle: 'Échange de conclusions',
      description: 'Échange des conclusions sur le fond du divorce',
      delai_moyen_jours: 30,
      documents_requis: ['Conclusions demandeur', 'Conclusions défendeur'],
      ordre: 6,
    },
    {
      id: 'AUDIENCE_FOND',
      libelle: 'Audience au fond',
      description: 'Plaidoirie sur le fond du divorce',
      delai_moyen_jours: 45,
      documents_requis: [],
      ordre: 7,
    },
    {
      id: 'JUGEMENT_DIVORCE',
      libelle: 'Jugement de divorce',
      description: 'Prononcé du jugement de divorce',
      delai_moyen_jours: 30,
      documents_requis: ['Jugement de divorce'],
      ordre: 8,
    },
    {
      id: 'TRANSCRIPTION',
      libelle: 'Transcription',
      description: 'Transcription du jugement sur l\'acte de mariage',
      delai_moyen_jours: 15,
      documents_requis: ['Extrait de jugement transcrit'],
      ordre: 9,
    },
  ],
}

/**
 * WORKFLOW COMMERCIAL - Procédure commerciale tunisienne
 *
 * PARTICULARITÉS COMMERCIALES TUNISIE:
 * - Tribunal de Commerce (compétence spéciale)
 * - Délai appel RÉDUIT: 10 jours (vs 20j civil) ⚠️
 * - Intérêts moratoires: TMM + 7 points (env. 14.5%)
 * - Indemnité forfaitaire recouvrement: 40 TND (loi 2017)
 * - Référés commerciaux fréquents (mesures urgentes)
 * - Expertise comptable courante
 */
export const WORKFLOW_COMMERCIAL: WorkflowTemplate = {
  id: 'commercial',
  nom: 'Procédure commerciale (Tribunal Commerce)',
  description: 'Workflow pour une procédure devant le tribunal de commerce tunisien - DÉLAI APPEL 10 JOURS',
  categorie: 'COMMERCIAL',
  etapes: [
    {
      id: 'CONSULTATION',
      libelle: 'Consultation initiale',
      description: 'Analyse du dossier commercial et calcul créance + intérêts TMM+7',
      delai_moyen_jours: 3,
      documents_requis: ['Contrat commercial', 'Factures', 'Registre commerce'],
      ordre: 1,
    },
    {
      id: 'MISE_EN_DEMEURE',
      libelle: 'Mise en demeure commerciale',
      description: 'Envoi mise en demeure préalable (point départ intérêts moratoires)',
      delai_moyen_jours: 7,
      documents_requis: ['Lettre mise en demeure recommandée', 'Décompte créance'],
      ordre: 2,
    },
    {
      id: 'ASSIGNATION',
      libelle: 'Assignation Tribunal Commerce',
      description: 'Assignation devant le tribunal de commerce avec calcul intérêts',
      delai_moyen_jours: 7,
      documents_requis: ['Assignation', 'Pièces commerciales', 'RC parties'],
      ordre: 3,
    },
    {
      id: 'CONSTITUTION',
      libelle: 'Constitution adverse',
      description: 'Constitution de l\'avocat de la partie adverse',
      delai_moyen_jours: 10,
      documents_requis: ['Constitution d\'avocat'],
      ordre: 4,
    },
    {
      id: 'ECHANGE_CONCLUSIONS',
      libelle: 'Échange conclusions',
      description: 'Communication pièces et échange conclusions (+ actualisations intérêts)',
      delai_moyen_jours: 20,
      documents_requis: ['Conclusions demandeur', 'Conclusions défendeur', 'Bordereaux pièces'],
      ordre: 5,
    },
    {
      id: 'EXPERTISE_COMPTABLE',
      libelle: 'Expertise comptable (optionnel)',
      description: 'Désignation expert-comptable si nécessaire',
      delai_moyen_jours: 60,
      documents_requis: ['Rapport expertise comptable'],
      ordre: 6,
    },
    {
      id: 'PLAIDOIRIE',
      libelle: 'Plaidoirie',
      description: 'Audience de plaidoirie devant le tribunal de commerce',
      delai_moyen_jours: 20,
      documents_requis: ['Notes de plaidoirie'],
      ordre: 7,
    },
    {
      id: 'JUGEMENT',
      libelle: 'Jugement',
      description: 'Prononcé du jugement - ⚠️ ATTENTION: Délai appel 10 JOURS seulement',
      delai_moyen_jours: 15,
      documents_requis: ['Jugement', 'Copie exécutoire'],
      ordre: 8,
    },
    {
      id: 'EXECUTION',
      libelle: 'Exécution jugement',
      description: 'Recouvrement forcé: commandement, saisie (si jugement favorable)',
      delai_moyen_jours: 30,
      documents_requis: ['Commandement de payer', 'PV de saisie'],
      ordre: 9,
    },
  ],
}

/**
 * WORKFLOW RÉFÉRÉ - Procédure en référé
 */
export const WORKFLOW_REFERE: WorkflowTemplate = {
  id: 'refere',
  nom: 'Procédure en référé',
  description: 'Procédure d\'urgence en référé',
  categorie: 'CIVIL',
  etapes: [
    {
      id: 'DEPOT_REQUETE',
      libelle: 'Dépôt de la requête',
      description: 'Dépôt de la requête en référé auprès du greffe',
      delai_moyen_jours: 1,
      documents_requis: ['Requête en référé', 'Pièces urgence'],
      ordre: 1,
    },
    {
      id: 'NOTIFICATION',
      libelle: 'Notification',
      description: 'Notification de la requête à la partie adverse',
      delai_moyen_jours: 2,
      documents_requis: [],
      ordre: 2,
    },
    {
      id: 'AUDIENCE',
      libelle: 'Audience',
      description: 'Audience devant le juge des référés',
      delai_moyen_jours: 3,
      documents_requis: [],
      ordre: 3,
    },
    {
      id: 'ORDONNANCE',
      libelle: 'Ordonnance',
      description: 'Prononcé de l\'ordonnance de référé',
      delai_moyen_jours: 1,
      documents_requis: ['Ordonnance de référé'],
      ordre: 4,
    },
    {
      id: 'EXECUTION',
      libelle: 'Exécution',
      description: 'Exécution de l\'ordonnance',
      delai_moyen_jours: 7,
      documents_requis: [],
      ordre: 5,
    },
  ],
}

/**
 * Liste de tous les workflows disponibles
 */
export const WORKFLOWS_DISPONIBLES: WorkflowTemplate[] = [
  WORKFLOW_CIVIL,
  WORKFLOW_DIVORCE,
  WORKFLOW_COMMERCIAL,
  WORKFLOW_REFERE,
]

/**
 * Récupérer un workflow par son ID
 */
export function getWorkflowById(id: string): WorkflowTemplate | undefined {
  return WORKFLOWS_DISPONIBLES.find((w) => w.id === id)
}

/**
 * Récupérer les workflows par catégorie
 */
export function getWorkflowsByCategorie(
  categorie: WorkflowTemplate['categorie']
): WorkflowTemplate[] {
  return WORKFLOWS_DISPONIBLES.filter((w) => w.categorie === categorie)
}

/**
 * Récupérer une étape spécifique d'un workflow
 */
export function getWorkflowEtape(
  workflowId: string,
  etapeId: string
): WorkflowEtape | undefined {
  const workflow = getWorkflowById(workflowId)
  return workflow?.etapes.find((e) => e.id === etapeId)
}

/**
 * Calculer la progression d'un workflow
 */
export function calculerProgression(
  workflowId: string,
  etapeActuelleId: string
): number {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) return 0

  const etapeActuelle = workflow.etapes.find((e) => e.id === etapeActuelleId)
  if (!etapeActuelle) return 0

  return Math.round((etapeActuelle.ordre / workflow.etapes.length) * 100)
}

/**
 * Récupérer l'étape suivante
 */
export function getEtapeSuivante(
  workflowId: string,
  etapeActuelleId: string
): WorkflowEtape | undefined {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) return undefined

  const etapeActuelle = workflow.etapes.find((e) => e.id === etapeActuelleId)
  if (!etapeActuelle) return undefined

  return workflow.etapes.find((e) => e.ordre === etapeActuelle.ordre + 1)
}

/**
 * Récupérer l'étape précédente
 */
export function getEtapePrecedente(
  workflowId: string,
  etapeActuelleId: string
): WorkflowEtape | undefined {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) return undefined

  const etapeActuelle = workflow.etapes.find((e) => e.id === etapeActuelleId)
  if (!etapeActuelle) return undefined

  return workflow.etapes.find((e) => e.ordre === etapeActuelle.ordre - 1)
}
