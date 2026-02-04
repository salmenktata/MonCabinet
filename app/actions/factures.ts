'use server'

import { createClient } from '@/lib/supabase/server'
import { factureSchema, type FactureFormData } from '@/lib/validations/facture'
import { revalidatePath } from 'next/cache'

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
