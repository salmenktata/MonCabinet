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
  categorie: 'CIVIL' | 'DIVORCE' | 'COMMERCIAL' | 'PENAL' | 'ADMINISTRATIF' | 'FAILLITE' | 'AUTRE'
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
 * WORKFLOW PÉNAL - Procédure pénale (poursuite / défense)
 *
 * PARTICULARITÉS CPP TUNISIE:
 * - Délai appel pénal : 10 jours (même qu'en commercial) ⚠️
 * - Droit à un avocat dès la garde à vue (réforme 2016)
 * - Détention préventive : délais stricts, contrôlée par juge instruction
 * - Double voie : poursuite (partie civile) OU défense (prévenu)
 * - Casier judiciaire (Bulletin B3) requis à l'audience
 */
export const WORKFLOW_PENAL: WorkflowTemplate = {
  id: 'penal',
  nom: 'Procédure pénale (CPP)',
  description: 'Workflow pénal tunisien — poursuite ou défense — DÉLAI APPEL 10 JOURS',
  categorie: 'PENAL',
  etapes: [
    {
      id: 'CONSULTATION_PENALE',
      libelle: 'Consultation pénale',
      description: 'Analyse des faits, qualification pénale applicable, stratégie défense ou poursuite',
      delai_moyen_jours: 3,
      documents_requis: ['Éléments de fait', 'Qualification pénale', 'Pièces à conviction'],
      ordre: 1,
    },
    {
      id: 'PLAINTE_CONSTITUTION_PC',
      libelle: 'Plainte / Constitution partie civile',
      description: 'Dépôt de la plainte pénale ou constitution en tant que partie civile',
      delai_moyen_jours: 7,
      documents_requis: ['Plainte pénale', 'CIN client', 'Pièces justificatives'],
      ordre: 2,
    },
    {
      id: 'INSTRUCTION',
      libelle: 'Phase d\'instruction',
      description: 'Instruction judiciaire par le juge d\'instruction (auditions, saisies, expertises)',
      delai_moyen_jours: 60,
      documents_requis: ['PV d\'audition', 'Ordonnances juge instruction', 'PV de saisie'],
      ordre: 3,
    },
    {
      id: 'MISE_EN_PREVENTION',
      libelle: 'Mise en prévention',
      description: 'Notification de la mise en prévention — demande de mise en liberté si applicable',
      delai_moyen_jours: 0,
      documents_requis: ['Ordonnance mise en prévention', 'Demande mise en liberté (si applicable)'],
      ordre: 4,
    },
    {
      id: 'ORDONNANCE_RENVOI',
      libelle: 'Ordonnance de renvoi',
      description: 'Ordonnance de renvoi en jugement devant le tribunal correctionnel ou criminel',
      delai_moyen_jours: 15,
      documents_requis: ['Ordonnance de renvoi en jugement'],
      ordre: 5,
    },
    {
      id: 'AUDIENCE_FOND_PENALE',
      libelle: 'Audience de jugement',
      description: 'Plaidoirie au fond devant le tribunal pénal',
      delai_moyen_jours: 30,
      documents_requis: ['Dossier pénal complet', 'B3 casier judiciaire', 'Notes de plaidoirie'],
      ordre: 6,
    },
    {
      id: 'DELIBERE_PENAL',
      libelle: 'Mis en délibéré',
      description: 'Affaire mise en délibéré — en attente du jugement pénal',
      delai_moyen_jours: 15,
      documents_requis: [],
      ordre: 7,
    },
    {
      id: 'JUGEMENT_PENAL',
      libelle: 'Jugement pénal',
      description: 'Prononcé du jugement pénal — ⚠️ DÉLAI APPEL 10 JOURS',
      delai_moyen_jours: 0,
      documents_requis: ['Jugement pénal'],
      ordre: 8,
    },
    {
      id: 'APPEL_PENAL',
      libelle: 'Appel (si décision défavorable)',
      description: 'Déclaration d\'appel et rédaction du mémoire ampliatif',
      delai_moyen_jours: 30,
      documents_requis: ['Déclaration d\'appel', 'Mémoire ampliatif'],
      ordre: 9,
    },
  ],
}

/**
 * WORKFLOW ADMINISTRATIF - Tribunal Administratif
 *
 * PARTICULARITÉS LOI 72-40:
 * - Recours gracieux préalable OBLIGATOIRE dans la plupart des cas
 * - Délai recours gracieux : 3 mois à compter de la notification de l'acte
 * - Délai recours contentieux : 60 jours après rejet gracieux (ou silence 3 mois = rejet implicite)
 * - Commissaire d'État (ministère public TA) rend des conclusions
 * - Exécution des arrêts TA peut nécessiter une astreinte spéciale
 */
export const WORKFLOW_ADMINISTRATIF: WorkflowTemplate = {
  id: 'administratif',
  nom: 'Tribunal Administratif (TA)',
  description: 'Workflow TA tunisien — recours gracieux préalable obligatoire — délai contentieux 60 jours après rejet',
  categorie: 'ADMINISTRATIF',
  etapes: [
    {
      id: 'CONSULTATION_ADMIN',
      libelle: 'Consultation et analyse',
      description: 'Analyse de la décision administrative contestée et vérification des délais de recours',
      delai_moyen_jours: 5,
      documents_requis: ['Décision administrative contestée', 'Pièces de notification'],
      ordre: 1,
    },
    {
      id: 'RECOURS_GRACIEUX',
      libelle: 'Recours gracieux',
      description: 'Envoi du recours gracieux préalable (obligatoire) — délai réponse 3 mois',
      delai_moyen_jours: 30,
      documents_requis: ['Lettre recours gracieux', 'AR (accusé de réception)', 'Décompte des délais'],
      ordre: 2,
    },
    {
      id: 'DEPOT_REQUETE_TA',
      libelle: 'Dépôt requête au TA',
      description: 'Dépôt de la requête introductive devant le Tribunal Administratif (60j après rejet gracieux)',
      delai_moyen_jours: 7,
      documents_requis: ['Requête introductive', 'Copie décision contestée', 'AR recours gracieux'],
      ordre: 3,
    },
    {
      id: 'INSTRUCTION_TA',
      libelle: 'Instruction (conseiller rapporteur)',
      description: 'Instruction du dossier par le conseiller rapporteur désigné',
      delai_moyen_jours: 90,
      documents_requis: ['Mémoire en demande détaillé'],
      ordre: 4,
    },
    {
      id: 'COMMUNICATIONS',
      libelle: 'Échange de mémoires',
      description: 'Communication des mémoires entre les parties — mémoire en défense de l\'administration et réplique',
      delai_moyen_jours: 45,
      documents_requis: ['Mémoire en défense administration', 'Mémoire en réplique'],
      ordre: 5,
    },
    {
      id: 'CONCLUSIONS_COMMISSAIRE',
      libelle: 'Conclusions du Commissaire d\'État',
      description: 'Dépôt des conclusions du Commissaire d\'État (ministère public TA)',
      delai_moyen_jours: 30,
      documents_requis: [],
      ordre: 6,
    },
    {
      id: 'AUDIENCE_TA',
      libelle: 'Audience devant la chambre TA',
      description: 'Plaidoirie devant la chambre du Tribunal Administratif — réponse aux conclusions du Commissaire',
      delai_moyen_jours: 30,
      documents_requis: ['Notes de plaidoirie', 'Réponse aux conclusions commissaire'],
      ordre: 7,
    },
    {
      id: 'ARRET_TA',
      libelle: 'Arrêt du Tribunal Administratif',
      description: 'Prononcé de l\'arrêt du Tribunal Administratif',
      delai_moyen_jours: 30,
      documents_requis: ['Arrêt TA'],
      ordre: 8,
    },
    {
      id: 'EXECUTION_ARRET',
      libelle: 'Exécution de l\'arrêt',
      description: 'Mise en demeure + demande d\'astreinte si l\'administration refuse d\'exécuter l\'arrêt TA',
      delai_moyen_jours: 45,
      documents_requis: ['Mise en demeure', 'Demande d\'astreinte (si refus d\'exécution)'],
      ordre: 9,
    },
  ],
}

/**
 * WORKFLOW FAILLITE - Faillite / Liquidation judiciaire
 *
 * PARTICULARITÉS LOI 95-34 (entreprises en difficultés):
 * - Compétence : Tribunal de Commerce (ou TPI si pas de TC)
 * - Syndic désigné par le tribunal (pas choisi par les parties)
 * - Délai déclaration des créances : 30 jours après jugement d'ouverture
 * - Période d'observation : max 3 mois (renouvelable une fois)
 * - 2 issues : Plan de redressement (RJ) OU Liquidation judiciaire
 */
export const WORKFLOW_FAILLITE: WorkflowTemplate = {
  id: 'faillite',
  nom: 'Faillite / Liquidation judiciaire',
  description: 'Workflow faillite tunisienne (Loi 95-34) — déclaration créances 30j — période observation 90j',
  categorie: 'FAILLITE',
  etapes: [
    {
      id: 'CONSULTATION_FAILLITE',
      libelle: 'Analyse situation financière',
      description: 'Analyse de la situation financière — bilan, état des dettes, viabilité de l\'entreprise',
      delai_moyen_jours: 7,
      documents_requis: ['Bilan comptable', 'État des dettes', 'RC entreprise'],
      ordre: 1,
    },
    {
      id: 'DEPOT_REQUETE_RJ',
      libelle: 'Dépôt requête RJ ou faillite',
      description: 'Dépôt de la requête d\'ouverture de redressement judiciaire ou de faillite',
      delai_moyen_jours: 3,
      documents_requis: ['Requête d\'ouverture', 'Bilan', 'État des créances', 'Rapport de gestion'],
      ordre: 2,
    },
    {
      id: 'JUGEMENT_OUVERTURE',
      libelle: 'Jugement d\'ouverture',
      description: 'Jugement d\'ouverture de la procédure — désignation du syndic et du juge commissaire',
      delai_moyen_jours: 0,
      documents_requis: ['Jugement désignation syndic + juge commissaire'],
      ordre: 3,
    },
    {
      id: 'PERIODE_OBSERVATION',
      libelle: 'Période d\'observation',
      description: 'Période d\'observation (max 90j) — vérification des créances, rapport du syndic',
      delai_moyen_jours: 90,
      documents_requis: ['Rapport syndic', 'État des créances vérifiées', 'Plan prévisionnel'],
      ordre: 4,
    },
    {
      id: 'PLAN_REDRESSEMENT',
      libelle: 'Élaboration plan de redressement',
      description: 'Rédaction du plan de redressement (échéancier, mesures sociales) — ou orientation vers liquidation',
      delai_moyen_jours: 30,
      documents_requis: ['Plan de redressement (échéancier, mesures sociales)'],
      ordre: 5,
    },
    {
      id: 'HOMOLOGATION_PLAN',
      libelle: 'Homologation du plan',
      description: 'Homologation judiciaire du plan de redressement ou jugement de liquidation judiciaire',
      delai_moyen_jours: 30,
      documents_requis: ['Jugement homologation OU jugement liquidation'],
      ordre: 6,
    },
    {
      id: 'EXECUTION_PLAN',
      libelle: 'Exécution du plan / Liquidation',
      description: 'Suivi de l\'exécution du plan de redressement ou opérations de liquidation des actifs',
      delai_moyen_jours: 180,
      documents_requis: ['PV vérification créances', 'Rapports syndic trimestriels'],
      ordre: 7,
    },
    {
      id: 'CLOTURE_FAILLITE',
      libelle: 'Clôture de la procédure',
      description: 'Jugement de clôture — pour extinction du passif (plan exécuté) ou insuffisance d\'actif (liquidation)',
      delai_moyen_jours: 0,
      documents_requis: ['Jugement de clôture'],
      ordre: 8,
    },
  ],
}

/**
 * WORKFLOW EXÉCUTION FORCÉE - Recouvrement forcé
 *
 * PARTICULARITÉS CPCC TUNISIE:
 * - Commandement de payer = point départ délai d'opposition 15 jours ⚠️
 * - Délai entre commandement et saisie : min 8 jours
 * - Saisie-arrêt bancaire : notification banque + 15j d'opposition
 * - Bien principal du débiteur : protection partielle (insaisissabilité résidence principale)
 * - Vente aux enchères : publicité légale obligatoire (15j min)
 */
export const WORKFLOW_EXECUTION: WorkflowTemplate = {
  id: 'execution_forcee',
  nom: 'Recouvrement forcé / Exécution',
  description: 'Workflow exécution forcée CPCC — commandement de payer → saisie → vente — OPPOSITION 15 JOURS',
  categorie: 'CIVIL',
  etapes: [
    {
      id: 'SIGNIFICATION_JUGEMENT',
      libelle: 'Signification du jugement',
      description: 'Signification par huissier du jugement avec formule exécutoire à la partie adverse',
      delai_moyen_jours: 7,
      documents_requis: ['Jugement avec formule exécutoire', 'PV de signification'],
      ordre: 1,
    },
    {
      id: 'COMMANDEMENT_PAYER',
      libelle: 'Commandement de payer',
      description: 'Commandement de payer par huissier — ⚠️ DÉLAI OPPOSITION 15 JOURS — délai min 8j avant saisie',
      delai_moyen_jours: 3,
      documents_requis: ['Commandement huissier'],
      ordre: 2,
    },
    {
      id: 'SAISIE_ARRET_BANCAIRE',
      libelle: 'Saisie-arrêt sur comptes',
      description: 'Saisie-arrêt bancaire sur les comptes du débiteur — notification bancaire + 15j opposition',
      delai_moyen_jours: 5,
      documents_requis: ['Ordonnance saisie-arrêt', 'Notification bancaire'],
      ordre: 3,
    },
    {
      id: 'SAISIE_MOBILIERE',
      libelle: 'Saisie mobilière',
      description: 'Saisie des biens mobiliers du débiteur si comptes bancaires insuffisants',
      delai_moyen_jours: 7,
      documents_requis: ['PV de saisie mobilière'],
      ordre: 4,
    },
    {
      id: 'SAISIE_IMMOBILIERE',
      libelle: 'Saisie immobilière',
      description: 'Réquisition de saisie immobilière et inscription d\'hypothèque judiciaire',
      delai_moyen_jours: 30,
      documents_requis: ['Réquisition saisie immeuble', 'Inscription hypothèque judiciaire'],
      ordre: 5,
    },
    {
      id: 'VENTE_FORCEE',
      libelle: 'Vente forcée aux enchères',
      description: 'Vente aux enchères publiques — publicité légale obligatoire (J.O. + 2 journaux, min 15j)',
      delai_moyen_jours: 30,
      documents_requis: ['Publication légale (J.O. + 2 journaux)', 'PV d\'adjudication'],
      ordre: 6,
    },
    {
      id: 'DISTRIBUTION',
      libelle: 'Distribution du prix',
      description: 'Établissement de l\'état de répartition du prix entre les créanciers',
      delai_moyen_jours: 15,
      documents_requis: ['État de répartition entre créanciers'],
      ordre: 7,
    },
    {
      id: 'CLOTURE_EXECUTION',
      libelle: 'Clôture de la procédure',
      description: 'Clôture de la procédure d\'exécution après recouvrement total ou partiel',
      delai_moyen_jours: 0,
      documents_requis: ['PV de clôture', 'Quittance'],
      ordre: 8,
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
  WORKFLOW_PENAL,
  WORKFLOW_ADMINISTRATIF,
  WORKFLOW_FAILLITE,
  WORKFLOW_EXECUTION,
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
