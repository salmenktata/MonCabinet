'use client'

import * as React from 'react'
import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DataTable, DataTableColumn } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog, useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Dossier {
  id: string
  numero: string
  objet: string
  statut: 'actif' | 'clos' | 'archive'
  type_procedure: string
  client?: {
    nom: string
    prenom?: string
    type_client: string
  }
  created_at: string
  date_ouverture?: string
}

interface DossiersDataTableProps {
  dossiers: Dossier[]
  onDelete?: (dossier: Dossier) => Promise<void>
  onArchive?: (dossier: Dossier) => Promise<void>
  onClose?: (dossier: Dossier) => Promise<void>
}

export function DossiersDataTable({
  dossiers,
  onDelete,
  onArchive,
  onClose,
}: DossiersDataTableProps) {
  const router = useRouter()
  const t = useTranslations('dossiers')
  const { confirm, dialog } = useConfirmDialog()

  // Fonction pour formater la date (mémorisée)
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }, [])

  // Obtenir le badge de statut (mémorisé)
  const getStatusBadge = useCallback((statut: Dossier['statut']) => {
    const variants = {
      actif: {
        className: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
        icon: Icons.checkCircle,
        label: 'Actif',
      },
      clos: {
        className: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
        icon: Icons.xCircle,
        label: 'Clôturé',
      },
      archive: {
        className: 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400',
        icon: Icons.archive,
        label: 'Archivé',
      },
    }

    const variant = variants[statut]
    const Icon = variant.icon

    return (
      <Badge variant="secondary" className={cn(variant.className)}>
        <Icon className="mr-1 h-3 w-3" />
        {variant.label}
      </Badge>
    )
  }, [])

  // Obtenir le nom du client (mémorisé)
  const getClientName = useCallback((client?: Dossier['client']) => {
    if (!client) return 'Non assigné'
    if (client.type_client === 'personne_physique') {
      return `${client.prenom || ''} ${client.nom}`.trim()
    }
    return client.nom
  }, [])

  // Gérer l'archivage (mémorisé)
  const handleArchive = useCallback(async (dossier: Dossier) => {
    await confirm({
      title: 'Archiver le dossier ?',
      description: `Le dossier "${dossier.numero}" sera déplacé vers les archives. Vous pourrez le restaurer à tout moment.`,
      confirmLabel: 'Archiver',
      variant: 'default',
      icon: 'warning',
      onConfirm: async () => {
        if (onArchive) {
          await onArchive(dossier)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Dossier archivé avec succès')
        router.refresh()
      },
    })
  }, [confirm, onArchive, router])

  // Gérer la clôture (mémorisé)
  const handleClose = useCallback(async (dossier: Dossier) => {
    await confirm({
      title: 'Clôturer le dossier ?',
      description: `Le dossier "${dossier.numero}" sera marqué comme clôturé. Il ne pourra plus être modifié.`,
      confirmLabel: 'Clôturer',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        if (onClose) {
          await onClose(dossier)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Dossier clôturé avec succès')
        router.refresh()
      },
    })
  }, [confirm, onClose, router])

  // Gérer la suppression (mémorisé)
  const handleDelete = useCallback(async (dossier: Dossier) => {
    await confirm({
      title: 'Supprimer le dossier ?',
      description: `Le dossier "${dossier.numero}" et toutes ses données associées seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel: 'Supprimer définitivement',
      variant: 'destructive',
      icon: 'danger',
      onConfirm: async () => {
        if (onDelete) {
          await onDelete(dossier)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Dossier supprimé avec succès')
        router.refresh()
      },
    })
  }, [confirm, onDelete, router])

  // Définition des colonnes (mémorisée)
  const columns: DataTableColumn<Dossier>[] = useMemo(() => [
    {
      id: 'numero',
      header: 'Numéro',
      accessor: (dossier) => (
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icons.dossiers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{dossier.numero}</div>
            <div className="text-xs text-muted-foreground">
              {formatDate(dossier.created_at)}
            </div>
          </div>
        </div>
      ),
      sortable: true,
      className: 'min-w-[180px]',
    },
    {
      id: 'objet',
      header: 'Objet',
      accessor: (dossier) => (
        <div>
          <div className="font-medium line-clamp-1">{dossier.objet}</div>
          <div className="text-xs text-muted-foreground">{dossier.type_procedure}</div>
        </div>
      ),
      sortable: true,
      className: 'min-w-[250px]',
    },
    {
      id: 'client',
      header: 'Client',
      accessor: (dossier) => (
        <div className="flex items-center gap-2">
          {dossier.client?.type_client === 'personne_physique' ? (
            <Icons.user className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Icons.building className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">{getClientName(dossier.client)}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'statut',
      header: 'Statut',
      accessor: (dossier) => getStatusBadge(dossier.statut),
      sortable: true,
    },
    {
      id: 'actions',
      header: '',
      accessor: (dossier) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <Icons.moreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dossiers/${dossier.id}`}>
                <Icons.eye className="mr-2 h-4 w-4" />
                Voir les détails
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dossiers/${dossier.id}/edit`}>
                <Icons.edit className="mr-2 h-4 w-4" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {dossier.statut === 'actif' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose(dossier)
                }}
              >
                <Icons.checkCircle className="mr-2 h-4 w-4" />
                Clôturer
              </DropdownMenuItem>
            )}
            {dossier.statut !== 'archive' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleArchive(dossier)
                }}
              >
                <Icons.archive className="mr-2 h-4 w-4" />
                Archiver
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(dossier)
              }}
            >
              <Icons.delete className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-12',
    },
  ], [formatDate, getStatusBadge, getClientName, handleArchive, handleClose, handleDelete])

  return (
    <>
      {dialog}
      <DataTable
        data={dossiers}
        columns={columns}
        searchable
        searchPlaceholder="Rechercher un dossier (numéro, objet)..."
        selectable
        onSelectionChange={(selected) => {
          console.log('Dossiers sélectionnés:', selected)
        }}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        emptyMessage="Aucun dossier trouvé"
        onRowClick={(dossier) => {
          window.location.href = `/dossiers/${dossier.id}`
        }}
        getRowId={(dossier) => dossier.id}
      />
    </>
  )
}
