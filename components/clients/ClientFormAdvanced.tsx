'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

// Schéma de validation Zod
const clientFormSchema = z.object({
  type_client: z.enum(['PARTICULIER', 'ENTREPRISE'], {
    required_error: 'Le type de client est obligatoire',
  }),
  // Pour particulier
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  prenom: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(100),
  cin: z.string().optional(),

  // Pour entreprise
  raison_sociale: z.string().optional(),
  registre_commerce: z.string().optional(),
  matricule_fiscale: z.string().optional(),

  // Contact
  email: z.string().email('Email invalide').min(1, 'Email obligatoire'),
  telephone: z
    .string()
    .regex(/^[0-9+\s()-]{8,}$/, 'Numéro de téléphone invalide')
    .optional()
    .or(z.literal('')),

  // Adresse
  adresse: z.string().optional(),
  ville: z.string().optional(),
  code_postal: z.string().optional(),

  // Notes
  notes: z.string().optional(),
}).refine((data) => {
  // Validation conditionnelle pour entreprise
  if (data.type_client === 'ENTREPRISE') {
    return !!data.raison_sociale
  }
  return true
}, {
  message: 'La raison sociale est obligatoire pour une entreprise',
  path: ['raison_sociale'],
})

type ClientFormValues = z.infer<typeof clientFormSchema>

interface ClientFormAdvancedProps {
  initialData?: Partial<ClientFormValues>
  onSubmit: (data: ClientFormValues) => Promise<void>
  submitLabel?: string
}

export function ClientFormAdvanced({
  initialData,
  onSubmit,
  submitLabel = 'Enregistrer',
}: ClientFormAdvancedProps) {
  const router = useRouter()
  const t = useTranslations('clients')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      type_client: 'PARTICULIER',
      nom: '',
      prenom: '',
      cin: '',
      raison_sociale: '',
      registre_commerce: '',
      matricule_fiscale: '',
      email: '',
      telephone: '',
      adresse: '',
      ville: '',
      code_postal: '',
      notes: '',
      ...initialData,
    },
    mode: 'onBlur', // Validation on blur
  })

  const typeClient = form.watch('type_client')

  const handleSubmit = async (data: ClientFormValues) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
    } catch (error) {
      console.error('Erreur lors de la soumission:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* Type de client */}
        <FormField
          control={form.control}
          name="type_client"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type de client *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PARTICULIER">
                    <div className="flex items-center gap-2">
                      <Icons.user className="h-4 w-4" />
                      <span>Particulier</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ENTREPRISE">
                    <div className="flex items-center gap-2">
                      <Icons.building className="h-4 w-4" />
                      <span>Entreprise</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Champs pour particulier */}
        {typeClient === 'PARTICULIER' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} placeholder="Ben Ali" />
                        {form.formState.errors.nom && (
                          <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                        )}
                        {!form.formState.errors.nom && field.value && (
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
                name="prenom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} placeholder="Ahmed" />
                        {form.formState.errors.prenom && (
                          <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                        )}
                        {!form.formState.errors.prenom && field.value && (
                          <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="cin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CIN</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="12345678" />
                  </FormControl>
                  <FormDescription>Numéro de carte d&apos;identité</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Champs pour entreprise */}
        {typeClient === 'ENTREPRISE' && (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="raison_sociale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raison sociale *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input {...field} placeholder="Société ABC SARL" />
                      {form.formState.errors.raison_sociale && (
                        <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                      )}
                      {!form.formState.errors.raison_sociale && field.value && (
                        <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="registre_commerce"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registre de commerce</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="B1234567" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="matricule_fiscale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matricule fiscale</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="1234567/A/M/000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Nom et prénom du contact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du contact</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ben Ali" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prenom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom du contact</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ahmed" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {/* Coordonnées (commun) */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Coordonnées</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} type="email" placeholder="client@example.com" className="pl-10" />
                      {form.formState.errors.email && (
                        <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                      )}
                      {!form.formState.errors.email && field.value && (
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
              name="telephone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Téléphone</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Icons.phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input {...field} type="tel" placeholder="+216 98 123 456" className="pl-10" />
                      {!form.formState.errors.telephone && field.value && (
                        <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Adresse (commun) */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Adresse</h3>

          <FormField
            control={form.control}
            name="adresse"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse complète</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="12 Avenue Habib Bourguiba" rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="ville"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Tunis" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code_postal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code postal</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="1000" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

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
                  placeholder="Informations supplémentaires..."
                  rows={4}
                />
              </FormControl>
              <FormDescription>
                Informations complémentaires sur le client
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Boutons */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
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
