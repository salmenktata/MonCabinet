import { z } from 'zod'

export const clientSchema = z.object({
  type_client: z.enum(['PERSONNE_PHYSIQUE', 'PERSONNE_MORALE'], {
    required_error: 'Le type de client est requis',
  }),
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  prenom: z.string().optional(),
  cin: z.string().optional(),
  date_naissance: z.string().optional(),
  sexe: z.string().optional(),
  registre_commerce: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  telephone: z
    .string()
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      'Format téléphone invalide. Utilisez le format international E.164 (ex: +216XXXXXXXX)'
    )
    .optional()
    .or(z.literal('')),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  profession: z.string().optional(),
  notes: z.string().optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>
