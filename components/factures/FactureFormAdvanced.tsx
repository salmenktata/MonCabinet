'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import { createFactureAction, updateFactureAction } from '@/app/actions/factures'

// Schéma de validation Zod - aligné avec lib/validations/facture.ts
const factureFormSchema = z.object({
  client_id: z.string().min(1, 'Le client est obligatoire'),
  dossier_id: z.string().optional(),
  objet: z.string().min(3, 'L\'objet doit contenir au moins 3 caractères'),
  montant_ht: z.number().min(0, 'Le montant HT doit être positif'),
  montant_debours: z.number().min(0).optional().default(0),
  provisions_recues: z.number().min(0).optional().default(0),
  taux_tva: z.number().min(0).max(100, 'Le taux de TVA doit être entre 0 et 100'),
  date_emission: z.string().min(1, 'La date d\'émission est obligatoire'),
  date_echeance: z.string().optional(),
  statut: z.enum(['BROUILLON', 'ENVOYEE', 'PAYEE', 'IMPAYEE']),
  type_honoraires: z.enum(['forfait', 'horaire', 'resultat', 'mixte']).optional(),
  tarif_horaire: z.number().optional(),
  heures_travaillees: z.number().optional(),
  pourcentage_resultat: z.number().optional(),
  notes: z.string().optional(),
})

type FactureFormValues = z.infer<typeof factureFormSchema>

interface FactureFormAdvancedProps {
  factureId?: string
  initialData?: Partial<FactureFormValues>
  isEditing?: boolean
  clients: Array<{
    id: string
    nom: string
    prenom?: string
    type_client: string
  }>
  dossiers?: Array<{
    id: string
    numero: string
    objet: string
  }>
  onSubmit?: (data: FactureFormValues) => Promise<void>
}

export function FactureFormAdvanced({
  factureId,
  initialData,
  isEditing = false,
  clients = [],
  dossiers = [],
  onSubmit: customOnSubmit,
}: FactureFormAdvancedProps) {
  const router = useRouter()
  const t = useTranslations('forms')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const form = useForm<FactureFormValues>({
    resolver: zodResolver(factureFormSchema),
    defaultValues: {
      client_id: '',
      dossier_id: '',
      objet: '',
      montant_ht: 0,
      taux_tva: 19,
      date_emission: new Date().toISOString().split('T')[0],
      date_echeance: '',
      statut: 'BROUILLON',
      notes: '',
      ...initialData,
    },
    mode: 'onBlur',
  })

  // Calculer automatiquement le montant TTC
  const montantHT = form.watch('montant_ht') || 0
  const tauxTVA = form.watch('taux_tva') || 19
  const montantTVA = (montantHT * tauxTVA) / 100
  const montantTTC = montantHT + montantTVA

  const handleSubmit = async (data: FactureFormValues) => {
    setError('')
    setIsSubmitting(true)

    try {
      if (customOnSubmit) {
        await customOnSubmit(data)
      } else {
        const result = isEditing && factureId
          ? await updateFactureAction(factureId, data)
          : await createFactureAction(data)

        if (result.error) {
          setError(result.error)
          setIsSubmitting(false)
          return
        }

        router.push('/factures')
        router.refresh()
      }
    } catch (err) {
      setError('Une erreur est survenue')
      setIsSubmitting(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* Erreur globale */}
        {error && (
          <Alert variant="destructive">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Client et Dossier */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un client" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients.map((client) => {
                      const displayName =
                        client.type_client === 'personne_physique'
                          ? `${client.prenom || ''} ${client.nom}`.trim()
                          : client.nom
                      return (
                        <SelectItem key={client.id} value={client.id}>
                          <div className="flex items-center gap-2">
                            {client.type_client === 'personne_physique' ? (
                              <Icons.user className="h-4 w-4" />
                            ) : (
                              <Icons.building className="h-4 w-4" />
                            )}
                            <span>{displayName}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dossier_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dossier (optionnel)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun dossier" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">Aucun dossier</SelectItem>
                    {dossiers.map((dossier) => (
                      <SelectItem key={dossier.id} value={dossier.id}>
                        <div className="flex items-center gap-2">
                          <Icons.dossiers className="h-4 w-4" />
                          <span>{dossier.numero} - {dossier.objet}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Dossier associé à cette facture
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Objet */}
        <FormField
          control={form.control}
          name="objet"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Objet de la facture *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input {...field} placeholder="Ex: Honoraires divorce contentieux" />
                  {form.formState.errors.objet && (
                    <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                  {!form.formState.errors.objet && field.value && (
                    <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Montants */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Montants</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="montant_ht"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Montant HT *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        type="number"
                        step="0.001"
                        placeholder="0.000"
                        className="pl-10"
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="taux_tva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taux TVA (%)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Taux de TVA applicable (19% par défaut en Tunisie)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Calcul automatique */}
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Montant HT</p>
                  <p className="text-lg font-semibold">{montantHT.toFixed(3)} TND</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">TVA ({tauxTVA}%)</p>
                  <p className="text-lg font-semibold">{montantTVA.toFixed(3)} TND</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Montant TTC</p>
                  <p className="text-2xl font-bold text-primary">{montantTTC.toFixed(3)} TND</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date_emission"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date d'émission *</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Icons.calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input {...field} type="date" className="pl-10" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date_echeance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date d'échéance</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Icons.calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input {...field} type="date" className="pl-10" />
                  </div>
                </FormControl>
                <FormDescription>
                  Date limite de paiement (optionnel)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Statut */}
        <FormField
          control={form.control}
          name="statut"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Statut *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="BROUILLON">Brouillon</SelectItem>
                  <SelectItem value="ENVOYEE">Envoyée</SelectItem>
                  <SelectItem value="PAYEE">Payée</SelectItem>
                  <SelectItem value="IMPAYEE">Impayée</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes internes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Notes privées sur cette facture..."
                  rows={3}
                />
              </FormControl>
              <FormDescription>
                Ces notes ne seront pas visibles sur la facture
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Boutons d'action */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Mettre à jour' : 'Créer la facture'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
        </div>
      </form>
    </Form>
  )
}
