/**
 * Template email — Récapitulatif hebdomadaire
 * Envoyé chaque lundi matin à 8h
 *
 * Sections :
 *  1. Échéances semaine prochaine
 *  2. Factures à relancer (> 14 jours)
 *  3. Dossiers en retard (≥1 échéance dépassée)
 *  4. Résumé de la semaine écoulée
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

export interface WeeklyRecapData {
  avocatNom: string
  avocatPrenom?: string
  langue: 'fr' | 'ar'
  baseUrl?: string
  dateDebut: string   // ex: "lundi 3 mars 2026"
  dateFin: string     // ex: "dimanche 9 mars 2026"
  echeancesSemaine: Array<{ titre: string; date_echeance: string; dossier?: string }>
  facturesARelancer: Array<{ numero: string; montant_ttc: number; date_emission: string; client: string }>
  dossiersEnRetard: Array<{ numero: string; objet: string; nbEcheancesDepassees: number }>
  resumeSemaine: { nouveauxClients: number; dossiersOuverts: number; factures_emises: number; echeancesTerminees: number }
}

function wrap(content: string, locale: 'fr' | 'ar' = 'fr'): string {
  const isRTL = locale === 'ar'
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${locale === 'ar' ? 'ملخص الأسبوع' : 'Récapitulatif hebdomadaire'}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#1e3a8a);padding:28px 32px;text-align:${isRTL ? 'right' : 'left'};">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Qadhya</span>
              <span style="background:rgba(255,255,255,0.15);color:#fbbf24;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;">HEBDO</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;" dir="${isRTL ? 'rtl' : 'ltr'}">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              <a href="${APP_URL}/recap-semaine" style="color:#2563eb;text-decoration:none;">
                ${locale === 'ar' ? 'عرض الملخص عبر الإنترنت' : 'Voir le récapitulatif en ligne'}
              </a>
              &nbsp;•&nbsp;
              <a href="${APP_URL}/settings/notifications" style="color:#94a3b8;text-decoration:none;">
                ${locale === 'ar' ? 'إلغاء الاشتراك' : 'Se désabonner'}
              </a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">© ${new Date().getFullYear()} Qadhya</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function sectionHeader(title: string, emoji: string, isRTL = false): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
    <tr>
      <td style="border-left:${isRTL ? 'none' : '4px'} solid #1e40af;border-right:${isRTL ? '4px' : 'none'} solid #1e40af;
                 padding:8px 14px;background:#eff6ff;border-radius:4px;">
        <span style="font-size:14px;font-weight:700;color:#1e40af;">${emoji} ${title}</span>
      </td>
    </tr>
  </table>`
}

function table(rows: string, headers: string, isRTL = false): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin-bottom:20px;">
    <thead>
      <tr style="background:#f8fafc;">
        ${headers}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
}

function th(label: string): string {
  return `<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">${label}</th>`
}

function td(content: string, muted = false): string {
  return `<td style="padding:9px 10px;border-bottom:1px solid #f1f5f9;color:${muted ? '#94a3b8' : '#1e293b'};">${content}</td>`
}

function badge(text: string, color: string): string {
  return `<span style="background:${color}20;color:${color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;">${text}</span>`
}

function emptyRow(msg: string): string {
  return `<tr><td colspan="10" style="padding:14px 10px;color:#94a3b8;font-size:13px;font-style:italic;">${msg}</td></tr>`
}

// ─── Traductions ─────────────────────────────────────────────────────────────

const T = {
  fr: {
    greeting: (nom: string, prenom?: string) => `Bonjour ${prenom ? prenom + ' ' + nom : nom},`,
    intro: (debut: string, fin: string) => `Voici votre récapitulatif pour la semaine du <strong>${debut}</strong> au <strong>${fin}</strong>.`,
    section1: 'Échéances semaine prochaine',
    section2: 'Factures à relancer',
    section3: 'Dossiers en retard',
    section4: 'Semaine écoulée',
    thDate: 'Date',
    thTitre: 'Titre',
    thDossier: 'Dossier',
    thNumero: 'N°',
    thClient: 'Client',
    thMontant: 'Montant',
    thEmission: 'Émise le',
    thRetards: 'Échéances dépassées',
    thObjet: 'Objet',
    emptyEcheances: 'Aucune échéance cette semaine ✓',
    emptyFactures: 'Aucune facture en attente ✓',
    emptyDossiers: 'Aucun dossier en retard ✓',
    statNouveauxClients: (n: number) => `${n} nouveau${n > 1 ? 'x' : ''} client${n > 1 ? 's' : ''}`,
    statDossiers: (n: number) => `${n} dossier${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}`,
    statFactures: (n: number) => `${n} facture${n > 1 ? 's' : ''} émise${n > 1 ? 's' : ''}`,
    statEcheances: (n: number) => `${n} échéance${n > 1 ? 's' : ''} terminée${n > 1 ? 's' : ''}`,
    tnd: 'TND',
    retard: (n: number) => `${n} en retard`,
  },
  ar: {
    greeting: (nom: string, prenom?: string) => `مرحباً ${prenom ? prenom + ' ' + nom : nom}،`,
    intro: (debut: string, fin: string) => `هذا ملخصك للأسبوع من <strong>${debut}</strong> إلى <strong>${fin}</strong>.`,
    section1: 'مواعيد الأسبوع القادم',
    section2: 'الفواتير المستحقة',
    section3: 'الملفات المتأخرة',
    section4: 'ملخص الأسبوع الماضي',
    thDate: 'التاريخ',
    thTitre: 'العنوان',
    thDossier: 'الملف',
    thNumero: 'الرقم',
    thClient: 'العميل',
    thMontant: 'المبلغ',
    thEmission: 'تاريخ الإصدار',
    thRetards: 'مواعيد متأخرة',
    thObjet: 'الموضوع',
    emptyEcheances: 'لا توجد مواعيد هذا الأسبوع ✓',
    emptyFactures: 'لا توجد فواتير معلقة ✓',
    emptyDossiers: 'لا توجد ملفات متأخرة ✓',
    statNouveauxClients: (n: number) => `${n} عميل جديد`,
    statDossiers: (n: number) => `${n} ملف مفتوح`,
    statFactures: (n: number) => `${n} فاتورة صادرة`,
    statEcheances: (n: number) => `${n} موعد منجز`,
    tnd: 'د.ت',
    retard: (n: number) => `${n} متأخر`,
  },
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

export function getWeeklyRecapHtml(data: WeeklyRecapData): string {
  const { langue, avocatNom, avocatPrenom, dateDebut, dateFin,
          echeancesSemaine, facturesARelancer, dossiersEnRetard, resumeSemaine } = data
  const t = T[langue]
  const isRTL = langue === 'ar'

  // Section 1 : Échéances
  const rowsEcheances = echeancesSemaine.length === 0
    ? emptyRow(t.emptyEcheances)
    : echeancesSemaine.map(e => `<tr>
        ${td(`<strong>${e.date_echeance}</strong>`)}
        ${td(e.titre)}
        ${td(e.dossier || '—', !e.dossier)}
      </tr>`).join('')

  const tableEcheances = table(
    rowsEcheances,
    [th(t.thDate), th(t.thTitre), th(t.thDossier)].join(''),
    isRTL
  )

  // Section 2 : Factures
  const rowsFactures = facturesARelancer.length === 0
    ? emptyRow(t.emptyFactures)
    : facturesARelancer.map(f => `<tr>
        ${td(f.numero)}
        ${td(f.client)}
        ${td(`<strong style="color:#dc2626;">${f.montant_ttc.toFixed(3)} ${t.tnd}</strong>`)}
        ${td(f.date_emission, true)}
      </tr>`).join('')

  const tableFactures = table(
    rowsFactures,
    [th(t.thNumero), th(t.thClient), th(t.thMontant), th(t.thEmission)].join(''),
    isRTL
  )

  // Section 3 : Dossiers en retard
  const rowsDossiers = dossiersEnRetard.length === 0
    ? emptyRow(t.emptyDossiers)
    : dossiersEnRetard.map(d => `<tr>
        ${td(d.numero)}
        ${td(d.objet || '—', !d.objet)}
        ${td(badge(t.retard(d.nbEcheancesDepassees), '#dc2626'))}
      </tr>`).join('')

  const tableDossiers = table(
    rowsDossiers,
    [th(t.thNumero), th(t.thObjet), th(t.thRetards)].join(''),
    isRTL
  )

  // Section 4 : Résumé semaine
  const stats = [
    { label: t.statNouveauxClients(resumeSemaine.nouveauxClients), val: resumeSemaine.nouveauxClients, color: '#2563eb' },
    { label: t.statDossiers(resumeSemaine.dossiersOuverts), val: resumeSemaine.dossiersOuverts, color: '#7c3aed' },
    { label: t.statFactures(resumeSemaine.factures_emises), val: resumeSemaine.factures_emises, color: '#059669' },
    { label: t.statEcheances(resumeSemaine.echeancesTerminees), val: resumeSemaine.echeancesTerminees, color: '#d97706' },
  ]

  const statCells = stats.map(s => `
    <td width="25%" style="padding:4px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${s.color};">${s.val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${s.label}</div>
      </div>
    </td>`).join('')

  const tableStats = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>${statCells}</tr></table>`

  const content = `
    <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 4px;">${t.greeting(avocatNom, avocatPrenom)}</p>
    <p style="font-size:13px;color:#64748b;margin:0 0 24px;">${t.intro(dateDebut, dateFin)}</p>

    ${sectionHeader(t.section1, '📅', isRTL)}
    ${tableEcheances}

    ${sectionHeader(t.section2, '💰', isRTL)}
    ${tableFactures}

    ${sectionHeader(t.section3, '⚠️', isRTL)}
    ${tableDossiers}

    ${sectionHeader(t.section4, '✅', isRTL)}
    ${tableStats}
  `

  return wrap(content, langue)
}

// ─── TEXT ─────────────────────────────────────────────────────────────────────

export function getWeeklyRecapText(data: WeeklyRecapData): string {
  const { langue, avocatNom, avocatPrenom, dateDebut, dateFin,
          echeancesSemaine, facturesARelancer, dossiersEnRetard, resumeSemaine } = data
  const t = T[langue]
  const sep = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

  const lines: string[] = [
    t.greeting(avocatNom, avocatPrenom).replace(/<[^>]+>/g, ''),
    `Récapitulatif ${dateDebut} → ${dateFin}`,
    '',
    sep,
    `📅 ${t.section1}`,
    sep,
  ]

  if (echeancesSemaine.length === 0) {
    lines.push(t.emptyEcheances)
  } else {
    echeancesSemaine.forEach(e => {
      lines.push(`• ${e.date_echeance} — ${e.titre}${e.dossier ? ` (${e.dossier})` : ''}`)
    })
  }

  lines.push('', sep, `💰 ${t.section2}`, sep)

  if (facturesARelancer.length === 0) {
    lines.push(t.emptyFactures)
  } else {
    facturesARelancer.forEach(f => {
      lines.push(`• ${f.numero} — ${f.client} — ${f.montant_ttc.toFixed(3)} ${t.tnd} (émise le ${f.date_emission})`)
    })
  }

  lines.push('', sep, `⚠️ ${t.section3}`, sep)

  if (dossiersEnRetard.length === 0) {
    lines.push(t.emptyDossiers)
  } else {
    dossiersEnRetard.forEach(d => {
      lines.push(`• ${d.numero} — ${d.objet || '—'} (${t.retard(d.nbEcheancesDepassees)})`)
    })
  }

  lines.push('', sep, `✅ ${t.section4}`, sep)
  lines.push(
    `• ${t.statNouveauxClients(resumeSemaine.nouveauxClients)}`,
    `• ${t.statDossiers(resumeSemaine.dossiersOuverts)}`,
    `• ${t.statFactures(resumeSemaine.factures_emises)}`,
    `• ${t.statEcheances(resumeSemaine.echeancesTerminees)}`,
    '',
    `${APP_URL}/recap-semaine`,
  )

  return lines.join('\n')
}
