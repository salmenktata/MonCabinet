import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://avocat-saas.tn'

interface NotificationData {
  userId: string
  email: string
  nom: string
  prenom: string
  langue: 'fr' | 'ar'
}

serve(async (req) => {
  try {
    // Initialiser le client Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Récupérer tous les utilisateurs avec notifications activées
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, nom, prenom, notification_preferences')
      .not('email', 'is', null)

    if (usersError) {
      throw new Error(`Erreur récupération utilisateurs: ${usersError.message}`)
    }

    console.log(`[Notifications] ${users?.length || 0} utilisateurs trouvés`)

    const results = {
      success: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    }

    // Traiter chaque utilisateur
    for (const user of users || []) {
      try {
        // Vérifier préférences (par défaut activé si pas de préférences)
        const prefs = user.notification_preferences || {}
        if (prefs.enabled === false) {
          results.skipped++
          results.details.push({
            userId: user.id,
            status: 'skipped',
            reason: 'notifications désactivées',
          })
          continue
        }

        const langue = prefs.langue_email || 'fr'

        // Récupérer échéances (J-15, J-7, J-3, J-1)
        const today = new Date()
        const dates = [1, 3, 7, 15].map((jours) => {
          const date = new Date(today)
          date.setDate(date.getDate() + jours)
          return date.toISOString().split('T')[0]
        })

        const { data: echeances } = await supabase
          .from('echeances')
          .select(
            `
            id,
            date,
            type,
            dossiers (
              numero_dossier,
              objet
            )
          `
          )
          .eq('user_id', user.id)
          .in('date', dates)
          .eq('statut', 'EN_ATTENTE')
          .order('date', { ascending: true })

        // Récupérer actions urgentes (priorité HAUTE ou URGENTE)
        const { data: actions } = await supabase
          .from('actions')
          .select(
            `
            id,
            titre,
            priorite,
            date_limite,
            dossiers (
              numero_dossier
            )
          `
          )
          .eq('user_id', user.id)
          .in('priorite', ['HAUTE', 'URGENTE'])
          .eq('statut', 'EN_ATTENTE')
          .order('date_limite', { ascending: true })
          .limit(10)

        // Récupérer audiences de la semaine
        const startOfWeek = new Date(today)
        startOfWeek.setDate(today.getDate() - today.getDay() + 1) // Lundi
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6) // Dimanche

        const { data: audiences } = await supabase
          .from('audiences')
          .select(
            `
            id,
            date,
            heure,
            tribunal,
            dossiers (
              numero_dossier,
              objet
            )
          `
          )
          .eq('user_id', user.id)
          .gte('date', startOfWeek.toISOString().split('T')[0])
          .lte('date', endOfWeek.toISOString().split('T')[0])
          .order('date', { ascending: true })
          .order('heure', { ascending: true })

        // Récupérer factures impayées > 30 jours (ou seuil personnalisé)
        const seuilJours = prefs.factures_seuil_jours || 30
        const dateSeuilFactures = new Date(today)
        dateSeuilFactures.setDate(today.getDate() - seuilJours)

        const { data: facturesImpayees } = await supabase
          .from('factures')
          .select(
            `
            id,
            numero_facture,
            montant_ttc,
            date_echeance,
            clients (
              nom,
              prenom,
              denomination,
              type
            )
          `
          )
          .eq('user_id', user.id)
          .eq('statut', 'ENVOYEE')
          .lte('date_echeance', dateSeuilFactures.toISOString().split('T')[0])
          .order('date_echeance', { ascending: true })
          .limit(10)

        // Si aucune donnée à notifier, passer
        if (
          (!echeances || echeances.length === 0) &&
          (!actions || actions.length === 0) &&
          (!audiences || audiences.length === 0) &&
          (!facturesImpayees || facturesImpayees.length === 0)
        ) {
          results.skipped++
          results.details.push({
            userId: user.id,
            status: 'skipped',
            reason: 'aucune donnée à notifier',
          })
          continue
        }

        // Préparer données email
        const emailData = {
          avocatNom: user.nom,
          avocatPrenom: user.prenom,
          dateAujourdhui: formatDate(today, langue),
          echeances: (echeances || []).map((e: any) => ({
            id: e.id,
            date: formatDate(new Date(e.date), langue),
            type: e.type,
            dossier_numero: e.dossiers?.numero_dossier || '',
            dossier_objet: e.dossiers?.objet || '',
            jours_restants: Math.ceil(
              (new Date(e.date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
          actionsUrgentes: (actions || []).map((a: any) => ({
            id: a.id,
            titre: a.titre,
            priorite: a.priorite,
            dossier_numero: a.dossiers?.numero_dossier || '',
            date_limite: a.date_limite ? formatDate(new Date(a.date_limite), langue) : '',
          })),
          audiences: (audiences || []).map((a: any) => ({
            id: a.id,
            date: formatDate(new Date(a.date), langue),
            heure: a.heure || '',
            tribunal: a.tribunal || '',
            dossier_numero: a.dossiers?.numero_dossier || '',
            dossier_objet: a.dossiers?.objet || '',
          })),
          facturesImpayees: (facturesImpayees || []).map((f: any) => {
            const clientNom =
              f.clients?.type === 'PERSONNE_PHYSIQUE'
                ? `${f.clients.nom} ${f.clients.prenom || ''}`.trim()
                : f.clients?.denomination || f.clients?.nom
            const joursRetard = Math.ceil(
              (today.getTime() - new Date(f.date_echeance).getTime()) / (1000 * 60 * 60 * 24)
            )
            return {
              id: f.id,
              numero_facture: f.numero_facture,
              client_nom: clientNom,
              montant_ttc: `${parseFloat(f.montant_ttc).toFixed(3)} TND`,
              date_echeance: formatDate(new Date(f.date_echeance), langue),
              jours_retard: joursRetard,
            }
          }),
          langue,
          baseUrl: BASE_URL,
        }

        // Générer HTML et texte (simulé ici - à adapter avec vos templates)
        const htmlContent = generateHTMLEmail(emailData)
        const textContent = generateTextEmail(emailData)

        // Envoyer email via Resend
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Avocat SaaS <notifications@avocat-saas.tn>',
            to: [user.email],
            subject:
              langue === 'fr'
                ? `Votre récapitulatif quotidien - ${formatDate(today, langue)}`
                : `ملخصك اليومي - ${formatDate(today, langue)}`,
            html: htmlContent,
            text: textContent,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
        }

        const emailResult = await response.json()

        // Logger succès
        await supabase.from('notification_logs').insert({
          user_id: user.id,
          type: 'daily_digest',
          status: 'success',
          email_id: emailResult.id,
          data: {
            echeances_count: emailData.echeances.length,
            actions_count: emailData.actionsUrgentes.length,
            audiences_count: emailData.audiences.length,
            factures_count: emailData.facturesImpayees.length,
          },
        })

        results.success++
        results.details.push({
          userId: user.id,
          status: 'success',
          emailId: emailResult.id,
        })

        console.log(`[Notifications] Email envoyé avec succès à ${user.email}`)
      } catch (error: any) {
        // Logger erreur
        await supabase.from('notification_logs').insert({
          user_id: user.id,
          type: 'daily_digest',
          status: 'error',
          error_message: error.message,
        })

        results.errors++
        results.details.push({
          userId: user.id,
          status: 'error',
          error: error.message,
        })

        console.error(`[Notifications] Erreur pour ${user.email}:`, error)
      }
    }

    console.log(`[Notifications] Résumé: ${results.success} succès, ${results.skipped} ignorés, ${results.errors} erreurs`)

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[Notifications] Erreur globale:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: 0,
        errors: 1,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})

// Fonctions utilitaires
function formatDate(date: Date, langue: 'fr' | 'ar'): string {
  if (langue === 'ar') {
    // Format arabe (à améliorer avec localisation complète)
    const day = date.getDate()
    const monthsAr = [
      'يناير',
      'فيفري',
      'مارس',
      'أفريل',
      'ماي',
      'جوان',
      'جويلية',
      'أوت',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ]
    const month = monthsAr[date.getMonth()]
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  } else {
    // Format français
    const monthsFr = [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre',
    ]
    const day = date.getDate()
    const month = monthsFr[date.getMonth()]
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }
}

// Génération HTML (simplifié - à remplacer par votre template React)
function generateHTMLEmail(data: any): string {
  // TODO: Utiliser le template daily-digest.tsx
  // Pour l'instant, HTML simple
  const t = data.langue === 'fr' ? {
    title: 'Votre récapitulatif quotidien',
    greeting: 'Bonjour',
    echeances: 'Échéances à surveiller',
    actions: 'Actions urgentes',
    audiences: 'Audiences de la semaine',
    factures: 'Factures impayées',
    empty: 'Aucun élément',
  } : {
    title: 'ملخصك اليومي',
    greeting: 'مرحبا',
    echeances: 'المواعيد النهائية المهمة',
    actions: 'الإجراءات العاجلة',
    audiences: 'جلسات هذا الأسبوع',
    factures: 'الفواتير غير المدفوعة',
    empty: 'لا توجد عناصر',
  }

  let html = `
    <!DOCTYPE html>
    <html dir="${data.langue === 'ar' ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 40px; color: white;">
          <h1 style="margin: 0; font-size: 28px;">${t.title}</h1>
          <p style="margin: 10px 0 0 0; color: #dbeafe;">${data.dateAujourdhui}</p>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">
            ${t.greeting} ${data.avocatPrenom || ''} ${data.avocatNom},
          </p>
  `

  // Échéances
  if (data.echeances.length > 0) {
    html += `
      <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.echeances}</h2>
      <div style="background: #f9fafb; padding: 15px; border-radius: 6px;">
    `
    data.echeances.forEach((e: any) => {
      const urgencyColor =
        e.jours_restants <= 1 ? '#dc2626' : e.jours_restants <= 3 ? '#f59e0b' : e.jours_restants <= 7 ? '#eab308' : '#3b82f6'
      html += `
        <div style="margin-bottom: 10px; padding: 10px; border-left: 4px solid ${urgencyColor}; background: white;">
          <strong>${e.type}</strong><br>
          ${e.dossier_objet} (${e.dossier_numero})<br>
          <small style="color: ${urgencyColor};">${e.jours_restants} jours restants • ${e.date}</small>
        </div>
      `
    })
    html += `</div>`
  }

  // Actions urgentes
  if (data.actionsUrgentes.length > 0) {
    html += `
      <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.actions}</h2>
      <div style="background: #fef2f2; padding: 15px; border-radius: 6px;">
    `
    data.actionsUrgentes.forEach((a: any) => {
      html += `
        <div style="margin-bottom: 10px; padding: 10px; border-left: 4px solid #dc2626; background: white;">
          <strong>${a.titre}</strong><br>
          ${a.dossier_numero} • Priorité ${a.priorite}<br>
          <small>${a.date_limite}</small>
        </div>
      `
    })
    html += `</div>`
  }

  // Audiences
  if (data.audiences.length > 0) {
    html += `
      <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.audiences}</h2>
      <div style="background: #eff6ff; padding: 15px; border-radius: 6px;">
    `
    data.audiences.forEach((a: any) => {
      html += `
        <div style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 4px;">
          <strong>${a.date} à ${a.heure}</strong><br>
          ${a.tribunal}<br>
          <small>${a.dossier_numero} • ${a.dossier_objet}</small>
        </div>
      `
    })
    html += `</div>`
  }

  // Factures impayées
  if (data.facturesImpayees.length > 0) {
    html += `
      <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.factures}</h2>
      <div style="background: #fefce8; padding: 15px; border-radius: 6px;">
    `
    data.facturesImpayees.forEach((f: any) => {
      html += `
        <div style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 4px;">
          <strong>${f.numero_facture}</strong><br>
          ${f.client_nom} • ${f.montant_ttc}<br>
          <small style="color: #dc2626;">${f.jours_retard} jours de retard</small>
        </div>
      `
    })
    html += `</div>`
  }

  html += `
          <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="font-size: 12px; color: #6b7280;">
              Vous recevez cet email car vous avez activé les notifications quotidiennes.
            </p>
            <a href="${data.baseUrl}/parametres/notifications"
               style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
              Gérer mes préférences
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  return html
}

// Génération texte
function generateTextEmail(data: any): string {
  const t = data.langue === 'fr' ? {
    title: 'Votre récapitulatif quotidien',
    greeting: 'Bonjour',
    echeances: 'Échéances à surveiller',
    actions: 'Actions urgentes',
    audiences: 'Audiences de la semaine',
    factures: 'Factures impayées',
  } : {
    title: 'ملخصك اليومي',
    greeting: 'مرحبا',
    echeances: 'المواعيد النهائية المهمة',
    actions: 'الإجراءات العاجلة',
    audiences: 'جلسات هذا الأسبوع',
    factures: 'الفواتير غير المدفوعة',
  }

  let text = `${t.title}\n${data.dateAujourdhui}\n\n`
  text += `${t.greeting} ${data.avocatPrenom || ''} ${data.avocatNom},\n\n`

  if (data.echeances.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    text += `${t.echeances}\n`
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    data.echeances.forEach((e: any) => {
      text += `${e.type}\n`
      text += `  ${e.dossier_objet} (${e.dossier_numero})\n`
      text += `  ${e.jours_restants} jours restants • ${e.date}\n\n`
    })
  }

  if (data.actionsUrgentes.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    text += `${t.actions}\n`
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    data.actionsUrgentes.forEach((a: any) => {
      text += `${a.titre}\n`
      text += `  ${a.dossier_numero} • Priorité ${a.priorite}\n`
      text += `  ${a.date_limite}\n\n`
    })
  }

  if (data.audiences.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    text += `${t.audiences}\n`
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    data.audiences.forEach((a: any) => {
      text += `${a.date} à ${a.heure}\n`
      text += `  ${a.tribunal}\n`
      text += `  ${a.dossier_numero} • ${a.dossier_objet}\n\n`
    })
  }

  if (data.facturesImpayees.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    text += `${t.factures}\n`
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    data.facturesImpayees.forEach((f: any) => {
      text += `${f.numero_facture}\n`
      text += `  ${f.client_nom} • ${f.montant_ttc}\n`
      text += `  ${f.jours_retard} jours de retard\n\n`
    })
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
  text += `Gérer mes préférences: ${data.baseUrl}/parametres/notifications\n`

  return text
}
