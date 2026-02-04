import { z } from 'zod'

export const documentSchema = z.object({
  dossier_id: z.string().uuid('Dossier invalide'),
  nom_fichier: z.string().min(1, 'Le nom du fichier est requis'),
  type_fichier: z.string().optional(),
  taille_fichier: z.number().int().positive().optional(),
  storage_path: z.string().min(1, 'Le chemin de stockage est requis'),
  categorie: z.enum(['contrat', 'jugement', 'correspondance', 'piece', 'autre'], {
    required_error: 'La catégorie est requise',
  }).optional(),
  description: z.string().optional(),
})

export const documentUploadSchema = z.object({
  dossier_id: z.string().uuid('Dossier invalide'),
  categorie: z.enum(['contrat', 'jugement', 'correspondance', 'piece', 'autre']).optional(),
  description: z.string().optional(),
})

export type DocumentFormData = z.infer<typeof documentSchema>
export type DocumentUploadData = z.infer<typeof documentUploadSchema>
