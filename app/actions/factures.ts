'use server'

import { createClient } from '@/lib/supabase/server'
import { factureSchema, type FactureFormData } from '@/lib/validations/facture'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { FacturePDF } from '@/lib/pdf/facture-pdf'
import { FactureEmailTemplate, FactureEmailText } from '@/lib/email/templates/facture-email'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function createFactureAction(formData: FactureFormData) {
  try {
    // Validation
    const validatedData = factureSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Générer le numéro de facture
    const currentYear = new Date().getFullYear()

    // Récupérer la dernière facture de l'année
    const { data: lastFacture } = await supabase
      .from('factures')
      .select('sequence')
      .eq('user_id', user.id)
      .eq('annee', currentYear)
      .order('sequence', { ascending: false })
      .limit(1)
      .single()

    const nextSequence = lastFacture ? lastFacture.sequence + 1 : 1
    const numeroFacture = `F${currentYear}${String(nextSequence).padStart(4, '0')}`

    // Calculer montants
    const montant_ht = validatedData.montant_ht
    const taux_tva = validatedData.taux_tva || 19
    const montant_tva = (montant_ht * taux_tva) / 100
    const montant_ttc = montant_ht + montant_tva

    // Préparer les données
    const factureData = {
      user_id: user.id,
      client_id: validatedData.client_id,
      dossier_id: validatedData.dossier_id || null,
      numero_facture: numeroFacture,
      annee: currentYear,
      sequence: nextSequence,
      montant_ht,
      taux_tva,
      montant_tva,
      montant_ttc,
      date_emission: validatedData.date_emission,
      date_echeance: validatedData.date_echeance || null,
      date_paiement: null,
      statut: validatedData.statut,
      objet: validatedData.objet,
      notes: validatedData.notes || null,
    }

    // Créer la facture
    const { data, error } = await supabase
      .from('factures')
      .insert(factureData)
      .select()
      .single()

    if (error) {
      console.error('Erreur création facture:', error)
      return { error: 'Erreur lors de la création de la facture' }
    }

    revalidatePath('/factures')
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateFactureAction(id: string, formData: Partial<FactureFormData>) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Recalculer les montants si montant_ht ou taux_tva changent
    let updateData: any = { ...formData }

    if (formData.montant_ht !== undefined || formData.taux_tva !== undefined) {
      const { data: currentFacture } = await supabase
        .from('factures')
        .select('montant_ht, taux_tva')
        .eq('id', id)
        .single()

      if (currentFacture) {
        const montant_ht = formData.montant_ht ?? currentFacture.montant_ht
        const taux_tva = formData.taux_tva ?? currentFacture.taux_tva
        const montant_tva = (montant_ht * taux_tva) / 100
        const montant_ttc = montant_ht + montant_tva

        updateData = {
          ...updateData,
          montant_tva,
          montant_ttc,
        }
      }
    }

    const { data, error } = await supabase
      .from('factures')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour facture:', error)
      return { error: 'Erreur lors de la mise à jour' }
    }

    revalidatePath('/factures')
    revalidatePath(`/factures/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function deleteFactureAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { error } = await supabase
      .from('factures')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Erreur suppression facture:', error)
      return { error: 'Erreur lors de la suppression' }
    }

    revalidatePath('/factures')
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function marquerFacturePayeeAction(id: string, datePaiement: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('factures')
      .update({
        statut: 'PAYEE',
        date_paiement: datePaiement,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Erreur marquage paiement:', error)
      return { error: 'Erreur lors du marquage comme payée' }
    }

    revalidatePath('/factures')
    revalidatePath(`/factures/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors du marquage comme payée' }
  }
}

