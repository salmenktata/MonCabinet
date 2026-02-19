'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface SchedulerStatus {
  config: {
    isEnabled: boolean
    maxConcurrentCrawls: number
    maxCrawlsPerHour: number
    defaultFrequency: string
    scheduleStartHour: number
    scheduleEndHour: number
    lastRunAt: string | null
    lastRunResult: string | null
    totalRuns: number
    totalErrors: number
  }
  sourcesDue: number
  activeCrawls: number
}

const FREQUENCIES = [
  { value: '1 hour', label: 'Toutes les heures' },
  { value: '6 hours', label: 'Toutes les 6 heures' },
  { value: '12 hours', label: 'Toutes les 12 heures' },
  { value: '24 hours', label: 'Quotidien' },
  { value: '7 days', label: 'Hebdomadaire' },
]

export function SchedulerDashboard() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable config state
  const [isEnabled, setIsEnabled] = useState(false)
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [maxPerHour, setMaxPerHour] = useState(10)
  const [defaultFrequency, setDefaultFrequency] = useState('24 hours')
  const [startHour, setStartHour] = useState(0)
  const [endHour, setEndHour] = useState(24)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/web-sources/scheduler')
      if (!res.ok) throw new Error('Erreur chargement')
      const data = await res.json()
      setStatus(data.status)

      // Initialize form from config
      if (data.status?.config) {
        const c = data.status.config
        setIsEnabled(c.isEnabled)
        setMaxConcurrent(c.maxConcurrentCrawls)
        setMaxPerHour(c.maxCrawlsPerHour)
        setDefaultFrequency(c.defaultFrequency)
        setStartHour(c.scheduleStartHour)
        setEndHour(c.scheduleEndHour)
      }
    } catch {
      toast.error('Impossible de charger le statut du scheduler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/web-sources/scheduler', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled,
          maxConcurrentCrawls: maxConcurrent,
          maxCrawlsPerHour: maxPerHour,
          defaultFrequency,
          scheduleStartHour: startHour,
          scheduleEndHour: endHour,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(err.error)
      }

      toast.success('Configuration sauvegardée')
      fetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8 flex items-center justify-center">
          <Icons.loader className="h-6 w-6 text-slate-400 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard
          label="Scheduler"
          value={isEnabled ? 'Actif' : 'Inactif'}
          color={isEnabled ? 'green' : 'slate'}
          icon={<Icons.clock className="h-4 w-4" />}
        />
        <StatusCard
          label="Sources dues"
          value={String(status?.sourcesDue ?? 0)}
          color={status?.sourcesDue ? 'orange' : 'slate'}
          icon={<Icons.globe className="h-4 w-4" />}
        />
        <StatusCard
          label="Crawls actifs"
          value={String(status?.activeCrawls ?? 0)}
          color={status?.activeCrawls ? 'blue' : 'slate'}
          icon={<Icons.loader className="h-4 w-4" />}
        />
        <StatusCard
          label="Total exécutions"
          value={String(status?.config?.totalRuns ?? 0)}
          color="purple"
          icon={<Icons.zap className="h-4 w-4" />}
          subValue={status?.config?.totalErrors ? `${status.config.totalErrors} erreurs` : undefined}
        />
      </div>

      {/* Configuration */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Configuration du Scheduler</CardTitle>
          <CardDescription>Paramètres globaux de planification automatique</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle global */}
          <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
            <div>
              <Label className="text-slate-300 text-base">Scheduler actif</Label>
              <p className="text-xs text-slate-400 mt-0.5">
                Active/désactive le crawl automatique global
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Concurrent crawls */}
            <div>
              <Label className="text-slate-300">
                Crawls simultanés max: {maxConcurrent}
              </Label>
              <Slider
                value={[maxConcurrent]}
                onValueChange={([v]) => setMaxConcurrent(v)}
                min={1}
                max={10}
                step={1}
                className="mt-2"
              />
            </div>

            {/* Max per hour */}
            <div>
              <Label className="text-slate-300">
                Crawls par heure max: {maxPerHour}
              </Label>
              <Slider
                value={[maxPerHour]}
                onValueChange={([v]) => setMaxPerHour(v)}
                min={1}
                max={50}
                step={1}
                className="mt-2"
              />
            </div>
          </div>

          {/* Default frequency */}
          <div>
            <Label className="text-slate-300">Fréquence par défaut</Label>
            <Select value={defaultFrequency} onValueChange={setDefaultFrequency}>
              <SelectTrigger className="mt-1 bg-slate-900 border-slate-600 text-white w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-white">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule window */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="text-slate-300">
                Heure de début: {startHour}h
              </Label>
              <Slider
                value={[startHour]}
                onValueChange={([v]) => setStartHour(v)}
                min={0}
                max={23}
                step={1}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-slate-300">
                Heure de fin: {endHour}h
              </Label>
              <Slider
                value={[endHour]}
                onValueChange={([v]) => setEndHour(v)}
                min={1}
                max={24}
                step={1}
                className="mt-2"
              />
            </div>
          </div>

          {/* Last run info */}
          {status?.config?.lastRunAt && (
            <div className="p-3 bg-slate-900/50 rounded-lg text-sm">
              <span className="text-slate-400">Dernière exécution: </span>
              <span className="text-slate-200">
                {new Date(status.config.lastRunAt).toLocaleString('fr-FR')}
              </span>
              {status.config.lastRunResult && (
                <span className="text-slate-400 ml-2">
                  ({status.config.lastRunResult})
                </span>
              )}
            </div>
          )}

          {/* Save */}
          <div className="flex justify-end pt-4 border-t border-slate-700">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.check className="h-4 w-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusCard({
  label,
  value,
  color,
  icon,
  subValue,
}: {
  label: string
  value: string
  color: 'green' | 'blue' | 'orange' | 'purple' | 'slate'
  icon: React.ReactNode
  subValue?: string
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    slate: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  }

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-300">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      {subValue && <div className="text-xs text-slate-400 mt-0.5">{subValue}</div>}
    </div>
  )
}
