'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface User {
  id: string
  email: string
  nom: string
  prenom: string
  role: string
  status: string
  plan: string
  plan_expires_at: Date | null
  created_at: Date
  last_login_at: Date | null
  login_count: number
  is_approved: boolean
  upgrade_requested_plan: string | null
  upgrade_request_note: string | null
}

interface UsersDataTableProps {
  users: User[]
}

export function UsersDataTable({ users }: UsersDataTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">En attente</Badge>
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approuvé</Badge>
      case 'suspended':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Suspendu</Badge>
      case 'rejected':
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Rejeté</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'free':
        return <Badge variant="secondary" className="bg-slate-600 text-slate-300">Free</Badge>
      case 'pro':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Pro</Badge>
      case 'enterprise':
        return <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">Enterprise</Badge>
      default:
        return <Badge variant="secondary">{plan || 'free'}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Badge className="bg-blue-600 text-white">Super Admin</Badge>
      case 'admin':
        return <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">Admin</Badge>
      default:
        return <Badge variant="outline" className="border-slate-600 text-slate-400">User</Badge>
    }
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Icons.users className="h-12 w-12 mx-auto mb-4" />
        <p>Aucun utilisateur trouvé</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 hover:bg-transparent">
            <TableHead className="text-slate-400">Utilisateur</TableHead>
            <TableHead className="text-slate-400">Rôle</TableHead>
            <TableHead className="text-slate-400">Status</TableHead>
            <TableHead className="text-slate-400">Plan</TableHead>
            <TableHead className="text-slate-400">Dernière connexion</TableHead>
            <TableHead className="text-slate-400">Inscrit le</TableHead>
            <TableHead className="text-slate-400 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="border-slate-700 hover:bg-slate-700/50">
              <TableCell>
                <div>
                  <p className="font-medium text-white">
                    {user.prenom} {user.nom}
                  </p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
              </TableCell>
              <TableCell>{getRoleBadge(user.role)}</TableCell>
              <TableCell>{getStatusBadge(user.status)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {getPlanBadge(user.plan)}
                  {user.upgrade_requested_plan && (
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs w-fit">
                      🚀 Demande {user.upgrade_requested_plan === 'solo' ? 'Solo' : 'Cabinet'}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-slate-400">
                {user.last_login_at ? (
                  <div>
                    <p>{new Date(user.last_login_at).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-slate-400">{user.login_count} connexions</p>
                  </div>
                ) : (
                  <span className="text-slate-400">Jamais</span>
                )}
              </TableCell>
              <TableCell className="text-slate-400">
                {new Date(user.created_at).toLocaleDateString('fr-FR')}
              </TableCell>
              <TableCell className="text-right">
                <Link href={`/super-admin/users/${user.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-white hover:bg-slate-700"
                  >
                    <Icons.eye className="h-4 w-4 mr-1" />
                    Voir
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
