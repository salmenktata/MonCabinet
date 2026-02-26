'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteEcheanceAction, marquerEcheanceRespecte } from '@/app/actions/echeances'
import { joursRestants, niveauUrgence, formatterDelai } from '@/lib/utils/delais-tunisie'
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

interface EcheanceData {
  id: string
  titre: string
  description?: string
  date_echeance: string
  type_echeance: 'audience' | 'delai_legal' | 'delai_interne' | 'autre'
  statut: 'actif' | 'respecte' | 'depasse'
  delai_type?: string
  date_point_depart?: string
  nombre_jours?: number
  rappel_j15: boolean
  rappel_j7: boolean
  rappel_j3: boolean
  rappel_j1: boolean
  dossiers?: {
    id: string
    numero: string
    objet?: string
    clients?: { type_client: string; nom: string; prenom?: string }
  }
}

interface EcheanceCardProps {
  echeance: EcheanceData
  showDossierInfo?: boolean
}

const urgenceBorderColor: Record<string, string> = {
  depasse: 'border-l-red-500',
  critique: 'border-l-orange-500',
  urgent: 'border-l-yellow-500',
  proche: 'border-l-blue-500',
  normal: 'border-l-border',
}

const urgenceBadgeStyle: Record<string, string> = {
  depasse: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400',
  critique: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400',
  urgent: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400',
  proche: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400',
  normal: '',
}

const typeColors: Record<string, string> = {
  audience: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400',
  delai_legal: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400',
  delai_interne: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400',
  autre: '',
}

export default function EcheanceCard({ echeance, showDossierInfo = false }: EcheanceCardProps) {
  const router = useRouter()
  const t = useTranslations('echeances.types')
  const tEch = useTranslations('echeances')
  const tCommon = useTranslations('common')
  const tConfirm = useTranslations('confirmations')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const typeLabels: Record<string, string> = {
    audience: t('AUDIENCE'),
    delai_legal: t('DELAI_LEGAL'),
    delai_interne: t('DELAI_INTERNE'),
    autre: t('AUTRE'),
  }

  const dateEcheance = new Date(echeance.date_echeance)
  const jours = joursRestants(dateEcheance)
  const urgence = niveauUrgence(dateEcheance)

  const handleDelete = async () => {
    if (!confirm(tConfirm('deleteDeadline'))) return
    setLoading(true)
    const result = await deleteEcheanceAction(echeance.id)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.refresh()
  }

  const handleMarquerRespecte = async () => {
    setLoading(true)
    const result = await marquerEcheanceRespecte(echeance.id)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.refresh()
  }

  const getDossierName = () => {
    if (!echeance.dossiers) return ''
    const client = echeance.dossiers.clients
    if (!client) return echeance.dossiers.numero
    const clientName =
      client.type_client === 'personne_physique'
        ? `${client.nom} ${client.prenom || ''}`.trim()
        : client.nom
    return `${echeance.dossiers.numero} - ${clientName}`
  }

  const hasRappels = echeance.rappel_j15 || echeance.rappel_j7 || echeance.rappel_j3 || echeance.rappel_j1

  return (
    <div
      className={cn(
        'rounded-xl border bg-card shadow-sm hover:shadow-md transition-all duration-200 border-l-4 p-4',
        urgenceBorderColor[urgence]
      )}
    >
      <div className="flex items-start gap-3">
        {/* Contenu principal */}
        <div className="flex-1 min-w-0">
          {/* Badges type + statut + urgence */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Badge variant="outline" className={cn('text-xs', typeColors[echeance.type_echeance])}>
              {typeLabels[echeance.type_echeance]}
            </Badge>

            {echeance.statut === 'respecte' && (
              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400">
                <Icons.check className="h-3 w-3 mr-1" />
                {tEch('respected')}
              </Badge>
            )}

            {urgence !== 'normal' && (
              <Badge variant="outline" className={cn('text-xs', urgenceBadgeStyle[urgence])}>
                {formatterDelai(jours)}
              </Badge>
            )}
          </div>

          {/* Titre */}
          <h3 className="text-sm font-semibold text-foreground leading-snug">{echeance.titre}</h3>

          {/* Description */}
          {echeance.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{echeance.description}</p>
          )}

          {/* Dossier */}
          {showDossierInfo && echeance.dossiers && (
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Icons.dossiers className="h-3 w-3 shrink-0" />
              <span className="truncate">{getDossierName()}</span>
            </div>
          )}

          {/* Date + délai */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Icons.calendar className="h-3 w-3 shrink-0" />
              <span>
                {dateEcheance.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>

            {urgence === 'normal' && (
              <div className="flex items-center gap-1">
                <Icons.clock className="h-3 w-3 shrink-0" />
                <span className="text-foreground font-medium">{formatterDelai(jours)}</span>
              </div>
            )}
          </div>

          {/* Calcul délai légal */}
          {echeance.delai_type && echeance.date_point_depart && (
            <div className="mt-2 flex items-start gap-1 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              <Icons.info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {echeance.nombre_jours} jour(s){' '}
                {echeance.delai_type === 'jours_ouvrables'
                  ? tEch('workingDays')
                  : echeance.delai_type === 'jours_francs'
                  ? tEch('frankDays')
                  : tEch('calendarDays')}{' '}
                {tEch('sinceDate', { date: new Date(echeance.date_point_depart).toLocaleDateString('fr-FR') })}
              </span>
            </div>
          )}

          {/* Rappels */}
          {echeance.statut === 'actif' && hasRappels && (
            <div className="mt-2 flex items-center gap-1.5">
              <Icons.bell className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex gap-1">
                {echeance.rappel_j15 && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1">J-15</span>
                )}
                {echeance.rappel_j7 && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1">J-7</span>
                )}
                {echeance.rappel_j3 && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1">J-3</span>
                )}
                {echeance.rappel_j1 && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1">J-1</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions dropdown */}
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
            {echeance.statut === 'actif' && (
              <DropdownMenuItem onClick={handleMarquerRespecte} disabled={loading}>
                <Icons.check className="mr-2 h-4 w-4 text-green-600" />
                {tEch('markAsRespected')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => router.push(`/echeances/${echeance.id}/edit`)}
              disabled={loading}
            >
              <Icons.edit className="mr-2 h-4 w-4" />
              {tCommon('edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={loading}
              className="text-destructive focus:text-destructive"
            >
              <Icons.delete className="mr-2 h-4 w-4" />
              {tCommon('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <Icons.alertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
