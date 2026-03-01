import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { PaginationControls } from '@/components/super-admin/shared/PaginationControls'
import { KPICard } from '@/components/super-admin/shared/KPICard'
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
  const page = safeParseInt(params.page, 1, 1, 9999)
  const limit = 20
  const offset = (page - 1) * limit

  // La recherche ILIKE multi-colonnes avec un seul param index nécessite une construction manuelle
  let finalWhereClause = 'WHERE 1=1'
  const finalParams: (string | number)[] = []
  let paramIndex = 1

  if (status !== 'all') {
    finalWhereClause += ` AND status = $${paramIndex}`
    finalParams.push(status)
    paramIndex++
  }
  if (role !== 'all') {
    finalWhereClause += ` AND role = $${paramIndex}`
    finalParams.push(role)
    paramIndex++
  }
  if (plan !== 'all') {
    finalWhereClause += ` AND plan = $${paramIndex}`
    finalParams.push(plan)
    paramIndex++
  }
  if (search) {
    finalWhereClause += ` AND (email ILIKE $${paramIndex} OR nom ILIKE $${paramIndex} OR prenom ILIKE $${paramIndex})`
    finalParams.push(`%${search}%`)
    paramIndex++
  }

  const [countResult, usersResult, statsResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM users ${finalWhereClause}`, finalParams),
    query(
      `SELECT
        id, email, nom, prenom, role, status, plan, plan_expires_at,
        created_at, last_login_at, login_count, is_approved,
        upgrade_requested_plan, upgrade_request_note
      FROM users
      ${finalWhereClause}
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
      [...finalParams, limit, offset]
    ),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected
      FROM users
    `),
  ])

  const total = safeParseInt(countResult.rows[0]?.count, 0, 0)
  const stats = statsResult.rows[0]
  const totalPages = Math.ceil(total / limit)
  const filterQS = `status=${status}&role=${role}&plan=${plan}&search=${search}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Utilisateurs"
        description="Approuver, suspendre et gérer les comptes"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard value={stats.pending} label="En attente" icon="clock" color="yellow"
          href="/super-admin/users?status=pending" isActive={status === 'pending'} />
        <KPICard value={stats.approved} label="Approuvés" icon="checkCircle" color="green"
          href="/super-admin/users?status=approved" isActive={status === 'approved'} />
        <KPICard value={stats.suspended} label="Suspendus" icon="xCircle" color="red"
          href="/super-admin/users?status=suspended" isActive={status === 'suspended'} />
        <KPICard value={stats.rejected} label="Rejetés" icon="xCircle" color="slate"
          href="/super-admin/users?status=rejected" isActive={status === 'rejected'} />
      </div>

      <UsersFilters
        currentStatus={status}
        currentRole={role}
        currentPlan={plan}
        currentSearch={search}
      />

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Utilisateurs ({total})</CardTitle>
          <CardDescription className="text-slate-400">
            {status !== 'all' && `Filtre: ${status} | `}
            Page {page} sur {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersDataTable users={usersResult.rows} />
          <PaginationControls
            page={page}
            totalPages={totalPages}
            prevHref={`/super-admin/users?${filterQS}&page=${Math.max(1, page - 1)}`}
            nextHref={`/super-admin/users?${filterQS}&page=${Math.min(totalPages, page + 1)}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
