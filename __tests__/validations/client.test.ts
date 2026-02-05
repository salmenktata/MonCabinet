/**
 * Tests pour le schéma de validation Client (Zod)
 */

import { describe, it, expect } from 'vitest'
import { clientSchema } from '@/lib/validations/client'

describe('Client Schema Validation', () => {
  describe('Type client', () => {
    it('devrait accepter type PERSONNE_PHYSIQUE', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Dupont',
        prenom: 'Jean',
        email: 'jean@example.com',
        telephone: '+21612345678',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter type PERSONNE_MORALE', () => {
      const data = {
        type_client: 'PERSONNE_MORALE',
        nom: 'SARL TechCorp',
        email: 'contact@techcorp.tn',
        telephone: '+21670123456',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un type invalide', () => {
      const data = {
        type_client: 'invalid_type',
        nom: 'Test',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Nom', () => {
    it('devrait accepter un nom valide', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Ben Ali',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un nom trop court (< 2 caractères)', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'A',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('2 caractères')
      }
    })

    it('devrait rejeter un nom manquant', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Email', () => {
    it('devrait accepter un email valide', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        email: 'test@example.com',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter un email vide (optionnel)', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        email: '',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un email invalide', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        email: 'invalid-email',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('invalide')
      }
    })
  })

  describe('Téléphone (validation E.164)', () => {
    it('devrait accepter un numéro tunisien valide avec +216', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '+21612345678',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter un numéro international valide', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '+33612345678',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait accepter un téléphone vide (optionnel)', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait rejeter un numéro commençant par 0', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '012345678',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('devrait rejeter un numéro trop court', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '+1', // Trop court (seulement 1 chiffre après +)
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('devrait rejeter un numéro trop long (> 15 chiffres)', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        telephone: '+21612345678901234',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('Champs conditionnels selon type', () => {
    it('PERSONNE_PHYSIQUE devrait accepter prenom et cin', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Ben Ali',
        prenom: 'Ahmed',
        cin: '12345678',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('PERSONNE_MORALE ne requiert pas prenom ni cin', () => {
      const data = {
        type_client: 'PERSONNE_MORALE',
        nom: 'SARL TechCorp',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe('Cas complets', () => {
    it('devrait valider un client personne physique complet', () => {
      const data = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Ben Salem',
        prenom: 'Fatma',
        cin: '87654321',
        email: 'fatma.bensalem@example.com',
        telephone: '+21698765432',
        adresse: '10 Avenue Habib Bourguiba',
        notes: 'Cliente VIP',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('devrait valider un client personne morale complet', () => {
      const data = {
        type_client: 'PERSONNE_MORALE',
        nom: 'SARL Digital Solutions',
        email: 'contact@digitalsolutions.tn',
        telephone: '+21671234567',
        adresse: 'Centre Urbain Nord, Tunis',
        notes: 'Contrat annuel',
      }

      const result = clientSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})