export async function changerStatutFactureAction(id: string, statut: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('factures')
      .update({ statut })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Erreur changement statut:', error)
      return { error: 'Erreur lors du changement de statut' }
    }

    revalidatePath('/factures')
    revalidatePath(`/factures/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors du changement de statut' }
  }
}

export async function envoyerFactureEmailAction(factureId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer la facture avec les relations
    const { data: facture, error: factureError } = await supabase
      .from('factures')
      .select(
        `
        *,
        clients (
          id,
          nom,
          prenom,
          denomination,
          type,
          cin,
          adresse,
          ville,
          code_postal,
          telephone,
          email
        )
      `
      )
      .eq('id', factureId)
      .eq('user_id', user.id)
      .single()

    if (factureError || !facture) {
      return { error: 'Facture non trouvée' }
    }

    // Vérifier que le client a un email
    if (!facture.clients?.email) {
      return { error: 'Le client n\'a pas d\'adresse email' }
    }

    // Récupérer le profil de l'avocat
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { error: 'Profil avocat non trouvé' }
    }

    // Préparer les données pour le PDF
    const pdfData = {
      facture: {
        id: facture.id,
        numero_facture: facture.numero_facture,
        date_emission: facture.date_emission,
        date_echeance: facture.date_echeance,
        date_paiement: facture.date_paiement,
        montant_ht: parseFloat(facture.montant_ht),
        taux_tva: parseFloat(facture.taux_tva),
        montant_tva: parseFloat(facture.montant_tva),
        montant_ttc: parseFloat(facture.montant_ttc),
        statut: facture.statut,
        objet: facture.objet,
        notes: facture.notes,
      },
      client: {
        nom: facture.clients.nom,
        prenom: facture.clients.prenom,
        denomination: facture.clients.denomination,
        type: facture.clients.type,
        cin: facture.clients.cin,
        adresse: facture.clients.adresse,
        ville: facture.clients.ville,
        code_postal: facture.clients.code_postal,
        telephone: facture.clients.telephone,
        email: facture.clients.email,
      },
      avocat: {
        nom: profile.nom,
        prenom: profile.prenom,
        email: profile.email,
        telephone: profile.telephone,
        matricule_avocat: profile.matricule_avocat,
        barreau: profile.barreau,
      },
      cabinet: {
        nom: undefined,
        logo_url: undefined,
        rne: undefined,
      },
      langue: 'fr' as const,
    }

    // Générer le PDF
    const pdfBuffer = await renderToBuffer(React.createElement(FacturePDF, pdfData))

    // Préparer les données email
    const clientNom =
      facture.clients.type === 'PERSONNE_PHYSIQUE'
        ? `${facture.clients.nom} ${facture.clients.prenom || ''}`.trim()
        : facture.clients.denomination || facture.clients.nom

    const avocatNom = `${profile.prenom || ''} ${profile.nom}`.trim()

    const formatDate = (dateString: string) => {
      const date = new Date(dateString)
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    }

    const emailData = {
      factureNumero: facture.numero_facture,
      clientNom,
      montantTTC: `${parseFloat(facture.montant_ttc).toFixed(3)} TND`,
      dateEmission: formatDate(facture.date_emission),
      dateEcheance: facture.date_echeance ? formatDate(facture.date_echeance) : undefined,
      avocatNom,
      avocatEmail: profile.email,
      avocatTelephone: profile.telephone,
      langue: 'fr' as const,
    }

    // Envoyer l'email avec Resend
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `${avocatNom} <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
      to: [facture.clients.email],
      subject: `Facture ${facture.numero_facture}`,
      react: React.createElement(FactureEmailTemplate, emailData),
      text: FactureEmailText(emailData),
      attachments: [
        {
          filename: `facture-${facture.numero_facture}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (emailError) {
      console.error('Erreur envoi email:', emailError)
      return { error: 'Erreur lors de l\'envoi de l\'email' }
    }

    // Mettre à jour le statut de la facture si elle était en brouillon
    if (facture.statut === 'BROUILLON') {
      await supabase
        .from('factures')
        .update({ statut: 'ENVOYEE' })
        .eq('id', factureId)
        .eq('user_id', user.id)
    }

    revalidatePath('/factures')
    revalidatePath(`/factures/${factureId}`)

    return {
      success: true,
      message: `Email envoyé à ${facture.clients.email}`,
      emailId: emailResult?.id,
    }
  } catch (error) {
    console.error('Erreur envoi facture email:', error)
    return { error: 'Erreur lors de l\'envoi de l\'email' }
  }
}
