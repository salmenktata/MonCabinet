'use client'

/**
 * Card de configuration pour une opération
 *
 * Features:
 * - Provider list (enable/disable, reorder)
 * - Primary provider selector
 * - Timeout inputs
 * - Test providers button
 * - Real-time validation
 */

import React, { useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ChevronUp,
  ChevronDown,
  TestTube,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { useProviderStatus } from '@/lib/hooks/useProviderStatus'
import { PROVIDER_NAMES, PROVIDER_COLORS } from '@/lib/constants/providers'
import type { OperationProviderConfig, OperationConfigUpdatePayload } from '@/lib/types/ai-config.types'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'

interface OperationConfigCardProps {
  operation: OperationProviderConfig
  onConfigChange: (updates: OperationConfigUpdatePayload) => void
  pendingChanges?: OperationConfigUpdatePayload
}

const OperationConfigCard: React.FC<OperationConfigCardProps> = ({
  operation,
  onConfigChange,
  pendingChanges,
}) => {
  const { testProvider, testAllProviders, getTestState } = useProviderStatus()

  // Local state pour providers (permet reorder avant save)
  const [localProviders, setLocalProviders] = useState<LLMProvider[]>(
    operation.enabledProviders || []
  )
  const [localPrimary, setLocalPrimary] = useState<LLMProvider>(operation.primaryProvider)
  const [localTimeouts, setLocalTimeouts] = useState({
    embedding: operation.timeoutEmbedding,
    chat: operation.timeoutChat,
    total: operation.timeoutTotal,
  })

  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [testingAll, setTestingAll] = useState(false)

  /**
   * Valide configuration locale
   */
  const validate = useCallback(() => {
    const errors: string[] = []

    // Au moins 1 provider
    if (localProviders.length === 0) {
      errors.push('Au moins un provider doit être actif')
    }

    // Primary dans enabled
    if (!localProviders.includes(localPrimary)) {
      errors.push('Provider primaire doit être dans la liste des providers actifs')
    }

    // Timeouts cohérents
    if (localTimeouts.embedding && localTimeouts.embedding > localTimeouts.chat) {
      errors.push('Timeout embedding doit être ≤ timeout chat')
    }
    if (localTimeouts.chat > localTimeouts.total) {
      errors.push('Timeout chat doit être ≤ timeout total')
    }

    setValidationErrors(errors)
    return errors.length === 0
  }, [localProviders, localPrimary, localTimeouts])

  /**
   * Apply changes + validate
   */
  const applyChanges = useCallback(() => {
    if (!validate()) return

    const updates: OperationConfigUpdatePayload = {}

    // Providers
    if (JSON.stringify(localProviders) !== JSON.stringify(operation.enabledProviders)) {
      updates.enabledProviders = localProviders
      updates.fallbackProviders = localProviders.filter((p) => p !== localPrimary)
    }

    // Primary
    if (localPrimary !== operation.primaryProvider) {
      updates.primaryProvider = localPrimary
    }

    // Timeouts
    if (localTimeouts.embedding !== operation.timeoutEmbedding) {
      updates.timeoutEmbedding = localTimeouts.embedding
    }
    if (localTimeouts.chat !== operation.timeoutChat) {
      updates.timeoutChat = localTimeouts.chat
    }
    if (localTimeouts.total !== operation.timeoutTotal) {
      updates.timeoutTotal = localTimeouts.total
    }

    if (Object.keys(updates).length > 0) {
      onConfigChange(updates)
    }
  }, [localProviders, localPrimary, localTimeouts, operation, onConfigChange, validate])

  /**
   * Toggle provider enabled/disabled
   */
  const handleToggleProvider = useCallback(
    (provider: LLMProvider, enabled: boolean) => {
      let newProviders = [...localProviders]

      if (enabled && !newProviders.includes(provider)) {
        newProviders.push(provider)
      } else if (!enabled) {
        newProviders = newProviders.filter((p) => p !== provider)
      }

      setLocalProviders(newProviders)

      // Auto-apply changes
      setTimeout(applyChanges, 100)
    },
    [localProviders, applyChanges]
  )

  /**
   * Move provider up/down dans fallback order
   */
  const handleMoveProvider = useCallback(
    (provider: LLMProvider, direction: 'up' | 'down') => {
      const currentIndex = localProviders.indexOf(provider)
      if (currentIndex === -1) return

      const newProviders = [...localProviders]
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (targetIndex < 0 || targetIndex >= newProviders.length) return

      // Swap
      ;[newProviders[currentIndex], newProviders[targetIndex]] = [
        newProviders[targetIndex],
        newProviders[currentIndex],
      ]

      setLocalProviders(newProviders)

      // Auto-apply changes
      setTimeout(applyChanges, 100)
    },
    [localProviders, applyChanges]
  )

  /**
   * Set primary provider
   */
  const handleSetPrimary = useCallback(
    (provider: LLMProvider) => {
      setLocalPrimary(provider)

      // Ensure provider is enabled
      if (!localProviders.includes(provider)) {
        setLocalProviders([provider, ...localProviders])
      }

      // Auto-apply changes
      setTimeout(applyChanges, 100)
    },
    [localProviders, applyChanges]
  )

  /**
   * Update timeout
   */
  const handleUpdateTimeout = useCallback(
    (field: 'embedding' | 'chat' | 'total', value: number | null) => {
      setLocalTimeouts((prev) => ({
        ...prev,
        [field]: value,
      }))

      // Auto-apply changes
      setTimeout(applyChanges, 100)
    },
    [applyChanges]
  )

  /**
   * Test tous les providers
   */
  const handleTestAllProviders = useCallback(async () => {
    setTestingAll(true)
    try {
      await testAllProviders(localProviders, operation.operationName)
    } finally {
      setTestingAll(false)
    }
  }, [localProviders, operation.operationName, testAllProviders])

  /**
   * Tous les providers disponibles
   */
  const allProviders: LLMProvider[] = useMemo(
    () => ['groq', 'gemini', 'deepseek', 'openai', 'anthropic', 'ollama'],
    []
  )

  return (
    <Card className="bg-slate-700/50 border-slate-600">
      <CardContent className="p-6 space-y-6">
        {/* Providers List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-white font-semibold">Providers Chat (Ordre de fallback)</Label>
            <Button size="sm" variant="outline" onClick={handleTestAllProviders} disabled={testingAll}>
              {testingAll ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Test en cours...
                </>
              ) : (
                <>
                  <TestTube className="h-3 w-3 mr-2" />
                  Tester tous
                </>
              )}
            </Button>
          </div>

          <div className="space-y-2">
            {allProviders.map((provider, index) => {
              const isEnabled = localProviders.includes(provider)
              const isPrimary = localPrimary === provider
              const providerIndex = localProviders.indexOf(provider)
              const testState = getTestState(provider, 'chat', operation.operationName)

              return (
                <div
                  key={provider}
                  className={`flex items-center gap-3 p-3 border rounded ${
                    isEnabled ? 'bg-slate-600/50 border-slate-500' : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  {/* Enable/Disable Switch */}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                    disabled={isPrimary} // Cannot disable primary
                  />

                  {/* Provider Badge */}
                  <div className="flex-1 flex items-center gap-2">
                    <Badge className={PROVIDER_COLORS[provider] || 'bg-muted0'}>
                      {PROVIDER_NAMES[provider]}
                    </Badge>

                    {isPrimary && (
                      <Badge variant="outline" className="bg-green-500/20 border-green-500/50">
                        🏆 Primary
                      </Badge>
                    )}

                    {isEnabled && !isPrimary && (
                      <span className="text-xs text-slate-400">
                        Fallback #{providerIndex}
                      </span>
                    )}

                    {/* Test Result */}
                    {testState.result && (
                      <Badge
                        variant="outline"
                        className={
                          testState.result.available
                            ? 'bg-green-500/20 border-green-500/50'
                            : 'bg-red-500/20 border-red-500/50'
                        }
                      >
                        {testState.result.available ? '✅' : '❌'}{' '}
                        {testState.result.latencyMs}ms
                      </Badge>
                    )}
                  </div>

                  {/* Set Primary Button */}
                  {isEnabled && !isPrimary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetPrimary(provider)}
                      className="text-xs"
                    >
                      Définir primaire
                    </Button>
                  )}

                  {/* Reorder Buttons */}
                  {isEnabled && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMoveProvider(provider, 'up')}
                        disabled={providerIndex === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMoveProvider(provider, 'down')}
                        disabled={providerIndex === localProviders.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Timeouts */}
        <div>
          <Label className="text-white font-semibold mb-3 block">Timeouts (millisecondes)</Label>
          <div className="grid grid-cols-3 gap-4">
            {operation.timeoutEmbedding !== null && (
              <div>
                <Label className="text-xs text-slate-400">Embedding</Label>
                <Input
                  type="number"
                  value={localTimeouts.embedding || ''}
                  onChange={(e) =>
                    handleUpdateTimeout(
                      'embedding',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  min={1000}
                  max={60000}
                  step={1000}
                  className="mt-1 bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-400 mt-1">1s - 60s</p>
              </div>
            )}

            <div>
              <Label className="text-xs text-slate-400">Chat</Label>
              <Input
                type="number"
                value={localTimeouts.chat}
                onChange={(e) =>
                  handleUpdateTimeout('chat', e.target.value ? parseInt(e.target.value) : 30000)
                }
                min={5000}
                max={120000}
                step={5000}
                className="mt-1 bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400 mt-1">5s - 120s</p>
            </div>

            <div>
              <Label className="text-xs text-slate-400">Total</Label>
              <Input
                type="number"
                value={localTimeouts.total}
                onChange={(e) =>
                  handleUpdateTimeout('total', e.target.value ? parseInt(e.target.value) : 45000)
                }
                min={10000}
                max={180000}
                step={5000}
                className="mt-1 bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400 mt-1">10s - 180s</p>
            </div>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert className="bg-red-500/10 border-red-500/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-white">
              <p className="font-semibold mb-1">Erreurs de configuration:</p>
              <ul className="list-disc list-inside text-sm">
                {validationErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Pending Changes Badge */}
        {pendingChanges && Object.keys(pendingChanges).length > 0 && (
          <Alert className="bg-yellow-500/10 border-yellow-500/50">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-white">
              <p className="text-sm">
                {Object.keys(pendingChanges).length} modification(s) en attente de sauvegarde
              </p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

export default OperationConfigCard
