/**
 * API Health Tab - Health check des clés API
 * Ancien contenu de app/super-admin/api-keys-health/page.tsx
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'

interface ProviderHealth {
  provider: string
  status: 'healthy' | 'error' | 'missing'
  responseTime?: number
  error?: string
  model?: string
  lastChecked: string
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'critical' | 'error'
  timestamp: string
  summary: {
    healthy: number
    errors: number
    missing: number
    total: number
  }
  providers: ProviderHealth[]
}

export function APIHealthTab() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/api-keys/health')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch health data')
      }

      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'missing':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500">Healthy</Badge>
      case 'degraded':
        return <Badge variant="default" className="bg-yellow-500">Degraded</Badge>
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  const getProviderBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500">✓ OK</Badge>
      case 'error':
        return <Badge variant="destructive">✗ Error</Badge>
      case 'missing':
        return <Badge variant="secondary">⚠ Missing</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <Button onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </Button>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Erreur</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Résumé global */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>État Global</CardTitle>
                  <CardDescription>
                    Dernière vérification:{' '}
                    {new Date(data.timestamp).toLocaleString('fr-FR')}
                  </CardDescription>
                </div>
                {getStatusBadge(data.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {data.summary.healthy}
                  </div>
                  <div className="text-sm text-muted-foreground">Healthy</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">
                    {data.summary.errors}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">
                    {data.summary.missing}
                  </div>
                  <div className="text-sm text-muted-foreground">Missing</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {data.summary.total}
                  </div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Détails par provider */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.providers.map((provider) => (
              <Card key={provider.provider}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(provider.status)}
                      <CardTitle className="capitalize">
                        {provider.provider}
                      </CardTitle>
                    </div>
                    {getProviderBadge(provider.status)}
                  </div>
                  {provider.model && (
                    <CardDescription className="text-xs">
                      {provider.model}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {provider.responseTime !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{provider.responseTime}ms</span>
                    </div>
                  )}

                  {provider.error && (
                    <div className="text-xs text-red-500 bg-red-50 p-2 rounded">
                      {provider.error}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Vérifié: {new Date(provider.lastChecked).toLocaleTimeString('fr-FR')}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {loading && !data && (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
