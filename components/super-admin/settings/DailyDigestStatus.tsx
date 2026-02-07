'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'

interface DailyDigestStatusProps {
  brevoConfigured: boolean
  cronConfigured: boolean
}

export function DailyDigestStatus({ brevoConfigured, cronConfigured }: DailyDigestStatusProps) {
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<{
    success: boolean
    emailsSent: number
    emailsFailed: number
    duration: string
  } | null>(null)
  const { toast } = useToast()

  const isReady = brevoConfigured && cronConfigured

  const handleManualRun = async () => {
    if (!isReady) return

    setLoading(true)
    try {
      const res = await fetch('/api/admin/trigger-daily-digest', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setLastRun({
          success: true,
          emailsSent: data.stats?.emailsSent || 0,
          emailsFailed: data.stats?.emailsFailed || 0,
          duration: data.stats?.duration || '0ms',
        })
        toast({
          title: 'Digest envoyé',
          description: `${data.stats?.emailsSent || 0} emails envoyés avec succès.`,
        })
      } else {
        toast({
          title: 'Erreur',
          description: data.error || 'Échec de l\'envoi',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur de connexion au serveur',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Statut de configuration */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
          <div>
            <p className="font-medium text-white">Brevo API</p>
            <p className="text-sm text-slate-400">Requis pour l'envoi</p>
          </div>
          <Badge className={brevoConfigured ? 'bg-green-500' : 'bg-red-500'}>
            {brevoConfigured ? 'OK' : 'Manquant'}
          </Badge>
        </div>
        <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
          <div>
            <p className="font-medium text-white">CRON_SECRET</p>
            <p className="text-sm text-slate-400">Sécurité du cron</p>
          </div>
          <Badge className={cronConfigured ? 'bg-green-500' : 'bg-red-500'}>
            {cronConfigured ? 'OK' : 'Manquant'}
          </Badge>
        </div>
      </div>

      {/* Instructions si non configuré */}
      {!isReady && (
        <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-700">
          <p className="text-yellow-400 text-sm font-medium mb-2">Configuration requise</p>
          <p className="text-yellow-300/80 text-sm">
            Ajoutez ces variables dans <code className="bg-slate-800 px-1 rounded">.env.local</code> :
          </p>
          <pre className="mt-2 p-3 bg-slate-800 rounded text-xs text-slate-300 overflow-x-auto">
{`# Brevo API (obtenir sur https://app.brevo.com/settings/keys/api)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=notifications@qadhya.tn

# Secret pour sécuriser le cron (générer avec: openssl rand -hex 32)
CRON_SECRET=votre-secret-32-chars-minimum`}
          </pre>
        </div>
      )}

      {/* Informations cron */}
      <div className="p-4 rounded-lg bg-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-white">Planification</p>
            <p className="text-sm text-slate-400">Tous les jours à 06:00 (Tunis)</p>
          </div>
          <Badge className="bg-blue-500">Automatique</Badge>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          <p>Endpoint: <code className="bg-slate-800 px-1 rounded">POST /api/cron/daily-digest</code></p>
          <p className="mt-1">
            Configurez un service cron externe (cron-job.org, Render, etc.) pour appeler cet endpoint.
          </p>
        </div>
      </div>

      {/* Bouton de déclenchement manuel */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
        <div>
          <p className="font-medium text-white">Déclenchement manuel</p>
          <p className="text-sm text-slate-400">Envoyer le digest maintenant</p>
        </div>
        <Button
          onClick={handleManualRun}
          disabled={!isReady || loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? (
            <>
              <Icons.spinner className="h-4 w-4 mr-2 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Icons.play className="h-4 w-4 mr-2" />
              Envoyer maintenant
            </>
          )}
        </Button>
      </div>

      {/* Dernier envoi */}
      {lastRun && (
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-700">
          <p className="text-green-400 text-sm font-medium">Dernier envoi réussi</p>
          <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Envoyés</p>
              <p className="text-white font-medium">{lastRun.emailsSent}</p>
            </div>
            <div>
              <p className="text-slate-400">Échecs</p>
              <p className="text-white font-medium">{lastRun.emailsFailed}</p>
            </div>
            <div>
              <p className="text-slate-400">Durée</p>
              <p className="text-white font-medium">{lastRun.duration}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
