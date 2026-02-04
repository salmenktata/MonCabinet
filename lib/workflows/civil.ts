export const WORKFLOW_CIVIL = {
  id: 'CIVIL_PREMIERE_INSTANCE',
  nom: 'Procédure Civile - 1ère Instance',
  description: 'Workflow standard pour une procédure civile devant le tribunal de première instance',
  etapes: [
    {
      id: 'ASSIGNATION',
      nom: 'Assignation',
      description: 'Rédaction et signification de l\'assignation',
      ordre: 1,
      couleur: 'blue',
      actions_type: [
        { titre: 'Rédiger l\'assignation', type: 'REDACTION', priorite: 'HAUTE' },
        { titre: 'Faire signifier l\'assignation', type: 'AUTRE', priorite: 'HAUTE' },
      ],
    },
    {
      id: 'MISE_EN_ETAT',
      nom: 'Mise en état',
      description: 'Audience de mise en état et échange de conclusions',
      ordre: 2,
      couleur: 'indigo',
      actions_type: [
        { titre: 'Préparer conclusions', type: 'REDACTION', priorite: 'NORMALE' },
        { titre: 'Audience mise en état', type: 'AUDIENCE', priorite: 'HAUTE' },
      ],
    },
    {
      id: 'INSTRUCTION',
      nom: 'Instruction',
      description: 'Phase d\'instruction - échange de pièces et mémoires',
      ordre: 3,
      couleur: 'purple',
      actions_type: [
        { titre: 'Communiquer les pièces', type: 'AUTRE', priorite: 'NORMALE' },
        { titre: 'Rédiger mémoire en réplique', type: 'REDACTION', priorite: 'NORMALE' },
      ],
    },
    {
      id: 'PLAIDOIRIES',
      nom: 'Plaidoiries',
      description: 'Audience de plaidoiries',
      ordre: 4,
      couleur: 'pink',
      actions_type: [
        { titre: 'Préparer plaidoirie', type: 'REDACTION', priorite: 'HAUTE' },
        { titre: 'Audience de plaidoiries', type: 'AUDIENCE', priorite: 'HAUTE' },
      ],
    },
    {
      id: 'DELIBERE',
      nom: 'Délibéré',
      description: 'Attente de la décision',
      ordre: 5,
      couleur: 'orange',
      actions_type: [
        { titre: 'Suivre le délibéré', type: 'AUTRE', priorite: 'NORMALE' },
      ],
    },
    {
      id: 'JUGEMENT',
      nom: 'Jugement',
      description: 'Prononcé du jugement',
      ordre: 6,
      couleur: 'green',
      actions_type: [
        { titre: 'Récupérer copie jugement', type: 'AUTRE', priorite: 'HAUTE' },
        { titre: 'Notifier jugement au client', type: 'RDV_CLIENT', priorite: 'HAUTE' },
      ],
    },
    {
      id: 'EXECUTION',
      nom: 'Exécution',
      description: 'Exécution du jugement',
      ordre: 7,
      couleur: 'teal',
      actions_type: [
        { titre: 'Demander exécution', type: 'AUTRE', priorite: 'NORMALE' },
      ],
    },
  ],
}

export function getWorkflowEtape(etapeId: string) {
  return WORKFLOW_CIVIL.etapes.find((e) => e.id === etapeId)
}

export function getNextEtape(currentEtapeId: string) {
  const currentEtape = getWorkflowEtape(currentEtapeId)
  if (!currentEtape) return null

  return WORKFLOW_CIVIL.etapes.find((e) => e.ordre === currentEtape.ordre + 1)
}

export function getPreviousEtape(currentEtapeId: string) {
  const currentEtape = getWorkflowEtape(currentEtapeId)
  if (!currentEtape) return null

  return WORKFLOW_CIVIL.etapes.find((e) => e.ordre === currentEtape.ordre - 1)
}

export function getWorkflowProgress(currentEtapeId: string) {
  const currentEtape = getWorkflowEtape(currentEtapeId)
  if (!currentEtape) return 0

  return Math.round((currentEtape.ordre / WORKFLOW_CIVIL.etapes.length) * 100)
}
