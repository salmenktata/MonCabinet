'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { dossierSchema, type DossierFormData } from '@/lib/validations/dossier'
import { revalidatePath } from 'next/cache'
import type {
  StructuredDossier,
  StructuringOptions,
  CreateDossierOptions,
  NewClientData,
} from '@/lib/ai/dossier-structuring-service'
import { getWorkflowById } from '@/lib/workflows/workflows-config'

export interface WorkflowHistoryEntry {
  id: string
  dossierId: string
  etapeFrom: string | null
  etapeTo: string
  typeTransition: 'initial' | 'normal' | 'bypass' | 'revert'
  note: string | null
  createdAt: string
  userId: string
}

export async function createDossierAction(formData: DossierFormData) {
  try {
    // Validation
    const validatedData = dossierSchema.parse(formData)

    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Préparer les données
    const dossierData = {
      user_id: userId,
      ...validatedData,
      montant_litige: validatedData.montant_litige || null,
      date_ouverture: validatedData.date_ouverture || new Date().toISOString().split('T')[0],
      workflow_etape_actuelle: validatedData.workflow_etape_actuelle || 'ASSIGNATION',
    }

    const columns = Object.keys(dossierData).join(', ')
    const values = Object.values(dossierData)
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query(
      `INSERT INTO dossiers (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    revalidatePath('/dossiers')
    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateDossierAction(id: string, formData: DossierFormData) {
  try {
    // Validation
    const validatedData = dossierSchema.parse(formData)

    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    const updateData = {
      ...validatedData,
      montant_litige: validatedData.montant_litige || null,
    }

    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ')
    const values = [...Object.values(updateData), id, userId]

    const result = await query(
      `UPDATE dossiers SET ${setClause} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return { error: 'Dossier introuvable' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${id}`)
    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateDossierEtapeAction(id: string, etapeId: string, note?: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Récupérer l'étape actuelle + le type_procedure pour déterminer le type de transition
    const dossierResult = await query(
      'SELECT workflow_etape_actuelle, type_procedure FROM dossiers WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (dossierResult.rows.length === 0) {
      return { error: 'Dossier introuvable' }
    }

    const dossier = dossierResult.rows[0]
    const etapeFrom: string | null = dossier.workflow_etape_actuelle ?? null
    const workflowId: string = dossier.type_procedure || 'civil_premiere_instance'

    // Déterminer le type de transition
    let typeTransition: 'initial' | 'normal' | 'bypass' | 'revert' = 'normal'
    if (!etapeFrom) {
      typeTransition = 'initial'
    } else {
      const workflow = getWorkflowById(workflowId)
      if (workflow) {
        const fromEtape = workflow.etapes.find((e) => e.id === etapeFrom)
        const toEtape = workflow.etapes.find((e) => e.id === etapeId)
        if (fromEtape && toEtape) {
          const diff = toEtape.ordre - fromEtape.ordre
          if (diff < 0) {
            typeTransition = 'revert'
          } else if (diff > 1) {
            typeTransition = 'bypass'
          } else {
            typeTransition = 'normal'
          }
        }
      }
    }

    // Mettre à jour le dossier
    const result = await query(
      'UPDATE dossiers SET workflow_etape_actuelle = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [etapeId, id, userId]
    )

    if (result.rows.length === 0) {
      return { error: 'Dossier introuvable' }
    }

    // Logger dans l'historique
    await query(
      `INSERT INTO dossier_workflow_history (dossier_id, etape_from, etape_to, type_transition, note, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, etapeFrom, etapeId, typeTransition, note || null, userId]
    )

    revalidatePath(`/dossiers/${id}`)
    return { success: true, data: result.rows[0], typeTransition }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function getWorkflowHistoryAction(dossierId: string): Promise<{
  success?: boolean
  data?: WorkflowHistoryEntry[]
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Vérifier que le dossier appartient à l'utilisateur
    const check = await query(
      'SELECT id FROM dossiers WHERE id = $1 AND user_id = $2',
      [dossierId, userId]
    )
    if (check.rows.length === 0) {
      return { error: 'Dossier introuvable' }
    }

    const result = await query(
      `SELECT id, dossier_id, etape_from, etape_to, type_transition, note, created_at, user_id
       FROM dossier_workflow_history
       WHERE dossier_id = $1
       ORDER BY created_at DESC`,
      [dossierId]
    )

    const data: WorkflowHistoryEntry[] = result.rows.map((row) => ({
      id: row.id,
      dossierId: row.dossier_id,
      etapeFrom: row.etape_from,
      etapeTo: row.etape_to,
      typeTransition: row.type_transition,
      note: row.note,
      createdAt: row.created_at,
      userId: row.user_id,
    }))

    return { success: true, data }
  } catch (error) {
    console.error('Erreur récupération historique workflow:', error)
    return { error: 'Erreur lors de la récupération de l\'historique' }
  }
}

export async function deleteDossierAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    // Supprimer le dossier (cascade supprime actions, documents, etc.)
    await query('DELETE FROM dossiers WHERE id = $1 AND user_id = $2', [id, userId])

    revalidatePath('/dossiers')
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function getDossierAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const userId = session.user.id

    const result = await query(
      `SELECT d.*, json_build_object(
        'id', c.id, 'nom', c.nom, 'prenom', c.prenom,
        'type_client', c.type_client, 'cin', c.cin, 'adresse', c.adresse,
        'telephone', c.telephone, 'email', c.email
      ) as clients
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return { error: 'Dossier non trouvé' }
    }

    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur récupération:', error)
    return { error: 'Erreur lors de la récupération du dossier' }
  }
}

// =============================================================================
// ACTIONS POUR L'ASSISTANT IA
// =============================================================================

/**
 * Analyse un récit en langage naturel et retourne un dossier structuré
 */
export async function structurerDossierAction(
  narratif: string,
  options?: StructuringOptions
): Promise<{ success?: boolean; data?: StructuredDossier; error?: string }> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    if (!narratif || narratif.length < 20) {
      return { error: 'Le récit doit contenir au moins 20 caractères' }
    }

    if (narratif.length > 10000) {
      return { error: 'Le récit ne doit pas dépasser 10 000 caractères' }
    }

    // Import dynamique pour éviter les problèmes de chargement
    const { structurerDossier } = await import(
      '@/lib/ai/dossier-structuring-service'
    )

    const result = await structurerDossier(
      narratif,
      session.user.id,
      options || {}
    )

    return { success: true, data: result }
  } catch (error) {
    // Logging détaillé pour diagnostic
    console.error('=== ERREUR STRUCTURATION DOSSIER ===')
    console.error('Type:', typeof error)
    console.error('Message:', error instanceof Error ? error.message : String(error))
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A')
    console.error('=== FIN ERREUR ===')

    if (error instanceof Error) {
      const msg = error.message.toLowerCase()

      // Erreurs de configuration
      if (msg.includes('anthropic_api_key') || msg.includes('openai_api_key') || msg.includes('groq_api_key') || msg.includes('deepseek_api_key')) {
        return { error: 'Service IA non configuré. Contactez l\'administrateur.' }
      }
      if (msg.includes('chat ia désactivé') || msg.includes('rag_enabled')) {
        return { error: 'Service IA désactivé. Vérifiez la configuration RAG_ENABLED.' }
      }

      // Erreurs de parsing
      if (msg.includes('parsing') || msg.includes('json')) {
        return { error: 'Erreur d\'analyse du récit. Veuillez reformuler ou simplifier.' }
      }

      // Erreurs API
      if (msg.includes('rate limit') || msg.includes('quota')) {
        return { error: 'Limite d\'utilisation IA atteinte. Réessayez dans quelques minutes.' }
      }
      if (msg.includes('timeout') || msg.includes('econnrefused')) {
        return { error: 'Service IA temporairement indisponible. Réessayez.' }
      }
      if (msg.includes('401') || msg.includes('unauthorized')) {
        return { error: 'Clé API invalide. Contactez l\'administrateur.' }
      }

      // Log le message pour debug
      console.error('Message d\'erreur IA:', error.message)
    }

    return { error: 'Erreur lors de l\'analyse du dossier. Vérifiez les logs serveur.' }
  }
}

/**
 * Crée un dossier complet à partir d'une structure analysée par l'IA
 */
export async function creerDossierDepuisStructureAction(
  structure: StructuredDossier,
  clientId: string | null,
  newClientData: NewClientData | null,
  options: CreateDossierOptions
): Promise<{
  success?: boolean
  data?: { dossierId: string; actionsCreees: number; echeancesCreees: number }
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    if (clientId) {
      // Vérifier que le client existe et appartient à l'utilisateur
      const clientCheck = await query(
        'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
        [clientId, session.user.id]
      )
      if (clientCheck.rows.length === 0) {
        return { error: 'Client non trouvé' }
      }
    } else if (newClientData) {
      if (!newClientData.nom?.trim()) {
        return { error: 'Le nom du client est requis' }
      }
    } else {
      return { error: 'Client non sélectionné' }
    }

    // Import dynamique pour éviter les problèmes de chargement
    const { creerDossierDepuisStructure } = await import(
      '@/lib/ai/dossier-structuring-service'
    )

    const result = await creerDossierDepuisStructure(
      structure,
      session.user.id,
      clientId,
      newClientData,
      options
    )

    revalidatePath('/dossiers')
    revalidatePath('/echeances')
    if (newClientData) {
      revalidatePath('/clients')
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('Erreur création dossier depuis structure:', error)
    return { error: 'Erreur lors de la création du dossier' }
  }
}

/**
 * Récupère les clients de l'utilisateur pour la sélection
 */
export async function getClientsForSelectionAction(): Promise<{
  success?: boolean
  data?: Array<{ id: string; nom: string; prenom?: string; type_client: string }>
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const result = await query(
      `SELECT id, nom, prenom, type_client
       FROM clients
       WHERE user_id = $1
       ORDER BY nom, prenom`,
      [session.user.id]
    )

    return { success: true, data: result.rows }
  } catch (error) {
    console.error('Erreur récupération clients:', error)
    return { error: 'Erreur lors de la récupération des clients' }
  }
}
