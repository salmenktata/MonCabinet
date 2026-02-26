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
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { calculerEcheance } from '@/lib/utils/delais-tunisie'
import { createEcheanceAction, updateEcheanceAction } from '@/app/actions/echeances'

// Schéma de validation Zod - aligné avec lib/validations/echeance.ts
const echeanceFormSchema = z.object({
  dossier_id: z.string().min(1, 'Le dossier est obligatoire'),
  type_echeance: z.enum(['audience', 'delai_legal', 'delai_interne', 'autre']),
  titre: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  description: z.string().optional(),
  date_echeance: z.string().min(1, 'La date d\'échéance est obligatoire'),
  date_point_depart: z.string().optional(),
  nombre_jours: z.number().optional(),
  delai_type: z.enum(['jours_calendaires', 'jours_ouvrables', 'jours_francs']).optional(),
  statut: z.enum(['actif', 'respecte', 'depasse']).default('actif'),
  rappel_j15: z.boolean().default(false),
  rappel_j7: z.boolean().default(true),
  rappel_j3: z.boolean().default(true),
  rappel_j1: z.boolean().default(true),
  notes: z.string().optional(),
})

type EcheanceFormValues = z.infer<typeof echeanceFormSchema>

interface EcheanceFormAdvancedProps {
  echeanceId?: string
  initialData?: Partial<EcheanceFormValues>
  isEditing?: boolean
  dossierId: string
  onSubmit?: (data: EcheanceFormValues) => Promise<void>
}

