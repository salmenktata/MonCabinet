import { z } from 'zod'

export const dossierSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  numero_dossier: z.string().min(3, 'Le numéro de dossier doit contenir au moins 3 caractères'),
  type_procedure: z.enum(['CIVIL', 'COMMERCIAL', 'PENAL', 'ADMINISTRATIF', 'SOCIAL', 'AUTRE'], {
    required_error: 'Le type de procédure est requis',
  }),
  objet: z.string().min(5, "L'objet doit contenir au moins 5 caractères"),
  description: z.string().optional(),
  partie_adverse: z.string().optional(),
  avocat_adverse: z.string().optional(),
  tribunal: z.string().optional(),
  numero_rg: z.string().optional(), // Numéro de Rôle Général
  date_ouverture: z.string().optional(),
  statut: z.enum(['ACTIF', 'CLOS', 'ARCHIVE'], {
    required_error: 'Le statut est requis',
  }),
  workflow_etape_actuelle: z.string().optional(),
  montant_litige: z.number().optional(),
  notes: z.string().optional(),
})

export const actionSchema = z.object({
  dossier_id: z.string().uuid('Dossier invalide'),
  titre: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  description: z.string().optional(),
  type: z.enum(['AUDIENCE', 'DEADLINE', 'RDV_CLIENT', 'REDACTION', 'AUTRE'], {
    required_error: 'Le type est requis',
  }),
  priorite: z.enum(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'], {
    required_error: 'La priorité est requise',
  }),
  date_limite: z.string().optional(),
  statut: z.enum(['A_FAIRE', 'EN_COURS', 'TERMINEE'], {
    required_error: 'Le statut est requis',
  }),
})

export const echeanceSchema = z.object({
  dossier_id: z.string().uuid('Dossier invalide'),
  titre: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  description: z.string().optional(),
  date_evenement: z.string().min(1, 'La date est requise'),
  type_delai: z.string().optional(),
  delai_jours: z.number().int().positive().optional(),
  date_calcul_delai: z.string().optional(),
  date_limite_calculee: z.string().optional(),
  rappel_j_moins_1: z.boolean().optional(),
  rappel_j_moins_3: z.boolean().optional(),
  rappel_j_moins_7: z.boolean().optional(),
})

export type DossierFormData = z.infer<typeof dossierSchema>
export type ActionFormData = z.infer<typeof actionSchema>
export type EcheanceFormData = z.infer<typeof echeanceSchema>
