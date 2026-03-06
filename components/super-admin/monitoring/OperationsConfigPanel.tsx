'use client'

/**
 * Panel "Configuration IA Actuelle" — Onglet Providers
 *
 * Affiche :
 * - Mode No-Fallback badge
 * - Providers actifs vs inactifs
 * - Tableau des 8 opérations avec provider/modèle/timeout/coût
 *
 * Refresh SWR toutes les 10 minutes (config statique, rarement modifiée)
 */

import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertCircle, CheckCircle, Zap } from 'lucide-react'
import { PROVIDER_LABELS } from '@/lib/constants/operation-labels'

// =============================================================================
// TYPES
// =============================================================================

interface OperationInfo {
  name: string
  label: string
  provider: string
  model: string
  timeout: string | null
  embeddings: { provider: string; model: string; dimensions: number } | null
  costEstimate: string
  alertSeverity: 'critical' | 'warning' | 'info'
  description: string
}

interface OperationsConfigData {
  operations: OperationInfo[]
  activeProviders: string[]
  inactiveProviders: string[]
  mode: string
  env: string
  generatedAt: string
}

// =============================================================================
// HELPERS
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function ProviderBadge({ provider, active }: { provider: string; active: boolean }) {
  const label = PROVIDER_LABELS[provider]
  const name = label?.name ?? provider.charAt(0).toUpperCase() + provider.slice(1)
  const colorClass = active
    ? (label?.color ?? 'bg-gray-500')
    : 'bg-gray-200 dark:bg-gray-700'
  const textClass = active ? 'text-foreground' : 'text-muted-foreground'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass} ${textClass}`}
    >
      {active ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {name}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const variants = {
    critical: 'destructive',
    warning: 'secondary',
    info: 'outline',
  } as const
  return <Badge variant={variants[severity]}>{severity}</Badge>
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function OperationsConfigPanel() {
  const { data, error, isLoading } = useSWR<OperationsConfigData>(
    '/api/admin/monitoring/operations-config',
    fetcher,
    { refreshInterval: 10 * 60 * 1000 } // 10 minutes
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration IA actuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration IA actuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Erreur de chargement de la configuration.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Configuration IA actuelle</CardTitle>
          {/* Badge mode No-Fallback */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Zap className="h-3.5 w-3.5" />
            Mode No-Fallback
          </span>
          {/* Env badge */}
          <Badge variant={data.env === 'production' ? 'default' : 'secondary'}>
            {data.env}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Providers actifs / inactifs */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-medium text-muted-foreground self-center mr-1">
            Providers actifs :
          </span>
          {data.activeProviders.map((p) => (
            <ProviderBadge key={p} provider={p} active />
          ))}
          {data.inactiveProviders.length > 0 && (
            <>
              <span className="text-xs font-medium text-muted-foreground self-center mx-1">
                · Non utilisés :
              </span>
              {data.inactiveProviders.map((p) => (
                <ProviderBadge key={p} provider={p} active={false} />
              ))}
            </>
          )}
        </div>

        {/* Tableau des opérations */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opération</TableHead>
                <TableHead>Provider LLM</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>Coût estimé</TableHead>
                <TableHead>Alerte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.operations.map((op) => (
                <TableRow key={op.name}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{op.label}</p>
                      <p className="text-xs text-muted-foreground">{op.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ProviderBadge provider={op.provider} active />
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{op.model}</code>
                  </TableCell>
                  <TableCell className="text-sm">
                    {op.timeout ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{op.costEstimate}</TableCell>
                  <TableCell>
                    <SeverityBadge severity={op.alertSeverity} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Mis à jour : {new Date(data.generatedAt).toLocaleString('fr-TN')}
        </p>
      </CardContent>
    </Card>
  )
}
