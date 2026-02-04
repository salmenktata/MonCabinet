'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const BUCKET_NAME = 'dossiers-documents'

export async function uploadDocumentAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Extraire les données du formulaire
    const file = formData.get('file') as File
    const dossierId = formData.get('dossier_id') as string
    const categorie = formData.get('categorie') as string
    const description = formData.get('description') as string

    if (!file) {
      return { error: 'Aucun fichier fourni' }
    }

    if (!dossierId) {
      return { error: 'Dossier non spécifié' }
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const { data: dossier, error: dossierError } = await supabase
      .from('dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('user_id', user.id)
      .single()

    if (dossierError || !dossier) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    // Créer un nom de fichier unique
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const storagePath = `${user.id}/${dossierId}/${fileName}`

    // Uploader le fichier dans Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Erreur upload fichier:', uploadError)
      return { error: 'Erreur lors de l\'upload du fichier' }
    }

    // Créer l'entrée dans la table documents
    const documentData = {
      dossier_id: dossierId,
      uploaded_by: user.id,
      nom_fichier: file.name,
      type_fichier: file.type || null,
      taille_fichier: file.size,
      storage_path: storagePath,
      categorie: categorie || null,
      description: description || null,
    }

    const { data, error } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single()

    if (error) {
      // Si erreur, supprimer le fichier uploadé
      await supabase.storage.from(BUCKET_NAME).remove([storagePath])
      console.error('Erreur création document:', error)
      return { error: 'Erreur lors de l\'enregistrement du document' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${dossierId}`)
    return { success: true, data }
  } catch (error) {
    console.error('Erreur upload:', error)
    return { error: 'Une erreur est survenue lors de l\'upload' }
  }
}

export async function deleteDocumentAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer le document pour obtenir le storage_path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*, dossiers!inner(user_id)')
      .eq('id', id)
      .single()

    if (fetchError || !document) {
      return { error: 'Document introuvable' }
    }

    if ((document.dossiers as any).user_id !== user.id) {
      return { error: 'Accès refusé' }
    }

    // Supprimer le fichier du storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([document.storage_path])

    if (storageError) {
      console.error('Erreur suppression fichier storage:', storageError)
      // Continue quand même pour supprimer l'entrée en base
    }

    // Supprimer l'entrée de la base de données
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Erreur suppression document:', deleteError)
      return { error: 'Erreur lors de la suppression du document' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${document.dossier_id}`)
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression du document' }
  }
}

export async function getDocumentUrlAction(id: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Récupérer le document
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*, dossiers!inner(user_id)')
      .eq('id', id)
      .single()

    if (fetchError || !document) {
      return { error: 'Document introuvable' }
    }

    if ((document.dossiers as any).user_id !== user.id) {
      return { error: 'Accès refusé' }
    }

    // Générer une URL signée valide 1 heure
    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(document.storage_path, 3600)

    if (urlError || !urlData) {
      console.error('Erreur génération URL:', urlError)
      return { error: 'Erreur lors de la génération de l\'URL' }
    }

    return { success: true, url: urlData.signedUrl }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors de la récupération de l\'URL' }
  }
}

export async function updateDocumentAction(id: string, data: { categorie?: string; description?: string }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le document appartient à l'utilisateur
    const { data: document, error: checkError } = await supabase
      .from('documents')
      .select('dossier_id, dossiers!inner(user_id)')
      .eq('id', id)
      .single()

    if (checkError || !document || (document.dossiers as any).user_id !== user.id) {
      return { error: 'Document introuvable ou accès refusé' }
    }

    const { data: updated, error } = await supabase
      .from('documents')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour document:', error)
      return { error: 'Erreur lors de la mise à jour du document' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${document.dossier_id}`)
    return { success: true, data: updated }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour du document' }
  }
}

export async function getDocumentsByDossierAction(dossierId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur récupération documents:', error)
      return { error: 'Erreur lors de la récupération des documents' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors de la récupération des documents' }
  }
}

export async function ensureStorageBucketAction() {
  try {
    const supabase = await createClient()

    // Vérifier si le bucket existe
    const { data: buckets } = await supabase.storage.listBuckets()

    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME)

    if (!bucketExists) {
      // Créer le bucket s'il n'existe pas
      const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 52428800, // 50 MB
      })

      if (error) {
        console.error('Erreur création bucket:', error)
        return { error: 'Erreur lors de la création du bucket de stockage' }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Erreur bucket:', error)
    return { error: 'Erreur lors de la vérification du bucket' }
  }
}
