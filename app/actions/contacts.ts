/**
 * Server Actions pour la gestion des contacts
 * Contacts = experts, témoins, notaires, huissiers liés aux dossiers
 *
 * @module app/actions/contacts
 * @see Phase 4.3 - TODOs Critiques - Modals Consultation
 */

'use server'

import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

const log = createLogger('Actions:Contacts')

/**
 * Données de création de contact
 */
export interface CreateContactData {
  nom: string
  prenom?: string
  type: 'expert' | 'temoin' | 'notaire' | 'huissier' | 'autre'
  email?: string
  telephone?: string
  specialite?: string
  notes?: string
}

/**
 * Contact enregistré
 */
export interface Contact extends CreateContactData {
  id: string
  user_id: string
  created_at: Date
  updated_at: Date
}

/**
 * Créer un nouveau contact
 */
export async function createContact(data: CreateContactData): Promise<Contact> {
  const session = await getSession()

  if (!session?.user?.id) {
    throw new Error('Non authentifié')
  }

  try {
    log.info('Creating contact', {
      userId: session.user.id,
      type: data.type,
      nom: data.nom,
    })

    const result = await query<Contact>(
      `
      INSERT INTO contacts (
        user_id,
        nom,
        prenom,
        type,
        email,
        telephone,
        specialite,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        session.user.id,
        data.nom,
        data.prenom || null,
        data.type,
        data.email || null,
        data.telephone || null,
        data.specialite || null,
        data.notes || null,
      ]
    )

    if (!result.rows[0]) {
      throw new Error('Échec de création du contact')
    }

    // Revalider les pages qui affichent les contacts
    revalidatePath('/contacts')
    revalidatePath('/dossiers')

    log.info('Contact created successfully', {
      contactId: result.rows[0].id,
      type: data.type,
    })

    return result.rows[0]
  } catch (error) {
    log.error('Failed to create contact', {
      error,
      userId: session.user.id,
      data,
    })
    throw error
  }
}

/**
 * Récupérer tous les contacts de l'utilisateur
 */
export async function getContacts(): Promise<Contact[]> {
  const session = await getSession()

  if (!session?.user?.id) {
    throw new Error('Non authentifié')
  }

  try {
    const result = await query<Contact>(
      `
      SELECT *
      FROM contacts
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [session.user.id]
    )

    return result.rows
  } catch (error) {
    log.error('Failed to fetch contacts', {
      error,
      userId: session.user.id,
    })
    throw error
  }
}

/**
 * Récupérer les contacts par type
 */
export async function getContactsByType(
  type: CreateContactData['type']
): Promise<Contact[]> {
  const session = await getSession()

  if (!session?.user?.id) {
    throw new Error('Non authentifié')
  }

  try {
    const result = await query<Contact>(
      `
      SELECT *
      FROM contacts
      WHERE user_id = $1 AND type = $2
      ORDER BY nom, prenom
      `,
      [session.user.id, type]
    )

    return result.rows
  } catch (error) {
    log.error('Failed to fetch contacts by type', {
      error,
      userId: session.user.id,
      type,
    })
    throw error
  }
}

/**
 * Supprimer un contact
 */
export async function deleteContact(contactId: string): Promise<void> {
  const session = await getSession()

  if (!session?.user?.id) {
    throw new Error('Non authentifié')
  }

  try {
    const result = await query(
      `
      DELETE FROM contacts
      WHERE id = $1 AND user_id = $2
      `,
      [contactId, session.user.id]
    )

    if (result.rowCount === 0) {
      throw new Error('Contact non trouvé ou non autorisé')
    }

    revalidatePath('/contacts')
    revalidatePath('/dossiers')

    log.info('Contact deleted successfully', {
      contactId,
      userId: session.user.id,
    })
  } catch (error) {
    log.error('Failed to delete contact', {
      error,
      contactId,
      userId: session.user.id,
    })
    throw error
  }
}
