'use client'

import * as React from 'react'
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

interface Facture {
  id: string
  numero: string
  objet: string
  statut: 'brouillon' | 'envoyee' | 'payee' | 'impayee'
  montant_ht: number
  montant_ttc: number
  date_emission: string
  date_echeance?: string
  client?: {
    nom: string
    prenom?: string
    type_client: string
  }
}

interface FacturesDataTableProps {
  factures: Facture[]
  onDelete?: (facture: Facture) => Promise<void>
  onCancel?: (facture: Facture) => Promise<void>
  onMarkAsPaid?: (facture: Facture) => Promise<void>
}

export function FacturesDataTable({
  factures,
  onDelete,
  onCancel,
  onMarkAsPaid,
}: FacturesDataTableProps) {
  const router = useRouter()
  const t = useTranslations('factures')
  const { confirm, dialog } = useConfirmDialog()

  // Fonction pour formater la date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  // Fonction pour formater le montant
  const formatMontant = (montant: number) => {
    return `${montant.toFixed(3)} TND`
  }

  // Vérifier si la facture est en retard
  const isOverdue = (facture: Facture) => {
    if (!facture.date_echeance || facture.statut === 'payee') return false
    const echeance = new Date(facture.date_echeance)
    return echeance < new Date()
  }

  // Obtenir le badge de statut
  const getStatusBadge = (facture: Facture) => {
    const overdue = isOverdue(facture)

    const variants = {
      brouillon: {
        className: 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400',
        label: 'Brouillon',
      },
      envoyee: {
        className: overdue
          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
        label: overdue ? 'En retard' : 'Envoyée',
      },
      payee: {
        className: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
        label: 'Payée',
      },
      impayee: {
        className: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
        label: 'Impayée',
      },
    }

    const variant = variants[facture.statut]

    return (
      <Badge variant="secondary" className={cn(variant.className)}>
        {variant.label}
      </Badge>
    )
  }

  // Obtenir le nom du client
  const getClientName = (client?: Facture['client']) => {
    if (!client) return 'Non assigné'
    if (client.type_client === 'personne_physique') {
      return `${client.prenom || ''} ${client.nom}`.trim()
    }
    return client.nom
  }

  // Gérer le marquage comme payée
  const handleMarkAsPaid = async (facture: Facture) => {
    await confirm({
      title: 'Marquer comme payée ?',
      description: `La facture "${facture.numero}" sera marquée comme payée.`,
      confirmLabel: 'Marquer comme payée',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        if (onMarkAsPaid) {
          await onMarkAsPaid(facture)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Facture marquée comme payée')
        router.refresh()
      },
    })
  }

  // Gérer l'annulation
  const handleCancel = async (facture: Facture) => {
    await confirm({
      title: 'Annuler la facture ?',
      description: `La facture "${facture.numero}" sera marquée comme annulée. Cette action ne peut pas être annulée.`,
      confirmLabel: 'Annuler la facture',
      variant: 'destructive',
      icon: 'danger',
      onConfirm: async () => {
        if (onCancel) {
          await onCancel(facture)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Facture annulée')
        router.refresh()
      },
    })
  }

  // Gérer la suppression
  const handleDelete = async (facture: Facture) => {
    await confirm({
      title: 'Supprimer la facture ?',
      description: `La facture "${facture.numero}" sera définitivement supprimée. Cette action est irréversible.`,
      confirmLabel: 'Supprimer définitivement',
      variant: 'destructive',
      icon: 'danger',
      onConfirm: async () => {
        if (onDelete) {
          await onDelete(facture)
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        toast.success('Facture supprimée avec succès')
        router.refresh()
      },
    })
  }

  // Définition des colonnes
  const columns: DataTableColumn<Facture>[] = [
    {
      id: 'numero',
      header: 'Numéro',
      accessor: (facture) => (
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icons.invoices className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{facture.numero}</div>
            <div className="text-xs text-muted-foreground">
              {formatDate(facture.date_emission)}
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
      accessor: (facture) => (
        <div className="max-w-[300px]">
          <div className="font-medium line-clamp-1">{facture.objet}</div>
          {facture.date_echeance && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Icons.calendar className="h-3 w-3" />
              Échéance : {formatDate(facture.date_echeance)}
            </div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      id: 'client',
      header: 'Client',
      accessor: (facture) => (
        <div className="flex items-center gap-2">
          {facture.client?.type_client === 'personne_physique' ? (
            <Icons.user className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Icons.building className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">{getClientName(facture.client)}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'montant',
      header: 'Montant',
      accessor: (facture) => (
        <div className="text-right">
          <div className="font-semibold">{formatMontant(facture.montant_ttc)}</div>
          <div className="text-xs text-muted-foreground">
            HT : {formatMontant(facture.montant_ht)}
          </div>
        </div>
      ),
      sortable: true,
      className: 'text-right',
    },
    {
      id: 'statut',
      header: 'Statut',
      accessor: (facture) => getStatusBadge(facture),
      sortable: true,
    },
    {
      id: 'actions',
      header: '',
      accessor: (facture) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <Icons.moreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/factures/${facture.id}`}>
                <Icons.eye className="mr-2 h-4 w-4" />
                Voir les détails
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/factures/${facture.id}/edit`}>
                <Icons.edit className="mr-2 h-4 w-4" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icons.download className="mr-2 h-4 w-4" />
              Télécharger PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {facture.statut !== 'payee' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkAsPaid(facture)
                }}
              >
                <Icons.checkCircle className="mr-2 h-4 w-4 text-green-600" />
                Marquer comme payée
              </DropdownMenuItem>
            )}
            {facture.statut === 'brouillon' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancel(facture)
                }}
              >
                <Icons.xCircle className="mr-2 h-4 w-4" />
                Annuler la facture
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(facture)
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
  ]

  return (
    <>
      {dialog}
      <DataTable
        data={factures}
        columns={columns}
        searchable
        searchPlaceholder="Rechercher une facture (numéro, objet)..."
        selectable
        onSelectionChange={(selected) => {
          console.log('Factures sélectionnées:', selected)
        }}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        emptyMessage="Aucune facture trouvée"
        onRowClick={(facture) => {
          router.push(`/factures/${facture.id}`)
        }}
        getRowId={(facture) => facture.id}
      />
    </>
  )
}
