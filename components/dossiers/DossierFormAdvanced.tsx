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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Icons } from '@/lib/icons'
import { createDossierAction, updateDossierAction } from '@/app/actions/dossiers'
import { WORKFLOWS_DISPONIBLES, getWorkflowById } from '@/lib/workflows/workflows-config'
import DossierCommercialForm from './DossierCommercialForm'
import DossierDivorceForm from './DossierDivorceForm'

// Schéma de validation Zod
const dossierFormSchema = z.object({
  client_id: z.string().min(1, 'Le client est obligatoire'),
  numero: z.string().min(1, 'Le numéro de dossier est obligatoire'),
  type_procedure: z.enum([
    'civil_premiere_instance',
    'divorce',
    'commercial',
    'refere',
    'autre'
  ], {
    required_error: 'Le type de procédure est requis',
  }),
  objet: z.string().min(3, 'L\'objet doit contenir au moins 3 caractères'),
  partie_adverse: z.string().optional(),
  avocat_adverse: z.string().optional(),
  tribunal: z.string().optional(),
  numero_rg: z.string().optional(),
  date_ouverture: z.string().optional(),
  montant_litige: z.number().optional(),
  statut: z.enum(['en_cours', 'clos', 'archive']),
  workflow_etape_actuelle: z.string().optional(),
  notes: z.string().optional(),
})

type DossierFormValues = z.infer<typeof dossierFormSchema>

interface DossierFormAdvancedProps {
  initialData?: Partial<DossierFormValues> & { id?: string }
  isEditing?: boolean
  clients: Array<{
    id: string
    nom: string
    prenom?: string
    type_client: string
  }>
  preselectedClientId?: string
  onSubmit?: (data: DossierFormValues) => Promise<void>
}

export function DossierFormAdvanced({
  initialData,
  isEditing = false,
  clients = [],
  preselectedClientId,
  onSubmit: customOnSubmit,
}: DossierFormAdvancedProps) {
  const router = useRouter()
  const _t = useTranslations('forms')
  const tErrors = useTranslations('errors')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const form = useForm<DossierFormValues>({
    resolver: zodResolver(dossierFormSchema),
    defaultValues: {
      client_id: preselectedClientId || '',
      numero: '',
      type_procedure: 'civil_premiere_instance',
      objet: '',
      partie_adverse: '',
      avocat_adverse: '',
      tribunal: '',
      numero_rg: '',
      date_ouverture: '',
      montant_litige: undefined,
      statut: 'en_cours',
      workflow_etape_actuelle: 'ASSIGNATION',
      notes: '',
      ...initialData,
    },
    mode: 'onBlur', // Validation on blur
  })

  const typeProcedure = form.watch('type_procedure')

  // Mettre à jour l'étape du workflow quand le type de procédure change
  React.useEffect(() => {
    if (typeProcedure && !isEditing) {
      const workflow = getWorkflowById(typeProcedure)
      if (workflow && workflow.etapes.length > 0) {
        form.setValue('workflow_etape_actuelle', workflow.etapes[0].id)
      }
    }
  }, [typeProcedure, form, isEditing])

  const handleSubmit = async (data: DossierFormValues) => {
    setError('')
    setIsSubmitting(true)

    try {
      if (customOnSubmit) {
        await customOnSubmit(data)
      } else {
        const result = isEditing && (initialData as any)?.id
          ? await updateDossierAction((initialData as any).id, data)
          : await createDossierAction(data)

        if (result.error) {
          setError(result.error)
          setIsSubmitting(false)
          return
        }

        router.push('/dossiers')
        router.refresh()
      }
    } catch (err) {
      setError(tErrors('generic'))
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

        {/* Client */}
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
                        ? `${client.nom} ${client.prenom || ''}`.trim()
                        : client.nom
                    return (
                      <SelectItem key={client.id} value={client.id}>
                        <div className="flex items-center gap-2">
                          <Icons.user className="h-4 w-4" />
                          <span>{displayName}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <FormDescription>
                Le client associé à ce dossier
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Informations principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="numero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numéro de dossier *</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Icons.hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input {...field} placeholder="2024-001" className="pl-10" />
                    {form.formState.errors.numero && (
                      <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                    )}
                    {!form.formState.errors.numero && field.value && (
                      <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type_procedure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type de procédure *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez le type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {WORKFLOWS_DISPONIBLES.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        <div className="flex items-center gap-2">
                          <Icons.gavel className="h-4 w-4" />
                          <span>{workflow.nom}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <FormLabel>Objet du dossier *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input {...field} placeholder="Ex: Divorce contentieux" />
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

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Notes et informations complémentaires..."
                  rows={4}
                />
              </FormControl>
              <FormDescription>
                Informations complémentaires sur le dossier
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Parties et Tribunal */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Parties et juridiction</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="partie_adverse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Partie adverse</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.user className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} placeholder="Nom de la partie adverse" className="pl-10" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="avocat_adverse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avocat adverse</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} placeholder="Nom de l'avocat adverse" className="pl-10" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tribunal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tribunal</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} placeholder="Ex: Tribunal de Tunis" className="pl-10" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="numero_rg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro RG</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.fileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} placeholder="Ex: 12345/2024" className="pl-10" />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Numéro du rôle général
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Date et Montant */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date_ouverture"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date d'ouverture</FormLabel>
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
            name="montant_litige"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant du litige</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Icons.banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="pl-10"
                      onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  Montant en TND (optionnel)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Statut et Workflow */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="statut"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Statut *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez le statut" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="en_cours">
                      <div className="flex items-center gap-2">
                        <Icons.checkCircle className="h-4 w-4 text-green-500" />
                        <span>Actif</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="clos">
                      <div className="flex items-center gap-2">
                        <Icons.xCircle className="h-4 w-4 text-orange-500" />
                        <span>Clôturé</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="archive">
                      <div className="flex items-center gap-2">
                        <Icons.archive className="h-4 w-4 text-muted-foreground" />
                        <span>Archivé</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="workflow_etape_actuelle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Étape du workflow *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez l'étape" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(() => {
                      const workflow = getWorkflowById(typeProcedure || 'civil_premiere_instance')
                      return workflow?.etapes.map((etape) => (
                        <SelectItem key={etape.id} value={etape.id}>
                          <div className="flex items-center gap-2">
                            <Icons.listTodo className="h-4 w-4" />
                            <span>{etape.libelle}</span>
                          </div>
                        </SelectItem>
                      )) || []
                    })()}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Étape actuelle dans le processus juridique
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
                  placeholder="Notes privées sur le dossier..."
                  rows={3}
                />
              </FormControl>
              <FormDescription>
                Ces notes ne sont visibles que par vous
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Section spécialisée selon type de procédure */}
        {typeProcedure === 'commercial' && (
          <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-100">
                <Icons.building className="h-5 w-5" />
                Informations commerciales
              </CardTitle>
              <CardDescription>
                Champs spécifiques aux litiges commerciaux (calcul intérêts, chèques, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DossierCommercialForm
                register={form.register}
                watch={form.watch}
                errors={form.formState.errors}
                setValue={form.setValue}
              />
            </CardContent>
          </Card>
        )}

        {typeProcedure === 'divorce' && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Icons.user className="h-5 w-5" />
                Informations divorce
              </CardTitle>
              <CardDescription>
                Champs spécifiques aux procédures de divorce (pension, garde, conciliation)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DossierDivorceForm
                register={form.register}
                watch={form.watch}
                errors={form.formState.errors}
                setValue={form.setValue}
              />
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Boutons d'action */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Mettre à jour' : 'Créer le dossier'}
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
