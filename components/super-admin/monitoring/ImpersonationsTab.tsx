'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface ActiveImpersonation {
  id: string
  admin_id: string
  target_user_id: string
  admin_email: string
  admin_name: string
  target_email: string
  target_name: string
  target_role: string
  reason: string
  started_at: string
  expires_at: string
  ip_address: string
  user_agent: string
}

export function ImpersonationsTab() {
  const [impersonations, setImpersonations] = useState<ActiveImpersonation[]>([])
  const [loading, setLoading] = useState(true)


  const fetchImpersonations = async () => {
    try {
      const response = await fetch('/api/super-admin/impersonations/active')
      if (response.ok) {
        const data = await response.json()
        setImpersonations(data)
      }
    } catch (error) {
      console.error('Erreur fetch impersonations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchImpersonations()

    // Refresh automatique toutes les 10 secondes
    const interval = setInterval(fetchImpersonations, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleForceStop = async (id: string, adminName: string) => {
    if (!confirm(`Forcer l'arrêt de l'impersonnalisation de ${adminName} ?`)) {
      return
    }

    try {
      const response = await fetch('/api/super-admin/impersonations/active', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (response.ok) {
        toast.success('Session arr\u00eat\u00e9e \u2014 L\'impersonnalisation a \u00e9t\u00e9 forc\u00e9e \u00e0 s\'arr\u00eater.')
        fetchImpersonations()
      } else {
        throw new Error('Erreur API')
      }
    } catch {
      toast.error('Impossible d\'arr\u00eater la session')
    }
  }

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt).getTime()
    const now = Date.now()
    const elapsed = Math.floor((now - start) / 1000) // secondes

    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const seconds = elapsed % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }
    return `${minutes}m ${seconds}s`
  }

  const getProgressPercentage = (startedAt: string, expiresAt: string) => {
    const start = new Date(startedAt).getTime()
    const end = new Date(expiresAt).getTime()
    const now = Date.now()
    const total = end - start
    const elapsed = now - start
    return Math.min(100, (elapsed / total) * 100)
  }

  if (loading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-8 text-center">
          <Icons.spinner className="h-8 w-8 animate-spin mx-auto text-slate-500" />
          <p className="text-slate-400 mt-4">Chargement des impersonnalisations...</p>
        </CardContent>
      </Card>
    )
  }

  if (impersonations.length === 0) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.eye className="h-5 w-5 text-orange-400" />
            Impersonnalisations Actives
          </CardTitle>
          <CardDescription>
            Aucune impersonnalisation en cours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 bg-slate-800/50 rounded-lg">
            <Icons.checkCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-slate-300">Aucune session d'impersonnalisation active</p>
            <p className="text-slate-500 text-sm mt-2">
              Les impersonnalisations apparaîtront ici en temps réel
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Icons.eye className="h-5 w-5 text-orange-400" />
              Impersonnalisations Actives
              <Badge variant="destructive" className="ml-2">
                {impersonations.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Mise à jour automatique toutes les 10 secondes
            </CardDescription>
          </div>
          <Button
            onClick={fetchImpersonations}
            variant="outline"
            size="sm"
            className="border-slate-700"
          >
            <Icons.refresh className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-400">Admin</TableHead>
                <TableHead className="text-slate-400">Utilisateur cible</TableHead>
                <TableHead className="text-slate-400">Raison</TableHead>
                <TableHead className="text-slate-400">Durée</TableHead>
                <TableHead className="text-slate-400">IP</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {impersonations.map((imp) => {
                const progress = getProgressPercentage(imp.started_at, imp.expires_at)
                const isWarning = progress > 75

                return (
                  <TableRow key={imp.id} className="border-slate-800">
                    <TableCell>
                      <div>
                        <p className="text-white font-medium">{imp.admin_name}</p>
                        <p className="text-slate-500 text-sm">{imp.admin_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-white">{imp.target_name}</p>
                        <p className="text-slate-500 text-sm">{imp.target_email}</p>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {imp.target_role}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-slate-300 text-sm truncate" title={imp.reason}>
                        {imp.reason}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p
                          className={`font-mono text-sm ${
                            isWarning ? 'text-orange-400 animate-pulse' : 'text-slate-300'
                          }`}
                        >
                          {formatDuration(imp.started_at)}
                        </p>
                        <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-1000 ${
                              isWarning ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          Expire : {new Date(imp.expires_at).toLocaleTimeString('fr-FR')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-slate-400 text-sm font-mono">{imp.ip_address}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleForceStop(imp.id, imp.admin_name)}
                        variant="destructive"
                        size="sm"
                      >
                        <Icons.xCircle className="h-4 w-4 mr-2" />
                        Forcer arrêt
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
