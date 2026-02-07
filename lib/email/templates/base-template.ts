/**
 * Template Email de Base
 * Design professionnel et minimaliste avec support bilingue (FR/AR)
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Qadhya'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

export type EmailLocale = 'fr' | 'ar'

interface BaseTemplateParams {
  locale?: EmailLocale
  content: string
  recipientEmail: string
  preheader?: string
}

// Couleurs de la marque
const COLORS = {
  primary: '#1e40af',      // Bleu professionnel
  primaryDark: '#1e3a8a',
  gold: '#f59e0b',         // Or/Ambre pour accents
  textDark: '#1e293b',
  textMuted: '#64748b',
  textLight: '#94a3b8',
  background: '#f8fafc',
  white: '#ffffff',
  border: '#e2e8f0',
}

// Traductions du footer
const FOOTER_TRANSLATIONS = {
  fr: {
    tagline: 'Logiciel de gestion de cabinet juridique',
    sentTo: 'Cet email a été envoyé à',
    unsubscribe: 'Se désabonner',
    copyright: `© ${new Date().getFullYear()} ${APP_NAME}. Tous droits réservés.`,
    developedBy: 'Developed by',
  },
  ar: {
    tagline: 'برنامج إدارة مكاتب المحاماة',
    sentTo: 'تم إرسال هذا البريد إلى',
    unsubscribe: 'إلغاء الاشتراك',
    copyright: `© ${new Date().getFullYear()} ${APP_NAME}. جميع الحقوق محفوظة.`,
    developedBy: 'تم التطوير بواسطة',
  },
}

/**
 * Logo SVG encodé en base64 pour les emails
 * Bouclier avec balance - version simplifiée pour emails
 */
function getLogoSvg(): string {
  return `
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Bouclier -->
      <path d="M24 4L6 12v12c0 11.1 7.67 21.5 18 24 10.33-2.5 18-12.9 18-24V12L24 4z" fill="${COLORS.gold}" fill-opacity="0.2" stroke="${COLORS.gold}" stroke-width="2"/>
      <!-- Balance -->
      <circle cx="24" cy="18" r="3" fill="${COLORS.gold}"/>
      <line x1="14" y1="26" x2="34" y2="26" stroke="${COLORS.gold}" stroke-width="2" stroke-linecap="round"/>
      <line x1="24" y1="18" x2="24" y2="26" stroke="${COLORS.gold}" stroke-width="2"/>
      <path d="M14 26v6l4-6h-4z" fill="${COLORS.gold}"/>
      <path d="M34 26v6l-4-6h4z" fill="${COLORS.gold}"/>
    </svg>
  `
}

/**
 * Générer le template HTML de base
 */
export function generateBaseTemplate(params: BaseTemplateParams): string {
  const { locale = 'fr', content, recipientEmail, preheader } = params
  const isRTL = locale === 'ar'
  const t = FOOTER_TRANSLATIONS[locale]

  return `
<!DOCTYPE html>
<html lang="${locale}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${APP_NAME}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
      .content { padding: 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${COLORS.background}; -webkit-font-smoothing: antialiased;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ''}

  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="container" style="width: 100%; max-width: 560px; border-collapse: collapse;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" style="border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle; padding-${isRTL ? 'left' : 'right'}: 12px;">
                    ${getLogoSvg()}
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-size: 24px; font-weight: 700; color: ${COLORS.textDark};">${APP_NAME}</span>
                    <br>
                    <span style="font-size: 11px; font-weight: 600; color: ${COLORS.gold}; text-transform: uppercase; letter-spacing: 1px;">
                      ${locale === 'ar' ? 'قانوني' : 'Juridique'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td>
              <table role="presentation" class="content" style="width: 100%; border-collapse: collapse; background-color: ${COLORS.white}; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0 0 8px; color: ${COLORS.textMuted}; font-size: 13px;">
                ${t.tagline}
              </p>
              <p style="margin: 0 0 8px; color: ${COLORS.textLight}; font-size: 12px;">
                ${t.sentTo} <span style="color: ${COLORS.textMuted};">${recipientEmail}</span>
              </p>
              <p style="margin: 0 0 16px; color: ${COLORS.textLight}; font-size: 12px;">
                ${t.copyright}
              </p>
              <p style="margin: 0; color: ${COLORS.textLight}; font-size: 11px;">
                ${t.developedBy} <a href="https://quelyos.com" style="color: ${COLORS.primary}; text-decoration: none;">quelyos.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Générer le template texte de base
 */
export function generateBaseTextTemplate(params: {
  locale?: EmailLocale
  content: string
  recipientEmail: string
}): string {
  const { locale = 'fr', content, recipientEmail } = params
  const t = FOOTER_TRANSLATIONS[locale]

  return `
${content}

---
${APP_NAME} - ${t.tagline}
${t.sentTo} ${recipientEmail}
${t.copyright}
  `.trim()
}

/**
 * Bouton CTA stylisé
 */
export function generateButton(params: {
  text: string
  url: string
  locale?: EmailLocale
}): string {
  const { text, url } = params

  return `
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 24px 0;">
          <a href="${url}"
             style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.primary}; color: ${COLORS.white}; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(30, 64, 175, 0.3);">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `
}

/**
 * Lien de secours sous le bouton
 */
export function generateFallbackLink(params: {
  url: string
  locale?: EmailLocale
}): string {
  const { url, locale = 'fr' } = params
  const text = locale === 'ar'
    ? 'إذا لم يعمل الزر، انسخ والصق هذا الرابط:'
    : 'Si le bouton ne fonctionne pas, copiez ce lien :'

  return `
    <p style="margin: 16px 0 8px; color: ${COLORS.textLight}; font-size: 12px; text-align: center;">
      ${text}
    </p>
    <p style="margin: 0; font-size: 12px; word-break: break-all; text-align: center;">
      <a href="${url}" style="color: ${COLORS.primary}; text-decoration: none;">${url}</a>
    </p>
  `
}

/**
 * Séparateur horizontal
 */
export function generateDivider(): string {
  return `<hr style="margin: 24px 0; border: none; border-top: 1px solid ${COLORS.border};">`
}

/**
 * Note/avertissement
 */
export function generateNote(params: {
  text: string
  locale?: EmailLocale
}): string {
  const { text } = params

  return `
    <p style="margin: 16px 0 0; padding: 12px 16px; background-color: ${COLORS.background}; border-radius: 6px; color: ${COLORS.textMuted}; font-size: 13px; line-height: 1.5;">
      ${text}
    </p>
  `
}

export { COLORS, APP_NAME, APP_URL }
