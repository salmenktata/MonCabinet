'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteTimeEntryAction } from '@/app/actions/time-entries'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icons } from '@/lib/icons'
import type { TimeEntry } from '@/types/time-tracking'

interface TimeEntryCardProps {
  entry: TimeEntry
  showDossierInfo?: boolean
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}

export default function TimeEntryCard({ entry, showDossierInfo = false }: TimeEntryCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const isFacturee = !!entry.facture_id

  const borderColor = isFacturee
    ? 'border-l-green-500'
    : entry.facturable
    ? 'border-l-blue-500'
    : 'border-l-border'

  const handleDelete = async () => {
    if (!confirm('Supprimer cette entrée de temps ?')) return
    setLoading(true)
    const result = await deleteTimeEntryAction(entry.id)
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    toast.success('Entrée supprimée')
    router.refresh()
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-card shadow-sm hover:shadow-md transition-all duration-200 border-l-4 p-4',
        borderColor
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges + date */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-xs text-muted-foreground">
              {new Date(entry.date).toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>

            {entry.heure_debut && (
              <span className="text-xs text-muted-foreground">
                {entry.heure_debut}
                {entry.heure_fin && ` → ${entry.heure_fin}`}
              </span>
            )}

            {isFacturee ? (
              <Badge
                variant="outline"
                className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400"
              >
                <Icons.check className="h-3 w-3 mr-1" />
                Facturé
              </Badge>
            ) : entry.facturable ? (
              <Badge
                variant="outline"
                className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400"
              >
                Facturable
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Non facturable
              </Badge>
            )}
          </div>

          {/* Description */}
          <h3 className="text-sm font-semibold text-foreground leading-snug">
            {entry.description}
          </h3>

          {/* Dossier */}
          {showDossierInfo && entry.dossiers && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Icons.dossiers className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {entry.dossiers.numero}
                {entry.dossiers.objet ? ` — ${entry.dossiers.objet}` : ''}
              </span>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.notes}</p>
          )}

          {/* Durée + montant */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-foreground font-medium">
              <Icons.clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{formatDuration(entry.duree_minutes)}</span>
            </div>

            {entry.taux_horaire && entry.taux_horaire > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {Number(entry.taux_horaire).toFixed(0)} TND/h
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold text-blue-600">
                  {parseFloat(entry.montant_calcule || '0').toFixed(3)} TND
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions dropdown — masqué si facturé */}
        {!isFacturee && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={loading}
              >
                {loading ? (
                  <Icons.loader className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.moreHorizontal className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => router.push(`/time-tracking/${entry.id}/edit`)}
                disabled={loading}
              >
                <Icons.edit className="mr-2 h-4 w-4" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={loading}
                className="text-destructive focus:text-destructive"
              >
                <Icons.delete className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
