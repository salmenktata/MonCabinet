/**
 * Re-export depuis brevo-client pour compatibilité imports @/lib/email/brevo
 */
export {
  sendEmail,
  sendTestEmail,
  isBrevoConfigured,
  isBrevoConfiguredSync,
  type SendEmailParams,
  type SendEmailResult,
} from './brevo-client'
