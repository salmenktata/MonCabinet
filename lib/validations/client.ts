import { z } from 'zod'

export const clientSchema = z.object({
  type: z.enum(['PERSONNE_PHYSIQUE', 'PERSONNE_MORALE'], {
    required_error: 'Le type de client est requis',
  }),
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  prenom: z.string().optional(),
  denomination: z.string().optional(),
  cin: z.string().optional(),
  registre_commerce: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  telephone: z.string().min(8, 'Le téléphone doit contenir au moins 8 chiffres').optional().or(z.literal('')),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  notes: z.string().optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>
