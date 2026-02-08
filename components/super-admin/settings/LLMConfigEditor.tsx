'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface LLMConfig {
  key: string
  value: string
  label: string
  description: string
  isSecret: boolean
  priority?: number
}

interface LLMConfigEditorProps {
  configs: LLMConfig[]
}

export function LLMConfigEditor({ configs: initialConfigs }: LLMConfigEditorProps) {
  const [configs, setConfigs] = useState(initialConfigs)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSecrets, setShowSecrets] = useState(false)

  const handleEdit = (key: string, currentValue: string) => {
    setEditingKey(key)
    setEditValue(currentValue)
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const handleSave = async (key: string) => {
    if (!editValue.trim()) {
      toast.error('La valeur ne peut pas être vide')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/super-admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue }),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde')
      }

      // Mettre à jour localement
      setConfigs(prev =>
        prev.map(c => (c.key === key ? { ...c, value: editValue } : c))
      )
      setEditingKey(null)
      setEditValue('')
      toast.success('Configuration mise à jour')
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const maskValue = (value: string, isSecret: boolean) => {
    if (!value) return 'Non configuré'
    if (!isSecret || showSecrets) return value
    if (value.length <= 12) return '••••••••'
    return `${value.slice(0, 8)}...${value.slice(-4)}`
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.zap className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-white">Configuration LLM</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSecrets(!showSecrets)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            {showSecrets ? (
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
          Gérez les clés API des providers LLM (stockées en base de données)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.key}
              className="p-4 rounded-lg bg-slate-700/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{config.label}</p>
                    {config.priority === 1 && (
                      <Badge className="bg-blue-500 text-xs">Prioritaire</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{config.description}</p>
                </div>
                <Badge className={config.value ? 'bg-green-500' : 'bg-red-500'}>
                  {config.value ? 'Configuré' : 'Manquant'}
                </Badge>
              </div>

              {editingKey === config.key ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={`Entrez ${config.label}`}
                    className="bg-slate-600 border-slate-500 text-white"
                    type={config.isSecret ? 'password' : 'text'}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSave(config.key)}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {saving ? (
                      <Icons.spinner className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    className="border-slate-500"
                  >
                    <Icons.x className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono px-2 py-1 rounded bg-slate-600 text-slate-300">
                    {maskValue(config.value, config.isSecret)}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(config.key, config.value)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-600"
                  >
                    <Icons.edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
