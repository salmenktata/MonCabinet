/**
 * Tests unitaires pour chat-to-dossier-extractor
 * Sprint 2 - Workflow Chat → Dossier
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractDossierDataFromChat,
  canCreateDossierFromChat,
  estimateDataQuality,
  type ChatDossierData,
} from '../chat-to-dossier-extractor'
import type { ChatMessage } from '@/components/assistant-ia'

// Mock du service LLM fallback
vi.mock('../llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(async (prompt: string) => {
    // Simuler une réponse LLM basée sur le prompt
    if (prompt.includes('divorce')) {
      return {
        answer: JSON.stringify({
          confidence: 0.85,
          langue: 'fr',
          titrePropose: 'Divorce - Pension alimentaire',
          description: 'Demande de révision de pension alimentaire pour 2 enfants',
          typeProcedure: 'divorce',
          client: {
            nom: 'Dupont',
            prenom: 'Marie',
            role: 'demandeur',
          },
          partieAdverse: {
            nom: 'Dupont',
            prenom: 'Jean',
            role: 'defendeur',
          },
          faitsExtraits: [
            {
              label: 'Date mariage',
              valeur: '2015-06-10',
              type: 'date',
              confidence: 0.9,
              source: 'Message utilisateur',
              importance: 'important',
            },
            {
              label: 'Nombre d\'enfants',
              valeur: '2',
              type: 'autre',
              confidence: 1.0,
              source: 'Message utilisateur',
              importance: 'decisif',
            },
          ],
        }),
      }
    }

    // Fallback pour d'autres cas
    return {
      answer: JSON.stringify({
        confidence: 0.5,
        langue: 'fr',
        titrePropose: 'Nouveau dossier',
        description: 'Dossier créé depuis conversation',
        faitsExtraits: [],
      }),
    }
  }),
}))

describe('chat-to-dossier-extractor', () => {
  describe('extractDossierDataFromChat', () => {
    it('should extract data from conversation about divorce', async () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Bonjour, je voudrais divorcer. Nous nous sommes mariés le 10/06/2015 et avons 2 enfants.',
          createdAt: new Date('2026-02-11T10:00:00Z'),
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Je comprends votre situation. Pouvez-vous me donner plus de détails ?',
          createdAt: new Date('2026-02-11T10:01:00Z'),
        },
        {
          id: '3',
          role: 'user',
          content: 'Mon ex-conjoint gagne 3000 TND par mois et je souhaite réviser la pension alimentaire.',
          createdAt: new Date('2026-02-11T10:02:00Z'),
        },
      ]

      const result = await extractDossierDataFromChat('conv-123', messages)

      expect(result).toBeDefined()
      expect(result.conversationId).toBe('conv-123')
      expect(result.confidence).toBeGreaterThan(0.7)
      expect(result.langue).toBe('fr')
      expect(result.titrePropose).toContain('Divorce')
      expect(result.description).toBeTruthy()
      expect(result.typeProcedure).toBe('divorce')
      expect(result.client).toBeDefined()
      expect(result.partieAdverse).toBeDefined()
      expect(result.faitsExtraits.length).toBeGreaterThan(0)
      expect(result.messageCount).toBe(3)
      expect(result.extractedFromUserMessages).toBe(2)
    })

    it('should limit to last N messages when specified', async () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        createdAt: new Date(`2026-02-11T10:${i.toString().padStart(2, '0')}:00Z`),
      })) as ChatMessage[]

      const result = await extractDossierDataFromChat('conv-123', messages, {
        lastNMessages: 3,
      })

      expect(result).toBeDefined()
      // Vérifie que l'extraction a bien utilisé les 3 derniers messages
    })

    it('should force procedure type when specified', async () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Je veux lancer une procédure',
          createdAt: new Date('2026-02-11T10:00:00Z'),
        },
      ]

      const result = await extractDossierDataFromChat('conv-123', messages, {
        forceProcedureType: 'commercial',
      })

      expect(result.typeProcedure).toBe('commercial')
    })

    it('should handle empty messages gracefully', async () => {
      const messages: ChatMessage[] = []

      const result = await extractDossierDataFromChat('conv-123', messages)

      expect(result).toBeDefined()
      expect(result.confidence).toBeLessThan(0.5) // Faible confiance
      expect(result.faitsExtraits).toEqual([])
    })
  })

  describe('canCreateDossierFromChat', () => {
    it('should return true for valid conversation', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Je voudrais créer un dossier pour un divorce',
          createdAt: new Date(),
        },
      ]

      expect(canCreateDossierFromChat(messages)).toBe(true)
    })

    it('should return false for empty conversation', () => {
      const messages: ChatMessage[] = []

      expect(canCreateDossierFromChat(messages)).toBe(false)
    })

    it('should return false for too short message', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Bonjour',
          createdAt: new Date(),
        },
      ]

      expect(canCreateDossierFromChat(messages)).toBe(false)
    })

    it('should return false for no user messages', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'Bonjour, comment puis-je vous aider ?',
          createdAt: new Date(),
        },
      ]

      expect(canCreateDossierFromChat(messages)).toBe(false)
    })
  })

  describe('estimateDataQuality', () => {
    it('should return high quality for complete data', () => {
      const data: ChatDossierData = {
        confidence: 0.9,
        langue: 'fr',
        titrePropose: 'Divorce - Pension alimentaire',
        description: 'Description complète avec tous les détails nécessaires pour le dossier',
        typeProcedure: 'divorce',
        client: { nom: 'Dupont', role: 'demandeur' },
        partieAdverse: { nom: 'Martin', role: 'defendeur' },
        faitsExtraits: [
          { label: 'Date', valeur: '2015-01-01', type: 'date', confidence: 0.9, importance: 'decisif' },
          { label: 'Montant', valeur: '1000 TND', type: 'montant', confidence: 0.9, importance: 'important' },
        ],
        conversationId: 'conv-123',
        messageCount: 5,
        extractedFromUserMessages: 3,
      }

      expect(estimateDataQuality(data)).toBe('high')
    })

    it('should return medium quality for partial data', () => {
      const data: ChatDossierData = {
        confidence: 0.6,
        langue: 'fr',
        titrePropose: 'Nouveau dossier',
        description: 'Description basique',
        typeProcedure: 'civil_premiere_instance',
        faitsExtraits: [],
        conversationId: 'conv-123',
        messageCount: 2,
        extractedFromUserMessages: 1,
      }

      expect(estimateDataQuality(data)).toBe('medium')
    })

    it('should return low quality for minimal data', () => {
      const data: ChatDossierData = {
        confidence: 0.3,
        langue: 'fr',
        titrePropose: 'Dossier',
        description: 'Description minimale',
        faitsExtraits: [],
        conversationId: 'conv-123',
        messageCount: 1,
        extractedFromUserMessages: 1,
      }

      expect(estimateDataQuality(data)).toBe('low')
    })

    it('should consider confidence in quality estimation', () => {
      const highConfidence: ChatDossierData = {
        confidence: 0.95,
        langue: 'fr',
        titrePropose: 'Titre court',
        description: 'Description',
        faitsExtraits: [],
        conversationId: 'conv-123',
        messageCount: 1,
        extractedFromUserMessages: 1,
      }

      const lowConfidence: ChatDossierData = {
        ...highConfidence,
        confidence: 0.2,
      }

      expect(estimateDataQuality(highConfidence)).not.toBe(
        estimateDataQuality(lowConfidence)
      )
    })
  })
})
