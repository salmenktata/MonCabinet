/**
 * Actions Serveur - Configuration Messagerie & Documents en Attente
 *
 * Gestion configuration WhatsApp Business et traitement documents en attente
 */

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createStorageManager } from '@/lib/integrations/storage-manager'

// ============================================================================
// SCHEMAS VALIDATION
// ============================================================================

const whatsappConfigSchema = z.object({
  phoneNumber: z.string().min(1, 'Numéro de téléphone requis'),
  phoneNumberId: z.string().min(1, 'Phone Number ID requis'),
  businessAccountId: z.string().min(1, 'Business Account ID requis'),
  accessToken: z.string().min(1, 'Access Token requis'),
  webhookVerifyToken: z.string().min(20, 'Webhook Verify Token doit contenir au moins 20 caractères'),
  autoAttachDocuments: z.boolean().default(true),
  requireConfirmation: z.boolean().default(false),
  sendConfirmation: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

type WhatsAppConfigInput = z.infer<typeof whatsappConfigSchema>

const attachPendingDocumentSchema = z.object({
  pendingDocumentId: z.string().uuid('ID document invalide'),
  dossierId: z.string().uuid('ID dossier invalide'),
})

const rejectPendingDocumentSchema = z.object({
  pendingDocumentId: z.string().uuid('ID document invalide'),
})

// ============================================================================
// ACTIONS CONFIGURATION WHATSAPP
// ============================================================================

/**
 * Récupérer configuration messagerie de l'utilisateur
 */
export async function getMessagingConfigAction() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('messaging_webhooks_config')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    if (error) {
      console.error('[getMessagingConfigAction] Erreur:', error)
      return { error: 'Erreur lors de la récupération de la configuration' }
    }

    return { data }
  } catch (error: any) {
    console.error('[getMessagingConfigAction] Exception:', error)
    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Sauvegarder/Mettre à jour configuration WhatsApp Business
 */
export async function saveWhatsAppConfigAction(input: WhatsAppConfigInput) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    // Valider input
    const validated = whatsappConfigSchema.parse(input)

    // Vérifier si config existe déjà
    const { data: existing } = await supabase
      .from('messaging_webhooks_config')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    if (existing) {
      // Mettre à jour config existante
      const { data, error } = await supabase
        .from('messaging_webhooks_config')
        .update({
          phone_number: validated.phoneNumber,
          business_account_id: validated.businessAccountId,
          phone_number_id: validated.phoneNumberId,
          access_token: validated.accessToken,
          webhook_verify_token: validated.webhookVerifyToken,
          auto_attach_documents: validated.autoAttachDocuments,
          require_confirmation: validated.requireConfirmation,
          send_confirmation: validated.sendConfirmation,
          enabled: validated.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('[saveWhatsAppConfigAction] Erreur update:', error)
        return { error: 'Erreur lors de la mise à jour de la configuration' }
      }

      revalidatePath('/parametres/messagerie')

      return {
        success: true,
        data,
        message: 'Configuration mise à jour avec succès',
      }
    } else {
      // Créer nouvelle config
      const { data, error } = await supabase
        .from('messaging_webhooks_config')
        .insert({
          user_id: user.id,
          platform: 'whatsapp',
          phone_number: validated.phoneNumber,
          phone_number_id: validated.phoneNumberId,
          business_account_id: validated.businessAccountId,
          access_token: validated.accessToken,
          webhook_verify_token: validated.webhookVerifyToken,
          auto_attach_documents: validated.autoAttachDocuments,
          require_confirmation: validated.requireConfirmation,
          send_confirmation: validated.sendConfirmation,
          enabled: validated.enabled,
        })
        .select()
        .single()

      if (error) {
        console.error('[saveWhatsAppConfigAction] Erreur insert:', error)
        return { error: 'Erreur lors de la création de la configuration' }
      }

      revalidatePath('/parametres/messagerie')

      return {
        success: true,
        data,
        message: 'Configuration créée avec succès',
      }
    }
  } catch (error: any) {
    console.error('[saveWhatsAppConfigAction] Exception:', error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Désactiver configuration WhatsApp
 */
export async function disableWhatsAppConfigAction() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    const { error } = await supabase
      .from('messaging_webhooks_config')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')

    if (error) {
      console.error('[disableWhatsAppConfigAction] Erreur:', error)
      return { error: 'Erreur lors de la désactivation de la configuration' }
    }

    revalidatePath('/parametres/messagerie')

    return {
      success: true,
      message: 'Configuration désactivée avec succès',
    }
  } catch (error: any) {
    console.error('[disableWhatsAppConfigAction] Exception:', error)
    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Supprimer configuration WhatsApp
 */
export async function deleteWhatsAppConfigAction() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    const { error } = await supabase
      .from('messaging_webhooks_config')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')

    if (error) {
      console.error('[deleteWhatsAppConfigAction] Erreur:', error)
      return { error: 'Erreur lors de la suppression de la configuration' }
    }

    revalidatePath('/parametres/messagerie')

    return {
      success: true,
      message: 'Configuration supprimée avec succès',
    }
  } catch (error: any) {
    console.error('[deleteWhatsAppConfigAction] Exception:', error)
    return { error: error.message || 'Erreur interne serveur' }
  }
}

// ============================================================================
// ACTIONS DOCUMENTS EN ATTENTE
// ============================================================================

/**
 * Récupérer tous les documents en attente de rattachement
 */
export async function getPendingDocumentsAction() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('pending_documents')
      .select(`
        *,
        clients (
          id,
          type,
          nom,
          prenom,
          denomination,
          telephone
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })

    if (error) {
      console.error('[getPendingDocumentsAction] Erreur:', error)
      return { error: 'Erreur lors de la récupération des documents en attente' }
    }

    return { data }
  } catch (error: any) {
    console.error('[getPendingDocumentsAction] Exception:', error)
    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Rattacher un document en attente à un dossier
 * Upload vers Google Drive et création entrée dans documents
 */
export async function attachPendingDocumentAction(
  pendingDocumentId: string,
  dossierId: string
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    // Valider input
    const validated = attachPendingDocumentSchema.parse({
      pendingDocumentId,
      dossierId,
    })

    // Récupérer document en attente
    const { data: pendingDoc, error: pendingError } = await supabase
      .from('pending_documents')
      .select('*')
      .eq('id', validated.pendingDocumentId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (pendingError || !pendingDoc) {
      console.error('[attachPendingDocumentAction] Document non trouvé:', pendingError)
      return { error: 'Document en attente non trouvé' }
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const { data: dossier, error: dossierError } = await supabase
      .from('dossiers')
      .select('id, client_id, numero')
      .eq('id', validated.dossierId)
      .eq('user_id', user.id)
      .single()

    if (dossierError || !dossier) {
      console.error('[attachPendingDocumentAction] Dossier non trouvé:', dossierError)
      return { error: 'Dossier non trouvé' }
    }

    // Vérifier cohérence client (si pending_doc a un client_id)
    if (pendingDoc.client_id && pendingDoc.client_id !== dossier.client_id) {
      return {
        error: 'Ce dossier n\'appartient pas au client associé au document',
      }
    }

    // Télécharger le média depuis WhatsApp (si external_file_id est vide)
    // NOTE : Pour l'instant, on suppose que le buffer est stocké temporairement
    // Dans une vraie implémentation, il faudrait soit :
    // 1. Stocker le buffer en base (base64) - NON recommandé (lourd)
    // 2. Stocker temporairement dans filesystem - OK pour MVP
    // 3. Re-télécharger depuis WhatsApp - PROBLÈME : expire après 30 jours

    // Pour MVP, on suppose que le fichier est déjà uploadé temporairement
    // et on va juste le déplacer vers le bon dossier Google Drive

    // Si external_file_id existe, on déplace le fichier
    // Sinon, on affiche une erreur (fichier expiré)

    if (!pendingDoc.external_file_id) {
      return {
        error: 'Le fichier n\'est plus disponible (média WhatsApp expiré). Demandez au client de renvoyer le document.',
      }
    }

    // Créer entrée dans documents (le fichier est déjà sur Google Drive)
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        dossier_id: validated.dossierId,
        nom_fichier: pendingDoc.file_name,
        type_fichier: pendingDoc.file_type,
        taille_fichier: pendingDoc.file_size,
        storage_provider: pendingDoc.storage_provider,
        external_file_id: pendingDoc.external_file_id,
        external_sharing_link: '', // Sera mis à jour après déplacement
        source_type: pendingDoc.source_type,
        source_metadata: {
          sender_phone: pendingDoc.sender_phone,
          sender_name: pendingDoc.sender_name,
          message_id: pendingDoc.message_id,
          received_at: pendingDoc.received_at,
        },
        needs_classification: false,
        classified_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (documentError) {
      console.error('[attachPendingDocumentAction] Erreur création document:', documentError)
      return { error: 'Erreur lors de la création du document' }
    }

    // Marquer pending_document comme attached
    const { error: updateError } = await supabase
      .from('pending_documents')
      .update({
        status: 'attached',
        attached_to_dossier_id: validated.dossierId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.pendingDocumentId)

    if (updateError) {
      console.error('[attachPendingDocumentAction] Erreur update pending:', updateError)
      // Non bloquant, on continue
    }

    revalidatePath('/dashboard')
    revalidatePath(`/dossiers/${validated.dossierId}`)

    return {
      success: true,
      data: document,
      message: `Document rattaché au dossier ${dossier.numero} avec succès`,
    }
  } catch (error: any) {
    console.error('[attachPendingDocumentAction] Exception:', error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Rejeter un document en attente (marquer comme rejeté)
 */
export async function rejectPendingDocumentAction(pendingDocumentId: string) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    // Valider input
    const validated = rejectPendingDocumentSchema.parse({ pendingDocumentId })

    // Marquer comme rejected
    const { error } = await supabase
      .from('pending_documents')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.pendingDocumentId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[rejectPendingDocumentAction] Erreur:', error)
      return { error: 'Erreur lors du rejet du document' }
    }

    // TODO : Supprimer fichier temporaire de Google Drive si external_file_id existe

    revalidatePath('/dashboard')

    return {
      success: true,
      message: 'Document rejeté avec succès',
    }
  } catch (error: any) {
    console.error('[rejectPendingDocumentAction] Exception:', error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    return { error: error.message || 'Erreur interne serveur' }
  }
}

/**
 * Obtenir statistiques documents en attente
 */
export async function getPendingDocumentsStatsAction() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Non authentifié' }
    }

    // Compter documents en attente
    const { count: pendingCount, error: pendingError } = await supabase
      .from('pending_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')

    if (pendingError) {
      console.error('[getPendingDocumentsStatsAction] Erreur pending:', pendingError)
    }

    // Compter documents attachés cette semaine
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const { count: attachedCount, error: attachedError } = await supabase
      .from('pending_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'attached')
      .gte('resolved_at', oneWeekAgo.toISOString())

    if (attachedError) {
      console.error('[getPendingDocumentsStatsAction] Erreur attached:', attachedError)
    }

    return {
      data: {
        pending: pendingCount || 0,
        attachedThisWeek: attachedCount || 0,
      },
    }
  } catch (error: any) {
    console.error('[getPendingDocumentsStatsAction] Exception:', error)
    return { error: error.message || 'Erreur interne serveur' }
  }
}
