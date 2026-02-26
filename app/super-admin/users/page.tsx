import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { safeParseInt } from '@/lib/utils/safe-number'

const UsersFilters = dynamic(
  () => import('@/components/super-admin/users/UsersFilters').then(mod => mod.UsersFilters),
  { loading: () => <Skeleton className="h-12 w-full" /> }
)
const UsersDataTable = dynamic(
  () => import('@/components/super-admin/users/UsersDataTable').then(mod => mod.UsersDataTable),
  { loading: () => <Skeleton className="h-64 w-full" /> }
)

interface PageProps {
  searchParams: Promise<{
    status?: string
    role?: string
    plan?: string
    search?: string
    page?: string
  }>
}

export default async function UsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = params.status || 'all'
  const role = params.role || 'all'
  const plan = params.plan || 'all'
  const search = params.search || ''
  const page = parseInt(params.page || '1', 10)
  const limit = 20
  const offset = (page - 1) * limit

  // Construire la requête avec filtres
  let whereClause = 'WHERE 1=1'
  const queryParams: (string | number)[] = []
  let paramIndex = 1

  if (status !== 'all') {
    whereClause += ` AND status = $${paramIndex}`
    queryParams.push(status)
    paramIndex++
  }

  if (role !== 'all') {
    whereClause += ` AND role = $${paramIndex}`
    queryParams.push(role)
    paramIndex++
  }

  if (plan !== 'all') {
    whereClause += ` AND plan = $${paramIndex}`
    queryParams.push(plan)
    paramIndex++
  }

  if (search) {
    whereClause += ` AND (email ILIKE $${paramIndex} OR nom ILIKE $${paramIndex} OR prenom ILIKE $${paramIndex})`
    queryParams.push(`%${search}%`)
    paramIndex++
  }

  // Compter le total
  const countResult = await query(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  // Récupérer les utilisateurs
  const usersResult = await query(
    `SELECT
      id, email, nom, prenom, role, status, plan, plan_expires_at,
      created_at, last_login_at, login_count, is_approved,
      upgrade_requested_plan, upgrade_request_note
    FROM users
    ${whereClause}
    ORDER BY
      CASE WHEN upgrade_requested_plan IS NOT NULL THEN 0 ELSE 1 END,
      CASE status
        WHEN 'pending' THEN 1
        WHEN 'approved' THEN 2
        WHEN 'suspended' THEN 3
        WHEN 'rejected' THEN 4
      END,
      created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  )

  // Stats rapides
  const statsResult = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'suspended') as suspended,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected
    FROM users
  `)
  const stats = statsResult.rows[0]

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestion des Utilisateurs</h2>
          <p className="text-slate-400">Approuver, suspendre et gérer les comptes</p>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link href="/super-admin/users?status=pending">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${status === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
                  <p className="text-sm text-slate-400">En attente</p>
                </div>
                <Icons.clock className="h-8 w-8 text-yellow-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/users?status=approved">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${status === 'approved' ? 'ring-2 ring-green-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
                  <p className="text-sm text-slate-400">Approuvés</p>
                </div>
                <Icons.checkCircle className="h-8 w-8 text-green-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/users?status=suspended">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${status === 'suspended' ? 'ring-2 ring-red-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-red-500">{stats.suspended}</p>
                  <p className="text-sm text-slate-400">Suspendus</p>
                </div>
                <Icons.xCircle className="h-8 w-8 text-red-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/users?status=rejected">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${status === 'rejected' ? 'ring-2 ring-slate-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-slate-400">{stats.rejected}</p>
                  <p className="text-sm text-slate-400">Rejetés</p>
                </div>
                <Icons.xCircle className="h-8 w-8 text-slate-400/20" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Filtres */}
      <UsersFilters
        currentStatus={status}
        currentRole={role}
        currentPlan={plan}
        currentSearch={search}
      />

      {/* Table des utilisateurs */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">
            Utilisateurs ({total})
          </CardTitle>
          <CardDescription className="text-slate-400">
            {status !== 'all' && `Filtre: ${status} | `}
            Page {page} sur {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersDataTable users={usersResult.rows} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Link
                href={`/super-admin/users?status=${status}&role=${role}&plan=${plan}&search=${search}&page=${Math.max(1, page - 1)}`}
                aria-label="Page précédente"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className="border-slate-600 text-slate-300"
                >
                  <Icons.chevronLeft className="h-4 w-4" />
                </Button>
              </Link>

              <span className="text-sm text-slate-400">
                Page {page} / {totalPages}
              </span>

              <Link
                href={`/super-admin/users?status=${status}&role=${role}&plan=${plan}&search=${search}&page=${Math.min(totalPages, page + 1)}`}
                aria-label="Page suivante"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  className="border-slate-600 text-slate-300"
                >
                  <Icons.chevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
