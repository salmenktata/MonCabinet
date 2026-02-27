/**
 * Template Email — Rappel d'Échéances
 * Envoyé chaque matin pour les échéances J-15, J-7, J-3, J-1
 */

import { generateBaseTemplate } from './base-template'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EcheanceReminderItem {
  titre: string
  date_echeance: string   // "DD/MM/YYYY"
  jours_restants: number  // 1, 3, 7, 15
  type_echeance: 'audience' | 'delai_legal' | 'delai_interne' | 'autre'
  dossier_numero?: string
  dossier_objet?: string
  dossier_id?: string
}

export interface EcheanceReminderData {
  avocatNom: string
  avocatPrenom?: string
  langue: 'fr' | 'ar'
  echeances: EcheanceReminderItem[]
}

// ─── Traductions ──────────────────────────────────────────────────────────────

const T = {
  fr: {
    subject: (n: number) => n === 1 ? `Rappel : 1 échéance à venir` : `Rappel : ${n} échéances à venir`,
    greeting: (nom: string, prenom?: string) => `Bonjour ${prenom ? prenom + ' ' : ''}${nom},`,
    intro: (n: number) => n === 1
      ? `Vous avez <strong>1 échéance</strong> qui approche. Voici le rappel pour aujourd'hui :`
      : `Vous avez <strong>${n} échéances</strong> qui approchent. Voici les rappels pour aujourd'hui :`,
    jours: (j: number) => j === 1 ? 'Demain' : j === 0 ? "Aujourd'hui" : `Dans ${j} jours`,
    types: {
      audience: '🏛 Audience',
      delai_legal: '⚖️ Délai légal',
      delai_interne: '📋 Délai interne',
      autre: '📌 Autre',
    },
    dossier: 'Dossier',
    cta: 'Voir mon agenda',
    footer: 'Pour gérer vos préférences de rappel, rendez-vous dans',
    settings: 'Paramètres → Notifications',
  },
  ar: {
    subject: (n: number) => n === 1 ? `تذكير : موعد قادم` : `تذكير : ${n} مواعيد قادمة`,
    greeting: (nom: string, prenom?: string) => `مرحباً ${prenom ? prenom + ' ' : ''}${nom}،`,
    intro: (n: number) => n === 1
      ? `لديك <strong>موعد واحد</strong> قادم. إليك التذكير لهذا اليوم :`
      : `لديك <strong>${n} مواعيد</strong> قادمة. إليك التذكيرات لهذا اليوم :`,
    jours: (j: number) => j === 1 ? 'غداً' : j === 0 ? 'اليوم' : `خلال ${j} أيام`,
    types: {
      audience: '🏛 جلسة',
      delai_legal: '⚖️ أجل قانوني',
      delai_interne: '📋 أجل داخلي',
      autre: '📌 آخر',
    },
    dossier: 'الملف',
    cta: 'عرض الأجندة',
    footer: 'لإدارة تفضيلات التذكير، انتقل إلى',
    settings: 'الإعدادات ← الإشعارات',
  },
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function urgencyColor(jours: number): string {
  if (jours <= 1) return '#ef4444'   // rouge
  if (jours <= 3) return '#f97316'   // orange
  if (jours <= 7) return '#eab308'   // jaune
  return '#3b82f6'                    // bleu
}

export function getEcheanceReminderHtml(data: EcheanceReminderData): string {
  const t = data.langue === 'ar' ? T.ar : T.fr
  const dir = data.langue === 'ar' ? 'rtl' : 'ltr'

  const rows = data.echeances.map(e => {
    const color = urgencyColor(e.jours_restants)
    const typeLabel = t.types[e.type_echeance] ?? e.type_echeance
    const joursLabel = t.jours(e.jours_restants)
    const dossierInfo = e.dossier_numero
      ? `<br><span style="color:#64748b;font-size:12px;">${t.dossier} ${e.dossier_numero}${e.dossier_objet ? ' — ' + e.dossier_objet : ''}</span>`
      : ''

    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <span style="font-weight:600;color:#1e293b;">${e.titre}</span>
          ${dossierInfo}
          <br><span style="color:#64748b;font-size:12px;">${typeLabel}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap;vertical-align:top;">
          <span style="color:#64748b;font-size:13px;">${e.date_echeance}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:top;">
          <span style="display:inline-block;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;white-space:nowrap;">
            ${joursLabel}
          </span>
        </td>
      </tr>`
  }).join('')

  const content = `
    <p style="margin:0 0 8px;color:#64748b;font-size:14px;">${t.greeting(data.avocatNom, data.avocatPrenom)}</p>
    <p style="margin:0 0 20px;color:#1e293b;font-size:15px;">${t.intro(data.echeances.length)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;" dir="${dir}">
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/agenda" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        ${t.cta}
      </a>
    </div>

    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
      ${t.footer} <a href="${APP_URL}/parametres/notifications" style="color:#64748b;">${t.settings}</a>
    </p>
  `

  return generateBaseTemplate({
    locale: data.langue,
    content,
    recipientEmail: '',
    preheader: t.subject(data.echeances.length),
  })
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function getEcheanceReminderText(data: EcheanceReminderData): string {
  const t = data.langue === 'ar' ? T.ar : T.fr

  const lines = [
    t.greeting(data.avocatNom, data.avocatPrenom),
    '',
    t.intro(data.echeances.length).replace(/<[^>]+>/g, ''),
    '',
    ...data.echeances.map(e => {
      const type = t.types[e.type_echeance] ?? e.type_echeance
      const dossier = e.dossier_numero ? ` | ${t.dossier}: ${e.dossier_numero}` : ''
      return `• ${e.titre} — ${e.date_echeance} (${t.jours(e.jours_restants)}) | ${type}${dossier}`
    }),
    '',
    `${t.cta}: ${APP_URL}/agenda`,
  ]

  return lines.join('\n')
}

// ─── Subject helper ───────────────────────────────────────────────────────────

export function getEcheanceReminderSubject(data: EcheanceReminderData): string {
  const t = data.langue === 'ar' ? T.ar : T.fr
  return t.subject(data.echeances.length)
}
