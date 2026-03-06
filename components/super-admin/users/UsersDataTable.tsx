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
        return <Badge className="bg-muted text-muted-foreground border-border">Rejeté</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'free':
        return <Badge variant="secondary" className="bg-muted text-muted-foreground">Free</Badge>
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
        return <Badge variant="outline" className="border-border text-muted-foreground">User</Badge>
    }
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Icons.users className="h-12 w-12 mx-auto mb-4" />
        <p>Aucun utilisateur trouvé</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Utilisateur</TableHead>
            <TableHead className="text-muted-foreground hidden sm:table-cell">Rôle</TableHead>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground hidden md:table-cell">Plan</TableHead>
            <TableHead className="text-muted-foreground hidden lg:table-cell">Dernière connexion</TableHead>
            <TableHead className="text-muted-foreground hidden lg:table-cell">Inscrit le</TableHead>
            <TableHead className="text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="border-border hover:bg-muted/50">
              <TableCell>
                <div>
                  <p className="font-medium text-foreground">
                    {user.prenom} {user.nom}
                  </p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  {/* Résumé condensé visible sur mobile uniquement */}
                  <div className="sm:hidden mt-1 flex flex-wrap gap-1">
                    {getRoleBadge(user.role)}
                    {getPlanBadge(user.plan)}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{getRoleBadge(user.role)}</TableCell>
              <TableCell>{getStatusBadge(user.status)}</TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-col gap-1">
                  {getPlanBadge(user.plan)}
                  {user.upgrade_requested_plan && (
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs w-fit">
                      🚀 Demande {user.upgrade_requested_plan === 'solo' ? 'Pro' : 'Expert'}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {user.last_login_at ? (
                  <div>
                    <p>{new Date(user.last_login_at).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-muted-foreground">{user.login_count} connexions</p>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Jamais</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {new Date(user.created_at).toLocaleDateString('fr-FR')}
              </TableCell>
              <TableCell className="text-right">
                <Link href={`/super-admin/users/${user.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
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
