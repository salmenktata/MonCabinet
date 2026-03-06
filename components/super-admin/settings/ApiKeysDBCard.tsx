'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { PROVIDER_ICONS, PROVIDER_COLORS } from '@/lib/constants/providers'

interface ApiKeyDB {
  id: string
  provider: string
  label: string
  apiKeyMasked: string
  modelDefault: string
  tier: 'free' | 'paid' | 'enterprise'
  isActive: boolean
  isPrimary: boolean
  lastUsedAt: string | null
  lastError: string | null
  errorCount: number
  rpmLimit?: number
  monthlyQuota?: number
  createdAt: string
  updatedAt: string
}

export function ApiKeysDBCard() {
  const [keys, setKeys] = useState<ApiKeyDB[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchKeys()
  }, [])

  async function fetchKeys() {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/api-keys')
      const data = await response.json()

      if (data.success) {
        setKeys(data.keys)
      } else {
        setError(data.error || 'Erreur inconnue')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function getProviderIcon(provider: string) {
    return PROVIDER_ICONS[provider] || '🔑'
  }

  function getProviderColor(provider: string) {
    return PROVIDER_COLORS[provider] || 'text-muted-foreground border-border'
  }

  if (loading) {
    return (
      <Card className="">
        <CardHeader>
          <CardTitle className="text-foreground">🔐 Clés API (Base de Données)</CardTitle>
          <CardDescription className="text-muted-foreground">
            Chargement des clés...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icons.spinner className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="">
        <CardHeader>
          <CardTitle className="text-foreground">🔐 Clés API (Base de Données)</CardTitle>
          <CardDescription className="text-red-400">
            Erreur: {error}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">🔐 Clés API (Base de Données)</CardTitle>
            <CardDescription className="text-muted-foreground">
              Clés stockées et chiffrées (AES-256-GCM) - {keys.length} provider(s)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchKeys}
            className="hover:bg-muted"
          >
            <Icons.refresh className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {keys.map((key) => (
          <div
            key={key.id}
            className={cn(
              "p-4 rounded-lg border",
              key.isActive ? "bg-muted/50 border-border" : "bg-muted/20 border-border opacity-60"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getProviderIcon(key.provider)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-white capitalize">{key.provider}</h4>
                      {key.isPrimary && (
                        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-400">
                          🏆 Primaire
                        </Badge>
                      )}
                      {key.tier === 'free' && (
                        <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                          Gratuit
                        </Badge>
                      )}
                      {key.tier === 'paid' && (
                        <Badge variant="outline" className="text-xs border-orange-500 text-orange-400">
                          Payant
                        </Badge>
                      )}
                      {!key.isActive && (
                        <Badge variant="outline" className="text-xs border-red-500 text-red-400">
                          Inactif
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{key.label}</p>
                  </div>
                </div>

                {/* Clé API */}
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono px-2 py-1 rounded bg-muted text-green-500">
                    {key.apiKeyMasked}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    Modèle: {key.modelDefault}
                  </span>
                </div>

                {/* Métriques */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {key.rpmLimit && (
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">RPM</span>
                      <span className="text-foreground font-mono">{key.rpmLimit}/min</span>
                    </div>
                  )}
                  {key.monthlyQuota && (
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Quota</span>
                      <span className="text-foreground font-mono">
                        {(key.monthlyQuota / 1000000).toFixed(1)}M tokens
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Erreurs</span>
                    <span className={cn(
                      "font-mono",
                      key.errorCount > 0 ? "text-red-400" : "text-green-400"
                    )}>
                      {key.errorCount}
                    </span>
                  </div>
                  {key.lastUsedAt && (
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Dernière utilisation</span>
                      <span className="text-foreground font-mono text-xs">
                        {format(new Date(key.lastUsedAt), 'dd/MM HH:mm', { locale: fr })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Erreur */}
                {key.lastError && (
                  <div className="mt-2 p-2 rounded bg-red-900/20 border border-red-500/30">
                    <p className="text-xs text-red-400">
                      ⚠️ {key.lastError}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {keys.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Aucune clé API configurée
          </div>
        )}
      </CardContent>
    </Card>
  )
}
