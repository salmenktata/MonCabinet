'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Icons } from '@/lib/icons'
import {
  deleteFactureAction,
  changerStatutFactureAction,
  envoyerFactureEmailAction,
} from '@/app/actions/factures'

interface FactureDetailClientProps {
  facture: {
    id: string
    numero: string
    statut: string
    type_honoraires?: string
    clients?: {
      email?: string
    }
  }
}

export default function FactureDetailClient({ facture }: FactureDetailClientProps) {
  const router = useRouter()
  const { confirm, dialog } = useConfirmDialog()

  const handleDelete = async () => {
    await confirm({
      title: 'Supprimer cette facture ?',
      description: 'Cette action est irréversible. La facture sera définitivement supprimée.',
      confirmLabel: 'Supprimer définitivement',
      variant: 'destructive',
      icon: 'danger',
      onConfirm: async () => {
        const result = await deleteFactureAction(facture.id)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Facture supprimée')
        router.push('/factures')
      },
    })
  }

  const handleChangeStatut = async (newStatut: string, label: string) => {
    const result = await changerStatutFactureAction(facture.id, newStatut)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(label)
    router.refresh()
  }

  const handleSendEmail = async () => {
    if (!facture.clients?.email) {
      toast.error("Le client n'a pas d'adresse email")
      return
    }
    await confirm({
      title: 'Envoyer par email ?',
      description: `La facture sera envoyée à ${facture.clients.email}.`,
      confirmLabel: 'Envoyer',
      variant: 'default',
      icon: 'question',
      onConfirm: async () => {
        const result = await envoyerFactureEmailAction(facture.id)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success(result.message || 'Facture envoyée par email')
        router.refresh()
      },
    })
  }

  return (
    <>
      {dialog}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
          Actions
        </h2>

        <div className="space-y-2">
          {/* PDF */}
          <Button variant="default" className="w-full justify-start" asChild>
            <a href={`/api/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Icons.download className="mr-2 h-4 w-4" />
              Télécharger PDF
            </a>
          </Button>

          {/* Note d'honoraires */}
          {facture.type_honoraires && (
            <Button variant="outline" className="w-full justify-start" asChild>
              <a
                href={`/api/factures/${facture.id}/note-honoraires`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icons.fileText className="mr-2 h-4 w-4" />
                Note d&apos;honoraires
              </a>
            </Button>
          )}

          {/* Envoyer par email */}
          {facture.clients?.email && (
            <Button variant="outline" className="w-full justify-start" onClick={handleSendEmail}>
              <Icons.mail className="mr-2 h-4 w-4 text-purple-600" />
              Envoyer par email
            </Button>
          )}

          {/* Marquer comme envoyée */}
          {facture.statut === 'brouillon' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleChangeStatut('envoyee', 'Facture marquée comme envoyée')}
            >
              <Icons.invoices className="mr-2 h-4 w-4 text-blue-600" />
              Marquer comme envoyée
            </Button>
          )}

          {/* Marquer comme payée */}
          {facture.statut !== 'payee' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleChangeStatut('payee', 'Facture marquée comme payée')}
            >
              <Icons.checkCircle className="mr-2 h-4 w-4 text-green-600" />
              Marquer comme payée
            </Button>
          )}

          {/* Marquer comme impayée */}
          {facture.statut === 'envoyee' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleChangeStatut('impayee', 'Facture marquée comme impayée')}
            >
              <Icons.alertCircle className="mr-2 h-4 w-4 text-orange-600" />
              Marquer comme impayée
            </Button>
          )}

          {/* Modifier */}
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link href={`/factures/${facture.id}/edit`}>
              <Icons.edit className="mr-2 h-4 w-4" />
              Modifier
            </Link>
          </Button>

          {/* Supprimer */}
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={handleDelete}
          >
            <Icons.delete className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
        </div>
      </div>
    </>
  )
}
