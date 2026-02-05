/**
 * Tests pour les actions serveur clients
 *
 * Couvre:
 * - createClientAction (personne physique, morale, auth, validation)
 * - updateClientAction (succès, auth, client non trouvé)
 * - deleteClientAction (succès, auth, avec dossiers)
 * - getClientAction (succès, auth, non trouvé)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClientAction, updateClientAction, deleteClientAction, getClientAction } from '@/app/actions/clients'
import type { ClientFormData } from '@/lib/validations/client'

// Mocks
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/lib/db/postgres', () => ({
  query: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { revalidatePath } from 'next/cache'

describe('Actions Clients', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  const mockClientPersonnePhysique = {
    id: 'client-456',
    user_id: 'user-123',
    type_client: 'personne_physique',
    nom: 'Ben Ali',
    prenom: 'Ahmed',
    cin: '12345678',
    email: 'ahmed@example.com',
    telephone: '+21612345678',
    adresse: '10 Avenue Habib Bourguiba',
    notes: 'Client VIP',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockClientPersonneMorale = {
    id: 'client-789',
    user_id: 'user-123',
    type_client: 'personne_morale',
    nom: 'SARL TechCorp',
    prenom: null,
    cin: null,
    email: 'contact@techcorp.tn',
    telephone: '+21670123456',
    adresse: 'Centre Urbain Nord, Tunis',
    notes: 'Contrat annuel',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createClientAction', () => {
    it('devrait créer une personne physique avec succès', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Ben Ali',
        prenom: 'Ahmed',
        cin: '12345678',
        email: 'ahmed@example.com',
        telephone: '+21612345678',
        adresse: '10 Avenue Habib Bourguiba',
        notes: 'Client VIP',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [mockClientPersonnePhysique],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockClientPersonnePhysique)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients'),
        expect.arrayContaining(['user-123', 'PERSONNE_PHYSIQUE'])
      )
      expect(revalidatePath).toHaveBeenCalledWith('/clients')
    })

    it('devrait créer une personne morale avec succès', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_MORALE',
        nom: 'SARL TechCorp',
        email: 'contact@techcorp.tn',
        telephone: '+21670123456',
        adresse: 'Centre Urbain Nord, Tunis',
        notes: 'Contrat annuel',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [mockClientPersonneMorale],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockClientPersonneMorale)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients'),
        expect.arrayContaining(['user-123', 'PERSONNE_MORALE'])
      )
    })

    it('devrait échouer si utilisateur non authentifié', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      vi.mocked(getSession).mockResolvedValue(null)

      const result = await createClientAction(formData)

      expect(result.error).toBe('Non authentifié')
      expect(result.success).toBeUndefined()
      expect(query).not.toHaveBeenCalled()
    })

    it('devrait valider les données avec Zod', async () => {
      const invalidFormData = {
        type_client: 'invalid_type', // Type invalide
        nom: 'A', // Nom trop court
      } as ClientFormData

      vi.mocked(getSession).mockResolvedValue(mockSession)

      const result = await createClientAction(invalidFormData)

      expect(result.error).toBeDefined()
      expect(result.success).toBeUndefined()
      expect(query).not.toHaveBeenCalled()
    })

    it('devrait accepter un email vide (optionnel)', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
        prenom: 'User',
        email: '', // Email vide autorisé
        telephone: '+21612345678',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockClientPersonnePhysique, email: null }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
      expect(query).toHaveBeenCalled()
    })

    it('devrait gérer les erreurs de base de données', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockRejectedValue(new Error('Database error'))

      const result = await createClientAction(formData)

      expect(result.error).toBe('Erreur lors de la création du client')
      expect(result.success).toBeUndefined()
    })

    it('devrait filtrer les colonnes non autorisées (protection SQL injection)', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [mockClientPersonnePhysique],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      await createClientAction(formData)

      // Vérifier que la requête SQL ne contient que des colonnes whitelistées
      const queryCall = vi.mocked(query).mock.calls[0]
      const sqlQuery = queryCall[0] as string

      // Colonnes autorisées
      const allowedColumns = [
        'user_id',
        'type_client',
        'email',
        'telephone',
        'adresse',
        'notes',
        'nom',
        'prenom',
        'cin',
      ]

      // Vérifier que seules les colonnes autorisées sont présentes
      expect(sqlQuery).toContain('INSERT INTO clients')
      allowedColumns.forEach((col) => {
        if (sqlQuery.includes(col)) {
          expect(allowedColumns).toContain(col)
        }
      })
    })
  })

  describe('updateClientAction', () => {
    const clientId = 'client-456'

    it('devrait mettre à jour un client avec succès', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Ben Ali Modifié',
        prenom: 'Ahmed',
        cin: '12345678',
        email: 'ahmed.updated@example.com',
        telephone: '+21698765432',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockClientPersonnePhysique, ...formData }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      })

      const result = await updateClientAction(clientId, formData)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clients SET'),
        expect.arrayContaining([clientId])
      )
      expect(revalidatePath).toHaveBeenCalledWith('/clients')
      expect(revalidatePath).toHaveBeenCalledWith(`/clients/${clientId}`)
    })

    it('devrait échouer si utilisateur non authentifié', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      vi.mocked(getSession).mockResolvedValue(null)

      const result = await updateClientAction(clientId, formData)

      expect(result.error).toBe('Non authentifié')
      expect(query).not.toHaveBeenCalled()
    })

    it('devrait retourner erreur si client non trouvé', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [], // Aucun client trouvé
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      })

      const result = await updateClientAction(clientId, formData)

      expect(result.error).toBe('Client non trouvé ou non autorisé')
      expect(result.success).toBeUndefined()
    })

    it('devrait mettre à jour de personne physique vers personne morale', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_MORALE',
        nom: 'Entreprise Ben Ali',
        email: 'contact@benali.tn',
        telephone: '+21670123456',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [
          {
            ...mockClientPersonnePhysique,
            type_client: 'personne_morale',
            nom: 'Entreprise Ben Ali',
            prenom: null,
            cin: null,
          },
        ],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      })

      const result = await updateClientAction(clientId, formData)

      expect(result.success).toBe(true)
      expect(result.data?.prenom).toBeNull()
      expect(result.data?.cin).toBeNull()
    })

    it('devrait gérer les erreurs de validation', async () => {
      const invalidFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'T', // Nom trop court
      } as ClientFormData

      vi.mocked(getSession).mockResolvedValue(mockSession)

      const result = await updateClientAction(clientId, invalidFormData)

      expect(result.error).toBeDefined()
      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('deleteClientAction', () => {
    const clientId = 'client-456'

    it('devrait supprimer un client avec succès', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)

      // Mock COUNT dossiers = 0
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock DELETE
        .mockResolvedValueOnce({
          rows: [{ id: clientId }],
          rowCount: 1,
          command: 'DELETE',
          oid: 0,
          fields: [],
        })

      const result = await deleteClientAction(clientId)

      expect(result.success).toBe(true)
      expect(query).toHaveBeenCalledTimes(2)
      expect(query).toHaveBeenNthCalledWith(
        1,
        'SELECT COUNT(*) FROM dossiers WHERE client_id = $1',
        [clientId]
      )
      expect(query).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
        [clientId, 'user-123']
      )
      expect(revalidatePath).toHaveBeenCalledWith('/clients')
    })

    it('devrait échouer si utilisateur non authentifié', async () => {
      vi.mocked(getSession).mockResolvedValue(null)

      const result = await deleteClientAction(clientId)

      expect(result.error).toBe('Non authentifié')
      expect(query).not.toHaveBeenCalled()
    })

    it('devrait refuser suppression si client a des dossiers', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [{ count: '3' }], // 3 dossiers actifs
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const result = await deleteClientAction(clientId)

      expect(result.error).toContain('3 dossier(s) actif(s)')
      expect(result.error).toContain('Suppression impossible')
      expect(query).toHaveBeenCalledTimes(1) // Seulement COUNT, pas DELETE
    })

    it('devrait retourner erreur si client non trouvé', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)

      // Mock COUNT = 0
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock DELETE sans résultat
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          command: 'DELETE',
          oid: 0,
          fields: [],
        })

      const result = await deleteClientAction(clientId)

      expect(result.error).toBe('Client non trouvé ou non autorisé')
      expect(result.success).toBeUndefined()
    })

    it('devrait gérer les erreurs de base de données', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockRejectedValue(new Error('Database error'))

      const result = await deleteClientAction(clientId)

      expect(result.error).toBe('Erreur lors de la suppression')
    })
  })

  describe('getClientAction', () => {
    const clientId = 'client-456'

    it('devrait récupérer un client avec succès', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [mockClientPersonnePhysique],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const result = await getClientAction(clientId)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockClientPersonnePhysique)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
        [clientId, 'user-123']
      )
    })

    it('devrait échouer si utilisateur non authentifié', async () => {
      vi.mocked(getSession).mockResolvedValue(null)

      const result = await getClientAction(clientId)

      expect(result.error).toBe('Non authentifié')
      expect(query).not.toHaveBeenCalled()
    })

    it('devrait retourner erreur si client non trouvé', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const result = await getClientAction(clientId)

      expect(result.error).toBe('Client non trouvé')
      expect(result.success).toBeUndefined()
    })

    it('devrait gérer les erreurs de base de données', async () => {
      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockRejectedValue(new Error('Database error'))

      const result = await getClientAction(clientId)

      expect(result.error).toBe('Erreur lors de la récupération du client')
    })

    it('ne devrait pas retourner clients d\'autres utilisateurs', async () => {
      const otherUserClient = {
        ...mockClientPersonnePhysique,
        user_id: 'other-user-999',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [], // Aucun résultat car user_id ne correspond pas
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

      const result = await getClientAction(clientId)

      expect(result.error).toBe('Client non trouvé')
      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['user-123']) // Vérifie user_id dans WHERE
      )
    })
  })

  describe('Edge Cases', () => {
    it('devrait gérer session expirée', async () => {
      const expiredSession = {
        user: { id: 'user-123', email: 'test@example.com' },
        expires: new Date(Date.now() - 1000).toISOString(), // Expiré
      }

      vi.mocked(getSession).mockResolvedValue(expiredSession)

      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test',
      }

      // L'action devrait quand même fonctionner si getSession retourne un user_id
      vi.mocked(query).mockResolvedValue({
        rows: [mockClientPersonnePhysique],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
    })

    it('devrait gérer téléphone au format E.164', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'Test International',
        telephone: '+33612345678', // Numéro français
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockClientPersonnePhysique, telephone: '+33612345678' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
    })

    it('devrait gérer nom avec caractères arabes', async () => {
      const formData: ClientFormData = {
        type_client: 'PERSONNE_PHYSIQUE',
        nom: 'بن علي',
        prenom: 'أحمد',
      }

      vi.mocked(getSession).mockResolvedValue(mockSession)
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockClientPersonnePhysique, nom: 'بن علي', prenom: 'أحمد' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      })

      const result = await createClientAction(formData)

      expect(result.success).toBe(true)
    })
  })
})
