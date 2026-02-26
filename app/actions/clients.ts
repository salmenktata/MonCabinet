'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { clientSchema, type ClientFormData } from '@/lib/validations/client'
import { revalidatePath } from 'next/cache'
import { logClientAccess } from '@/lib/audit/activity-logger'
import { safeParseInt } from '@/lib/utils/safe-number'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans/plan-config'

interface ClientData {
  user_id: string
  type_client: string
  email?: string | null
  telephone?: string | null
  adresse?: string | null
  notes?: string | null
  nom?: string | null
  prenom?: string | null
  cin?: string | null
}

export async function createClientAction(formData: ClientFormData) {
  try {
    // Validation
    const validatedData = clientSchema.parse(formData)

    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Vérifier la limite de clients selon le plan
    const planRow = await query('SELECT plan FROM users WHERE id = $1', [session.user.id])
    const userPlan = (planRow.rows[0]?.plan ?? 'trial') as PlanType
    const maxClients = PLAN_LIMITS[userPlan]?.maxClients ?? Infinity
    if (maxClients !== Infinity) {
      const countRow = await query('SELECT COUNT(*) AS count FROM clients WHERE user_id = $1', [session.user.id])
      const current = parseInt(countRow.rows[0]?.count || '0', 10)
      if (current >= maxClients) {
        return {
          error: `Limite atteinte : votre essai est limité à ${maxClients} clients.`,
          limitReached: true as const,
          upgradeRequired: true as const,
          limit: maxClients,
        }
      }
    }

    // Whitelist des colonnes autorisées pour éviter SQL injection
    const ALLOWED_INSERT_FIELDS = [
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

    // Préparer les données selon le type
    const clientData: ClientData = {
      user_id: session.user.id,
      type_client: validatedData.type_client,
      email: validatedData.email || null,
      telephone: validatedData.telephone || null,
      adresse: validatedData.adresse || null,
      notes: validatedData.notes || null,
    }

    if (validatedData.type_client === 'PERSONNE_PHYSIQUE') {
      clientData.nom = validatedData.nom
      clientData.prenom = validatedData.prenom || null
      clientData.cin = validatedData.cin || null
    } else {
      clientData.nom = validatedData.nom
    }

    // Filtrer uniquement les colonnes autorisées
    const sanitizedData: any = {}
    Object.keys(clientData).forEach((key) => {
      if (ALLOWED_INSERT_FIELDS.includes(key)) {
        sanitizedData[key] = (clientData as any)[key]
      }
    })

    // Créer le client
    const columns = Object.keys(sanitizedData).join(', ')
    const values = Object.values(sanitizedData)
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query(
      `INSERT INTO clients (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    revalidatePath('/clients')

    // Log INPDP - création de données personnelles
    const client = result.rows[0]
    logClientAccess(
      session.user.id,
      session.user.email,
      'client_create',
      client.id,
      client.nom || client.raison_sociale || 'Client'
    ).catch(() => {})

    return { success: true, data: client }
  } catch (error) {
    console.error('Erreur création client:', error)
    return { error: 'Erreur lors de la création du client' }
  }
}

export async function updateClientAction(id: string, formData: ClientFormData) {
  try {
    // Validation
    const validatedData = clientSchema.parse(formData)

    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Whitelist des colonnes autorisées pour éviter SQL injection
    const ALLOWED_UPDATE_FIELDS = [
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

    // Préparer les données selon le type
    const clientData: ClientData = {
      user_id: session.user.id,
      type_client: validatedData.type_client,
      email: validatedData.email || null,
      telephone: validatedData.telephone || null,
      adresse: validatedData.adresse || null,
      notes: validatedData.notes || null,
    }

    if (validatedData.type_client === 'PERSONNE_PHYSIQUE') {
      clientData.nom = validatedData.nom
      clientData.prenom = validatedData.prenom || null
      clientData.cin = validatedData.cin || null
    } else {
      clientData.nom = validatedData.nom
      clientData.prenom = null
      clientData.cin = null
    }

    // Filtrer uniquement les colonnes autorisées
    const sanitizedData: any = {}
    Object.keys(clientData).forEach((key) => {
      if (ALLOWED_UPDATE_FIELDS.includes(key)) {
        sanitizedData[key] = (clientData as any)[key]
      }
    })

    // Mettre à jour le client
    const setClause = Object.keys(sanitizedData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ')
    const values = [...Object.values(sanitizedData), id]

    const result = await query(
      `UPDATE clients SET ${setClause} WHERE id = $${values.length} AND user_id = $1 RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return { error: 'Client non trouvé ou non autorisé' }
    }

    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)

    // Log INPDP - modification de données personnelles
    const client = result.rows[0]
    logClientAccess(
      session.user.id,
      session.user.email,
      'client_update',
      client.id,
      client.nom || client.raison_sociale || 'Client'
    ).catch(() => {})

    return { success: true, data: client }
  } catch (error) {
    console.error('Erreur mise à jour client:', error)
    return { error: 'Erreur lors de la mise à jour du client' }
  }
}

export async function deleteClientAction(id: string) {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Vérifier si le client a des dossiers
    const countResult = await query(
      'SELECT COUNT(*) FROM dossiers WHERE client_id = $1',
      [id]
    )
    const count = parseInt(countResult.rows[0].count, 10)

    if (count > 0) {
      return {
        error: `Ce client a ${count} dossier(s) actif(s). Suppression impossible.`,
      }
    }

    // Supprimer le client (avec RETURNING pour le log)
    const result = await query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id, nom, raison_sociale',
      [id, session.user.id]
    )

    if (result.rows.length === 0) {
      return { error: 'Client non trouvé ou non autorisé' }
    }

    // Log INPDP - suppression de données personnelles
    const client = result.rows[0]
    logClientAccess(
      session.user.id,
      session.user.email,
      'client_delete',
      client.id,
      client.nom || client.raison_sociale || 'Client'
    ).catch(() => {})

    revalidatePath('/clients')
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression client:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function getClientAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const result = await query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [id, session.user.id]
    )

    if (result.rows.length === 0) {
      return { error: 'Client non trouvé' }
    }

    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur récupération client:', error)
    return { error: 'Erreur lors de la récupération du client' }
  }
}
