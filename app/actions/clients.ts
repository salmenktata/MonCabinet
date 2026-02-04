'use server'

import { createClient } from '@/lib/supabase/server'
import { clientSchema, type ClientFormData } from '@/lib/validations/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createClientAction(formData: ClientFormData) {
  try {
    // Validation
    const validatedData = clientSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Préparer les données selon le type
    const clientData: any = {
      user_id: user.id,
      type: validatedData.type,
      email: validatedData.email || null,
      telephone: validatedData.telephone || null,
      adresse: validatedData.adresse || null,
      ville: validatedData.ville || null,
      notes: validatedData.notes || null,
    }

    if (validatedData.type === 'PERSONNE_PHYSIQUE') {
      clientData.nom = validatedData.nom
      clientData.prenom = validatedData.prenom || null
      clientData.cin = validatedData.cin || null
    } else {
      clientData.denomination = validatedData.nom
      clientData.registre_commerce = validatedData.registre_commerce || null
    }

    // Créer le client
    const { data, error } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single()

    if (error) {
      console.error('Erreur création client:', error)
      return { error: 'Erreur lors de la création du client' }
    }

    revalidatePath('/clients')
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function updateClientAction(id: string, formData: ClientFormData) {
  try {
    // Validation
    const validatedData = clientSchema.parse(formData)

    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Préparer les données selon le type
    const clientData: any = {
      user_id: user.id,
      type: validatedData.type,
      email: validatedData.email || null,
      telephone: validatedData.telephone || null,
      adresse: validatedData.adresse || null,
      ville: validatedData.ville || null,
      notes: validatedData.notes || null,
    }

    if (validatedData.type === 'PERSONNE_PHYSIQUE') {
      clientData.nom = validatedData.nom
      clientData.prenom = validatedData.prenom || null
      clientData.cin = validatedData.cin || null
      clientData.denomination = null
      clientData.registre_commerce = null
    } else {
      clientData.denomination = validatedData.nom
      clientData.registre_commerce = validatedData.registre_commerce || null
      clientData.nom = null
      clientData.prenom = null
      clientData.cin = null
    }

    // Mettre à jour le client
    const { data, error } = await supabase
      .from('clients')
      .update(clientData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour client:', error)
      return { error: 'Erreur lors de la mise à jour du client' }
    }

    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur validation:', error)
    return { error: 'Données invalides' }
  }
}

export async function deleteClientAction(id: string) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier si le client a des dossiers
    const { count } = await supabase
      .from('dossiers')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    if (count && count > 0) {
      return {
        error: `Ce client a ${count} dossier(s) actif(s). Suppression impossible.`,
      }
    }

    // Supprimer le client
    const { error } = await supabase.from('clients').delete().eq('id', id)

    if (error) {
      console.error('Erreur suppression client:', error)
      return { error: 'Erreur lors de la suppression du client' }
    }

    revalidatePath('/clients')
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function getClientAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Erreur récupération client:', error)
      return { error: 'Client non trouvé' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Erreur récupération:', error)
    return { error: 'Erreur lors de la récupération du client' }
  }
}
