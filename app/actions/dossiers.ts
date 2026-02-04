'use server'

import { createClient } from '@/lib/supabase/server'
import { dossierSchema, type DossierFormData } from '@/lib/validations/dossier'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createDossierAction(formData: DossierFormData) {
  try {
    // Validation
    const validatedData = dossierSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Préparer les données
    const dossierData = {
      user_id: user.id,
      ...validatedData,
      montant_litige: validatedData.montant_litige || null,
      date_ouverture: validatedData.date_ouverture || new Date().toISOString().split('T')[0],
      workflow_etape_actuelle: validatedData.workflow_etape_actuelle || 'ASSIGNATION',
    }

    // Créer le dossier
    const { data, error } = await supabase
      .from('dossiers')
      .insert(dossierData)
      .select()
      .single()

    if (error) {
      console.error('Erreur création dossier:', error)
      return { error: 'Erreur lors de la création du dossier' }
    }

    revalidatePath('/dossiers')
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateDossierAction(id: string, formData: DossierFormData) {
  try {
    // Validation
    const validatedData = dossierSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Mettre à jour le dossier
    const { data, error } = await supabase
      .from('dossiers')
      .update({
        ...validatedData,
        montant_litige: validatedData.montant_litige || null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour dossier:', error)
      return { error: 'Erreur lors de la mise à jour du dossier' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateDossierEtapeAction(id: string, etapeId: string) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Mettre à jour l'étape
    const { data, error } = await supabase
      .from('dossiers')
      .update({ workflow_etape_actuelle: etapeId })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour étape:', error)
      return { error: 'Erreur lors de la mise à jour de l\'étape' }
    }

    revalidatePath(`/dossiers/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function deleteDossierAction(id: string) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Supprimer le dossier (cascade supprime actions, documents, etc.)
    const { error } = await supabase.from('dossiers').delete().eq('id', id)

    if (error) {
      console.error('Erreur suppression dossier:', error)
      return { error: 'Erreur lors de la suppression du dossier' }
    }

    revalidatePath('/dossiers')
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function getDossierAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('dossiers')
      .select('*, clients(*)')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Erreur récupération dossier:', error)
      return { error: 'Dossier non trouvé' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Erreur récupération:', error)
    return { error: 'Erreur lors de la récupération du dossier' }
  }
}
