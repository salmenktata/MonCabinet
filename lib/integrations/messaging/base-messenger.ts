/**
 * Interface de base pour les services de messagerie
 * Supporte : WhatsApp (MVP), Messenger (futur), SMS (futur)
 */

export interface MessagingConfig {
  platform: 'whatsapp' | 'messenger' | 'sms'
  userId: string
  enabled: boolean
  phoneNumber: string
  phoneNumberId: string
  businessAccountId: string
  accessToken: string
  webhookVerifyToken: string
}

export interface SendTextMessageParams {
  to: string // Numéro destinataire (format E.164)
  text: string
}

export interface SendTextMessageResult {
  messageId: string
  timestamp: Date
  success: boolean
}

export interface DownloadMediaParams {
  mediaId: string
  mimeType: string
}

export interface DownloadMediaResult {
  buffer: Buffer
  fileName: string
  mimeType: string
  size: number
}

export interface MarkAsReadParams {
  messageId: string
}

export interface ValidateWebhookParams {
  signature: string
  body: string
  appSecret: string
}

export interface IncomingMessage {
  messageId: string
  from: string // Numéro expéditeur (format E.164)
  fromName?: string
  timestamp: Date
  type: 'text' | 'image' | 'video' | 'audio' | 'document'
  text?: string
  mediaId?: string
  mimeType?: string
  fileName?: string
  caption?: string
}

/**
 * Interface commune pour tous les services de messagerie
 */
export interface IMessenger {
  /**
   * Envoyer un message texte
   */
  sendTextMessage(params: SendTextMessageParams): Promise<SendTextMessageResult>

  /**
   * Télécharger un média (image, vidéo, audio, document)
   */
  downloadMedia(params: DownloadMediaParams): Promise<DownloadMediaResult>

  /**
   * Marquer un message comme lu
   */
  markAsRead(params: MarkAsReadParams): Promise<void>

  /**
   * Valider la signature d'un webhook
   */
  validateWebhookSignature(params: ValidateWebhookParams): boolean

  /**
   * Parser le payload d'un webhook entrant
   */
  parseIncomingWebhook(payload: any): IncomingMessage | null
}

/**
 * Erreurs personnalisées messagerie
 */
export class MessagingError extends Error {
  constructor(
    message: string,
    public code: string,
    public platform: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'MessagingError'
  }
}

export class InvalidPhoneNumberError extends MessagingError {
  constructor(platform: string, phoneNumber: string) {
    super(
      `Numéro de téléphone invalide: ${phoneNumber}`,
      'INVALID_PHONE_NUMBER',
      platform
    )
  }
}

export class MediaDownloadError extends MessagingError {
  constructor(platform: string, mediaId: string) {
    super(
      `Échec téléchargement média: ${mediaId}`,
      'MEDIA_DOWNLOAD_FAILED',
      platform
    )
  }
}

export class WebhookValidationError extends MessagingError {
  constructor(platform: string) {
    super('Signature webhook invalide', 'INVALID_SIGNATURE', platform, 403)
  }
}
