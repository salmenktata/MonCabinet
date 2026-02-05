/**
 * Implémentation WhatsApp Business API
 * Provider messagerie par défaut pour MVP
 */

import axios from 'axios'
import crypto from 'crypto'
import type {
  IMessenger,
  SendTextMessageParams,
  SendTextMessageResult,
  DownloadMediaParams,
  DownloadMediaResult,
  MarkAsReadParams,
  ValidateWebhookParams,
  IncomingMessage,
} from './base-messenger'
import {
  MessagingError,
  InvalidPhoneNumberError,
  MediaDownloadError,
  WebhookValidationError,
} from './base-messenger'

const WHATSAPP_API_VERSION = 'v21.0'
const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  appSecret: string
}

export class WhatsAppMessenger implements IMessenger {
  private config: WhatsAppConfig

  constructor(config: WhatsAppConfig) {
    this.config = config
  }

  /**
   * Envoyer un message texte
   */
  async sendTextMessage(
    params: SendTextMessageParams
  ): Promise<SendTextMessageResult> {
    try {
      // Valider format téléphone (E.164)
      if (!this.isValidPhoneNumber(params.to)) {
        throw new InvalidPhoneNumberError('whatsapp', params.to)
      }

      const url = `${WHATSAPP_API_BASE_URL}/${this.config.phoneNumberId}/messages`

      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'text',
          text: {
            preview_url: false,
            body: params.text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const messageId = response.data.messages?.[0]?.id

      if (!messageId) {
        throw new MessagingError(
          'Message ID manquant dans réponse',
          'INVALID_RESPONSE',
          'whatsapp'
        )
      }

      console.log(`[WhatsApp] Message envoyé: ${messageId} → ${params.to}`)

      return {
        messageId,
        timestamp: new Date(),
        success: true,
      }
    } catch (error: any) {
      if (error instanceof MessagingError) {
        throw error
      }

      console.error('[WhatsApp] Erreur envoi message:', error)

      if (error.response?.status === 401) {
        throw new MessagingError(
          'Token WhatsApp invalide ou expiré',
          'INVALID_TOKEN',
          'whatsapp',
          401
        )
      }

      if (error.response?.status === 429) {
        throw new MessagingError(
          'Limite de taux WhatsApp dépassée',
          'RATE_LIMIT_EXCEEDED',
          'whatsapp',
          429
        )
      }

      throw new MessagingError(
        error.message || 'Échec envoi message WhatsApp',
        'SEND_FAILED',
        'whatsapp',
        error.response?.status
      )
    }
  }

  /**
   * Télécharger un média depuis WhatsApp
   */
  async downloadMedia(
    params: DownloadMediaParams
  ): Promise<DownloadMediaResult> {
    try {
      // 1. Récupérer URL du média depuis l'API
      const mediaUrlResponse = await axios.get(
        `${WHATSAPP_API_BASE_URL}/${params.mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        }
      )

      const mediaUrl = mediaUrlResponse.data.url

      if (!mediaUrl) {
        throw new MediaDownloadError('whatsapp', params.mediaId)
      }

      // 2. Télécharger le média depuis l'URL
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        responseType: 'arraybuffer',
      })

      const buffer = Buffer.from(mediaResponse.data)

      // Extraire nom fichier depuis headers ou générer
      const contentDisposition = mediaResponse.headers['content-disposition']
      let fileName = `media_${params.mediaId}`

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/)
        if (match) {
          fileName = match[1]
        }
      } else {
        // Générer extension depuis MIME type
        const extension = this.getExtensionFromMimeType(params.mimeType)
        fileName = `${fileName}.${extension}`
      }

      console.log(
        `[WhatsApp] Média téléchargé: ${params.mediaId} (${buffer.length} bytes)`
      )

      return {
        buffer,
        fileName,
        mimeType: params.mimeType,
        size: buffer.length,
      }
    } catch (error: any) {
      if (error instanceof MessagingError) {
        throw error
      }

      console.error('[WhatsApp] Erreur téléchargement média:', error)

      if (error.response?.status === 404) {
        throw new MediaDownloadError('whatsapp', params.mediaId)
      }

      throw new MessagingError(
        error.message || 'Échec téléchargement média WhatsApp',
        'DOWNLOAD_FAILED',
        'whatsapp',
        error.response?.status
      )
    }
  }

  /**
   * Marquer un message comme lu
   */
  async markAsRead(params: MarkAsReadParams): Promise<void> {
    try {
      const url = `${WHATSAPP_API_BASE_URL}/${this.config.phoneNumberId}/messages`

      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: params.messageId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      console.log(`[WhatsApp] Message marqué comme lu: ${params.messageId}`)
    } catch (error: any) {
      console.error('[WhatsApp] Erreur marquage lu:', error)
      // Non bloquant, on ignore l'erreur
    }
  }

  /**
   * Valider la signature d'un webhook WhatsApp (HMAC SHA256)
   */
  validateWebhookSignature(params: ValidateWebhookParams): boolean {
    try {
      // Signature format: sha256=<hash>
      const signature = params.signature.replace('sha256=', '')

      // Calculer HMAC SHA256
      const hmac = crypto.createHmac('sha256', params.appSecret)
      hmac.update(params.body)
      const expectedSignature = hmac.digest('hex')

      // Comparaison sécurisée (évite timing attacks)
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    } catch (error) {
      console.error('[WhatsApp] Erreur validation signature:', error)
      return false
    }
  }

  /**
   * Parser le payload d'un webhook WhatsApp entrant
   */
  parseIncomingWebhook(payload: any): IncomingMessage | null {
    try {
      // Structure webhook WhatsApp : entry[0].changes[0].value.messages[0]
      const entry = payload.entry?.[0]
      if (!entry) return null

      const changes = entry.changes?.[0]
      if (!changes) return null

      const value = changes.value
      if (!value) return null

      const messages = value.messages
      if (!messages || messages.length === 0) return null

      const message = messages[0]

      // Informations de base
      const incomingMessage: IncomingMessage = {
        messageId: message.id,
        from: message.from,
        fromName: value.contacts?.[0]?.profile?.name,
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        type: message.type,
      }

      // Parser selon type de message
      switch (message.type) {
        case 'text':
          incomingMessage.text = message.text?.body
          break

        case 'image':
          incomingMessage.mediaId = message.image?.id
          incomingMessage.mimeType = message.image?.mime_type
          incomingMessage.caption = message.image?.caption
          break

        case 'video':
          incomingMessage.mediaId = message.video?.id
          incomingMessage.mimeType = message.video?.mime_type
          incomingMessage.caption = message.video?.caption
          break

        case 'audio':
          incomingMessage.mediaId = message.audio?.id
          incomingMessage.mimeType = message.audio?.mime_type
          break

        case 'document':
          incomingMessage.mediaId = message.document?.id
          incomingMessage.mimeType = message.document?.mime_type
          incomingMessage.fileName = message.document?.filename
          incomingMessage.caption = message.document?.caption
          break

        default:
          console.warn(`[WhatsApp] Type message non supporté: ${message.type}`)
          return null
      }

      return incomingMessage
    } catch (error) {
      console.error('[WhatsApp] Erreur parsing webhook:', error)
      return null
    }
  }

  /**
   * Valider format téléphone E.164
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Format E.164 : +[country code][number]
    // Ex: +21612345678 (Tunisie)
    const e164Regex = /^\+[1-9]\d{1,14}$/
    return e164Regex.test(phoneNumber)
  }

  /**
   * Obtenir extension fichier depuis MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/amr': 'amr',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'xlsx',
      'text/plain': 'txt',
    }

    return mimeToExt[mimeType] || 'bin'
  }
}

/**
 * Créer instance WhatsAppMessenger
 */
export function createWhatsAppMessenger(
  config: WhatsAppConfig
): WhatsAppMessenger {
  return new WhatsAppMessenger(config)
}
