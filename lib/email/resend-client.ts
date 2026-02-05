/**
 * Client Resend - Service Email
 * Gestion envoi emails via Resend API
 */

import { Resend } from 'resend'

// Initialiser client Resend
const resend = new Resend(process.env.RESEND_API_KEY)

// Configuration email
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notifications@moncabinet.tn'
const FROM_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'MonCabinet'

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Envoyer un email via Resend
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('[Resend] RESEND_API_KEY non configurée')
      return {
        success: false,
        error: 'RESEND_API_KEY non configurée',
      }
    }

    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    })

    if (error) {
      console.error('[Resend] Erreur envoi email:', error)
      return {
        success: false,
        error: error.message || 'Erreur envoi email',
      }
    }

    console.log('[Resend] Email envoyé avec succès:', data?.id)

    return {
      success: true,
      messageId: data?.id,
    }
  } catch (error: any) {
    console.error('[Resend] Exception envoi email:', error)
    return {
      success: false,
      error: error.message || 'Exception lors de l\'envoi',
    }
  }
}

/**
 * Envoyer un email de test (développement)
 */
export async function sendTestEmail(to: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: 'Test Email - MonCabinet',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>Test Email</h1>
        <p>Ceci est un email de test envoyé depuis MonCabinet.</p>
        <p>Si vous recevez ce message, votre configuration Resend fonctionne correctement.</p>
      </div>
    `,
    text: 'Ceci est un email de test envoyé depuis MonCabinet.',
  })
}
