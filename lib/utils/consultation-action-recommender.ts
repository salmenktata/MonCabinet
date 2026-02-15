/**
 * Service de recommandation d'actions après une consultation juridique
 * Analyse la réponse de consultation et suggère des actions concrètes
 *
 * @module lib/utils/consultation-action-recommender
 * @see Sprint 2 - Workflow Consultation → Actions
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('Utils:ConsultationActions')

/**
 * Action recommandée après une consultation
 */
export interface RecommendedAction {
  id: string
  type: 'dossier' | 'document' | 'recherche' | 'contact' | 'deadline'
  icon: string // Lucide icon name
  titre: string
  description: string
  priorite: 'urgent' | 'haute' | 'moyenne' | 'basse'
  dureeEstimee?: string // Ex: "5 min", "1 heure"
  action: ActionHandler
}

/**
 * Handler d'action
 */
export interface ActionHandler {
  type: 'navigate' | 'open-modal' | 'copy' | 'download'
  payload: Record<string, any>
}

/**
 * Contexte de consultation pour recommandations
 */
export interface ConsultationContext {
  question: string
  answer: string
  sources: Array<{
    id: string
    type: string
    title: string
    category?: string
  }>
  metadata?: {
    hasJurisprudence?: boolean
    hasCode?: boolean
    hasDoctrine?: boolean
    categories?: string[]
  }
}

/**
 * Recommande des actions basées sur une consultation
 */
export function recommendActionsFromConsultation(
  context: ConsultationContext
): RecommendedAction[] {
  const actions: RecommendedAction[] = []

  // Toujours proposer de créer un dossier
  actions.push({
    id: 'create-dossier',
    type: 'dossier',
    icon: 'FolderPlus',
    titre: 'Créer un dossier',
    description: 'Transformer cette consultation en dossier avec structuration IA',
    priorite: 'haute',
    dureeEstimee: '5-10 min',
    action: {
      type: 'navigate',
      payload: {
        path: '/qadhya-ia/structure',
        params: {
          from: 'consultation',
          seed: context.question,
          context: context.answer.substring(0, 500),
        },
      },
    },
  })

  // Si la réponse contient des montants ou calculs
  if (containsCalculations(context.answer)) {
    actions.push({
      id: 'deep-analysis',
      type: 'document',
      icon: 'Calculator',
      titre: 'Analyse approfondie',
      description: 'Obtenir des calculs détaillés avec timeline et actions suggérées',
      priorite: 'haute',
      dureeEstimee: '3-5 min',
      action: {
        type: 'navigate',
        payload: {
          path: '/qadhya-ia/structure',
          params: {
            from: 'consultation',
            mode: 'calcul',
            seed: `${context.question}\n\nRéponse préliminaire:\n${context.answer.substring(0, 800)}`,
          },
        },
      },
    })
  }

  // Si la réponse mentionne des documents à préparer
  if (mentionsDocuments(context.answer)) {
    actions.push({
      id: 'list-documents',
      type: 'document',
      icon: 'FileCheck',
      titre: 'Liste des documents requis',
      description: 'Afficher les documents à préparer mentionnés dans la réponse',
      priorite: 'moyenne',
      action: {
        type: 'open-modal',
        payload: {
          modal: 'document-checklist',
          data: extractDocuments(context.answer),
        },
      },
    })
  }

  // Si la réponse contient des délais
  if (mentionsDeadlines(context.answer)) {
    actions.push({
      id: 'create-deadlines',
      type: 'deadline',
      icon: 'Calendar',
      titre: 'Créer des échéances',
      description: 'Ajouter les délais mentionnés à votre calendrier',
      priorite: 'urgent',
      dureeEstimee: '2 min',
      action: {
        type: 'navigate',
        payload: {
          path: '/echeances/new',
          params: {
            from: 'consultation',
            deadlines: extractDeadlines(context.answer),
          },
        },
      },
    })
  }

  // Si la réponse contient des références juridiques
  if (context.sources.length > 0) {
    actions.push({
      id: 'explore-sources',
      type: 'recherche',
      icon: 'BookOpen',
      titre: 'Explorer les sources',
      description: `Consulter les ${context.sources.length} références juridiques utilisées`,
      priorite: 'moyenne',
      dureeEstimee: '10-15 min',
      action: {
        type: 'navigate',
        payload: {
          path: '/client/knowledge-base',
          params: {
            filter: context.sources.map((s) => s.id).join(','),
          },
        },
      },
    })
  }

  // Si la réponse suggère de contacter quelqu'un
  if (mentionsContact(context.answer)) {
    actions.push({
      id: 'add-contact',
      type: 'contact',
      icon: 'UserPlus',
      titre: 'Ajouter un contact',
      description: 'Enregistrer les contacts mentionnés (experts, témoins, etc.)',
      priorite: 'basse',
      action: {
        type: 'open-modal',
        payload: {
          modal: 'add-contact',
          data: extractContacts(context.answer),
        },
      },
    })
  }

  // Toujours proposer de copier la réponse
  actions.push({
    id: 'copy-answer',
    type: 'document',
    icon: 'Copy',
    titre: 'Copier la réponse',
    description: 'Copier le conseil juridique dans le presse-papier',
    priorite: 'basse',
    dureeEstimee: '1 sec',
    action: {
      type: 'copy',
      payload: {
        text: context.answer,
      },
    },
  })

  // Proposer de rechercher des arrêts similaires si jurisprudence
  if (context.metadata?.hasJurisprudence) {
    actions.push({
      id: 'similar-cases',
      type: 'recherche',
      icon: 'Scale',
      titre: 'Arrêts similaires',
      description: 'Rechercher une jurisprudence complémentaire',
      priorite: 'moyenne',
      action: {
        type: 'navigate',
        payload: {
          path: '/client/jurisprudence-timeline',
          params: {
            from: 'consultation',
            category: context.metadata?.categories?.[0],
          },
        },
      },
    })
  }

  // Trier par priorité
  return sortActionsByPriority(actions)
}

