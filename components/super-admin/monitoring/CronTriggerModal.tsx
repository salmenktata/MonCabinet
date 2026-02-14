'use client'

/**
 * Modal de confirmation pour déclencher un cron manuellement
 * Supporte les paramètres configurables (Phase 6.2)
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, AlertTriangle, Loader2, Settings } from 'lucide-react'
import {
  getCronParameters,
  cronHasParameters,
  validateCronParameters,
  type CronParameter,
} from '@/lib/cron/cron-parameters'

interface CronTriggerModalProps {
  isOpen: boolean
  onClose: () => void
  cronName: string
  description: string
  estimatedDuration: number
  onSuccess?: () => void
}

export function CronTriggerModal({
  isOpen,
  onClose,
  cronName,
  description,
  estimatedDuration,
  onSuccess,
}: CronTriggerModalProps) {
  const [isTriggering, setIsTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Phase 6.2: Paramètres dynamiques
  const [parameters, setParameters] = useState<Record<string, any>>({})
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const cronParams = getCronParameters(cronName)
  const hasParams = cronHasParameters(cronName)

  // Initialiser les valeurs par défaut
  useEffect(() => {
    if (hasParams && isOpen) {
      const defaults: Record<string, any> = {}
      cronParams.forEach((param) => {
        defaults[param.name] = param.defaultValue
      })
      setParameters(defaults)
      setValidationErrors([])
    }
  }, [cronName, isOpen, hasParams])

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const handleTrigger = async () => {
    setIsTriggering(true)
    setError(null)
    setSuccess(false)
    setValidationErrors([])

    // Phase 6.2: Validation des paramètres
    if (hasParams) {
      const validation = validateCronParameters(cronName, parameters)
      if (!validation.valid) {
        setValidationErrors(validation.errors)
        setIsTriggering(false)
        return
      }
    }

    try {
      const response = await fetch('/api/admin/cron-executions/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cronName,
          parameters: hasParams ? parameters : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Ce cron est déjà en cours d\'exécution. Attendez sa fin.')
        }
        throw new Error(data.error || 'Erreur lors du déclenchement')
      }

      setSuccess(true)

      // Wait 2 seconds to show success message, then close
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setSuccess(false)
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setIsTriggering(false)
    }
  }

  // Phase 6.2: Gestion changement paramètre
  const handleParameterChange = (paramName: string, value: any) => {
    setParameters((prev) => ({
      ...prev,
      [paramName]: value,
    }))
    setValidationErrors([])
  }

  // Phase 6.2: Toggle pour multiselect
  const handleMultiselectToggle = (paramName: string, optionValue: string) => {
    setParameters((prev) => {
      const current = Array.isArray(prev[paramName]) ? prev[paramName] : []
      const newValue = current.includes(optionValue)
        ? current.filter((v: string) => v !== optionValue)
        : [...current, optionValue]
      return { ...prev, [paramName]: newValue }
    })
    setValidationErrors([])
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Déclencher Manuellement
          </DialogTitle>
          <DialogDescription>
            Vous êtes sur le point d'exécuter ce cron manuellement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cron Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Nom :</span>
              <span className="font-mono">{cronName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Description :</span>
              <span>{description}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Durée estimée :</span>
              <span className="font-mono">{formatDuration(estimatedDuration)}</span>
            </div>
          </div>

          {/* Phase 6.2: Formulaire paramètres dynamiques */}
          {hasParams && (
            <>
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Paramètres</h4>
                </div>

                <div className="space-y-4">
                  {cronParams.map((param) => (
                    <div key={param.name} className="space-y-2">
                      <Label htmlFor={param.name} className="text-sm font-medium">
                        {param.label}
                        {param.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <p className="text-xs text-muted-foreground mb-2">{param.description}</p>

                      {/* Number Input */}
                      {param.type === 'number' && (
                        <Input
                          id={param.name}
                          type="number"
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={parameters[param.name] ?? param.defaultValue ?? ''}
                          onChange={(e) =>
                            handleParameterChange(param.name, Number(e.target.value))
                          }
                          className="w-full"
                        />
                      )}

                      {/* Text Input */}
                      {param.type === 'text' && (
                        <Input
                          id={param.name}
                          type="text"
                          placeholder={param.placeholder}
                          maxLength={param.maxLength}
                          value={parameters[param.name] ?? param.defaultValue ?? ''}
                          onChange={(e) => handleParameterChange(param.name, e.target.value)}
                          className="w-full"
                        />
                      )}

                      {/* Boolean Checkbox */}
                      {param.type === 'boolean' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={param.name}
                            checked={parameters[param.name] ?? param.defaultValue ?? false}
                            onCheckedChange={(checked) =>
                              handleParameterChange(param.name, checked)
                            }
                          />
                          <label
                            htmlFor={param.name}
                            className="text-sm cursor-pointer select-none"
                          >
                            Activé
                          </label>
                        </div>
                      )}

                      {/* Select Dropdown */}
                      {param.type === 'select' && param.options && (
                        <Select
                          value={parameters[param.name] ?? param.defaultValue ?? ''}
                          onValueChange={(value) => handleParameterChange(param.name, value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Sélectionner..." />
                          </SelectTrigger>
                          <SelectContent>
                            {param.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div>
                                  <div>{option.label}</div>
                                  {option.description && (
                                    <div className="text-xs text-muted-foreground">
                                      {option.description}
                                    </div>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Multiselect Checkboxes */}
                      {param.type === 'multiselect' && param.options && (
                        <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                          {param.options.map((option) => {
                            const currentValues = Array.isArray(parameters[param.name])
                              ? parameters[param.name]
                              : []
                            const isChecked = currentValues.includes(option.value)

                            return (
                              <div key={option.value} className="flex items-start space-x-2">
                                <Checkbox
                                  id={`${param.name}-${option.value}`}
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    handleMultiselectToggle(param.name, option.value)
                                  }
                                />
                                <label
                                  htmlFor={`${param.name}-${option.value}`}
                                  className="text-sm cursor-pointer select-none flex-1"
                                >
                                  <div className="font-medium">{option.label}</div>
                                  {option.description && (
                                    <div className="text-xs text-muted-foreground">
                                      {option.description}
                                    </div>
                                  )}
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning */}
          {!success && !error && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                L'exécution sera asynchrone. Rafraîchissez la page dans quelques secondes pour
                voir les résultats.
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-900">
              <AlertDescription className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <span>Cron démarré avec succès !</span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isTriggering}>
            Annuler
          </Button>
          <Button
            onClick={handleTrigger}
            disabled={isTriggering || success}
            className="gap-2"
          >
            {isTriggering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Démarrage...
              </>
            ) : success ? (
              <>
                <span className="text-lg">✅</span>
                Démarré
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Exécuter Maintenant
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
