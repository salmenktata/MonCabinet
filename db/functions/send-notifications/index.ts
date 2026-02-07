// Edge Function: Notifications Email Quotidiennes
// Envoie un email récapitulatif quotidien avec échéances, actions urgentes, audiences et factures impayées
// Déclenchement: Cron quotidien 06:00 (heure Tunisie)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { renderToStaticMarkup } from 'https://esm.sh/react-dom@18.2.0/server'
import { createElement } from 'https://esm.sh/react@18.2.0'

// Types
interface NotificationPreferences {
  user_id: string
  email: string
  enabled: boolean
  daily_digest_enabled: boolean
  daily_digest_time: string
  alerte_j15_enabled: boolean
  alerte_j7_enabled: boolean
  alerte_j3_enabled: boolean
  alerte_j1_enabled: boolean
  alerte_actions_urgentes: boolean
  alerte_actions_priorite_haute: boolean
  alerte_audiences_semaine: boolean
  alerte_factures_impayees: boolean
  alerte_factures_impayees_delai_jours: number
  email_format: string
  langue_email: string
}

interface Echeance {
  id: string
  date: string
  type: string
  dossier_id: string
  dossier_numero: string
  dossier_objet: string
  jours_restants: number
}

interface ActionUrgente {
  id: string
  titre: string
  priorite: string
  dossier_id: string
  dossier_numero: string
  date_limite: string
}

interface Audience {
  id: string
  date: string
  heure: string
  tribunal: string
  dossier_id: string
  dossier_numero: string
  dossier_objet: string
}

interface FactureImpayee {
  id: string
  numero_facture: string
  client_nom: string
  montant_ttc: number
  date_echeance: string
  jours_retard: number
}

