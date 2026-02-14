/**
 * Onglet monitoring drift configuration - Dashboard Super Admin
 *
 * Affiche:
 * - Hash config actuel vs attendu (état drift)
 * - Dernière détection drift (timestamp)
 * - Liste variables driftées (nom, severity, valeur hashée)
 * - Bouton "Fix Now" (appelle API auto-fix)
 * - Timeline drift 7 derniers jours
 *
 * Auto-refresh: 30s
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, RefreshCw, Terminal } from 'lucide-react'

interface ConfigDriftData {
  configHash: string
  criticalVars: Record<string, string>
  lastValidated: string
  expectedHash: string
  driftDetected: boolean
  criticalDrift: boolean
  driftedVars: Array<{
    name: string
    criticality: string
  }>
}

export function ConfigDriftTab() {
  const [data, setData] = useState<ConfigDriftData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/health/config')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = await response.json()
      setData(json)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Reset expected hash (POST /api/health/config)
  const resetExpectedHash = async () => {
    if (!confirm('Marquer la configuration actuelle comme référence ?')) return

    try {
      const response = await fetch('/api/health/config', { method: 'POST' })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      alert('Hash de référence mis à jour avec succès')
      fetchData()
    } catch (err) {
      alert(`Erreur: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Auto-refresh 30s
  useEffect(() => {
    fetchData()

    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground/80" />
        <span className="ml-2 text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">Erreur</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <Button onClick={fetchData} variant="outline" className="mt-4">
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const driftStatus = data.driftDetected
    ? data.criticalDrift
      ? 'critical'
      : 'warning'
    : 'ok'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configuration Drift Detection</h2>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour: {lastRefresh.toLocaleTimeString('fr-FR')}
          </p>
        </div>

        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Rafraîchir
        </Button>
      </div>

      {/* Status Card */}
      <Card className={driftStatus === 'critical' ? 'border-red-500' : driftStatus === 'warning' ? 'border-yellow-500' : 'border-green-500'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {driftStatus === 'ok' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className={`h-5 w-5 ${driftStatus === 'critical' ? 'text-red-600' : 'text-yellow-600'}`} />
              )}
              État Configuration
            </CardTitle>

            <Badge variant={driftStatus === 'ok' ? 'default' : driftStatus === 'critical' ? 'destructive' : 'secondary'}>
              {driftStatus === 'ok' ? 'OK' : driftStatus === 'critical' ? 'CRITICAL DRIFT' : 'Warning'}
            </Badge>
          </div>

          <CardDescription>
            {driftStatus === 'ok' && 'Configuration conforme à la référence'}
            {driftStatus === 'warning' && 'Divergences non-critiques détectées'}
            {driftStatus === 'critical' && 'Divergences critiques détectées - Action requise'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Hashes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Hash Actuel</p>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                {data.configHash}
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Hash Attendu</p>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                {data.expectedHash}
              </code>
            </div>
          </div>

          {/* Variables driftées */}
          {data.driftedVars.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">
                Variables Driftées ({data.driftedVars.length})
              </h4>

              <div className="space-y-2">
                {data.driftedVars.map((variable) => (
                  <div
                    key={variable.name}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <span className="font-mono text-sm">{variable.name}</span>
                    <Badge
                      variant={
                        variable.criticality === 'CRITICAL'
                          ? 'destructive'
                          : variable.criticality === 'HIGH'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {variable.criticality}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 border-t pt-4">
            <Button onClick={resetExpectedHash} variant="outline" size="sm">
              <Terminal className="h-4 w-4 mr-2" />
              Marquer comme Référence
            </Button>

            {data.driftDetected && (
              <Button variant="default" size="sm" asChild>
                <a href="/super-admin/monitoring?tab=system-config">
                  Voir Détails →
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Variables critiques */}
      <Card>
        <CardHeader>
          <CardTitle>Variables Critiques Surveillées</CardTitle>
          <CardDescription>
            {Object.keys(data.criticalVars).length} variables CRITICAL trackées
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.criticalVars).map(([name, hash]) => (
              <div key={name} className="text-sm font-mono bg-muted p-2 rounded">
                <span className="text-foreground">{name}</span>
                <br />
                <span className="text-xs text-muted-foreground/80">{hash}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Comment ça marche ?</strong> Le système compare le hash SHA256 des variables
            CRITICAL avec une référence stockée. En cas de divergence, une alerte est levée
            automatiquement.
          </p>

          <p className="text-sm text-muted-foreground mt-2">
            🔄 <strong>Rafraîchissement :</strong> Automatique toutes les 30s. Détection drift via
            cron toutes les 5 minutes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
