'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import {
  deleteFactureAction,
  changerStatutFactureAction,
  envoyerFactureEmailAction,
} from '@/app/actions/factures'

interface Facture {
  id: string
  numero: string
  objet: string
  statut: 'brouillon' | 'envoyee' | 'payee' | 'impayee'
  montant_ht: number
  montant_ttc: number
  date_emission: string
  date_echeance?: string
  date_paiement?: string
  type_honoraires?: string
  clients?: {
    id?: string
    nom: string
    prenom?: string
    type_client: string
    email?: string
  }
  dossiers?: {
    id?: string
    numero?: string
    objet?: string
  }
}

export function FacturesDataTable({ factures }: { factures: Facture[] }) {
  const router = useRouter()
  const { confirm, dialog } = useConfirmDialog()

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

  const formatMontant = (montant: number) => `${montant.toFixed(3)} TND`

  const isOverdue = (facture: Facture) => {
    if (!facture.date_echeance || facture.statut === 'payee') return false
    return new Date(facture.date_echeance) < new Date()
  }

  const getStatusBadge = (facture: Facture) => {
    const overdue = isOverdue(facture)
    const variants = {
      brouillon: { className: 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400', label: 'Brouillon' },
      envoyee: {
        className: overdue
          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
        label: overdue ? 'En retard' : 'Envoyée',
      },
      payee: { className: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400', label: 'Payée' },
      impayee: { className: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400', label: 'Impayée' },
    }
    const variant = variants[facture.statut]
    return (
      <Badge variant="secondary" className={cn(variant.className)}>
        {variant.label}
      </Badge>
    )
  }

  const getClientName = (client?: Facture['clients']) => {
    if (!client) return '—'
    return client.type_client === 'personne_physique'
      ? `${client.prenom || ''} ${client.nom}`.trim()
      : client.nom
  }

  const handleMarkAsSent = async (facture: Facture) => {
    await confirm({
      title: 'Marquer comme envoyée ?',
      description: `La facture "${facture.numero}" passera en statut "Envoyée".`,
      confirmLabel: 'Marquer comme envoyée',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        const result = await changerStatutFactureAction(facture.id, 'envoyee')
        if (result.error) { toast.error(result.error); return }
        toast.success('Facture marquée comme envoyée')
        router.refresh()
      },
    })
  }

  const handleMarkAsPaid = async (facture: Facture) => {
    await confirm({
      title: 'Marquer comme payée ?',
      description: `La facture "${facture.numero}" sera marquée comme payée.`,
      confirmLabel: 'Marquer comme payée',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        const result = await changerStatutFactureAction(facture.id, 'payee')
        if (result.error) { toast.error(result.error); return }
        toast.success('Facture marquée comme payée')
        router.refresh()
      },
    })
  }

  const handleSendEmail = async (facture: Facture) => {
    if (!facture.clients?.email) {
      toast.error("Le client n'a pas d'adresse email")
      return
    }
    await confirm({
      title: 'Envoyer par email ?',
      description: `La facture "${facture.numero}" sera envoyée à ${facture.clients.email}.`,
      confirmLabel: 'Envoyer',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        const result = await envoyerFactureEmailAction(facture.id)
        if (result.error) { toast.error(result.error); return }
        toast.success(result.message || 'Facture envoyée par email')
        router.refresh()
      },
    })
  }

  const handleDelete = async (facture: Facture) => {
    await confirm({
      title: 'Supprimer la facture ?',
      description: `La facture "${facture.numero}" sera définitivement supprimée. Cette action est irréversible.`,
      confirmLabel: 'Supprimer définitivement',
      variant: 'destructive',
      icon: 'danger',
      onConfirm: async () => {
        const result = await deleteFactureAction(facture.id)
        if (result.error) { toast.error(result.error); return }
        toast.success('Facture supprimée')
        router.refresh()
      },
    })
  }

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
            <div className="text-xs text-muted-foreground">{formatDate(facture.date_emission)}</div>
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
        <div className="max-w-[280px]">
          <div className="font-medium line-clamp-1">{facture.objet}</div>
          {facture.date_echeance && (
            <div className={cn('text-xs flex items-center gap-1 mt-0.5', isOverdue(facture) ? 'text-red-500' : 'text-muted-foreground')}>
              <Icons.clock className="h-3 w-3" />
              Éch. {formatDate(facture.date_echeance)}
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
          {facture.clients?.type_client === 'personne_physique' ? (
            <Icons.user className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Icons.building className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm truncate max-w-[150px]">{getClientName(facture.clients)}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'montant',
      header: 'Montant TTC',
      accessor: (facture) => (
        <div className="text-right">
          <div className="font-semibold tabular-nums">{formatMontant(facture.montant_ttc)}</div>
          {facture.date_paiement ? (
            <div className="text-xs text-green-600 flex items-center gap-1 justify-end mt-0.5">
              <Icons.checkCircle className="h-3 w-3" />
              {formatDate(facture.date_paiement)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5">
              HT : {formatMontant(facture.montant_ht)}
            </div>
          )}
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
            <DropdownMenuItem asChild>
              <a href={`/api/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Icons.download className="mr-2 h-4 w-4" />
                Télécharger PDF
              </a>
            </DropdownMenuItem>
            {facture.type_honoraires && (
              <DropdownMenuItem asChild>
                <a href={`/api/factures/${facture.id}/note-honoraires`} target="_blank" rel="noopener noreferrer">
                  <Icons.fileText className="mr-2 h-4 w-4" />
                  Note d&apos;honoraires
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {facture.statut === 'brouillon' && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMarkAsSent(facture) }}>
                <Icons.invoices className="mr-2 h-4 w-4 text-blue-600" />
                Marquer comme envoyée
              </DropdownMenuItem>
            )}
            {facture.statut !== 'payee' && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(facture) }}>
                <Icons.checkCircle className="mr-2 h-4 w-4 text-green-600" />
                Marquer comme payée
              </DropdownMenuItem>
            )}
            {facture.clients?.email && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendEmail(facture) }}>
                <Icons.mail className="mr-2 h-4 w-4 text-purple-600" />
                Envoyer par email
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); handleDelete(facture) }}
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
        selectable
        onSelectionChange={() => {}}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        emptyMessage="Aucune facture trouvée"
        onRowClick={(facture) => router.push(`/factures/${facture.id}`)}
        getRowId={(facture) => facture.id}
      />
    </>
  )
}
