'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateCabinetInfoAction(formData: FormData) {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Extraire les données du formulaire
    const cabinet_nom = formData.get('cabinet_nom') as string
    const cabinet_adresse = formData.get('cabinet_adresse') as string
    const cabinet_ville = formData.get('cabinet_ville') as string
    const cabinet_code_postal = formData.get('cabinet_code_postal') as string
    const rne = formData.get('rne') as string
    const logoFile = formData.get('logo') as File | null

    let logo_url = null

    // Upload du logo si présent
    if (logoFile && logoFile.size > 0) {
      // Générer un nom de fichier unique
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `cabinet-logos/${fileName}`

      // Convertir File en ArrayBuffer puis en Buffer
      const arrayBuffer = await logoFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Upload vers Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cabinet-logos')
        .upload(filePath, buffer, {
          contentType: logoFile.type,
          upsert: true,
        })

      if (uploadError) {
        console.error('Erreur upload logo:', uploadError)
        return { error: 'Erreur lors de l\'upload du logo' }
      }

      // Récupérer l'URL publique
      const {
        data: { publicUrl },
      } = supabase.storage.from('cabinet-logos').getPublicUrl(filePath)

      logo_url = publicUrl

      // Supprimer l'ancien logo si existant
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('logo_url')
        .eq('id', user.id)
        .single()

      if (currentProfile?.logo_url) {
        const oldFilePath = currentProfile.logo_url.split('/').pop()
        if (oldFilePath) {
          await supabase.storage.from('cabinet-logos').remove([`cabinet-logos/${oldFilePath}`])
        }
      }
    }

    // Préparer les données à mettre à jour
    const updateData: any = {
      cabinet_nom: cabinet_nom || null,
      cabinet_adresse: cabinet_adresse || null,
      cabinet_ville: cabinet_ville || null,
      cabinet_code_postal: cabinet_code_postal || null,
      rne: rne || null,
    }

    // Ajouter logo_url seulement si un nouveau logo a été uploadé
    if (logo_url) {
      updateData.logo_url = logo_url
    }

    // Mettre à jour le profil
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (updateError) {
      console.error('Erreur mise à jour profil:', updateError)
      return { error: 'Erreur lors de la mise à jour' }
    }

    revalidatePath('/parametres/cabinet')
    revalidatePath('/factures')

    return { success: true }
  } catch (error) {
    console.error('Erreur updateCabinetInfo:', error)
    return { error: 'Erreur lors de la mise à jour des informations' }
  }
}
