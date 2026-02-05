/**
 * Actions serveur pour Cloud Storage (Google Drive)
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createGoogleDriveAuthProvider, createGoogleDriveProvider } from '@/lib/integrations/cloud-storage'
import { z } from 'zod'

/**
 * Récupérer les configurations cloud providers de l'utilisateur
 */
export async function getCloudProvidersAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('cloud_providers_config')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getCloudProvidersAction] Erreur:', error)
      return { error: error.message }
    }

    // Masquer tokens sensibles
    const sanitizedData = data?.map((config) => ({
      id: config.id,
      provider: config.provider,
      enabled: config.enabled,
      default_provider: config.default_provider,
      provider_email: config.provider_email,
      sync_enabled: config.sync_enabled,
      sync_frequency: config.sync_frequency,
      last_sync_at: config.last_sync_at,
      created_at: config.created_at,
      updated_at: config.updated_at,
      root_folder_name: config.root_folder_name,
    }))

    return { data: sanitizedData || [] }
  } catch (error: any) {
    console.error('[getCloudProvidersAction] Exception:', error)
    return { error: error.message || 'Erreur lors de la récupération des configurations' }
  }
}

/**
 * Générer URL OAuth Google Drive
 */
export async function getGoogleDriveAuthUrlAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Créer provider (sans token)
    const provider = createGoogleDriveAuthProvider()

    // Générer URL OAuth avec state = user_id (pour vérification)
    const authUrl = provider.getAuthUrl(user.id)

    return { data: { authUrl } }
  } catch (error: any) {
    console.error('[getGoogleDriveAuthUrlAction] Exception:', error)
    return { error: error.message || 'Erreur lors de la génération de l\'URL OAuth' }
  }
}

/**
 * Déconnecter un cloud provider
 */
const disconnectSchema = z.object({
  providerId: z.string().uuid('ID provider invalide'),
})

export async function disconnectCloudProviderAction(providerId: string) {
  try {
    // Validation
    const validated = disconnectSchema.parse({ providerId })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le provider appartient à l'utilisateur
    const { data: config, error: configError } = await supabase
      .from('cloud_providers_config')
      .select('id, provider, webhook_channel_id, webhook_resource_id, access_token')
      .eq('id', validated.providerId)
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    // Si webhook actif, le stopper d'abord
    if (config.webhook_channel_id && config.webhook_resource_id) {
      try {
        const provider = createGoogleDriveProvider(config.access_token)
        await provider.stopWatching({
          channelId: config.webhook_channel_id,
          resourceId: config.webhook_resource_id,
        })
        console.log('[disconnectCloudProviderAction] Webhook Google Drive arrêté')
      } catch (error) {
        console.warn('[disconnectCloudProviderAction] Erreur arrêt webhook (ignorée):', error)
        // Continuer même si webhook stop échoue
      }
    }

    // Supprimer configuration
    const { error: deleteError } = await supabase
      .from('cloud_providers_config')
      .delete()
      .eq('id', validated.providerId)

    if (deleteError) {
      return { error: deleteError.message }
    }

    console.log(`[disconnectCloudProviderAction] Provider ${config.provider} déconnecté`)

    revalidatePath('/settings/cloud-storage')

    return { success: true }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[disconnectCloudProviderAction] Exception:', error)
    return { error: error.message || 'Erreur lors de la déconnexion' }
  }
}

/**
 * Activer/désactiver synchronisation bidirectionnelle
 */
const toggleSyncSchema = z.object({
  providerId: z.string().uuid('ID provider invalide'),
  enabled: z.boolean(),
  frequency: z.enum(['15', '30', '60']).optional(),
})

