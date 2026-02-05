/**
 * Tests pour le schéma de validation Facture (Zod)
 */

import { describe, it, expect } from 'vitest'
import { factureSchema } from '@/lib/validations/facture'

describe('Facture Schema Validation', () => {
  describe('Champs requis', () => {
    it('devrait accepter une facture valide minimale', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Honoraires consultation juridique',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter une facture sans client_id', () => {
      const data = {
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('devrait rejeter une facture sans montant_ht', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Montant HT', () => {
    it('devrait accepter un montant positif', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 500.50,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un montant négatif', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: -100,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('devrait rejeter un montant égal à zéro', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 0,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Taux TVA', () => {
    it('devrait accepter 19% (défaut Tunisie)', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        taux_tva: 19,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter 7% (taux réduit)', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        taux_tva: 7,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter 0% (exonération)', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        taux_tva: 0,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un taux TVA négatif', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        taux_tva: -5,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Statut', () => {
    const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']

    statuts.forEach((statut) => {
      it(`devrait accepter le statut "${statut}"`, () => {
        const data = {
          client_id: '123e4567-e89b-12d3-a456-426614174000',
          montant_ht: 1000,
          date_emission: '2026-02-05',
          statut,
          objet: 'Test objet facture',
        }

        const result = factureSchema.safeParse(data)
        expect(result.success).toBe(true)
      })
    })

    it('devrait rejeter un statut invalide', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'invalid_status',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Dates', () => {
    it('devrait accepter une date d\'émission valide', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter une date d\'échéance optionnelle', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        date_echeance: '2026-03-05',
        statut: 'BROUILLON',
        objet: 'Test objet facture',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe('Objet', () => {
    it('devrait accepter un objet valide', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'Honoraires consultation juridique - Dossier 2026/001',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un objet trop court', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1000,
        date_emission: '2026-02-05',
        statut: 'BROUILLON',
        objet: 'AB',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Facture complète', () => {
    it('devrait valider une facture complète', () => {
      const data = {
        client_id: '123e4567-e89b-12d3-a456-426614174000',
        dossier_id: '456e4567-e89b-12d3-a456-426614174000',
        montant_ht: 1500.00,
        taux_tva: 19,
        date_emission: '2026-02-05',
        date_echeance: '2026-03-05',
        statut: 'ENVOYEE',
        objet: 'Honoraires contentieux commercial - Dossier REF-2026-042',
        notes: 'Paiement par virement bancaire',
      }

      const result = factureSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})
