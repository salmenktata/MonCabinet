/**
 * Webhook Google Drive Push Notifications
 * Reçoit les notifications de changements dans Google Drive et déclenche la synchronisation
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { headers } from 'next/headers'
import { syncGoogleDriveToDatabase } from '@/lib/integrations/sync-service'

const WEBHOOK_VERIFY_TOKEN = process.env.GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN

/**
 * GET Handler - Vérification webhook Google Drive
 * Google envoie une requête GET pour vérifier que l'endpoint est valide
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get('token')

  console.log('[GoogleDrive Webhook] Vérification webhook...')

  // Vérifier token
  if (!WEBHOOK_VERIFY_TOKEN) {
    console.error('[GoogleDrive Webhook] GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN non configuré')
    return NextResponse.json(
      { error: 'Configuration manquante' },
      { status: 500 }
    )
  }

  if (token !== WEBHOOK_VERIFY_TOKEN) {
    console.error('[GoogleDrive Webhook] Token invalide')
    return NextResponse.json(
      { error: 'Token invalide' },
      { status: 403 }
    )
  }

  console.log('[GoogleDrive Webhook] Vérification réussie')
  return NextResponse.json({ success: true })
}

/**
 * POST Handler - Réception notifications changements
 * Google envoie une notification POST quand un fichier change dans le dossier surveillé
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers()

    // Headers Google Drive Push Notifications
    const channelId = headersList.get('x-goog-channel-id')
    const resourceState = headersList.get('x-goog-resource-state')
    const resourceId = headersList.get('x-goog-resource-id')
    const channelToken = headersList.get('x-goog-channel-token')

    console.log('[GoogleDrive Webhook] Notification reçue:', {
      channelId,
      resourceState,
      resourceId,
      channelToken,
    })

    // Vérifier headers requis
    if (!channelId || !resourceState) {
      console.error('[GoogleDrive Webhook] Headers manquants')
      return NextResponse.json(
        { error: 'Headers manquants' },
        { status: 400 }
      )
    }

    // Vérifier token channel
    if (channelToken !== WEBHOOK_VERIFY_TOKEN) {
      console.error('[GoogleDrive Webhook] Token channel invalide')
      return NextResponse.json(
        { error: 'Token invalide' },
        { status: 403 }
      )
    }

    // Types de notifications Google Drive :
    // - 'sync' : notification initiale après watch
    // - 'add' : fichier ajouté
    // - 'update' : fichier modifié
    // - 'remove' : fichier supprimé
    // - 'trash' : fichier mis à la corbeille

    // Ignorer notification 'sync' (initiale)
    if (resourceState === 'sync') {
      console.log('[GoogleDrive Webhook] Notification sync ignorée')
      return NextResponse.json({ success: true })
    }

    // 1. Récupérer configuration utilisateur à partir du channelId
    const configResult = await query(
      `SELECT user_id, enabled, sync_enabled
       FROM cloud_providers_config
       WHERE webhook_channel_id = $1 AND provider = $2`,
      [channelId, 'google_drive']
    )

    if (configResult.rows.length === 0) {
      console.error('[GoogleDrive Webhook] Configuration non trouvée pour channelId:', channelId)
      return NextResponse.json(
        { error: 'Configuration non trouvée' },
        { status: 404 }
      )
    }

    const config = configResult.rows[0]

    // Vérifier que synchronisation est activée
    if (!config.enabled || !config.sync_enabled) {
      console.log('[GoogleDrive Webhook] Synchronisation désactivée pour utilisateur')
      return NextResponse.json({ success: true, skipped: true })
    }

    // 2. Déclencher synchronisation asynchrone
    console.log(`[GoogleDrive Webhook] Déclenchement synchronisation pour user ${config.user_id}...`)

    try {
      // Appeler service de synchronisation
      const syncResult = await syncGoogleDriveToDatabase(config.user_id)

      console.log('[GoogleDrive Webhook] Synchronisation terminée:', {
        success: syncResult.success,
        filesScanned: syncResult.filesScanned,
        filesAdded: syncResult.filesAdded,
        filesUpdated: syncResult.filesUpdated,
        filesNeedsClassification: syncResult.filesNeedsClassification,
        errors: syncResult.errors.length,
      })

      return NextResponse.json({
        success: true,
        syncLogId: syncResult.syncLogId,
        result: {
          filesScanned: syncResult.filesScanned,
          filesAdded: syncResult.filesAdded,
          filesUpdated: syncResult.filesUpdated,
          filesNeedsClassification: syncResult.filesNeedsClassification,
        },
      })
    } catch (error: any) {
      console.error('[GoogleDrive Webhook] Erreur synchronisation:', error)

      // La synchronisation a échoué mais on retourne 200 pour ne pas que Google réessaye
      return NextResponse.json({
        success: false,
        error: 'Synchronisation failed',
        message: error.message,
      })
    }

  } catch (error: any) {
    console.error('[GoogleDrive Webhook] Erreur traitement notification:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur interne' },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS Handler - CORS preflight
 * Requis pour les webhooks Google Drive
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Goog-Channel-Id, X-Goog-Resource-State, X-Goog-Resource-Id, X-Goog-Channel-Token',
    },
  })
}
