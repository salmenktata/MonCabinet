'use server'

import { createClient } from '@/lib/supabase/server'
import { echeanceSchema, calculateEcheanceSchema, type EcheanceFormData, type CalculateEcheanceData } from '@/lib/validations/echeance'
import { calculerEcheance } from '@/lib/utils/delais-tunisie'
import { revalidatePath } from 'next/cache'

export async function createEcheanceAction(formData: EcheanceFormData) {
  try {
    // Validation
    const validatedData = echeanceSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const { data: dossier, error: dossierError } = await supabase
      .from('dossiers')
      .select('id')
      .eq('id', validatedData.dossier_id)
      .eq('user_id', user.id)
      .single()

    if (dossierError || !dossier) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    // Créer l'échéance
    const { data, error } = await supabase
      .from('echeances')
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      console.error('Erreur création échéance:', error)
      return { error: 'Erreur lors de la création de l\'échéance' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${validatedData.dossier_id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateEcheanceAction(id: string, formData: Partial<EcheanceFormData>) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que l'échéance existe et appartient à l'utilisateur
    const { data: echeance, error: checkError } = await supabase
      .from('echeances')
      .select('id, dossier_id, dossiers(user_id)')
      .eq('id', id)
      .single()

    if (checkError || !echeance || echeance.dossiers?.user_id !== user.id) {
      return { error: 'Échéance introuvable ou accès refusé' }
    }

    const { data, error } = await supabase
      .from('echeances')
      .update(formData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour échéance:', error)
      return { error: 'Erreur lors de la mise à jour' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${echeance.dossier_id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function deleteEcheanceAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer l'échéance pour le revalidatePath
    const { data: echeance } = await supabase
      .from('echeances')
      .select('dossier_id')
      .eq('id', id)
      .single()

    const { error } = await supabase.from('echeances').delete().eq('id', id)

    if (error) {
      console.error('Erreur suppression échéance:', error)
      return { error: 'Erreur lors de la suppression' }
    }

    if (echeance) {
      revalidatePath('/dossiers')
      revalidatePath(`/dossiers/${echeance.dossier_id}`)
    }

    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function marquerEcheanceRespecte(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data: echeance, error: checkError } = await supabase
      .from('echeances')
      .select('dossier_id')
      .eq('id', id)
      .single()

    if (checkError) {
      return { error: 'Échéance introuvable' }
    }

    const { data, error } = await supabase
      .from('echeances')
      .update({ statut: 'respecte' })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur marquage échéance:', error)
      return { error: 'Erreur lors du marquage' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${echeance.dossier_id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors du marquage' }
  }
}

export async function calculateEcheanceAction(formData: CalculateEcheanceData) {
  try {
    // Validation
    const validatedData = calculateEcheanceSchema.parse(formData)

    const dateDepart = new Date(validatedData.date_point_depart)
    const dateEcheance = calculerEcheance(
      dateDepart,
      validatedData.nombre_jours,
      validatedData.delai_type,
      validatedData.exclure_vacances_judiciaires
    )

    return {
      success: true,
      data: {
        date_echeance: dateEcheance.toISOString().split('T')[0],
        date_point_depart: validatedData.date_point_depart,
        nombre_jours: validatedData.nombre_jours,
        delai_type: validatedData.delai_type,
      },
    }
  } catch (error) {
    console.error('Erreur calcul échéance:', error)
    return { error: 'Erreur lors du calcul de l\'échéance' }
  }
}

export async function getEcheancesUrgentesAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer les échéances des 15 prochains jours
    const dans15Jours = new Date()
    dans15Jours.setDate(dans15Jours.getDate() + 15)

    const { data, error } = await supabase
      .from('echeances')
      .select(`
        *,
        dossiers (
          id,
          numero_dossier,
          objet,
          clients (
            nom,
            prenom,
            denomination,
            type
          )
        )
      `)
      .eq('statut', 'actif')
      .lte('date_echeance', dans15Jours.toISOString().split('T')[0])
      .order('date_echeance', { ascending: true })

    if (error) {
      console.error('Erreur récupération échéances urgentes:', error)
      return { error: 'Erreur lors de la récupération des échéances' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors de la récupération des échéances' }
  }
}
