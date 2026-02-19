'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { ProviderTestButton } from './ProviderTestButton'
import { cn } from '@/lib/utils'

type EmailProviderMode = 'brevo' | 'resend' | 'auto'

interface EmailProviderConfig {
  mode: EmailProviderMode
  failoverOrder: ('brevo' | 'resend')[]
  brevo: {
    configured: boolean
    apiKeyMasked: string | null
  }
  resend: {
    configured: boolean
    apiKeyMasked: string | null
  }
}

export function EmailProvidersConfig() {
  const [config, setConfig] = useState<EmailProviderConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<EmailProviderMode>('auto')
  const [brevoApiKey, setBrevoApiKey] = useState('')
  const [resendApiKey, setResendApiKey] = useState('')
  const [showBrevoKey, setShowBrevoKey] = useState(false)
  const [showResendKey, setShowResendKey] = useState(false)

  // Charger la configuration
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/super-admin/providers/email')
      const data = await res.json()

      if (data.success) {
        setConfig(data.data)
        setMode(data.data.mode)
      } else {
        toast.error(data.error || 'Impossible de charger la configuration')
      }
    } catch {
      toast.error('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, string> = {}

      // Toujours envoyer le mode
      if (mode !== config?.mode) {
        body.mode = mode
      }

      // Envoyer les clés seulement si modifiées
      if (brevoApiKey) {
        body.brevoApiKey = brevoApiKey
      }
      if (resendApiKey) {
        body.resendApiKey = resendApiKey
      }

      // Si aucun changement sauf le mode, envoyer quand même
      if (Object.keys(body).length === 0 && mode !== config?.mode) {
        body.mode = mode
      }

      if (Object.keys(body).length === 0) {
        toast.success('Aucune modification à enregistrer')
        setSaving(false)
        return
      }

      const res = await fetch('/api/super-admin/providers/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.success) {
        toast.success(data.message || 'Configuration enregistrée')
        setConfig(data.data)
        setBrevoApiKey('')
        setResendApiKey('')
      } else {
        toast.error(data.error || 'Échec de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion au serveur')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="flex items-center justify-center py-8">
          <Icons.spinner className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icons.mail className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-white">Providers Email</CardTitle>
        </div>
        <CardDescription className="text-slate-400">
          Configurez le mode d&apos;envoi des emails et les clés API des providers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode de fonctionnement */}
        <div className="space-y-4">
          <Label className="text-white text-sm font-medium">Mode de fonctionnement</Label>
          <RadioGroup
            value={mode}
            onValueChange={(v: string) => setMode(v as EmailProviderMode)}
            className="space-y-3"
          >
            <div className={cn(
              'flex items-center space-x-3 p-3 rounded-lg border transition-colors',
              mode === 'auto' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700/50'
            )}>
              <RadioGroupItem value="auto" id="auto" />
              <div className="flex-1">
                <Label htmlFor="auto" className="text-white font-medium cursor-pointer">
                  Auto (Failover)
                </Label>
                <p className="text-xs text-slate-400 mt-1">
                  Essaie Brevo en premier, puis Resend si échec
                </p>
              </div>
              <Badge variant="outline" className="text-green-400 border-green-500">
                Recommandé
              </Badge>
            </div>

            <div className={cn(
              'flex items-center space-x-3 p-3 rounded-lg border transition-colors',
              mode === 'brevo' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700/50'
            )}>
              <RadioGroupItem value="brevo" id="brevo" />
              <div className="flex-1">
                <Label htmlFor="brevo" className="text-white font-medium cursor-pointer">
                  Brevo uniquement
                </Label>
                <p className="text-xs text-slate-400 mt-1">
                  Utilise exclusivement Brevo (ex-Sendinblue)
                </p>
              </div>
            </div>

            <div className={cn(
              'flex items-center space-x-3 p-3 rounded-lg border transition-colors',
              mode === 'resend' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700/50'
            )}>
              <RadioGroupItem value="resend" id="resend" />
              <div className="flex-1">
                <Label htmlFor="resend" className="text-white font-medium cursor-pointer">
                  Resend uniquement
                </Label>
                <p className="text-xs text-slate-400 mt-1">
                  Utilise exclusivement Resend
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Configuration Brevo */}
        <div className="space-y-3 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">Brevo</h4>
              <Badge className={config?.brevo.configured ? 'bg-green-500' : 'bg-red-500'}>
                {config?.brevo.configured ? 'Configuré' : 'Non configuré'}
              </Badge>
            </div>
            <ProviderTestButton
              provider="brevo"
              disabled={!config?.brevo.configured}
            />
          </div>

          {config?.brevo.apiKeyMasked && (
            <div className="text-xs text-slate-400 font-mono">
              Clé actuelle: {config.brevo.apiKeyMasked}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showBrevoKey ? 'text' : 'password'}
                placeholder="Nouvelle clé API Brevo"
                value={brevoApiKey}
                onChange={(e) => setBrevoApiKey(e.target.value)}
                className="bg-slate-600 border-slate-500 text-white pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-white"
                onClick={() => setShowBrevoKey(!showBrevoKey)}
              >
                {showBrevoKey ? (
                  <Icons.eyeOff className="h-4 w-4" />
                ) : (
                  <Icons.eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Configuration Resend */}
        <div className="space-y-3 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">Resend</h4>
              <Badge className={config?.resend.configured ? 'bg-green-500' : 'bg-red-500'}>
                {config?.resend.configured ? 'Configuré' : 'Non configuré'}
              </Badge>
            </div>
            <ProviderTestButton
              provider="resend"
              disabled={!config?.resend.configured}
            />
          </div>

          {config?.resend.apiKeyMasked && (
            <div className="text-xs text-slate-400 font-mono">
              Clé actuelle: {config.resend.apiKeyMasked}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showResendKey ? 'text' : 'password'}
                placeholder="Nouvelle clé API Resend"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                className="bg-slate-600 border-slate-500 text-white pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-white"
                onClick={() => setShowResendKey(!showResendKey)}
              >
                {showResendKey ? (
                  <Icons.eyeOff className="h-4 w-4" />
                ) : (
                  <Icons.eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Bouton Enregistrer */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Icons.spinner className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Icons.save className="h-4 w-4 mr-2" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
