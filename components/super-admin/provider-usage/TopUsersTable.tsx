'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { formatCurrency, formatNumber } from '@/lib/utils/format'

interface TopUsersTableProps {
  days: number
}

interface UserData {
  id: string
  email: string
  nom: string
  prenom: string
  plan: string
  totalOperations: number
  totalTokens: number
  totalCost: number
  providerBreakdown: {
    [provider: string]: {
      operations: number
      cost: number
    }
  }
}

interface UserSummaryResponse {
  users: UserData[]
  period: {
    start: string
    end: string
    days: number
  }
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const getPlanBadgeVariant = (plan: string) => {
  switch (plan) {
    case 'enterprise':
      return 'default' // Purple
    case 'pro':
      return 'secondary' // Blue
    default:
      return 'outline' // Gray
  }
}

const getRankEmoji = (rank: number) => {
  switch (rank) {
    case 1:
      return '🥇'
    case 2:
      return '🥈'
    case 3:
      return '🥉'
    default:
      return null
  }
}

const getTopProvider = (providerBreakdown: UserData['providerBreakdown']) => {
  if (!providerBreakdown) return null

  const providers = Object.entries(providerBreakdown)
  if (providers.length === 0) return null

  const topProvider = providers.reduce((max, [provider, data]) => {
    return data.cost > (max[1]?.cost || 0) ? [provider, data] : max
  }, ['', { operations: 0, cost: 0 }] as [string, { operations: number; cost: number }])

  return topProvider[0] !== '' ? topProvider : null
}

export function TopUsersTable({ days }: TopUsersTableProps) {
  const router = useRouter()
  const { data, isLoading, error } = useSWR<UserSummaryResponse>(
    `/api/admin/user-consumption-summary?days=${days}`,
    fetcher
  )

  const handleUserClick = (userId: string) => {
    router.push(`/super-admin/provider-usage?days=${days}&userId=${userId}`)
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Top Utilisateurs - Consommation IA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-400">
            <Icons.alertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Erreur lors du chargement des données</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Top Utilisateurs - Consommation IA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Top Utilisateurs - Consommation IA</CardTitle>
        <CardDescription className="text-muted-foreground">
          {days} derniers jours • Cliquez sur une ligne pour filtrer
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data?.users || data.users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Icons.users className="h-12 w-12 mx-auto mb-2" />
            <p>Aucune utilisation IA pour cette période</p>
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-muted-foreground w-12">#</TableHead>
                  <TableHead className="text-muted-foreground">Utilisateur</TableHead>
                  <TableHead className="text-muted-foreground">Plan</TableHead>
                  <TableHead className="text-muted-foreground text-right">Opérations</TableHead>
                  <TableHead className="text-muted-foreground text-right">Tokens</TableHead>
                  <TableHead className="text-muted-foreground text-right">Coût</TableHead>
                  <TableHead className="text-muted-foreground">Top Provider</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user, index) => {
                  const rankEmoji = getRankEmoji(index + 1)
                  const topProvider = getTopProvider(user.providerBreakdown)

                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/50 border-border transition-colors"
                      onClick={() => handleUserClick(user.id)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-1">
                          {rankEmoji && <span className="text-lg">{rankEmoji}</span>}
                          <span className={rankEmoji ? 'text-xs' : ''}>{index + 1}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">
                            {user.prenom} {user.nom}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPlanBadgeVariant(user.plan)}>
                          {user.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatNumber(user.totalOperations)}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatNumber(user.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="text-green-500 font-medium">
                            {formatCurrency(user.totalCost, 'TND')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${user.totalCost.toFixed(2)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {topProvider && (
                          <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border">
                            {topProvider[0]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUserClick(user.id)
                          }}
                        >
                          <Icons.eye className="h-4 w-4 text-muted-foreground" />
                          <span className="sr-only">Filtrer par cet utilisateur</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
