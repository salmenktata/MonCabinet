'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface ApiKey {
  name: string
  value: string | undefined
  label: string
  priority?: boolean
}

interface ApiKeysCardProps {
  apiKeys: ApiKey[]
}

function maskKey(key: string | undefined): string {
  if (!key) return 'Non configuré'
  if (key.length <= 12) return '***'
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

function ApiKeyRow({ apiKey, showFull }: { apiKey: ApiKey; showFull: boolean }) {
  const isConfigured = !!apiKey.value &&
    !apiKey.value.includes('CHANGE_ME') &&
    !apiKey.value.includes('VOTRE') &&
    !apiKey.value.includes('your')

  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-white">{apiKey.label}</p>
          {apiKey.priority && (
            <Badge variant="outline" className="text-xs border-blue-500 text-blue-400">
              Prioritaire
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1">{apiKey.name}</p>
      </div>
      <div className="flex items-center gap-3">
        <code className={cn(
          "text-sm font-mono px-2 py-1 rounded",
          isConfigured ? "bg-slate-600 text-green-400" : "bg-slate-600 text-red-400"
        )}>
          {showFull && apiKey.value ? apiKey.value : maskKey(apiKey.value)}
        </code>
        <Badge className={isConfigured ? 'bg-green-500' : 'bg-red-500'}>
          {isConfigured ? 'OK' : 'Manquant'}
        </Badge>
      </div>
    </div>
  )
}

export function ApiKeysCard({ apiKeys }: ApiKeysCardProps) {
  const [showKeys, setShowKeys] = useState(false)

  const configuredCount = apiKeys.filter(k =>
    k.value && !k.value.includes('CHANGE_ME') && !k.value.includes('VOTRE') && !k.value.includes('your')
  ).length

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.key className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-white">Clés API</CardTitle>
            <Badge variant="outline" className="ml-2">
              {configuredCount}/{apiKeys.length}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeys(!showKeys)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            {showKeys ? (
              <>
                <Icons.eyeOff className="h-4 w-4 mr-2" />
                Masquer
              </>
            ) : (
              <>
                <Icons.eye className="h-4 w-4 mr-2" />
                Afficher
              </>
            )}
          </Button>
        </div>
        <CardDescription className="text-slate-400">
          Configuration par défaut de la plateforme - Clés API et secrets
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow key={apiKey.name} apiKey={apiKey} showFull={showKeys} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
