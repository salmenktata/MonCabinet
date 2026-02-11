/**
 * Tests unitaires pour consultation-action-recommender
 * Sprint 2 - Workflow Consultation → Actions
 */

import { describe, it, expect } from 'vitest'
import {
  recommendActionsFromConsultation,
  type ConsultationContext,
  type RecommendedAction,
} from '../consultation-action-recommender'

describe('consultation-action-recommender', () => {
  describe('recommendActionsFromConsultation', () => {
    it('should always recommend creating a dossier', () => {
      const context: ConsultationContext = {
        question: 'Question simple',
        answer: 'Réponse simple',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const createDossierAction = actions.find((a) => a.id === 'create-dossier')
      expect(createDossierAction).toBeDefined()
      expect(createDossierAction?.priorite).toBe('haute')
      expect(createDossierAction?.type).toBe('dossier')
    })

    it('should always recommend copying answer', () => {
      const context: ConsultationContext = {
        question: 'Question',
        answer: 'Réponse',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const copyAction = actions.find((a) => a.id === 'copy-answer')
      expect(copyAction).toBeDefined()
      expect(copyAction?.action.type).toBe('copy')
      expect(copyAction?.action.payload.text).toBe('Réponse')
    })

    it('should recommend deep analysis when calculations detected', () => {
      const context: ConsultationContext = {
        question: 'Calcul pension alimentaire',
        answer: 'La pension alimentaire est de 500 TND par mois selon le calcul suivant...',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const deepAnalysisAction = actions.find((a) => a.id === 'deep-analysis')
      expect(deepAnalysisAction).toBeDefined()
      expect(deepAnalysisAction?.priorite).toBe('haute')
    })

    it('should recommend document list when documents mentioned', () => {
      const context: ConsultationContext = {
        question: 'Documents requis',
        answer: 'Vous devez préparer les documents suivants : acte de mariage, certificat de naissance...',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const documentAction = actions.find((a) => a.id === 'list-documents')
      expect(documentAction).toBeDefined()
      expect(documentAction?.type).toBe('document')
    })

    it('should recommend creating deadlines when delays mentioned', () => {
      const context: ConsultationContext = {
        question: 'Délais procédure',
        answer: 'Vous avez 30 jours pour déposer votre recours et 60 jours pour la réponse...',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const deadlineAction = actions.find((a) => a.id === 'create-deadlines')
      expect(deadlineAction).toBeDefined()
      expect(deadlineAction?.priorite).toBe('urgente')
      expect(deadlineAction?.type).toBe('deadline')
    })

    it('should recommend exploring sources when sources provided', () => {
      const context: ConsultationContext = {
        question: 'Question juridique',
        answer: 'Selon l\'article 123...',
        sources: [
          { id: 'source-1', type: 'code', title: 'Code civil' },
          { id: 'source-2', type: 'jurisprudence', title: 'Arrêt 456' },
        ],
      }

      const actions = recommendActionsFromConsultation(context)

      const exploreAction = actions.find((a) => a.id === 'explore-sources')
      expect(exploreAction).toBeDefined()
      expect(exploreAction?.type).toBe('recherche')
    })

    it('should recommend similar cases when jurisprudence present', () => {
      const context: ConsultationContext = {
        question: 'Jurisprudence',
        answer: 'Selon la jurisprudence...',
        sources: [
          { id: 'juris-1', type: 'jurisprudence', title: 'Arrêt cassation' },
        ],
        metadata: {
          hasJurisprudence: true,
          categories: ['divorce'],
        },
      }

      const actions = recommendActionsFromConsultation(context)

      const similarCasesAction = actions.find((a) => a.id === 'similar-cases')
      expect(similarCasesAction).toBeDefined()
      expect(similarCasesAction?.type).toBe('recherche')
    })

    it('should recommend add contact when contacts mentioned', () => {
      const context: ConsultationContext = {
        question: 'Qui contacter',
        answer: 'Vous devez consulter un expert comptable et faire appel à un notaire...',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const contactAction = actions.find((a) => a.id === 'add-contact')
      expect(contactAction).toBeDefined()
      expect(contactAction?.type).toBe('contact')
    })

    it('should sort actions by priority (urgent first)', () => {
      const context: ConsultationContext = {
        question: 'Question complète',
        answer: 'Vous avez 15 jours pour agir. Montant: 1000 TND. Documents requis. Consultez un expert.',
        sources: [
          { id: 's1', type: 'code', title: 'Code' },
        ],
        metadata: {
          hasJurisprudence: true,
        },
      }

      const actions = recommendActionsFromConsultation(context)

      // Vérifie que les actions urgentes sont en premier
      const firstAction = actions[0]
      expect(['urgent', 'haute']).toContain(firstAction.priorite)

      // Vérifie que l'ordre est décroissant de priorité
      const priorityOrder = ['urgent', 'haute', 'moyenne', 'basse']
      const priorityIndices = actions.map((a) => priorityOrder.indexOf(a.priorite))

      for (let i = 1; i < priorityIndices.length; i++) {
        expect(priorityIndices[i]).toBeGreaterThanOrEqual(priorityIndices[i - 1])
      }
    })

    it('should handle multiple calculations in answer', () => {
      const context: ConsultationContext = {
        question: 'Calculs multiples',
        answer: 'Pension alimentaire: 500 TND/mois. Indemnité forfaitaire: 2000 TND. Intérêts: 100 TND.',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const deepAnalysisAction = actions.find((a) => a.id === 'deep-analysis')
      expect(deepAnalysisAction).toBeDefined()
    })

    it('should detect Arabic currency mentions', () => {
      const context: ConsultationContext = {
        question: 'سؤال',
        answer: 'المبلغ هو 1000 د.ت',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      // Doit détecter le montant même en arabe
      const deepAnalysisAction = actions.find((a) => a.id === 'deep-analysis')
      expect(deepAnalysisAction).toBeDefined()
    })

    it('should provide navigate action with correct payload', () => {
      const context: ConsultationContext = {
        question: 'Ma question',
        answer: 'Réponse détaillée',
        sources: [],
      }

      const actions = recommendActionsFromConsultation(context)

      const createDossierAction = actions.find((a) => a.id === 'create-dossier')
      expect(createDossierAction?.action.type).toBe('navigate')
      expect(createDossierAction?.action.payload.path).toBe('/dossiers/assistant')
      expect(createDossierAction?.action.payload.params.from).toBe('consultation')
      expect(createDossierAction?.action.payload.params.seed).toBe('Ma question')
    })
  })
})
