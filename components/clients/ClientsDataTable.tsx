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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

interface Client {
  id: string
  nom: string
  prenom: string
  email: string
  telephone?: string
  cin?: string
  type_client: 'PARTICULIER' | 'ENTREPRISE'
  created_at: string
}

interface ClientsDataTableProps {
  clients: Client[]
  onDelete?: (client: Client) => void
}

export function ClientsDataTable({ clients, onDelete }: ClientsDataTableProps) {
  const router = useRouter()
  const t = useTranslations('clients')
  const tCommon = useTranslations('common')

  // Fonction pour obtenir les initiales
  const getInitials = (client: Client) => {
    return `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase()
  }

  // Fonction pour formater la date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays < 7) {
      return (
        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
          {t('newBadge')}
        </Badge>
      )
    }

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  // Définition des colonnes
  const columns: DataTableColumn<Client>[] = [
    {
      id: 'client',
      header: t('clientColumn'),
      accessor: (client) => (
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(client)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">
              {client.prenom} {client.nom}
            </div>
            {client.cin && (
              <div className="text-sm text-muted-foreground">CIN: {client.cin}</div>
            )}
          </div>
        </div>
      ),
      sortable: true,
      className: 'min-w-[200px]',
    },
    {
      id: 'email',
      header: t('emailColumn'),
      accessor: (client) => (
        <div className="flex items-center gap-2">
          <Icons.mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{client.email}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'telephone',
      header: t('phoneColumn'),
      accessor: (client) =>
        client.telephone ? (
          <div className="flex items-center gap-2">
            <Icons.phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{client.telephone}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: 'type',
      header: t('typeColumn'),
      accessor: (client) => (
        <Badge variant={client.type_client === 'PARTICULIER' ? 'default' : 'secondary'}>
          {client.type_client === 'PARTICULIER' ? (
            <div className="flex items-center gap-1">
              <Icons.user className="h-3 w-3" />
              <span>{t('particulier')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Icons.building className="h-3 w-3" />
              <span>{t('entreprise')}</span>
            </div>
          )}
        </Badge>
      ),
      sortable: true,
    },
    {
      id: 'created_at',
      header: t('addedColumn'),
      accessor: (client) => formatDate(client.created_at),
      sortable: true,
    },
    {
      id: 'actions',
      header: '',
      accessor: (client) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <Icons.moreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}`}>
                <Icons.eye className="mr-2 h-4 w-4" />
                {t('viewDetails')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Icons.edit className="mr-2 h-4 w-4" />
                {t('editClient')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(client)
              }}
            >
              <Icons.delete className="mr-2 h-4 w-4" />
              {tCommon('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-12',
    },
  ]

  return (
    <DataTable
      data={clients}
      columns={columns}
      searchable
      searchPlaceholder={t('searchPlaceholderFull')}
      selectable
      onSelectionChange={(selected) => {
        console.log('Clients sélectionnés:', selected)
      }}
      pageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      emptyMessage={t('noClientsFound')}
      onRowClick={(client) => {
        router.push(`/clients/${client.id}`)
      }}
      getRowId={(client) => client.id}
    />
  )
}
