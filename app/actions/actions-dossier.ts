'use server'

import { createClient } from '@/lib/supabase/server'
import { actionSchema, type ActionFormData } from '@/lib/validations/dossier'
import { revalidatePath } from 'next/cache'

export async function createActionDossierAction(formData: ActionFormData) {
  try {
    const validatedData = actionSchema.parse(formData)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('actions')
      .insert({
        user_id: user.id,
        ...validatedData,
        date_limite: validatedData.date_limite || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur création action:', error)
      return { error: 'Erreur lors de la création de l\'action' }
    }

    revalidatePath(`/dossiers/${validatedData.dossier_id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateActionDossierAction(
  id: string,
  formData: Partial<ActionFormData>
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('actions')
      .update(formData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour action:', error)
      return { error: 'Erreur lors de la mise à jour de l\'action' }
    }

    revalidatePath(`/dossiers/${data.dossier_id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function deleteActionDossierAction(id: string, dossierId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { error } = await supabase.from('actions').delete().eq('id', id)

    if (error) {
      console.error('Erreur suppression action:', error)
      return { error: 'Erreur lors de la suppression de l\'action' }
    }

    revalidatePath(`/dossiers/${dossierId}`)
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function toggleActionStatutAction(id: string, dossierId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer l'action actuelle
    const { data: action } = await supabase
      .from('actions')
      .select('statut')
      .eq('id', id)
      .single()

    if (!action) {
      return { error: 'Action non trouvée' }
    }

    // Toggle statut
    const newStatut = action.statut === 'TERMINEE' ? 'A_FAIRE' : 'TERMINEE'

    const { data, error } = await supabase
      .from('actions')
      .update({ statut: newStatut })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur toggle statut:', error)
      return { error: 'Erreur lors de la mise à jour' }
    }

    revalidatePath(`/dossiers/${dossierId}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur toggle:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}
