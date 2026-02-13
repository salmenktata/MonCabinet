'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DomainBadge } from './domain-badge'
import type { AbrogationStats, LegalDomain } from '@/types/legal-abrogations'
import { BarChart3, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

interface StatsWidgetProps {
  stats: AbrogationStats
}

export function StatsWidget({ stats }: StatsWidgetProps) {
  const totalDomains = Object.keys(stats.byDomain).length
  const verifiedPercentage = ((stats.verified / stats.total) * 100).toFixed(1)

  // Convertir byDomain en tableau trié
  const sortedDomains = Object.entries(stats.byDomain)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) // Top 5 domaines

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Abrogations</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">
            {totalDomains} domaines juridiques
          </p>
        </CardContent>
      </Card>

      {/* Vérifiées */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vérifiées</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.verified}</div>
          <p className="text-xs text-muted-foreground">{verifiedPercentage}% du total</p>
        </CardContent>
      </Card>

      {/* En attente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">En Attente</CardTitle>
          <Clock className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.pending}</div>
          <p className="text-xs text-muted-foreground">À vérifier</p>
        </CardContent>
      </Card>

      {/* Contestées */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Contestées</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.disputed}</div>
          <p className="text-xs text-muted-foreground">Débat juridique</p>
        </CardContent>
      </Card>

      {/* Top Domaines */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle>Répartition par Domaine</CardTitle>
          <CardDescription>Top 5 domaines juridiques</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedDomains.map(([domain, count]) => {
              const percentage = ((count / stats.total) * 100).toFixed(1)
              return (
                <div key={domain} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DomainBadge domain={domain as LegalDomain} size="sm" />
                      <span className="text-sm text-muted-foreground">
                        {count} abrogation{count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-sm font-medium">{percentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Abrogations récentes */}
      {stats.recentAbrogations && stats.recentAbrogations.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>Abrogations Récentes</CardTitle>
            <CardDescription>
              Dernières lois abrogées ({stats.recentAbrogations.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentAbrogations.slice(0, 5).map((abrogation) => (
                <div
                  key={abrogation.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">
                        {abrogation.abrogatedReference}
                      </p>
                      {abrogation.domain && (
                        <DomainBadge domain={abrogation.domain} size="sm" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      → {abrogation.abrogatingReference}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(abrogation.abrogationDate).toLocaleDateString('fr-TN', {
                      year: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
