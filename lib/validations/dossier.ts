import { z } from 'zod'

export const dossierSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  numero: z.string().min(3, 'Le numéro de dossier doit contenir au moins 3 caractères'),
  type_procedure: z.enum([
    'civil_premiere_instance',
    'divorce',
    'commercial',
    'refere',
    'penal',
    'administratif',
    'faillite',
    'execution_forcee',
    'autre'
  ], {
    required_error: 'Le type de procédure est requis',
  }),
  objet: z.string().min(5, "L'objet doit contenir au moins 5 caractères"),
  partie_adverse: z.string().optional(),
  avocat_adverse: z.string().optional(),
  tribunal: z.string().optional(),
  numero_rg: z.string().optional(), // Numéro de Rôle Général
  date_ouverture: z.string().optional(),
  statut: z.enum(['actif', 'en_cours', 'clos', 'archive'], {
    required_error: 'Le statut est requis',
  }).transform(v => v === 'actif' ? 'en_cours' : v),
  montant_litige: z.number().optional(),
  montant_demande: z.number().optional(),
  montant_obtenu: z.number().optional(),
  workflow_etape_actuelle: z.string().optional(),
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
