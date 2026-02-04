import { z } from 'zod'

export const echeanceSchema = z.object({
  dossier_id: z.string().uuid('Dossier invalide'),
  type_echeance: z.enum(['audience', 'delai_legal', 'delai_interne', 'autre'], {
    required_error: 'Le type d\'échéance est requis',
  }),
  titre: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  description: z.string().optional(),
  date_echeance: z.string().min(1, 'La date d\'échéance est requise'),
  delai_type: z.enum(['jours_calendaires', 'jours_ouvrables', 'jours_francs']).optional(),
  date_point_depart: z.string().optional(),
  nombre_jours: z.number().int().positive().optional(),
  rappel_j15: z.boolean().default(false),
  rappel_j7: z.boolean().default(true),
  rappel_j3: z.boolean().default(true),
  rappel_j1: z.boolean().default(true),
  statut: z.enum(['actif', 'respecte', 'depasse']).default('actif'),
  notes: z.string().optional(),
})

export const calculateEcheanceSchema = z.object({
  date_point_depart: z.string().min(1, 'La date de départ est requise'),
  nombre_jours: z.number().int().positive('Le nombre de jours doit être positif'),
  delai_type: z.enum(['jours_calendaires', 'jours_ouvrables', 'jours_francs'], {
    required_error: 'Le type de délai est requis',
  }),
  exclure_vacances_judiciaires: z.boolean().default(true),
})

export type EcheanceFormData = z.infer<typeof echeanceSchema>
export type CalculateEcheanceData = z.infer<typeof calculateEcheanceSchema>
