import { z } from 'zod'

/**
 * Schéma de validation Zod pour les dossiers structurés
 * Assure la cohérence des données retournées par l'IA
 */

const extractedFactSchema = z.object({
  fait: z.string().min(1, 'Le fait ne peut pas être vide'),
  label: z.string().optional(),
  categorie: z.enum(['fait_juridique', 'interpretation', 'ressenti']),
  dateApproximative: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100),
  source: z.string().nullable().optional(),
  preuve: z.string().nullable().optional(),
  importance: z.enum(['decisif', 'important', 'contexte']),
})

const legalAnalysisSchema = z.object({
  diagnostic: z.string(),
  qualification: z.string(),
  risques: z.array(z.string()),
  opportunites: z.array(z.string()),
  fondement: z.string(),
  recommandation: z.string(),
})

const extractedChildSchema = z.object({
  prenom: z.string(),
  age: z.number().int().min(0).max(30),
  estMineur: z.boolean(),
})

const legalCalculationSchema = z.object({
  type: z.enum([
    'moutaa',
    'pension_alimentaire',
    'pension_epouse',
    'interets_moratoires',
    'indemnite_forfaitaire',
    'autre',
  ]),
  label: z.string(),
  montant: z.number().min(0),
  formule: z.string(),
  reference: z.string(),
  details: z.string().nullable().optional(),
})

const timelineStepSchema = z.object({
  etape: z.string().min(1),
  delaiJours: z.number().int().min(0),
  description: z.string(),
  obligatoire: z.boolean(),
  alertes: z.array(z.string()).nullable().optional(),
})

const suggestedActionSchema = z.object({
  titre: z.string().min(1),
  description: z.string().nullable().optional(),
  priorite: z.enum(['urgent', 'haute', 'moyenne', 'basse']),
  delaiJours: z.number().int().min(0).nullable().optional(),
  checked: z.boolean().default(false),
})

const legalReferenceSchema = z.object({
  type: z.enum(['code', 'jurisprudence', 'doctrine']),
  titre: z.string(),
  article: z.string().nullable().optional(),
  extrait: z.string().nullable().optional(),
  pertinence: z.number().min(0).max(100),
})

const partySchema = z.object({
  nom: z.string().min(1, 'Le nom ne peut pas être vide'),
  prenom: z.string().nullable().optional(),
  role: z.enum(['demandeur', 'defendeur']),
  profession: z.string().nullable().optional(),
  revenus: z.number().nullable().optional(),
  adresse: z.string().nullable().optional(),
})

/**
 * Schéma principal pour un dossier structuré
 */
export const structuredDossierSchema = z.object({
  confidence: z.number().min(0).max(100).default(50),
  langue: z.enum(['ar', 'fr']).default('ar'),
  typeProcedure: z.enum([
    'civil_premiere_instance',
    'divorce',
    'commercial',
    'refere',
    'cassation',
    'autre',
  ]),
  sousType: z.string().nullable().optional(),
  analyseJuridique: legalAnalysisSchema.nullable().optional(),
  client: partySchema,
  partieAdverse: partySchema,
  faitsExtraits: z.array(extractedFactSchema).default([]),
  enfants: z.array(extractedChildSchema).nullable().optional(),
  calculs: z.array(legalCalculationSchema).default([]),
  timeline: z.array(timelineStepSchema).default([]),
  actionsSuggerees: z.array(suggestedActionSchema).default([]),
  references: z.array(legalReferenceSchema).default([]),
  titrePropose: z.string().min(1, 'Le titre ne peut pas être vide'),
  resumeCourt: z.string().default(''),
  donneesSpecifiques: z.record(z.unknown()).optional().default({}),
})

/**
 * Type TypeScript inféré du schéma Zod
 */
export type StructuredDossierValidated = z.infer<typeof structuredDossierSchema>

/**
 * Fonction helper pour valider avec des erreurs détaillées
 */
export function validateStructuredDossier(data: unknown) {
  const result = structuredDossierSchema.safeParse(data)

  if (!result.success) {
    const errors = result.error.flatten()
    console.error('[Validation Zod] Erreurs:', {
      fieldErrors: errors.fieldErrors,
      formErrors: errors.formErrors,
    })
  }

  return result
}
