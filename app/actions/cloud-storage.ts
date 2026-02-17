/**
 * Actions serveur pour Cloud Storage (Google Drive)
 */

'use server'

import { query } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { createGoogleDriveAuthProvider, createGoogleDriveProvider } from '@/lib/integrations/cloud-storage'
import { z } from 'zod'
import { decrypt } from '@/lib/crypto'
import { safeParseInt } from '@/lib/utils/safe-number'

/**
 * Récupérer les configurations cloud providers de l'utilisateur
 */
export async function getCloudProvidersAction() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    const result = await query(
      'SELECT * FROM cloud_providers_config WHERE user_id = $1 ORDER BY created_at DESC',
      [session.user.id]
    )

    // Masquer tokens sensibles
    const sanitizedData = result.rows?.map((config) => ({
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
  } catch (error) {
    console.error('[getCloudProvidersAction] Exception:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la récupération des configurations' }
  }
}

/**
 * Générer URL OAuth Google Drive
 */
export async function getGoogleDriveAuthUrlAction() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Créer provider (sans token)
    const provider = createGoogleDriveAuthProvider()

    // Générer URL OAuth avec state = user_id (pour vérification)
    const authUrl = provider.getAuthUrl(session.user.id)

    return { data: { authUrl } }
  } catch (error) {
    console.error('[getGoogleDriveAuthUrlAction] Exception:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la génération de l\'URL OAuth' }
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

    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le provider appartient à l'utilisateur
    const configResult = await query(
      `SELECT id, provider, webhook_channel_id, webhook_resource_id, access_token
       FROM cloud_providers_config
       WHERE id = $1 AND user_id = $2`,
      [validated.providerId, userId]
    )

    if (configResult.rows.length === 0) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    const config = configResult.rows[0]

    // Si webhook actif, le stopper d'abord
    if (config.webhook_channel_id && config.webhook_resource_id) {
      try {
        // Déchiffrer le token
        const decryptedToken = await decrypt(config.access_token)
        const provider = createGoogleDriveProvider(decryptedToken)
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
    await query(
      'DELETE FROM cloud_providers_config WHERE id = $1',
      [validated.providerId]
    )

    console.log(`[disconnectCloudProviderAction] Provider ${config.provider} déconnecté`)

    revalidatePath('/settings/cloud-storage')

    return { success: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[disconnectCloudProviderAction] Exception:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la déconnexion' }
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

    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le provider appartient à l'utilisateur
    const configResult = await query(
      `SELECT id, provider, root_folder_id, access_token, webhook_channel_id
       FROM cloud_providers_config
       WHERE id = $1 AND user_id = $2`,
      [validated.providerId, userId]
    )

    if (configResult.rows.length === 0) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    const config = configResult.rows[0]

    // Préparer update
    const updateData: any = {
      sync_enabled: validated.enabled,
      updated_at: new Date().toISOString(),
    }

    if (validated.frequency) {
      updateData.sync_frequency = parseInt(validated.frequency, 10)
    }

    // Si activation sync et pas de webhook actif, créer webhook
    if (validated.enabled && !config.webhook_channel_id && config.root_folder_id) {
      try {
        // Déchiffrer le token
        const decryptedToken = await decrypt(config.access_token)
        const provider = createGoogleDriveProvider(decryptedToken)

        // Générer channel ID unique
        const channelId = `${userId}-${Date.now()}`

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
      } catch (error) {
        console.error('[toggleSyncAction] Erreur création webhook:', error)
        return { error: `Impossible d'activer la synchronisation: ${getErrorMessage(error)}` }
      }
    }

    // Si désactivation sync et webhook actif, le stopper
    if (!validated.enabled && config.webhook_channel_id) {
      try {
        // Déchiffrer le token
        const decryptedToken = await decrypt(config.access_token)
        const provider = createGoogleDriveProvider(decryptedToken)

        const webhookResult = await query(
          'SELECT webhook_resource_id FROM cloud_providers_config WHERE id = $1',
          [validated.providerId]
        )

        if (webhookResult.rows.length > 0 && webhookResult.rows[0].webhook_resource_id) {
          await provider.stopWatching({
            channelId: config.webhook_channel_id,
            resourceId: webhookResult.rows[0].webhook_resource_id,
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
    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ')
    const values = [...Object.values(updateData), validated.providerId]

    await query(
      `UPDATE cloud_providers_config SET ${setClause} WHERE id = $${values.length}`,
      values
    )

    console.log(`[toggleSyncAction] Synchronisation ${validated.enabled ? 'activée' : 'désactivée'}`)

    revalidatePath('/settings/cloud-storage')

    return { success: true, enabled: validated.enabled }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[toggleSyncAction] Exception:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la modification de la synchronisation' }
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

    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le provider appartient à l'utilisateur
    const configResult = await query(
      'SELECT id, provider FROM cloud_providers_config WHERE id = $1 AND user_id = $2',
      [validated.providerId, userId]
    )

    if (configResult.rows.length === 0) {
      return { error: 'Configuration non trouvée ou accès refusé' }
    }

    const config = configResult.rows[0]

    // Désactiver default_provider pour tous les autres providers
    await query(
      'UPDATE cloud_providers_config SET default_provider = false WHERE user_id = $1 AND id != $2',
      [userId, validated.providerId]
    )

    // Activer default_provider pour ce provider
    await query(
      'UPDATE cloud_providers_config SET default_provider = true, updated_at = NOW() WHERE id = $1',
      [validated.providerId]
    )

    console.log(`[setDefaultCloudProviderAction] Provider ${config.provider} défini par défaut`)

    revalidatePath('/settings/cloud-storage')

    return { success: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message }
    }

    console.error('[setDefaultCloudProviderAction] Exception:', error)
    return { error: getErrorMessage(error) || 'Erreur lors de la définition du provider par défaut' }
  }
}
