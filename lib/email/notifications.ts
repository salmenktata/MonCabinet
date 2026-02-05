/**
 * Service Notifications Email
 * Fonctions d'envoi de notifications aux avocats
 */

import { sendEmail } from './resend-client'
import {
  templateDocumentAutoAttached,
  templateDocumentPendingClassification,
  templateDocumentUnknownNumber,
} from './templates/whatsapp-document-received'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7002'

// ============================================================================
// TYPES
// ============================================================================

export interface NotifyDocumentAutoAttachedParams {
  lawyerEmail: string
  lawyerName: string
  clientName: string
  clientPhone: string
  documentName: string
  documentSize: string
  dossierNumero: string
  dossierObjet?: string
  dossierId: string
  receivedAt: Date
}

export interface NotifyDocumentPendingParams {
  lawyerEmail: string
  lawyerName: string
  clientName: string
  clientPhone: string
  documentName: string
  documentSize: string
  nombreDossiers: number
  receivedAt: Date
}

export interface NotifyDocumentUnknownNumberParams {
  lawyerEmail: string
  lawyerName: string
  senderPhone: string
  senderName?: string
  documentName: string
  documentSize: string
  receivedAt: Date
}

// ============================================================================
// FONCTIONS NOTIFICATION
// ============================================================================

/**
 * Notifier l'avocat qu'un document a été reçu et rattaché automatiquement
 */
export async function notifyDocumentAutoAttached(
  params: NotifyDocumentAutoAttachedParams
): Promise<{ success: boolean; error?: string }> {
  try {
    // Formater date
    const receivedAtFormatted = params.receivedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // URL vers le dossier
    const dossierUrl = `${APP_URL}/dossiers/${params.dossierId}`

    // Générer template email
    const template = templateDocumentAutoAttached({
      lawyerName: params.lawyerName,
      clientName: params.clientName,
      clientPhone: params.clientPhone,
      documentName: params.documentName,
      documentSize: params.documentSize,
      dossierNumero: params.dossierNumero,
      dossierObjet: params.dossierObjet,
      receivedAt: receivedAtFormatted,
      dossierUrl,
    })

    // Envoyer email
    const result = await sendEmail({
      to: params.lawyerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })

    if (!result.success) {
      console.error('[Notifications] Erreur envoi email auto-attached:', result.error)
      return { success: false, error: result.error }
    }

    console.log('[Notifications] Email auto-attached envoyé:', result.messageId)
    return { success: true }
  } catch (error: any) {
    console.error('[Notifications] Exception notifyDocumentAutoAttached:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Notifier l'avocat qu'un document est en attente de rattachement manuel
 */
export async function notifyDocumentPendingClassification(
  params: NotifyDocumentPendingParams
): Promise<{ success: boolean; error?: string }> {
  try {
    // Formater date
    const receivedAtFormatted = params.receivedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // URL vers le dashboard
    const dashboardUrl = `${APP_URL}/dashboard`

    // Générer template email
    const template = templateDocumentPendingClassification({
      lawyerName: params.lawyerName,
      clientName: params.clientName,
      clientPhone: params.clientPhone,
      documentName: params.documentName,
      documentSize: params.documentSize,
      nombreDossiers: params.nombreDossiers,
      receivedAt: receivedAtFormatted,
      dashboardUrl,
    })

    // Envoyer email
    const result = await sendEmail({
      to: params.lawyerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })

    if (!result.success) {
      console.error('[Notifications] Erreur envoi email pending:', result.error)
      return { success: false, error: result.error }
    }

    console.log('[Notifications] Email pending envoyé:', result.messageId)
    return { success: true }
  } catch (error: any) {
    console.error('[Notifications] Exception notifyDocumentPendingClassification:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Notifier l'avocat qu'un document a été reçu d'un numéro inconnu
 */
export async function notifyDocumentUnknownNumber(
  params: NotifyDocumentUnknownNumberParams
): Promise<{ success: boolean; error?: string }> {
  try {
    // Formater date
    const receivedAtFormatted = params.receivedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // URL vers la liste clients
    const clientsUrl = `${APP_URL}/clients`

    // Générer template email
    const template = templateDocumentUnknownNumber({
      lawyerName: params.lawyerName,
      senderPhone: params.senderPhone,
      senderName: params.senderName,
      documentName: params.documentName,
      documentSize: params.documentSize,
      receivedAt: receivedAtFormatted,
      clientsUrl,
    })

    // Envoyer email
    const result = await sendEmail({
      to: params.lawyerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })

    if (!result.success) {
      console.error('[Notifications] Erreur envoi email unknown:', result.error)
      return { success: false, error: result.error }
    }

    console.log('[Notifications] Email unknown number envoyé:', result.messageId)
    return { success: true }
  } catch (error: any) {
    console.error('[Notifications] Exception notifyDocumentUnknownNumber:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Formater taille fichier (helper)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
