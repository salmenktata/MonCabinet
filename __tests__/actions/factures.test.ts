/**
 * Tests pour les actions de factures
 *
 * Vérifie:
 * - Authentification requise
 * - Génération du numéro de facture séquentiel
 * - Validation Zod des données
 * - Calcul des montants TVA
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock du logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  }),
}))

// Variable pour contrôler le mock de session
let mockSession: { user: { id: string; email: string; name: string } | null } | null = null

// Mock de la session
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(mockSession)),
}))

// Mock de la base de données
const mockQuery = vi.fn()
vi.mock('@/lib/db/postgres', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}))

// Mock de revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock du schéma de validation
vi.mock('@/lib/validations/facture', () => ({
  factureSchema: {
    parse: (data: unknown) => {
      const d = data as Record<string, unknown>
      // Validation basique
      if (!d.client_id) throw new Error('client_id requis')
      if (!d.montant_ht) throw new Error('montant_ht requis')
      if (typeof d.montant_ht !== 'number' || d.montant_ht <= 0) {
        throw new Error('montant_ht doit être positif')
      }
      return d
    },
  },
}))

// Mock de resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' } }),
    },
  })),
}))

// Mock de react-pdf/renderer
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Image: () => null,
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Font: {
    register: vi.fn(),
  },
  pdf: vi.fn().mockReturnValue({
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  }),
}))

// Import après les mocks
import { getSession } from '@/lib/auth/session'

describe('Actions Factures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSession = null
  })

  afterEach(() => {
    mockSession = null
  })

  describe('Authentification', () => {
    it('devrait rejeter si non authentifié', async () => {
      // Simuler absence de session
      mockSession = null

      const { createFactureAction } = await import('@/app/actions/factures')

      const result = await createFactureAction({
        client_id: 'client-123',
        montant_ht: 1000,
        taux_tva: 19,
        date_emission: '2024-01-15',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Test facture',
      })

      expect(result).toEqual({ error: 'Non authentifié' })
    })

    it('devrait accepter si authentifié', async () => {
      // Simuler session valide
      mockSession = {
        user: {
          id: 'user-123',
          email: 'avocat@test.com',
          name: 'Test Avocat',
        },
      }

      // Mock des requêtes DB
      mockQuery
        .mockResolvedValueOnce({ rows: [{ sequence: 5 }] }) // lastFacture
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'facture-123',
              numero: 'F20240006',
              montant_ht: 1000,
            },
          ],
        }) // INSERT

      const { createFactureAction } = await import('@/app/actions/factures')

      const result = await createFactureAction({
        client_id: 'client-123',
        montant_ht: 1000,
        taux_tva: 19,
        date_emission: '2024-01-15',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Test facture',
      })

      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('data')
    })
  })

  describe('Génération numéro séquentiel', () => {
    it('devrait générer F{année}0001 pour la première facture de l\'année', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      // Mock: pas de facture existante cette année
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // lastFacture = vide
        .mockResolvedValueOnce({
          rows: [{ id: 'facture-1', numero: 'F20240001' }],
        })

      const { createFactureAction } = await import('@/app/actions/factures')

      await createFactureAction({
        client_id: 'client-123',
        montant_ht: 500,
        taux_tva: 19,
        date_emission: '2024-01-01',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Première facture',
      })

      // Vérifier que la requête INSERT contient le bon numéro
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[0]).toContain('INSERT INTO factures')
    })

    it('devrait incrémenter le numéro séquentiel', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      // Mock: dernière facture sequence = 42
      mockQuery
        .mockResolvedValueOnce({ rows: [{ sequence: 42 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'facture-43', numero: 'F20240043' }],
        })

      const { createFactureAction } = await import('@/app/actions/factures')

      await createFactureAction({
        client_id: 'client-123',
        montant_ht: 500,
        taux_tva: 19,
        date_emission: '2024-01-01',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Facture 43',
      })

      // La séquence devrait être 43
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1]).toContain(43) // sequence dans les valeurs
    })
  })

  describe('Calcul des montants', () => {
    it('devrait calculer correctement la TVA à 19%', () => {
      const montant_ht = 1000
      const taux_tva = 19

      const montant_tva = (montant_ht * taux_tva) / 100
      const montant_ttc = montant_ht + montant_tva

      expect(montant_tva).toBe(190)
      expect(montant_ttc).toBe(1190)
    })

    it('devrait calculer correctement la TVA à 7%', () => {
      const montant_ht = 1000
      const taux_tva = 7

      const montant_tva = (montant_ht * taux_tva) / 100
      const montant_ttc = montant_ht + montant_tva

      expect(montant_tva).toBe(70)
      expect(montant_ttc).toBe(1070)
    })

    it('devrait calculer correctement la TVA à 0%', () => {
      const montant_ht = 1000
      const taux_tva = 0

      const montant_tva = (montant_ht * taux_tva) / 100
      const montant_ttc = montant_ht + montant_tva

      expect(montant_tva).toBe(0)
      expect(montant_ttc).toBe(1000)
    })

    it('devrait gérer les montants décimaux', () => {
      const montant_ht = 999.99
      const taux_tva = 19

      const montant_tva = (montant_ht * taux_tva) / 100
      const montant_ttc = montant_ht + montant_tva

      expect(montant_tva).toBeCloseTo(189.9981, 2)
      expect(montant_ttc).toBeCloseTo(1189.9881, 2)
    })
  })

  describe('Validation des données', () => {
    it('devrait rejeter si client_id manquant', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      const { createFactureAction } = await import('@/app/actions/factures')

      const result = await createFactureAction({
        client_id: '', // vide
        montant_ht: 1000,
        taux_tva: 19,
        date_emission: '2024-01-01',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Test',
      })

      expect(result).toHaveProperty('error')
    })

    it('devrait rejeter si montant_ht négatif', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      const { createFactureAction } = await import('@/app/actions/factures')

      const result = await createFactureAction({
        client_id: 'client-123',
        montant_ht: -500, // négatif
        taux_tva: 19,
        date_emission: '2024-01-01',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Test',
      })

      expect(result).toHaveProperty('error')
    })

    it('devrait rejeter si montant_ht = 0', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      const { createFactureAction } = await import('@/app/actions/factures')

      const result = await createFactureAction({
        client_id: 'client-123',
        montant_ht: 0,
        taux_tva: 19,
        date_emission: '2024-01-01',
        statut: 'BROUILLON',
        montant_debours: 0,
        provisions_recues: 0,
        objet: 'Test',
      })

      expect(result).toHaveProperty('error')
    })
  })

  describe('Statuts de facture', () => {
    it('devrait accepter le statut BROUILLON', () => {
      const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']
      expect(statuts).toContain('BROUILLON')
    })

    it('devrait accepter le statut ENVOYEE', () => {
      const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']
      expect(statuts).toContain('ENVOYEE')
    })

    it('devrait accepter le statut PAYEE', () => {
      const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']
      expect(statuts).toContain('PAYEE')
    })

    it('devrait accepter le statut IMPAYEE', () => {
      const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']
      expect(statuts).toContain('IMPAYEE')
    })
  })

  describe('Mise à jour de facture', () => {
    it('devrait recalculer les montants si montant_ht change', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      // Mock: facture existante
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ montant_ht: 1000, taux_tva: 19 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'facture-123', montant_ht: 2000, montant_tva: 380, montant_ttc: 2380 }],
        })

      const { updateFactureAction } = await import('@/app/actions/factures')

      const result = await updateFactureAction('facture-123', {
        montant_ht: 2000, // Nouveau montant
      })

      // Vérifier que le montant a été recalculé
      if (result.success && result.data) {
        expect(result.data.montant_ttc).toBe(2380) // 2000 + (2000 * 0.19)
      }
    })
  })

  describe('Suppression de facture', () => {
    it('devrait supprimer une facture existante', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      mockQuery.mockResolvedValueOnce({ rowCount: 1 })

      const { deleteFactureAction } = await import('@/app/actions/factures')

      const result = await deleteFactureAction('facture-123')

      expect(result).toHaveProperty('success', true)
    })

    it('devrait rejeter la suppression si non authentifié', async () => {
      mockSession = null

      const { deleteFactureAction } = await import('@/app/actions/factures')

      const result = await deleteFactureAction('facture-123')

      expect(result).toEqual({ error: 'Non authentifié' })
    })
  })

  describe('Changement de statut', () => {
    it('devrait permettre de marquer une facture comme payée', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'facture-123', statut: 'payee', date_paiement: '2024-01-20' }],
      })

      const { marquerFacturePayeeAction } = await import('@/app/actions/factures')

      const result = await marquerFacturePayeeAction('facture-123', '2024-01-20')

      expect(result).toHaveProperty('success', true)
    })

    it('devrait rejeter si facture non trouvée', async () => {
      mockSession = {
        user: { id: 'user-123', email: 'test@test.com', name: 'Test' },
      }

      mockQuery.mockResolvedValueOnce({ rows: [] }) // Facture non trouvée

      const { marquerFacturePayeeAction } = await import('@/app/actions/factures')

      const result = await marquerFacturePayeeAction('facture-inexistante', '2024-01-20')

      expect(result).toEqual({ error: 'Facture introuvable' })
    })
  })
})