export async function toggleSyncAction(params: {
  providerId: string
  enabled: boolean
  frequency?: '15' | '30' | '60'
}) {
  try {
    // Validation
    const validated = toggleSyncSchema.parse(params)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le provider appartient à l'utilisateur
    const { data: config, error: configError } = await supabase
      .from('cloud_providers_config')
      .select('id, provider, root_folder_id, access_token, webhook_channel_id')
      .eq('id', validated.providerId)
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    // Préparer update
    const updateData: any = {
      sync_enabled: validated.enabled,
      updated_at: new Date().toISOString(),
    }

    if (validated.frequency) {
      updateData.sync_frequency = parseInt(validated.frequency)
    }

    // Si activation sync et pas de webhook actif, créer webhook
    if (validated.enabled && !config.webhook_channel_id && config.root_folder_id) {
      try {
        const provider = createGoogleDriveProvider(config.access_token)

        // Générer channel ID unique
        const channelId = `${user.id}-${Date.now()}`

        // URL webhook
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-drive`

        // Créer webhook Google Drive
        const watchResult = await provider.watchFolder({
          folderId: config.root_folder_id,
          webhookUrl,
          channelId,
          expirationMs: 7 * 24 * 60 * 60 * 1000, // 7 jours
        })

        updateData.webhook_channel_id = watchResult.channelId
        updateData.webhook_resource_id = watchResult.resourceId
        updateData.webhook_expiration = watchResult.expiration.toISOString()
        updateData.webhook_address = webhookUrl

        console.log('[toggleSyncAction] Webhook Google Drive créé:', watchResult)
      } catch (error: any) {
        console.error('[toggleSyncAction] Erreur création webhook:', error)
        return { error: `Impossible d'activer la synchronisation: ${error.message}` }
      }
    }

    // Si désactivation sync et webhook actif, le stopper
    if (!validated.enabled && config.webhook_channel_id) {
      try {
        const provider = createGoogleDriveProvider(config.access_token)

        const { data: webhookData } = await supabase
          .from('cloud_providers_config')
          .select('webhook_resource_id')
          .eq('id', validated.providerId)
          .single()

        if (webhookData?.webhook_resource_id) {
          await provider.stopWatching({
            channelId: config.webhook_channel_id,
            resourceId: webhookData.webhook_resource_id,
          })
        }

        updateData.webhook_channel_id = null
        updateData.webhook_resource_id = null
        updateData.webhook_expiration = null
        updateData.webhook_address = null

        console.log('[toggleSyncAction] Webhook Google Drive arrêté')
      } catch (error) {
        console.warn('[toggleSyncAction] Erreur arrêt webhook (ignorée):', error)
        // Continuer même si webhook stop échoue
      }
    }

    // Mettre à jour configuration
    const { error: updateError } = await supabase
      .from('cloud_providers_config')
      .update(updateData)
      .eq('id', validated.providerId)

    if (updateError) {
      return { error: updateError.message }
    }

    console.log(`[toggleSyncAction] Synchronisation ${validated.enabled ? 'activée' : 'désactivée'}`)

    revalidatePath('/settings/cloud-storage')

    return { success: true, enabled: validated.enabled }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[toggleSyncAction] Exception:', error)
    return { error: error.message || 'Erreur lors de la modification de la synchronisation' }
  }
}

/**
 * Définir un provider comme provider par défaut
 */
const setDefaultSchema = z.object({
  providerId: z.string().uuid('ID provider invalide'),
})

export async function setDefaultCloudProviderAction(providerId: string) {
  try {
    // Validation
    const validated = setDefaultSchema.parse({ providerId })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le provider appartient à l'utilisateur
    const { data: config, error: configError } = await supabase
      .from('cloud_providers_config')
      .select('id, provider')
      .eq('id', validated.providerId)
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    // Désactiver default_provider pour tous les autres providers
    await supabase
      .from('cloud_providers_config')
      .update({ default_provider: false })
      .eq('user_id', user.id)
      .neq('id', validated.providerId)

    // Activer default_provider pour ce provider
    const { error: updateError } = await supabase
      .from('cloud_providers_config')
      .update({
        default_provider: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.providerId)

    if (updateError) {
      return { error: updateError.message }
    }

    console.log(`[setDefaultCloudProviderAction] Provider ${config.provider} défini par défaut`)

    revalidatePath('/settings/cloud-storage')

    return { success: true }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[setDefaultCloudProviderAction] Exception:', error)
    return { error: error.message || 'Erreur lors de la définition du provider par défaut' }
  }
}
