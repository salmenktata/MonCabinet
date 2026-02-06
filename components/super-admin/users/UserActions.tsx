'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  approveUserAction,
  rejectUserAction,
  suspendUserAction,
  reactivateUserAction,
  changeUserRoleAction,
  changeUserPlanAction,
  deleteUserAction
} from '@/app/actions/super-admin/users'

interface User {
  id: string
  email: string
  nom: string
  prenom: string
  role: string
  status: string
  plan: string
}

interface UserActionsProps {
  user: User
}

export function UserActions({ user }: UserActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // Dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showSuspendDialog, setShowSuspendDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showPlanDialog, setShowPlanDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Form values
  const [reason, setReason] = useState('')
  const [newRole, setNewRole] = useState(user.role || 'user')
  const [newPlan, setNewPlan] = useState(user.plan || 'free')
  const [confirmEmail, setConfirmEmail] = useState('')

  const handleApprove = async () => {
    setLoading(true)
    try {
      const result = await approveUserAction(user.id)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Utilisateur approuvé',
          description: `${user.email} a été approuvé avec succès.`
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      const result = await rejectUserAction(user.id, reason)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Utilisateur rejeté',
          description: `La demande de ${user.email} a été rejetée.`
        })
        setShowRejectDialog(false)
        setReason('')
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSuspend = async () => {
    setLoading(true)
    try {
      const result = await suspendUserAction(user.id, reason)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Utilisateur suspendu',
          description: `Le compte de ${user.email} a été suspendu.`
        })
        setShowSuspendDialog(false)
        setReason('')
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReactivate = async () => {
    setLoading(true)
    try {
      const result = await reactivateUserAction(user.id)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Utilisateur réactivé',
          description: `Le compte de ${user.email} a été réactivé.`
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChangeRole = async () => {
    setLoading(true)
    try {
      const result = await changeUserRoleAction(user.id, newRole)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Rôle modifié',
          description: `Le rôle de ${user.email} a été changé en ${newRole}.`
        })
        setShowRoleDialog(false)
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChangePlan = async () => {
    setLoading(true)
    try {
      const result = await changeUserPlanAction(user.id, newPlan)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Plan modifié',
          description: `Le plan de ${user.email} a été changé en ${newPlan}.`
        })
        setShowPlanDialog(false)
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const result = await deleteUserAction(user.id, confirmEmail)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Utilisateur supprimé',
          description: `Le compte de ${user.email} a été supprimé définitivement.`
        })
        setShowDeleteDialog(false)
        setConfirmEmail('')
        router.push('/super-admin/users')
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 p-4 rounded-lg bg-slate-800 border border-slate-700">
        {/* Actions selon le status */}
        {user.status === 'pending' && (
          <>
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              <Icons.checkCircle className="h-4 w-4 mr-2" />
              Approuver
            </Button>
            <Button
              onClick={() => setShowRejectDialog(true)}
              disabled={loading}
              variant="destructive"
            >
              <Icons.xCircle className="h-4 w-4 mr-2" />
              Rejeter
            </Button>
          </>
        )}

        {user.status === 'approved' && (
          <Button
            onClick={() => setShowSuspendDialog(true)}
            disabled={loading}
            variant="destructive"
          >
            <Icons.xCircle className="h-4 w-4 mr-2" />
            Suspendre
          </Button>
        )}

        {(user.status === 'suspended' || user.status === 'rejected') && (
          <Button
            onClick={handleReactivate}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            <Icons.checkCircle className="h-4 w-4 mr-2" />
            Réactiver
          </Button>
        )}

        {/* Changer le rôle */}
        <Button
          onClick={() => setShowRoleDialog(true)}
          disabled={loading}
          variant="outline"
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <Icons.shield className="h-4 w-4 mr-2" />
          Changer le rôle
        </Button>

        {/* Changer le plan */}
        <Button
          onClick={() => setShowPlanDialog(true)}
          disabled={loading}
          variant="outline"
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <Icons.creditCard className="h-4 w-4 mr-2" />
          Changer le plan
        </Button>

        {/* Supprimer - seulement si pas super_admin */}
        {user.role !== 'super_admin' && (
          <Button
            onClick={() => setShowDeleteDialog(true)}
            disabled={loading}
            variant="destructive"
            className="ml-auto"
          >
            <Icons.trash className="h-4 w-4 mr-2" />
            Supprimer le compte
          </Button>
        )}
      </div>

      {/* Dialog Rejet */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription className="text-slate-400">
              Rejeter la demande d'inscription de {user.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Raison du rejet (optionnel)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Expliquez la raison du rejet..."
                className="mt-2 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowRejectDialog(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleReject}
              disabled={loading}
              variant="destructive"
            >
              {loading ? 'Rejet...' : 'Confirmer le rejet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suspension */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Suspendre le compte</DialogTitle>
            <DialogDescription className="text-slate-400">
              Suspendre le compte de {user.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Raison de la suspension (optionnel)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Expliquez la raison de la suspension..."
                className="mt-2 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowSuspendDialog(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSuspend}
              disabled={loading}
              variant="destructive"
            >
              {loading ? 'Suspension...' : 'Confirmer la suspension'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Changement de rôle */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Changer le rôle</DialogTitle>
            <DialogDescription className="text-slate-400">
              Modifier le rôle de {user.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Nouveau rôle</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-2 bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="user" className="text-white hover:bg-slate-700">
                    Utilisateur
                  </SelectItem>
                  <SelectItem value="admin" className="text-white hover:bg-slate-700">
                    Admin
                  </SelectItem>
                  <SelectItem value="super_admin" className="text-blue-500 hover:bg-slate-700">
                    Super Admin
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowRoleDialog(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleChangeRole}
              disabled={loading || newRole === user.role}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Modification...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Changement de plan */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Changer le plan</DialogTitle>
            <DialogDescription className="text-slate-400">
              Modifier le plan d'abonnement de {user.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Nouveau plan</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="mt-2 bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="free" className="text-slate-400 hover:bg-slate-700">
                    Free - Gratuit
                  </SelectItem>
                  <SelectItem value="pro" className="text-blue-500 hover:bg-slate-700">
                    Pro - Professionnel
                  </SelectItem>
                  <SelectItem value="enterprise" className="text-purple-500 hover:bg-slate-700">
                    Enterprise - Entreprise
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowPlanDialog(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleChangePlan}
              disabled={loading || newPlan === user.plan}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Modification...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open)
        if (!open) setConfirmEmail('')
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-500">Supprimer le compte</DialogTitle>
            <DialogDescription className="text-slate-400">
              Cette action est irréversible. Toutes les données de l'utilisateur seront supprimées.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">
                <strong>Attention :</strong> La suppression entraînera la perte de :
              </p>
              <ul className="text-red-400 text-sm mt-2 list-disc list-inside">
                <li>Tous les dossiers et clients</li>
                <li>Toutes les factures et documents</li>
                <li>Tout l'historique et les conversations</li>
              </ul>
            </div>
            <div>
              <Label className="text-slate-300">
                Tapez <span className="font-mono text-red-400">{user.email}</span> pour confirmer
              </Label>
              <Input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="Entrez l'email pour confirmer"
                className="mt-2 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteDialog(false)
                setConfirmEmail('')
              }}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleDelete}
              disabled={loading || confirmEmail !== user.email}
              variant="destructive"
            >
              {loading ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