serve(async (req) => {
  try {
    // Vérifier authorization (secret pour cron jobs)
    const authHeader = req.headers.get('Authorization')
    const expectedAuth = Deno.env.get('CRON_SECRET')

    if (authHeader !== `Bearer ${expectedAuth}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialiser Supabase client avec service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Récupérer Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const baseUrl = Deno.env.get('BASE_URL') || 'https://avocat.tn'

    // 1. Récupérer tous les utilisateurs avec notifications quotidiennes activées
    const { data: users, error: usersError } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('enabled', true)
      .eq('daily_digest_enabled', true)

    if (usersError) {
      throw new Error(`Erreur récupération utilisateurs: ${usersError.message}`)
    }

    console.log(`Traitement de ${users?.length || 0} utilisateurs`)

    let emailsSent = 0
    let emailsFailed = 0

    // 2. Pour chaque utilisateur, récupérer données et envoyer email
    for (const user of users || []) {
      try {
        const userId = user.user_id

        // Récupérer profil avocat
        const { data: profile } = await supabase
          .from('profiles')
          .select('nom, prenom')
          .eq('id', userId)
          .single()

        if (!profile) continue

        // Récupérer échéances (J-15, J-7, J-3, J-1)
        const echeances: Echeance[] = []

        const joursAlerte = [
          { jours: 15, enabled: user.alerte_j15_enabled },
          { jours: 7, enabled: user.alerte_j7_enabled },
          { jours: 3, enabled: user.alerte_j3_enabled },
          { jours: 1, enabled: user.alerte_j1_enabled },
        ]

        for (const alerte of joursAlerte) {
          if (!alerte.enabled) continue

          const { data: echeancesData } = await supabase
            .from('echeances')
            .select(`
              id,
              date,
              type,
              dossier_id,
              dossiers (
                numero_dossier,
                objet
              )
            `)
            .eq('user_id', userId)
            .eq('statut', 'en_cours')
            .gte('date', new Date().toISOString())
            .lte('date', new Date(Date.now() + alerte.jours * 24 * 60 * 60 * 1000).toISOString())
            .order('date', { ascending: true })

          if (echeancesData) {
            echeancesData.forEach((e: any) => {
              const dateEcheance = new Date(e.date)
              const joursRestants = Math.ceil((dateEcheance.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

              echeances.push({
                id: e.dossier_id,
                date: new Date(e.date).toLocaleDateString('fr-FR'),
                type: e.type,
                dossier_id: e.dossier_id,
                dossier_numero: e.dossiers?.numero_dossier || '',
                dossier_objet: e.dossiers?.objet || '',
                jours_restants: joursRestants,
              })
            })
          }
        }

        // Récupérer actions urgentes/prioritaires
        const actionsUrgentes: ActionUrgente[] = []

        const priorites = []
        if (user.alerte_actions_urgentes) priorites.push('URGENTE')
        if (user.alerte_actions_priorite_haute) priorites.push('HAUTE')

        if (priorites.length > 0) {
          const { data: actionsData } = await supabase
            .from('actions')
            .select(`
              id,
              titre,
              priorite,
              date_limite,
              dossier_id,
              dossiers (
                numero_dossier
              )
            `)
            .eq('user_id', userId)
            .eq('statut', 'en_cours')
            .in('priorite', priorites)
            .order('date_limite', { ascending: true })
            .limit(10)

          if (actionsData) {
            actionsData.forEach((a: any) => {
              actionsUrgentes.push({
                id: a.dossier_id,
                titre: a.titre,
                priorite: a.priorite,
                dossier_id: a.dossier_id,
                dossier_numero: a.dossiers?.numero_dossier || '',
                date_limite: a.date_limite ? new Date(a.date_limite).toLocaleDateString('fr-FR') : '',
              })
            })
          }
        }

        // Récupérer audiences de la semaine
        const audiences: Audience[] = []

        if (user.alerte_audiences_semaine) {
          const aujourd = new Date()
          const dansSeptJours = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

          const { data: audiencesData } = await supabase
            .from('audiences')
            .select(`
              id,
              date,
              heure,
              tribunal,
              dossier_id,
              dossiers (
                numero_dossier,
                objet
              )
            `)
            .eq('user_id', userId)
            .gte('date', aujourd.toISOString().split('T')[0])
            .lte('date', dansSeptJours.toISOString().split('T')[0])
            .order('date', { ascending: true })

          if (audiencesData) {
            audiencesData.forEach((aud: any) => {
              audiences.push({
                id: aud.dossier_id,
                date: new Date(aud.date).toLocaleDateString('fr-FR'),
                heure: aud.heure || '',
                tribunal: aud.tribunal || '',
                dossier_id: aud.dossier_id,
                dossier_numero: aud.dossiers?.numero_dossier || '',
                dossier_objet: aud.dossiers?.objet || '',
              })
            })
          }
        }

        // Récupérer factures impayées
        const facturesImpayees: FactureImpayee[] = []

        if (user.alerte_factures_impayees) {
          const delaiJours = user.alerte_factures_impayees_delai_jours || 30
          const dateSeuilRetard = new Date(Date.now() - delaiJours * 24 * 60 * 60 * 1000)

          const { data: facturesData } = await supabase
            .from('factures')
            .select(`
              id,
              numero_facture,
              montant_ttc,
              date_echeance,
              clients (
                nom,
                prenom,
                denomination
              )
            `)
            .eq('user_id', userId)
            .eq('statut', 'IMPAYEE')
            .lte('date_echeance', dateSeuilRetard.toISOString())
            .order('date_echeance', { ascending: true })
            .limit(10)

          if (facturesData) {
            facturesData.forEach((f: any) => {
              const clientNom = f.clients?.denomination ||
                               `${f.clients?.nom || ''} ${f.clients?.prenom || ''}`.trim()
              const joursRetard = Math.ceil((Date.now() - new Date(f.date_echeance).getTime()) / (1000 * 60 * 60 * 24))

              facturesImpayees.push({
                id: f.id,
                numero_facture: f.numero_facture,
                client_nom: clientNom,
                montant_ttc: parseFloat(f.montant_ttc).toFixed(3) + ' TND',
                date_echeance: new Date(f.date_echeance).toLocaleDateString('fr-FR'),
                jours_retard: joursRetard,
              })
            })
          }
        }

        // Si aucune donnée à envoyer, passer au suivant
        if (
          echeances.length === 0 &&
          actionsUrgentes.length === 0 &&
          audiences.length === 0 &&
          facturesImpayees.length === 0
        ) {
          console.log(`Aucune donnée à envoyer pour ${user.email}`)
          continue
        }

        // Préparer données email
        const dateAujourdhui = new Date().toLocaleDateString(
          user.langue_email === 'ar' ? 'ar-TN' : 'fr-FR',
          { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
        )

        // Générer contenu email (HTML ou texte selon préférence)
        let emailHtml = ''
        let emailText = ''

        if (user.email_format === 'html') {
          // Utiliser le template React (simplifié ici pour Deno)
          emailHtml = generateHtmlEmail({
            avocatNom: profile.nom,
            avocatPrenom: profile.prenom,
            dateAujourdhui,
            echeances,
            actionsUrgentes,
            audiences,
            facturesImpayees,
            langue: user.langue_email,
            baseUrl,
          })
        } else {
          emailText = generateTextEmail({
            avocatNom: profile.nom,
            avocatPrenom: profile.prenom,
            dateAujourdhui,
            echeances,
            actionsUrgentes,
            audiences,
            facturesImpayees,
            langue: user.langue_email,
            baseUrl,
          })
        }

        // Envoyer email via Resend
        const emailPayload = {
          from: 'Avocat SaaS <notifications@avocat.tn>',
          to: [user.email],
          subject: user.langue_email === 'ar'
            ? 'ملخصك اليومي - Avocat SaaS'
            : 'Votre récapitulatif quotidien - Avocat SaaS',
          html: emailHtml || undefined,
          text: emailText || undefined,
        }

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailPayload),
        })

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text()
          console.error(`Erreur envoi email à ${user.email}: ${errorText}`)
          emailsFailed++
        } else {
          console.log(`Email envoyé avec succès à ${user.email}`)
          emailsSent++
        }

      } catch (userError) {
        console.error(`Erreur traitement utilisateur ${user.email}:`, userError)
        emailsFailed++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notifications envoyées',
        stats: {
          total_users: users?.length || 0,
          emails_sent: emailsSent,
          emails_failed: emailsFailed,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erreur globale:', error)
    return new Response(
      JSON.stringify({
        error: 'Erreur interne',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Fonction génération email HTML (version simplifiée inline)
function generateHtmlEmail(data: any): string {
  const t = data.langue === 'ar' ? {
    title: 'ملخصك اليومي',
    greeting: 'مرحبا',
    echeances_title: 'المواعيد النهائية',
    actions_title: 'الإجراءات العاجلة',
    audiences_title: 'الجلسات',
    factures_title: 'الفواتير غير المدفوعة',
  } : {
    title: 'Votre récapitulatif quotidien',
    greeting: 'Bonjour',
    echeances_title: 'Échéances à surveiller',
    actions_title: 'Actions urgentes',
    audiences_title: 'Audiences de la semaine',
    factures_title: 'Factures impayées',
  }

  const dir = data.langue === 'ar' ? 'rtl' : 'ltr'
  const nomComplet = data.avocatPrenom ? `${data.avocatPrenom} ${data.avocatNom}` : data.avocatNom

  return `
    <!DOCTYPE html>
    <html dir="${dir}">
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #2563eb, #1e40af); padding: 40px; color: #fff;">
          <h1 style="margin: 0 0 10px 0; font-size: 28px;">${t.title}</h1>
          <p style="margin: 0; opacity: 0.9;">${data.dateAujourdhui}</p>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 18px; font-weight: 600; margin: 0 0 10px 0;">${t.greeting} ${nomComplet},</p>

          ${data.echeances.length > 0 ? `
            <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.echeances_title}</h2>
            ${data.echeances.map((e: Echeance) => `
              <div style="background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px;">
                <strong>${e.type}</strong><br>
                <span style="color: #666;">${e.dossier_objet}</span><br>
                <span style="color: #999; font-size: 12px;">${e.dossier_numero} • ${e.date}</span><br>
                <span style="color: #dc2626; font-weight: 600;">${e.jours_restants} jours restants</span>
              </div>
            `).join('')}
          ` : ''}

          ${data.actionsUrgentes.length > 0 ? `
            <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.actions_title}</h2>
            ${data.actionsUrgentes.map((a: ActionUrgente) => `
              <div style="background: #fef2f2; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #dc2626;">
                <strong>${a.titre}</strong><br>
                <span style="color: #dc2626;">Priorité: ${a.priorite}</span><br>
                <span style="color: #999; font-size: 12px;">${a.dossier_numero}</span>
              </div>
            `).join('')}
          ` : ''}

          ${data.audiences.length > 0 ? `
            <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.audiences_title}</h2>
            ${data.audiences.map((aud: Audience) => `
              <div style="background: #eff6ff; padding: 15px; margin: 10px 0; border-radius: 6px;">
                <strong>${aud.date} à ${aud.heure}</strong><br>
                <span style="color: #666;">${aud.tribunal}</span><br>
                <span style="color: #999; font-size: 12px;">${aud.dossier_numero}</span>
              </div>
            `).join('')}
          ` : ''}

          ${data.facturesImpayees.length > 0 ? `
            <h2 style="font-size: 20px; margin: 20px 0 10px 0;">${t.factures_title}</h2>
            ${data.facturesImpayees.map((f: FactureImpayee) => `
              <div style="background: #fefce8; padding: 15px; margin: 10px 0; border-radius: 6px;">
                <strong>${f.numero_facture}</strong><br>
                <span style="color: #666;">${f.client_nom} • ${f.montant_ttc}</span><br>
                <span style="color: #dc2626; font-weight: 600;">${f.jours_retard} jours de retard</span>
              </div>
            `).join('')}
          ` : ''}
        </div>
        <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <a href="${data.baseUrl}/parametres/notifications" style="color: #2563eb; text-decoration: none;">Gérer mes préférences</a>
        </div>
      </div>
    </body>
    </html>
  `
}

// Fonction génération email texte brut
function generateTextEmail(data: any): string {
  const t = data.langue === 'ar' ? {
    title: 'ملخصك اليومي',
    greeting: 'مرحبا',
  } : {
    title: 'Votre récapitulatif quotidien',
    greeting: 'Bonjour',
  }

  const nomComplet = data.avocatPrenom ? `${data.avocatPrenom} ${data.avocatNom}` : data.avocatNom

  let text = `${t.title}\n${data.dateAujourdhui}\n\n`
  text += `${t.greeting} ${nomComplet},\n\n`

  if (data.echeances.length > 0) {
    text += `═══ ÉCHÉANCES ═══\n\n`
    data.echeances.forEach((e: Echeance) => {
      text += `${e.type}\n`
      text += `  ${e.dossier_objet}\n`
      text += `  ${e.dossier_numero} • ${e.date}\n`
      text += `  ${e.jours_restants} jours restants\n\n`
    })
  }

  if (data.actionsUrgentes.length > 0) {
    text += `═══ ACTIONS URGENTES ═══\n\n`
    data.actionsUrgentes.forEach((a: ActionUrgente) => {
      text += `${a.titre}\n`
      text += `  Priorité: ${a.priorite}\n`
      text += `  ${a.dossier_numero}\n\n`
    })
  }

  if (data.audiences.length > 0) {
    text += `═══ AUDIENCES ═══\n\n`
    data.audiences.forEach((aud: Audience) => {
      text += `${aud.date} à ${aud.heure}\n`
      text += `  ${aud.tribunal}\n`
      text += `  ${aud.dossier_numero}\n\n`
    })
  }

  if (data.facturesImpayees.length > 0) {
    text += `═══ FACTURES IMPAYÉES ═══\n\n`
    data.facturesImpayees.forEach((f: FactureImpayee) => {
      text += `${f.numero_facture}\n`
      text += `  ${f.client_nom} • ${f.montant_ttc}\n`
      text += `  ${f.jours_retard} jours de retard\n\n`
    })
  }

  text += `\nGérer mes préférences: ${data.baseUrl}/parametres/notifications\n`

  return text
}