/**
 * Vérifie si la réponse contient des calculs
 */
function containsCalculations(answer: string): boolean {
  const patterns = [
    /\d+\s*(TND|dinars?|DT)/i,
    /(pension|indemnité|moutaa|intérêts)/i,
    /(calcul|montant|somme)/i,
  ]
  return patterns.some((p) => p.test(answer))
}

/**
 * Vérifie si la réponse mentionne des documents
 */
function mentionsDocuments(answer: string): boolean {
  const patterns = [
    /(document|pièce|acte|certificat|attestation)/i,
    /(préparer|fournir|joindre|produire)/i,
  ]
  return patterns.some((p) => p.test(answer))
}

/**
 * Vérifie si la réponse mentionne des délais
 */
function mentionsDeadlines(answer: string): boolean {
  const patterns = [
    /(\d+)\s*(jour|mois|an|semaine)s?/i,
    /(délai|échéance|date limite)/i,
    /(avant le|jusqu'au)/i,
  ]
  return patterns.some((p) => p.test(answer))
}

/**
 * Vérifie si la réponse suggère un contact
 */
function mentionsContact(answer: string): boolean {
  const patterns = [
    /(expert|témoin|notaire|huissier)/i,
    /(contacter|consulter|faire appel)/i,
  ]
  return patterns.some((p) => p.test(answer))
}

/**
 * Extrait les documents mentionnés
 */
function extractDocuments(answer: string): string[] {
  // Regex simple pour extraire les documents
  const matches = answer.match(/(?:document|pièce|acte|certificat|attestation)[^.!?]*/gi)
  return matches ? Array.from(new Set(matches)).slice(0, 5) : []
}

/**
 * Extrait les délais mentionnés
 */
function extractDeadlines(answer: string): string[] {
  const matches = answer.match(/(\d+)\s*(jour|mois|an|semaine)s?/gi)
  return matches ? Array.from(new Set(matches)) : []
}

/**
 * Extrait les contacts mentionnés
 */
function extractContacts(answer: string): string[] {
  const matches = answer.match(/(?:expert|témoin|notaire|huissier)[^.!?]*/gi)
  return matches ? Array.from(new Set(matches)).slice(0, 3) : []
}

/**
 * Trie les actions par priorité
 */
function sortActionsByPriority(actions: RecommendedAction[]): RecommendedAction[] {
  const priorityOrder = { urgent: 0, haute: 1, moyenne: 2, basse: 3 }
  return actions.sort((a, b) => priorityOrder[a.priorite] - priorityOrder[b.priorite])
}
