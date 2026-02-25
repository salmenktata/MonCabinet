'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Mail, Phone, MapPin, User, Building2, IdCard, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { deleteClientAction } from '@/app/actions/clients'
import { usePrefetchClient } from '@/lib/hooks/useClients'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ClientCardProps {
  client: any
}

const TYPE_STYLES = {
  physical: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    avatar: 'bg-blue-600',
  },
  legal: {
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    avatar: 'bg-purple-600',
  },
}

export default function ClientCard({ client }: ClientCardProps) {
  const router = useRouter()
  const t = useTranslations('cards')
  const prefetchClient = usePrefetchClient()
  const [deleting, setDeleting] = useState(false)

  const isPhysical =
    client.typeClient === 'particulier' ||
    client.typeClient === 'PERSONNE_PHYSIQUE' ||
    client.type_client === 'personne_physique'

  const styles = isPhysical ? TYPE_STYLES.physical : TYPE_STYLES.legal

  const displayName = isPhysical
    ? `${client.nom} ${client.prenom || ''}`.trim()
    : client.nom || client.raisonSociale || '—'

  const initials = isPhysical
    ? `${client.nom?.[0] || ''}${client.prenom?.[0] || ''}`.toUpperCase() || '?'
    : `${client.nom?.[0] || ''}`.toUpperCase() || '?'

  const handleDelete = async () => {
    setDeleting(true)
    const result = await deleteClientAction(client.id)
    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
      return
    }
    toast.success(t('clientDeleted'))
    router.refresh()
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header — Avatar + Nom + Badge type */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-semibold text-sm ${styles.avatar}`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate leading-tight">{displayName}</h3>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shrink-0 ${styles.badge}`}
        >
          {isPhysical ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
          {isPhysical ? t('clientType.physical') : t('clientType.legal')}
        </span>
      </div>

      {/* Infos de contact */}
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {isPhysical && client.cin && (
          <p className="flex items-center gap-1.5">
            <IdCard className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="truncate">CIN: {client.cin}</span>
          </p>
        )}
        {!isPhysical && (client.registre_commerce || client.registreCommerce) && (
          <p className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 shrink-0 text-purple-500" />
            <span className="truncate">RC: {client.registre_commerce || client.registreCommerce}</span>
          </p>
        )}
        {client.email && (
          <p className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{client.email}</span>
          </p>
        )}
        {client.telephone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{client.telephone}</span>
          </p>
        )}
        {client.ville && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{client.ville}</span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Link
          href={`/clients/${client.id}`}
          onMouseEnter={() => prefetchClient(client.id)}
          className="flex-1 rounded-md border border-blue-600 bg-card px-3 py-2 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          {t('viewDetails')}
        </Link>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="rounded-md border border-red-300 bg-card px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              {t('delete')}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('confirmDelete')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteConfirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('close')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? t('deleting') : t('yesDelete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
