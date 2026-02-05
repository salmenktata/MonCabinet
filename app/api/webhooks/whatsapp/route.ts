/**
 * Webhook WhatsApp Business API
 *
 * GET : Vérification webhook Meta (hub.verify_token, hub.challenge)
 * POST : Réception messages entrants avec médias
 *
 * Architecture :
 * 1. Validation signature HMAC SHA256
 * 2. Parsing payload WhatsApp
 * 3. Téléchargement médias (documents, images, vidéos, audio)
 * 4. Identification client via téléphone normalisé
 * 5. Rattachement automatique ou manuel selon nombre dossiers actifs
 * 6. Upload Google Drive via StorageManager
 * 7. Confirmation WhatsApp au client
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWhatsAppMessenger } from '@/lib/integrations/messaging/whatsapp'
import { createStorageManager } from '@/lib/integrations/storage-manager'
import type { IncomingMessage } from '@/lib/integrations/messaging/base-messenger'
import {
  notifyDocumentAutoAttached,
  notifyDocumentPendingClassification,
  notifyDocumentUnknownNumber,
  formatFileSize,
} from '@/lib/email/notifications'

/**
 * GET : Vérification webhook Meta
 * Meta envoie GET avec hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log('[WhatsApp Webhook] GET verification:', { mode, token: token?.substring(0, 10) + '...' })

    // Vérifier paramètres
    if (!mode || !token || !challenge) {
      console.error('[WhatsApp Webhook] Paramètres manquants')
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    // Vérifier mode
    if (mode !== 'subscribe') {
      console.error('[WhatsApp Webhook] Mode invalide:', mode)
      return NextResponse.json(
        { error: 'Mode invalide' },
        { status: 400 }
      )
    }

    // Vérifier token (compare avec WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

    if (!expectedToken) {
      console.error('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN non configuré')
      return NextResponse.json(
        { error: 'Token vérification non configuré' },
        { status: 500 }
      )
    }

    if (token !== expectedToken) {
      console.error('[WhatsApp Webhook] Token invalide')
      return NextResponse.json(
        { error: 'Token invalide' },
        { status: 403 }
      )
    }

    // Retourner challenge (confirme webhook)
    console.log('[WhatsApp Webhook] Vérification réussie, challenge retourné')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur interne serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST : Réception messages WhatsApp
 * Meta envoie POST avec signature x-hub-signature-256
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Récupérer signature header
    const signature = request.headers.get('x-hub-signature-256')

    if (!signature) {
      console.error('[WhatsApp Webhook] Signature manquante')
      return NextResponse.json(
        { error: 'Signature manquante' },
        { status: 403 }
      )
    }

    // 2. Lire body (doit être lu une seule fois)
    const rawBody = await request.text()

    // 3. Valider signature HMAC SHA256
    const appSecret = process.env.WHATSAPP_APP_SECRET

    if (!appSecret) {
      console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET non configuré')
      return NextResponse.json(
        { error: 'App secret non configuré' },
        { status: 500 }
      )
    }

    // Créer messenger temporaire pour validation signature
    const tempMessenger = createWhatsAppMessenger({
      phoneNumberId: 'temp',
      accessToken: 'temp',
      appSecret: appSecret,
    })

    const isValidSignature = tempMessenger.validateWebhookSignature({
      signature,
      body: rawBody,
      appSecret,
    })

    if (!isValidSignature) {
      console.error('[WhatsApp Webhook] Signature invalide')
      return NextResponse.json(
        { error: 'Signature invalide' },
        { status: 403 }
      )
    }

    // 4. Parser payload
    const payload = JSON.parse(rawBody)

    console.log('[WhatsApp Webhook] Payload reçu:', {
      entry: payload.entry?.length,
      changes: payload.entry?.[0]?.changes?.length,
    })

    // 5. Parser message entrant
    const incomingMessage = tempMessenger.parseIncomingWebhook(payload)

    if (!incomingMessage) {
      // Pas de message (peut être status update, etc.)
      console.log('[WhatsApp Webhook] Pas de message à traiter')
      return NextResponse.json({ success: true, message: 'Aucun message à traiter' })
    }

    console.log('[WhatsApp Webhook] Message entrant:', {
      type: incomingMessage.type,
      from: incomingMessage.from,
      mediaId: incomingMessage.mediaId,
    })

    // 6. Traiter message selon type
    if (incomingMessage.type === 'text') {
      // Messages texte : on ignore (pas de document)
      console.log('[WhatsApp Webhook] Message texte ignoré (pas de document)')
      return NextResponse.json({ success: true, message: 'Message texte ignoré' })
    }

    // Types avec média : document, image, video, audio
    if (!incomingMessage.mediaId || !incomingMessage.mimeType) {
      console.error('[WhatsApp Webhook] mediaId ou mimeType manquant')
      return NextResponse.json({ success: true, message: 'Média incomplet' })
    }

    // 7. Identifier client via téléphone normalisé
    const supabase = await createClient()

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, nom, prenom, denomination, type, user_id')
      .eq('telephone_normalized', incomingMessage.from)
      .single()

    if (clientError || !client) {
      console.warn('[WhatsApp Webhook] Client non trouvé:', incomingMessage.from)

      // Récupérer email de l'avocat (on doit deviner l'utilisateur via autre méthode)
      // Pour l'instant, on stocke le document et on notifie tous les utilisateurs (MVP)
      // En production, il faudrait identifier l'utilisateur via le whatsappConfig.phone_number

      // Stocker document temporairement pour traitement ultérieur
      const { data: pendingDoc, error: pendingError } = await supabase
        .from('pending_documents')
        .insert({
          user_id: null, // Sera assigné manuellement
          client_id: null,
          file_name: incomingMessage.fileName || mediaResult.fileName,
          file_type: mediaResult.mimeType,
          file_size: mediaResult.size,
          source_type: 'whatsapp',
          sender_phone: incomingMessage.from,
          sender_name: incomingMessage.fromName,
          message_id: incomingMessage.messageId,
          status: 'pending',
        })
        .select()
        .single()

      if (pendingError) {
        console.error('[WhatsApp Webhook] Erreur stockage pending (inconnu):', pendingError)
      }

      // Marquer message comme lu
      await messenger.markAsRead({ messageId: incomingMessage.messageId })

      // Envoyer message au client
      await messenger.sendTextMessage({
        to: incomingMessage.from,
        text: `📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais.`,
      })

      // NOTE : En production, il faudrait récupérer l'email de l'avocat
      // depuis la config WhatsApp qui a reçu ce message
      // Pour le MVP, on log et on retourne succès
      console.log('[WhatsApp Webhook] Notification email "numéro inconnu" - email avocat non disponible')

      return NextResponse.json({
        success: true,
        message: 'Client non trouvé, notification envoyée',
        pendingDocumentId: pendingDoc?.id,
      })
    }

    console.log('[WhatsApp Webhook] Client identifié:', {
      clientId: client.id,
      nom: client.type === 'PERSONNE_PHYSIQUE'
        ? `${client.prenom} ${client.nom}`
        : client.denomination,
    })

    // 8. Récupérer configuration WhatsApp de l'utilisateur
    const { data: whatsappConfig, error: configError } = await supabase
      .from('messaging_webhooks_config')
      .select('*')
      .eq('user_id', client.user_id)
      .eq('platform', 'whatsapp')
      .eq('enabled', true)
      .single()

    if (configError || !whatsappConfig) {
      console.error('[WhatsApp Webhook] Configuration WhatsApp non trouvée pour user:', client.user_id)
      return NextResponse.json({
        success: false,
        error: 'Configuration WhatsApp non trouvée',
      }, { status: 500 })
    }

    // Créer messenger avec vraie config
    const messenger = createWhatsAppMessenger({
      phoneNumberId: whatsappConfig.phone_number,
      accessToken: whatsappConfig.access_token,
      appSecret: appSecret,
    })

    // 9. Télécharger média depuis serveurs WhatsApp
    console.log('[WhatsApp Webhook] Téléchargement média:', incomingMessage.mediaId)

    const mediaResult = await messenger.downloadMedia({
      mediaId: incomingMessage.mediaId,
      mimeType: incomingMessage.mimeType,
    })

    console.log('[WhatsApp Webhook] Média téléchargé:', {
      fileName: mediaResult.fileName,
      size: mediaResult.size,
    })

    // 10. Récupérer dossiers actifs du client
    const { data: dossiers, error: dossiersError } = await supabase
      .from('dossiers')
      .select('id, numero, objet')
      .eq('client_id', client.id)
      .eq('user_id', client.user_id)
      .eq('statut', 'ACTIF')

    if (dossiersError) {
      console.error('[WhatsApp Webhook] Erreur récupération dossiers:', dossiersError)
      return NextResponse.json({
        success: false,
        error: 'Erreur récupération dossiers',
      }, { status: 500 })
    }

    const nombreDossiersActifs = dossiers?.length || 0

    console.log('[WhatsApp Webhook] Dossiers actifs trouvés:', nombreDossiersActifs)

    // 11. Logique rattachement selon nombre dossiers actifs

    if (nombreDossiersActifs === 1) {
      // ✅ CAS 1 : 1 seul dossier actif → Upload automatique
      const dossier = dossiers![0]

      console.log('[WhatsApp Webhook] Rattachement automatique au dossier:', dossier.numero)

      try {
        const storageManager = createStorageManager()

        const uploadResult = await storageManager.uploadDocument({
          userId: client.user_id,
          dossierId: dossier.id,
          fileName: incomingMessage.fileName || mediaResult.fileName,
          fileBuffer: mediaResult.buffer,
          mimeType: mediaResult.mimeType,
          sourceType: 'whatsapp',
          sourceMetadata: {
            sender_phone: incomingMessage.from,
            sender_name: incomingMessage.fromName,
            message_id: incomingMessage.messageId,
            received_at: incomingMessage.timestamp.toISOString(),
            caption: incomingMessage.caption,
          },
        })

        console.log('[WhatsApp Webhook] Document uploadé avec succès:', {
          documentId: uploadResult.documentId,
          fileId: uploadResult.fileId,
        })

        // Marquer message comme lu
        await messenger.markAsRead({ messageId: incomingMessage.messageId })

        // Envoyer confirmation au client (si activé)
        if (whatsappConfig.send_confirmation) {
          await messenger.sendTextMessage({
            to: incomingMessage.from,
            text: `✅ Document bien reçu et rattaché au dossier ${dossier.numero}.`,
          })
        }

        // Envoyer notification email à l'avocat
        try {
          // Récupérer email avocat
          const { data: userData } = await supabase.auth.admin.getUserById(client.user_id)

          if (userData?.user?.email) {
            const clientName = client.type === 'PERSONNE_PHYSIQUE'
              ? `${client.prenom} ${client.nom}`
              : client.denomination

            await notifyDocumentAutoAttached({
              lawyerEmail: userData.user.email,
              lawyerName: userData.user.user_metadata?.full_name || 'Avocat',
              clientName,
              clientPhone: incomingMessage.from,
              documentName: incomingMessage.fileName || mediaResult.fileName,
              documentSize: formatFileSize(mediaResult.size),
              dossierNumero: dossier.numero,
              dossierObjet: dossier.objet,
              dossierId: dossier.id,
              receivedAt: incomingMessage.timestamp,
            })

            console.log('[WhatsApp Webhook] Email notification envoyée à l\'avocat')
          }
        } catch (emailError) {
          console.error('[WhatsApp Webhook] Erreur envoi email notification:', emailError)
          // Non bloquant, on continue
        }

        return NextResponse.json({
          success: true,
          message: 'Document uploadé automatiquement',
          documentId: uploadResult.documentId,
          dossier: dossier.numero,
        })
      } catch (uploadError: any) {
        console.error('[WhatsApp Webhook] Erreur upload automatique:', uploadError)

        // Envoyer message d'erreur au client
        await messenger.sendTextMessage({
          to: incomingMessage.from,
          text: `❌ Erreur lors de l'enregistrement du document. Veuillez réessayer ou contacter votre avocat.`,
        })

        return NextResponse.json({
          success: false,
          error: 'Erreur upload document',
          details: uploadError.message,
        }, { status: 500 })
      }
    } else if (nombreDossiersActifs > 1) {
      // ⏳ CAS 2 : Plusieurs dossiers actifs → Stockage temporaire

      console.log('[WhatsApp Webhook] Plusieurs dossiers actifs, stockage en attente')

      // Upload temporaire vers Google Drive (dossier "Documents non classés")
      // Pour l'instant, on stocke les métadonnées dans pending_documents
      // L'upload Google Drive sera fait lors du rattachement manuel

      const { data: pendingDoc, error: pendingError } = await supabase
        .from('pending_documents')
        .insert({
          user_id: client.user_id,
          client_id: client.id,
          file_name: incomingMessage.fileName || mediaResult.fileName,
          file_type: mediaResult.mimeType,
          file_size: mediaResult.size,
          source_type: 'whatsapp',
          sender_phone: incomingMessage.from,
          sender_name: incomingMessage.fromName,
          message_id: incomingMessage.messageId,
          status: 'pending',
        })
        .select()
        .single()

      if (pendingError) {
        console.error('[WhatsApp Webhook] Erreur stockage pending:', pendingError)
        return NextResponse.json({
          success: false,
          error: 'Erreur stockage document en attente',
        }, { status: 500 })
      }

      // Marquer message comme lu
      await messenger.markAsRead({ messageId: incomingMessage.messageId })

      // Envoyer message au client
      await messenger.sendTextMessage({
        to: incomingMessage.from,
        text: `📥 Document bien reçu. Votre avocat va le rattacher au bon dossier sous peu.`,
      })

      // Envoyer notification email "Action requise" à l'avocat
      try {
        // Récupérer email avocat
        const { data: userData } = await supabase.auth.admin.getUserById(client.user_id)

        if (userData?.user?.email) {
          const clientName = client.type === 'PERSONNE_PHYSIQUE'
            ? `${client.prenom} ${client.nom}`
            : client.denomination

          await notifyDocumentPendingClassification({
            lawyerEmail: userData.user.email,
            lawyerName: userData.user.user_metadata?.full_name || 'Avocat',
            clientName,
            clientPhone: incomingMessage.from,
            documentName: incomingMessage.fileName || mediaResult.fileName,
            documentSize: formatFileSize(mediaResult.size),
            nombreDossiers: nombreDossiersActifs,
            receivedAt: incomingMessage.timestamp,
          })

          console.log('[WhatsApp Webhook] Email notification "action requise" envoyée à l\'avocat')
        }
      } catch (emailError) {
        console.error('[WhatsApp Webhook] Erreur envoi email notification:', emailError)
        // Non bloquant, on continue
      }

      return NextResponse.json({
        success: true,
        message: 'Document en attente de rattachement manuel',
        pendingDocumentId: pendingDoc.id,
        nombreDossiers: nombreDossiersActifs,
      })
    } else {
      // ⚠️ CAS 3 : 0 dossier actif → Notification avocat

      console.log('[WhatsApp Webhook] Aucun dossier actif pour ce client')

      // Stocker dans pending_documents sans client_id (nécessite création dossier)
      const { data: pendingDoc, error: pendingError } = await supabase
        .from('pending_documents')
        .insert({
          user_id: client.user_id,
          client_id: client.id,
          file_name: incomingMessage.fileName || mediaResult.fileName,
          file_type: mediaResult.mimeType,
          file_size: mediaResult.size,
          source_type: 'whatsapp',
          sender_phone: incomingMessage.from,
          sender_name: incomingMessage.fromName,
          message_id: incomingMessage.messageId,
          status: 'pending',
        })
        .select()
        .single()

      if (pendingError) {
        console.error('[WhatsApp Webhook] Erreur stockage pending:', pendingError)
      }

      // Marquer message comme lu
      await messenger.markAsRead({ messageId: incomingMessage.messageId })

      // Envoyer message au client
      await messenger.sendTextMessage({
        to: incomingMessage.from,
        text: `📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais.`,
      })

      // Envoyer notification email "Aucun dossier actif" à l'avocat
      try {
        // Récupérer email avocat
        const { data: userData } = await supabase.auth.admin.getUserById(client.user_id)

        if (userData?.user?.email) {
          const clientName = client.type === 'PERSONNE_PHYSIQUE'
            ? `${client.prenom} ${client.nom}`
            : client.denomination

          // Utiliser la même notification que "plusieurs dossiers" car action similaire requise
          await notifyDocumentPendingClassification({
            lawyerEmail: userData.user.email,
            lawyerName: userData.user.user_metadata?.full_name || 'Avocat',
            clientName,
            clientPhone: incomingMessage.from,
            documentName: incomingMessage.fileName || mediaResult.fileName,
            documentSize: formatFileSize(mediaResult.size),
            nombreDossiers: 0,
            receivedAt: incomingMessage.timestamp,
          })

          console.log('[WhatsApp Webhook] Email notification "aucun dossier actif" envoyée à l\'avocat')
        }
      } catch (emailError) {
        console.error('[WhatsApp Webhook] Erreur envoi email notification:', emailError)
        // Non bloquant, on continue
      }

      return NextResponse.json({
        success: true,
        message: 'Aucun dossier actif, notification envoyée',
        pendingDocumentId: pendingDoc?.id,
      })
    }
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Erreur POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur traitement webhook',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
