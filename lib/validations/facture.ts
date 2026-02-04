import { z } from 'zod'

export const factureSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  dossier_id: z.string().uuid('Dossier invalide').optional(),
  numero_facture: z.string().optional(), // Généré automatiquement
  montant_ht: z.number().positive('Le montant HT doit être positif'),
  taux_tva: z.number().min(0).max(100).default(19), // TVA tunisienne = 19%
  date_emission: z.string().min(1, 'La date d\'émission est requise'),
  date_echeance: z.string().optional(),
  statut: z.enum(['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE'], {
    required_error: 'Le statut est requis',
  }),
  objet: z.string().min(5, 'L\'objet doit contenir au moins 5 caractères'),
  notes: z.string().optional(),
})

export const ligneFactureSchema = z.object({
  facture_id: z.string().uuid(),
  description: z.string().min(3, 'La description est requise'),
  quantite: z.number().positive().default(1),
  prix_unitaire: z.number().positive('Le prix unitaire doit être positif'),
  montant: z.number().positive(),
})

export const paiementSchema = z.object({
  facture_id: z.string().uuid(),
  montant: z.number().positive('Le montant doit être positif'),
  date_paiement: z.string().min(1, 'La date de paiement est requise'),
  mode_paiement: z.enum(['ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'AUTRE']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export type FactureFormData = z.infer<typeof factureSchema>
export type LigneFactureFormData = z.infer<typeof ligneFactureSchema>
export type PaiementFormData = z.infer<typeof paiementSchema>
