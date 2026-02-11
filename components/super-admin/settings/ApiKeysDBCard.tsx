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
    return PROVIDER_COLORS[provider] || 'text-slate-400 border-slate-500'
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">🔐 Clés API (Base de Données)</CardTitle>
          <CardDescription className="text-slate-400">
            Chargement des clés...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icons.spinner className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">🔐 Clés API (Base de Données)</CardTitle>
          <CardDescription className="text-red-400">
            Erreur: {error}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">🔐 Clés API (Base de Données)</CardTitle>
            <CardDescription className="text-slate-400">
              Clés stockées et chiffrées (AES-256-GCM) - {keys.length} provider(s)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchKeys}
            className="border-slate-600 hover:bg-slate-700"
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
              key.isActive ? "bg-slate-700/50 border-slate-600" : "bg-slate-700/20 border-slate-700 opacity-60"
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
                    <p className="text-xs text-slate-400 mt-0.5">{key.label}</p>
                  </div>
                </div>

                {/* Clé API */}
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono px-2 py-1 rounded bg-slate-600 text-green-400">
                    {key.apiKeyMasked}
                  </code>
                  <span className="text-xs text-slate-500">
                    Modèle: {key.modelDefault}
                  </span>
                </div>

                {/* Métriques */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {key.rpmLimit && (
                    <div className="flex flex-col">
                      <span className="text-slate-500">RPM</span>
                      <span className="text-slate-300 font-mono">{key.rpmLimit}/min</span>
                    </div>
                  )}
                  {key.monthlyQuota && (
                    <div className="flex flex-col">
                      <span className="text-slate-500">Quota</span>
                      <span className="text-slate-300 font-mono">
                        {(key.monthlyQuota / 1000000).toFixed(1)}M tokens
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-slate-500">Erreurs</span>
                    <span className={cn(
                      "font-mono",
                      key.errorCount > 0 ? "text-red-400" : "text-green-400"
                    )}>
                      {key.errorCount}
                    </span>
                  </div>
                  {key.lastUsedAt && (
                    <div className="flex flex-col">
                      <span className="text-slate-500">Dernière utilisation</span>
                      <span className="text-slate-300 font-mono text-xs">
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
          <div className="text-center py-8 text-slate-400">
            Aucune clé API configurée
          </div>
        )}
      </CardContent>
    </Card>
  )
}