export function EcheanceFormAdvanced({
  echeanceId,
  initialData,
  isEditing = false,
  dossierId,
  onSubmit: customOnSubmit,
}: EcheanceFormAdvancedProps) {
  const router = useRouter()
  const t = useTranslations('forms')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showCalculator, setShowCalculator] = React.useState(false)

  // État pour le calculateur
  const [dateDepart, setDateDepart] = React.useState('')
  const [nombreJours, setNombreJours] = React.useState(0)
  const [typeDelai, setTypeDelai] = React.useState<'jours_calendaires' | 'jours_ouvrables' | 'jours_francs'>('jours_ouvrables')
  const [dateCalculee, setDateCalculee] = React.useState('')

  const form = useForm<EcheanceFormValues>({
    resolver: zodResolver(echeanceFormSchema),
    defaultValues: {
      dossier_id: dossierId,
      type_echeance: 'delai_legal',
      titre: '',
      description: '',
      date_echeance: '',
      statut: 'actif',
      rappel_j15: false,
      rappel_j7: true,
      rappel_j3: true,
      rappel_j1: true,
      notes: '',
      ...initialData,
    },
    mode: 'onBlur',
  })

  // Calculer la date d'échéance
  const handleCalculer = () => {
    if (!dateDepart || !nombreJours) {
      setError(t('validation.enterStartDateAndDays'))
      return
    }

    try {
      const date = calculerEcheance(
        new Date(dateDepart),
        nombreJours,
        typeDelai,
        true // Exclure vacances judiciaires
      )

      const dateFormatted = date.toISOString().split('T')[0]
      setDateCalculee(dateFormatted)
      form.setValue('date_echeance', dateFormatted)
      form.setValue('date_point_depart', dateDepart)
      form.setValue('nombre_jours', nombreJours)
      form.setValue('delai_type', typeDelai)
      setError('')
    } catch (err) {
      setError(t('validation.calculationError'))
    }
  }

  const handleSubmit = async (data: EcheanceFormValues) => {
    setError('')
    setIsSubmitting(true)

    try {
      if (customOnSubmit) {
        await customOnSubmit(data)
      } else {
        const result = isEditing && echeanceId
          ? await updateEcheanceAction(echeanceId, data)
          : await createEcheanceAction(data)

        if (result.error) {
          setError(result.error)
          setIsSubmitting(false)
          return
        }

        router.push(`/dossiers/${dossierId}`)
        router.refresh()
      }
    } catch (err) {
      setError(t('validation.required'))
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

        {/* Type et Titre */}
        <FormField
          control={form.control}
          name="type_echeance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.echeanceDeadlineTypeRequired')}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="delai_legal">
                    <div className="flex items-center gap-2">
                      <Icons.gavel className="h-4 w-4" />
                      <span>{t('options.deadlineLegal')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="audience">
                    <div className="flex items-center gap-2">
                      <Icons.calendar className="h-4 w-4" />
                      <span>{t('options.deadlineHearing')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="delai_interne">
                    <div className="flex items-center gap-2">
                      <Icons.timeTracking className="h-4 w-4" />
                      <span>{t('options.deadlineInternal')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="autre">
                    <div className="flex items-center gap-2">
                      <Icons.calendar className="h-4 w-4" />
                      <span>{t('options.deadlineOther')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Titre */}
        <FormField
          control={form.control}
          name="titre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.echeanceTitleRequired')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input {...field} placeholder="Ex: Dépôt conclusions" />
                  {form.formState.errors.titre && (
                    <Icons.xCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                  {!form.formState.errors.titre && field.value && (
                    <Icons.checkCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder={t('placeholders.deadlineDetails')} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Calculateur de délais */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Icons.calendar className="h-5 w-5" />
                  {t('helpers.calculatorTitle')}
                </CardTitle>
                <CardDescription>
                  {t('helpers.calculatorDesc')}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCalculator(!showCalculator)}
              >
                {showCalculator ? t('buttons.hide') : t('buttons.show')}
              </Button>
            </div>
          </CardHeader>
          {showCalculator && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('helpers.startDate')}</label>
                  <Input
                    type="date"
                    value={dateDepart}
                    onChange={(e) => setDateDepart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('helpers.numberOfDays')}</label>
                  <Input
                    type="number"
                    value={nombreJours}
                    onChange={(e) => setNombreJours(parseInt(e.target.value) || 0)}
                    placeholder="Ex: 30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('helpers.delayType')}</label>
                  <Select value={typeDelai} onValueChange={(value: any) => setTypeDelai(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jours_calendaires">{t('options.delayCalendar')}</SelectItem>
                      <SelectItem value="jours_ouvrables">{t('options.delayWorking')}</SelectItem>
                      <SelectItem value="jours_francs">{t('options.delayFranc')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button type="button" onClick={handleCalculer} variant="secondary">
                  <Icons.calendar className="mr-2 h-4 w-4" />
                  {t('buttons.calculate')}
                </Button>
                {dateCalculee && (
                  <div className="text-sm">
                    {t('helpers.calculatedDeadline')} <span className="font-semibold">{new Date(dateCalculee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Date d'échéance */}
        <FormField
          control={form.control}
          name="date_echeance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.deadlineRequired')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Icons.calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input {...field} type="date" className="pl-10" />
                </div>
              </FormControl>
              <FormDescription>
                {t('labels.calculatorManualNote')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Rappels */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('helpers.autoReminders')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="rappel_j15"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">{t('helpers.reminder15')}</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rappel_j7"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">{t('helpers.reminder7')}</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rappel_j3"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">{t('helpers.reminder3')}</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rappel_j1"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">{t('helpers.reminderEve')}</FormLabel>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Statut */}
        <FormField
          control={form.control}
          name="statut"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('labels.status')}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="actif">{t('options.echeanceActif')}</SelectItem>
                  <SelectItem value="respecte">{t('options.echeanceRespected')}</SelectItem>
                  <SelectItem value="depasse">{t('options.echeanceOverdue')}</SelectItem>
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
              <FormLabel>{t('labels.internalNotes')}</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder={t('placeholders.internalNotes')} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Boutons d'action */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? t('buttons.update') : t('buttons.createEcheance')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            {t('buttons.cancel')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
