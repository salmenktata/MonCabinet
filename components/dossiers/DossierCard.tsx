'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { getWorkflowEtape, getWorkflowProgress } from '@/lib/workflows/civil'
import { usePrefetchDossier } from '@/lib/hooks/useDossiers'
import { User, Building2, Users, Calendar, Banknote } from 'lucide-react'

interface DossierCardProps {
  dossier: any
}

// Couleurs par type de procédure
const TYPE_COLORS: Record<string, string> = {
  civil_premiere_instance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  commercial: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  divorce: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  penal: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  administratif: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  refere: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  faillite: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  cassation: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  social: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  execution_forcee: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

// Couleurs par statut
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closed: 'bg-muted text-muted-foreground',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  // raw DB values en fallback
  actif: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  en_cours: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  clos: 'bg-muted text-muted-foreground',
  archive: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

// Couleurs par priorité
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

// Couleurs de la barre de progression par statut
const PROGRESS_BAR_COLORS: Record<string, string> = {
  open: 'bg-emerald-500',
  in_progress: 'bg-blue-600',
  pending: 'bg-amber-500',
  closed: 'bg-slate-400',
  archived: 'bg-slate-300',
}

export default function DossierCard({ dossier }: DossierCardProps) {
  const t = useTranslations('dossiers')
  const tCards = useTranslations('cards')
  const locale = useLocale()
  const prefetchDossier = usePrefetchDossier()

  const workflowKey = dossier.workflowEtape || dossier.workflow_etape_actuelle || 'ASSIGNATION'
  const etapeActuelle = getWorkflowEtape(workflowKey)
  const progress = getWorkflowProgress(workflowKey)

  // Client name — compatible avec les deux formes (client vs clients)
  const clientData = dossier.client || dossier.clients
  const clientName = clientData
    ? clientData.type === 'personne_physique' || clientData.type_client === 'personne_physique'
      ? `${clientData.nom} ${clientData.prenom || ''}`.trim()
      : clientData.nom
    : tCards('unknownClient')

  // Objet — compatible avec les deux formes
  const objet = dossier.objet || dossier.description || ''

  // Tribunal — compatible avec les deux formes
  const tribunal = dossier.tribunal || dossier.juridiction

  // Status — prendre la valeur mappée ou la brute
  const status = dossier.status || dossier.statut || 'open'

  // Labels traduits — maps statiques (évite problème de clés dynamiques next-intl)
  const TYPE_LABELS: Record<string, string> = {
    civil_premiere_instance: t('types.civil_premiere_instance'),
    divorce: t('types.divorce'),
    commercial: t('types.commercial'),
    refere: t('types.refere'),
    penal: t('types.penal'),
    administratif: t('types.administratif'),
    faillite: t('types.faillite'),
    execution_forcee: t('types.execution_forcee'),
    cassation: t('types.cassation'),
    social: t('types.social'),
    autre: t('types.autre'),
  }
  const STATUS_LABELS: Record<string, string> = {
    open: t('statusLabels.open'),
    in_progress: t('statusLabels.in_progress'),
    pending: t('statusLabels.pending'),
    closed: t('statusLabels.closed'),
    archived: t('statusLabels.archived'),
    // aliases DB
    actif: t('statusLabels.open'),
    en_cours: t('statusLabels.in_progress'),
    clos: t('statusLabels.closed'),
    archive: t('statusLabels.archived'),
  }
  const PRIORITY_LABELS: Record<string, string> = {
    low: t('priorityLabels.low'),
    medium: t('priorityLabels.medium'),
    high: t('priorityLabels.high'),
    urgent: t('priorityLabels.urgent'),
  }

  // Type de procédure
  const type = dossier.type || dossier.type_procedure || 'autre'
  const typeLabel = TYPE_LABELS[type] || type
  const typeColor = TYPE_COLORS[type] || 'bg-gray-100 text-gray-600'

  // Status label traduit
  const statusLabel = STATUS_LABELS[status] || status
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS['open']

  // Priority
  const priority = dossier.priority || dossier.priorite
  const priorityLabel = priority ? (PRIORITY_LABELS[priority] || priority) : null
  const priorityColor = priority ? (PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-500') : ''

  // Date d'ouverture
  const dateOuverture = dossier.dateOuverture || dossier.date_ouverture
  const formattedDate = dateOuverture
    ? new Date(dateOuverture).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null

  // Montant
  const montant = dossier.montantLitige || dossier.montant_litige || dossier.montant
  const formattedMontant = montant
    ? new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(montant) + ' TND'
    : null

  // Partie adverse
  const partieAdverse = dossier.partieAdverse || dossier.partie_adverse

  // Couleur barre de progression
  const progressBarColor = PROGRESS_BAR_COLORS[status] || 'bg-blue-600'

  return (
    <Link
      href={`/dossiers/${dossier.id}`}
      onMouseEnter={() => prefetchDossier(dossier.id)}
      className="block group"
    >
      <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-600 flex flex-col h-full">
        {/* En-tête : type + statut */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${typeColor}`}>
            {typeLabel}
          </span>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Numéro + priorité */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-bold text-foreground group-hover:text-blue-600 transition-colors">
            {dossier.numero || '—'}
          </h3>
          {priorityLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor}`}>
              {priorityLabel}
            </span>
          )}
        </div>

        {/* Objet */}
        {objet && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-snug">
            {objet}
          </p>
        )}

        {/* Infos du dossier */}
        <div className="space-y-1.5 flex-1">
          {/* Client */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="truncate font-medium text-foreground">{clientName}</span>
          </div>

          {/* Tribunal */}
          {tribunal && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tribunal}</span>
            </div>
          )}

          {/* Partie adverse */}
          {partieAdverse && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                <span className="text-muted-foreground/70">{t('partieAdverse')} : </span>
                {partieAdverse}
              </span>
            </div>
          )}

          {/* Date d'ouverture */}
          {formattedDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="text-muted-foreground/70">{t('dateOuverture')} : </span>
                {formattedDate}
              </span>
            </div>
          )}

          {/* Montant litige */}
          {formattedMontant && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Banknote className="h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="text-muted-foreground/70">{t('montantLitige')} : </span>
                <span className="font-medium text-foreground">{formattedMontant}</span>
              </span>
            </div>
          )}
        </div>

        {/* Barre de progression */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              {etapeActuelle ? (
                <>
                  <span className="text-muted-foreground/70">{t('workflowStep')} : </span>
                  <span className="font-medium text-foreground">{etapeActuelle.nom}</span>
                </>
              ) : (
                tCards('progression')
              )}
            </span>
            <span className="text-xs font-semibold text-blue-600">{progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${progressBarColor} rounded-full transition-all duration-300`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
