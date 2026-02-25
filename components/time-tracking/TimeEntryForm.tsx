'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { timeEntrySchema, type TimeEntryFormData } from '@/lib/validations/time-entry'
import { createTimeEntryAction, updateTimeEntryAction } from '@/app/actions/time-entries'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface DossierOption {
  id: string
  numero: string
  objet?: string
}

interface TimeEntryFormProps {
  entryId?: string
  initialData?: Partial<TimeEntryFormData>
  isEditing?: boolean
  dossierId?: string
  dossiers?: DossierOption[]
  tauxHoraireDefaut?: number
  onSuccess?: () => void
}

const QUICK_DURATIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
]

export default function TimeEntryForm({
  entryId,
  initialData,
  isEditing = false,
  dossierId: propDossierId,
  dossiers = [],
  tauxHoraireDefaut,
  onSuccess,
}: TimeEntryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: initialData || {
      dossier_id: propDossierId || '',
      date: new Date().toISOString().split('T')[0],
      duree_minutes: 60,
      taux_horaire: tauxHoraireDefaut || undefined,
      facturable: true,
    },
  })

  const dureeMinutes = watch('duree_minutes') || 0
  const tauxHoraire = watch('taux_horaire') || 0
  const montantCalcule = (dureeMinutes / 60) * tauxHoraire

  const heures = Math.floor(dureeMinutes / 60)
  const minutes = dureeMinutes % 60

  const onSubmit = async (data: TimeEntryFormData) => {
    setLoading(true)
    try {
      const result =
        isEditing && entryId
          ? await updateTimeEntryAction(entryId, data)
          : await createTimeEntryAction(data)

      if (result.error) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      toast.success(isEditing ? 'Entrée modifiée' : 'Entrée ajoutée')

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/time-tracking')
        router.refresh()
      }
    } catch {
      toast.error('Une erreur est survenue')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Dossier — affiché seulement si pas pré-sélectionné */}
      {!propDossierId && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Dossier <span className="text-destructive">*</span>
          </label>
          <select
            {...register('dossier_id')}
            className={cn(
              'block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
              errors.dossier_id && 'border-destructive'
            )}
          >
            <option value="">Sélectionner un dossier…</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.numero}
                {d.objet ? ` — ${d.objet}` : ''}
              </option>
            ))}
          </select>
          {errors.dossier_id && (
            <p className="text-xs text-destructive">{errors.dossier_id.message}</p>
          )}
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Description <span className="text-destructive">*</span>
        </label>
        <Input
          {...register('description')}
          placeholder="Ex : Consultation client, Rédaction mémoire…"
          className={cn(errors.description && 'border-destructive')}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Date <span className="text-destructive">*</span>
        </label>
        <Input
          type="date"
          {...register('date')}
          className={cn(errors.date && 'border-destructive')}
        />
        {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
      </div>

      {/* Durée */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Durée <span className="text-destructive">*</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Heures</label>
            <Input
              type="number"
              value={heures}
              onChange={(e) =>
                setValue('duree_minutes', (parseInt(e.target.value) || 0) * 60 + minutes)
              }
              min="0"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Minutes</label>
            <Input
              type="number"
              value={minutes}
              onChange={(e) =>
                setValue('duree_minutes', heures * 60 + (parseInt(e.target.value) || 0))
              }
              min="0"
              max="59"
            />
          </div>
        </div>

        <input type="hidden" {...register('duree_minutes', { valueAsNumber: true })} />

        <div className="flex flex-wrap gap-1.5">
          {QUICK_DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              onClick={() => setValue('duree_minutes', d.minutes)}
              className={cn(
                'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                dureeMinutes === d.minutes
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                  : 'border bg-card text-foreground hover:bg-muted'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {errors.duree_minutes && (
          <p className="text-xs text-destructive">{errors.duree_minutes.message}</p>
        )}
      </div>

      {/* Taux horaire */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Taux horaire (TND/h)</label>
        <Input
          type="number"
          step="0.001"
          {...register('taux_horaire', { valueAsNumber: true })}
          placeholder="Ex : 150"
        />
        {errors.taux_horaire && (
          <p className="text-xs text-destructive">{errors.taux_horaire.message}</p>
        )}
      </div>

      {/* Montant calculé */}
      {tauxHoraire > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 p-4">
          <div className="flex items-center gap-3">
            <Icons.dollar className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Montant calculé</div>
              <div className="text-xl font-bold text-blue-600">{montantCalcule.toFixed(3)} TND</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {(dureeMinutes / 60).toFixed(2)} h × {tauxHoraire.toFixed(3)} TND/h
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Facturable */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('facturable')}
            className="h-4 w-4 rounded border-input accent-blue-600"
          />
          <span className="text-sm text-foreground">Temps facturable</span>
        </label>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Notes internes</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Notes internes (non visibles par le client)"
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={loading}>
          {loading && <Icons.loader className="mr-1.5 h-4 w-4 animate-spin" />}
          {isEditing ? 'Enregistrer les modifications' : "Ajouter l'entrée"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
