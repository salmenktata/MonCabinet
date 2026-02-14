'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Pencil, TestTube, Trash2, Plus, Loader2, CheckCircle, XCircle } from 'lucide-react'
import ProviderEditModal from './ProviderEditModal'
import {
  PROVIDER_PRIORITY,
  PROVIDER_ICONS,
  PROVIDER_NAMES,
  PROVIDER_COLORS,
} from '@/lib/constants/providers'
import { OPERATION_LABELS } from '@/lib/types/ai-config.types'
import type { OperationName } from '@/lib/ai/operations-config'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'

interface ApiKeyData {
  provider: string
  label: string
  modelDefault?: string
  tier?: 'free' | 'paid' | 'enterprise'
  rpmLimit?: number
  monthlyQuota?: number
  isActive: boolean
  isPrimary: boolean
  lastUsedAt?: string
  errorCount: number
  lastError?: string
  createdAt: string
  updatedAt: string
}

interface ProviderOperationsMap {
  [provider: string]: {
    operations: OperationName[]
    primaryFor: OperationName[]
    fallbackFor: OperationName[]
  }
}

const ProviderConfigTable: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([])
  const [loading, setLoading] = useState(true)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<ApiKeyData | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [providerOperations, setProviderOperations] = useState<ProviderOperationsMap>({})

  // Charger les clés API
  const loadApiKeys = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/api-keys')
      const data = await response.json()

      if (data.success) {
        setApiKeys(data.keys || [])
      } else {
        toast.error('Erreur lors du chargement des clés API')
      }
    } catch (error) {
      console.error('Error loading API keys:', error)
      toast.error('Erreur réseau lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  // Charger mapping providers → operations
  const loadProviderOperations = async () => {
    try {
      const response = await fetch('/api/admin/operations-config')
      const data = await response.json()

      if (data.success && data.operations) {
        const mapping: ProviderOperationsMap = {}

        data.operations.forEach((op: any) => {
          const primaryProvider = op.primaryProvider as LLMProvider
          const fallbackProviders = (op.fallbackProviders || []) as LLMProvider[]
          const allProviders = [primaryProvider, ...fallbackProviders]

          allProviders.forEach((provider) => {
            if (!mapping[provider]) {
              mapping[provider] = {
                operations: [],
                primaryFor: [],
                fallbackFor: [],
              }
            }

            if (!mapping[provider].operations.includes(op.operationName)) {
              mapping[provider].operations.push(op.operationName)
            }

            if (provider === primaryProvider) {
              mapping[provider].primaryFor.push(op.operationName)
            } else {
              mapping[provider].fallbackFor.push(op.operationName)
            }
          })
        })

        setProviderOperations(mapping)
      }
    } catch (error) {
      console.error('Error loading provider operations:', error)
    }
  }

  useEffect(() => {
    loadApiKeys()
    loadProviderOperations()
  }, [])

  // Tester la connexion à un provider
  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider)
    try {
      const response = await fetch(`/api/admin/api-keys/${provider}/test`, {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        toast.success(
          <div>
            <p className="font-semibold">✅ Connexion {PROVIDER_NAMES[provider]} OK</p>
            {data.latency && <p className="text-xs">Latence: {data.latency}ms</p>}
            {data.modelsList && data.modelsList.length > 0 && (
              <p className="text-xs">Modèles: {data.modelsList.slice(0, 3).join(', ')}</p>
            )}
          </div>
        )
      } else {
        toast.error(
          <div>
            <p className="font-semibold">❌ Connexion {PROVIDER_NAMES[provider]} échouée</p>
            <p className="text-xs">{data.error}</p>
          </div>,
          { duration: 5000 }
        )
      }
    } catch (error) {
      toast.error(`Erreur lors du test de connexion: ${error}`)
    } finally {
      setTestingProvider(null)
    }
  }

  // Supprimer une clé API
  const handleDelete = async (provider: string) => {
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer la clé API ${PROVIDER_NAMES[provider]} ?`
    )
    if (!confirmed) return

    setDeletingProvider(provider)
    try {
      const response = await fetch(`/api/admin/api-keys/${provider}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`Clé API ${PROVIDER_NAMES[provider]} supprimée`)
        loadApiKeys() // Recharger la liste
      } else {
        toast.error(data.error || 'Erreur lors de la suppression')
      }
    } catch (error) {
      toast.error(`Erreur lors de la suppression: ${error}`)
    } finally {
      setDeletingProvider(null)
    }
  }

  // Ouvrir le modal d'édition
  const handleEdit = (apiKey: ApiKeyData) => {
    setEditingProvider(apiKey)
    setIsEditModalOpen(true)
  }

  // Ajouter un nouveau provider
  const handleAddNew = () => {
    setEditingProvider(null)
    setIsEditModalOpen(true)
  }

  // Callback après sauvegarde
  const handleSaveSuccess = () => {
    setIsEditModalOpen(false)
    setEditingProvider(null)
    loadApiKeys() // Recharger la liste
  }

  // Masquer la clé API (afficher seulement les 4 derniers chars)
  const maskApiKey = (provider: string) => {
    return `${PROVIDER_ICONS[provider]} ${'•'.repeat(20)}`
  }

  // Calculer le provider actif (priorité la plus haute parmi les actifs)
  const getActiveProvider = (): string | null => {
    const activeKeys = apiKeys.filter(key => key.isActive && key.errorCount === 0)
    if (activeKeys.length === 0) return null

    // Trouver celui avec la priorité la plus basse (1 = plus haute priorité)
    return activeKeys.reduce((prev, curr) => {
      const prevPriority = PROVIDER_PRIORITY[prev.provider] || 999
      const currPriority = PROVIDER_PRIORITY[curr.provider] || 999
      return currPriority < prevPriority ? curr : prev
    }).provider
  }

  // Badge de status
  const renderStatusBadge = (apiKey: ApiKeyData) => {
    const activeProvider = getActiveProvider()
    const isActiveProvider = activeProvider === apiKey.provider

    if (apiKey.isPrimary) {
      return (
        <div className="flex items-center gap-1">
          <Badge className="bg-yellow-500">🏆 Primaire</Badge>
          {isActiveProvider && <Badge className="bg-green-500 animate-pulse">⚡ Actif</Badge>}
        </div>
      )
    }
    if (!apiKey.isActive) {
      return <Badge variant="secondary">❌ Inactif</Badge>
    }
    if (apiKey.errorCount > 0) {
      return (
        <Badge variant="destructive" title={apiKey.lastError || 'Erreur inconnue'}>
          ⚠️ Erreur ({apiKey.errorCount})
        </Badge>
      )
    }
    if (isActiveProvider) {
      return <Badge className="bg-green-500 animate-pulse">⚡ Actif</Badge>
    }
    return <Badge className="bg-green-500">✅ Standby</Badge>
  }

  // Render operations actives badges
  const renderOperationsBadges = (provider: string) => {
    const providerOps = providerOperations[provider]
    if (!providerOps || providerOps.operations.length === 0) {
      return <span className="text-xs text-muted-foreground">Aucune</span>
    }

    return (
      <div className="flex flex-wrap gap-1">
        {providerOps.operations.slice(0, 3).map((op) => {
          const isPrimary = providerOps.primaryFor.includes(op)
          const label = OPERATION_LABELS[op]

          return (
            <Badge
              key={op}
              variant="outline"
              className={`text-xs ${
                isPrimary
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-blue-500/20 border-blue-500/50'
              }`}
              title={`${label.fr} - ${isPrimary ? 'Primary' : 'Fallback'}`}
            >
              {label.fr.length > 15 ? label.fr.substring(0, 12) + '...' : label.fr}
              {isPrimary && ' 🏆'}
            </Badge>
          )
        })}
        {providerOps.operations.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{providerOps.operations.length - 3}
          </Badge>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Chargement des providers...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Configuration des Providers IA</CardTitle>
              <CardDescription>
                Gérer les clés API et la configuration des providers.
                Providers primaires (Fév 2026): Groq (chat), Gemini (analyse), OpenAI (embeddings)
              </CardDescription>
            </div>
            <Button onClick={handleAddNew} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-semibold">Priorité</th>
                  <th className="text-left p-3 font-semibold">Provider</th>
                  <th className="text-left p-3 font-semibold">Label</th>
                  <th className="text-left p-3 font-semibold">Clé API</th>
                  <th className="text-left p-3 font-semibold">Modèle Défaut</th>
                  <th className="text-left p-3 font-semibold">Tier</th>
                  <th className="text-left p-3 font-semibold">Operations Actives</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                  <th className="text-center p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                      Aucune clé API configurée. Cliquez sur "Ajouter" pour en créer une.
                    </td>
                  </tr>
                ) : (
                  // Trier par priorité
                  [...apiKeys]
                    .sort((a, b) => {
                      const aPriority = PROVIDER_PRIORITY[a.provider] || 999
                      const bPriority = PROVIDER_PRIORITY[b.provider] || 999
                      return aPriority - bPriority
                    })
                    .map((apiKey) => {
                      const priority = PROVIDER_PRIORITY[apiKey.provider] || '?'
                      const colorClass = PROVIDER_COLORS[apiKey.provider] || 'text-gray-600'
                      return (
                        <tr key={apiKey.provider} className="border-b hover:bg-muted/50">
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="font-mono">
                              #{priority}
                            </Badge>
                          </td>
                          <td className="p-3 font-medium">
                            <span className={`text-lg ${colorClass}`}>
                              {PROVIDER_ICONS[apiKey.provider]}
                            </span>{' '}
                            <span className={colorClass}>
                              {PROVIDER_NAMES[apiKey.provider] || apiKey.provider}
                            </span>
                          </td>
                          <td className="p-3">{apiKey.label}</td>
                          <td className="p-3 font-mono text-xs">{maskApiKey(apiKey.provider)}</td>
                          <td className="p-3 text-xs">{apiKey.modelDefault || '-'}</td>
                          <td className="p-3">
                            {apiKey.tier ? (
                              <Badge variant="outline" className="text-xs">
                                {apiKey.tier}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="p-3">
                            {renderOperationsBadges(apiKey.provider)}
                          </td>
                          <td className="p-3 text-center">{renderStatusBadge(apiKey)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(apiKey)}
                            title="Éditer"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTestConnection(apiKey.provider)}
                            disabled={testingProvider === apiKey.provider}
                            title="Tester la connexion"
                          >
                            {testingProvider === apiKey.provider ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(apiKey.provider)}
                            disabled={
                              apiKey.isPrimary || deletingProvider === apiKey.provider
                            }
                            title={
                              apiKey.isPrimary
                                ? 'Impossible de supprimer un provider primaire'
                                : 'Supprimer'
                            }
                          >
                            {deletingProvider === apiKey.provider ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </div>

          {/* Légende */}
          <div className="mt-4 p-3 bg-muted rounded-lg text-xs space-y-1">
            <p className="font-semibold">Légende :</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>Priorité :</strong> Ordre de fallback (1 = plus haute priorité). Le système utilise le provider actif avec la priorité la plus haute.</li>
              <li><strong>🏆 Primaire :</strong> Provider principal (ne peut pas être supprimé)</li>
              <li><strong>⚡ Actif :</strong> Provider actuellement utilisé par le système (priorité la plus haute parmi les actifs)</li>
              <li><strong>✅ Standby :</strong> Provider opérationnel mais pas utilisé (priorité plus basse)</li>
              <li><strong>⚠️ Erreur :</strong> Provider rencontrant des erreurs (cliquez sur le badge pour voir le détail)</li>
              <li><strong>❌ Inactif :</strong> Provider désactivé manuellement</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Modal d'édition */}
      <ProviderEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingProvider(null)
        }}
        apiKey={editingProvider}
        onSaveSuccess={handleSaveSuccess}
      />
    </>
  )
}

export default ProviderConfigTable
