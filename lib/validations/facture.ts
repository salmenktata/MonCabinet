import { z } from 'zod'

export const factureSchema = z
  .object({
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

    // Honoraires ONAT
    type_honoraires: z
      .enum(['forfait', 'horaire', 'resultat', 'mixte'])
      .optional(),
    base_calcul: z
      .string()
      .min(10, 'La base de calcul doit être détaillée')
      .optional(),
    taux_horaire: z
      .number()
      .nonnegative('Le taux horaire ne peut pas être négatif')
      .optional(),
    heures: z
      .number()
      .nonnegative('Le nombre d\'heures ne peut pas être négatif')
      .optional(),
    pourcentage_resultat: z
      .number()
      .min(0, 'Le pourcentage doit être entre 0 et 100')
      .max(100, 'Le pourcentage doit être entre 0 et 100')
      .optional(),
    montant_debours: z
      .number()
      .nonnegative('Le montant des débours ne peut pas être négatif')
      .default(0),
    provisions_recues: z
      .number()
      .nonnegative('Les provisions ne peuvent pas être négatives')
      .default(0),
  })
  .superRefine((data, ctx) => {
    // Validation conditionnelle selon type_honoraires
    if (data.type_honoraires === 'horaire' || data.type_honoraires === 'mixte') {
      if (!data.taux_horaire || data.taux_horaire <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Le taux horaire est requis pour ce type d\'honoraires',
          path: ['taux_horaire'],
        })
      }
      if (!data.heures || data.heures <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Le nombre d\'heures est requis pour ce type d\'honoraires',
          path: ['heures'],
        })
      }
    }

    if (data.type_honoraires === 'resultat' || data.type_honoraires === 'mixte') {
      if (
        data.pourcentage_resultat === undefined ||
        data.pourcentage_resultat <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Le pourcentage de résultat est requis pour ce type d\'honoraires',
          path: ['pourcentage_resultat'],
        })
      }
      if (!data.base_calcul || data.base_calcul.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'La base de calcul doit être détaillée pour les honoraires au résultat',
          path: ['base_calcul'],
        })
      }
    }

    // Vérifier que provisions <= montant_ttc
    const montant_tva = data.montant_ht * (data.taux_tva / 100)
    const montant_ttc = data.montant_ht + montant_tva
    if (data.provisions_recues > montant_ttc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Les provisions reçues ne peuvent pas dépasser le montant TTC',
        path: ['provisions_recues'],
      })
    }
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

// Schémas pour débours et provisions (honoraires ONAT)
export const deboursSchema = z.object({
  facture_id: z.string().uuid(),
  nature: z
    .string()
    .min(3, 'La nature du débours est requise')
    .max(200, 'La nature ne doit pas dépasser 200 caractères'),
  date: z.string().min(1, 'La date est requise'),
  montant: z.number().positive('Le montant doit être positif'),
  justificatif_url: z.string().url('URL invalide').optional(),
  notes: z.string().max(500, 'Les notes ne doivent pas dépasser 500 caractères').optional(),
})

export const provisionSchema = z.object({
  facture_id: z.string().uuid(),
  date_versement: z.string().min(1, 'La date de versement est requise'),
  montant: z.number().positive('Le montant doit être positif'),
  mode_paiement: z.enum(['especes', 'cheque', 'virement', 'flouci', 'carte']),
  reference_paiement: z
    .string()
    .max(100, 'La référence ne doit pas dépasser 100 caractères')
    .optional(),
  notes: z.string().max(500, 'Les notes ne doivent pas dépasser 500 caractères').optional(),
})

export type FactureFormData = z.infer<typeof factureSchema>
export type LigneFactureFormData = z.infer<typeof ligneFactureSchema>
export type PaiementFormData = z.infer<typeof paiementSchema>
export type DeboursFormData = z.infer<typeof deboursSchema>
export type ProvisionFormData = z.infer<typeof provisionSchema>
