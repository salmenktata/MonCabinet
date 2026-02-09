'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { ProviderTestButton } from './ProviderTestButton'
import { cn } from '@/lib/utils'

type AIProvider = 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'ollama'

interface AIProviderConfig {
  deepseek: { configured: boolean; apiKeyMasked: string | null }
  groq: { configured: boolean; apiKeyMasked: string | null }
  openai: { configured: boolean; apiKeyMasked: string | null }
  anthropic: { configured: boolean; apiKeyMasked: string | null }
  ollama: { enabled: boolean; baseUrl: string | null }
  activeProvider: AIProvider | null
}

interface ProviderCardProps {
  name: string
  provider: AIProvider
  description: string
  configured: boolean
  apiKeyMasked: string | null
  apiKey: string
  setApiKey: (value: string) => void
  showKey: boolean
  setShowKey: (value: boolean) => void
  isActive: boolean
  priority: number
  disabled?: boolean
}

function ProviderCard({
  name,
  provider,
  description,
  configured,
  apiKeyMasked,
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
  isActive,
  priority,
  disabled = false,
}: ProviderCardProps) {
  return (
    <div className={cn(
      'space-y-3 p-4 rounded-lg border transition-colors',
      isActive ? 'bg-green-500/10 border-green-500' : 'bg-slate-700/50 border-slate-600',
      disabled && 'opacity-60'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-white font-medium">{name}</h4>
          <Badge className={configured ? 'bg-green-500' : 'bg-slate-500'}>
            {configured ? 'Configuré' : 'Non configuré'}
          </Badge>
          {isActive && (
            <Badge variant="outline" className="text-green-400 border-green-500">
              Actif
            </Badge>
          )}
          <span className="text-xs text-slate-400">Priorité: {priority}</span>
        </div>
        <ProviderTestButton
          provider={provider}
          disabled={!configured || disabled}
        />
      </div>

      <p className="text-xs text-slate-400">{description}</p>

      {apiKeyMasked && (
        <div className="text-xs text-slate-400 font-mono">
          Clé actuelle: {apiKeyMasked}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={showKey ? 'text' : 'password'}
            placeholder={`Nouvelle clé API ${name}`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="bg-slate-600 border-slate-500 text-white pr-10"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-white"
            onClick={() => setShowKey(!showKey)}
            disabled={disabled}
          >
            {showKey ? (
              <Icons.eyeOff className="h-4 w-4" />
            ) : (
              <Icons.eye className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AIProvidersConfig() {
  const router = useRouter()
  const [config, setConfig] = useState<AIProviderConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Clés API
  const [deepseekKey, setDeepseekKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')

  // Affichage des clés
  const [showDeepseek, setShowDeepseek] = useState(false)
  const [showGroq, setShowGroq] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)

  // Ollama
  const [ollamaEnabled, setOllamaEnabled] = useState(false)
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')

  const { toast } = useToast()

  // Interface dépréciée - lecture seule
  const DEPRECATED = true

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/super-admin/providers/ai')
      const data = await res.json()

      if (data.success) {
        setConfig(data.data)
        setOllamaEnabled(data.data.ollama.enabled)
        if (data.data.ollama.baseUrl) {
          setOllamaUrl(data.data.ollama.baseUrl)
        }
      } else {
        toast({
          title: 'Erreur',
          description: data.error || 'Impossible de charger la configuration',
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

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, string | boolean> = {}

      if (deepseekKey) body.deepseekApiKey = deepseekKey
      if (groqKey) body.groqApiKey = groqKey
      if (openaiKey) body.openaiApiKey = openaiKey
      if (anthropicKey) body.anthropicApiKey = anthropicKey

      // Ollama
      if (ollamaEnabled !== config?.ollama.enabled) {
        body.ollamaEnabled = ollamaEnabled
      }
      if (ollamaUrl !== config?.ollama.baseUrl && ollamaEnabled) {
        body.ollamaBaseUrl = ollamaUrl
      }

      if (Object.keys(body).length === 0) {
        toast({
          title: 'Info',
          description: 'Aucune modification à enregistrer',
        })
        setSaving(false)
        return
      }

      const res = await fetch('/api/super-admin/providers/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.success) {
        toast({
          title: 'Succès',
          description: data.message || 'Configuration enregistrée',
        })
        setConfig(data.data)
        // Reset les champs
        setDeepseekKey('')
        setGroqKey('')
        setOpenaiKey('')
        setAnthropicKey('')
      } else {
        toast({
          title: 'Erreur',
          description: data.error || 'Échec de la sauvegarde',
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
      setSaving(false)
    }
  }

  const testProvider = async (provider: AIProvider) => {
    try {
      const res = await fetch('/api/super-admin/providers/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })

      const data = await res.json()

      if (data.success) {
        toast({
          title: 'Test réussi',
          description: data.message,
        })
      } else {
        toast({
          title: 'Échec du test',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur de connexion au serveur',
        variant: 'destructive',
      })
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
          <Icons.zap className="h-5 w-5 text-purple-500" />
          <CardTitle className="text-white">Providers IA</CardTitle>
        </div>
        <CardDescription className="text-slate-400">
          Configurez les clés API des providers IA. Le provider actif est sélectionné automatiquement selon l&apos;ordre de priorité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bandeau de dépréciation */}
        {DEPRECATED && (
          <Alert className="bg-orange-500/10 border-orange-500/50">
            <Icons.alertTriangle className="h-4 w-4 text-orange-500" />
            <AlertTitle className="text-orange-300 font-semibold">
              ⚠️ Interface Dépréciée
            </AlertTitle>
            <AlertDescription className="text-orange-200/80 space-y-2">
              <p>
                Cette interface est en lecture seule et sera supprimée prochainement.
                Utilisez la nouvelle interface <strong>Architecture IA</strong> qui inclut tous les providers (y compris Gemini).
              </p>
              <Button
                onClick={() => router.push('/super-admin/settings')}
                className="bg-orange-600 hover:bg-orange-700 text-white mt-2"
                size="sm"
              >
                <Icons.arrowRight className="h-4 w-4 mr-2" />
                Accéder à la nouvelle interface
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Info priorité */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-start gap-2 text-sm text-blue-300">
            <Icons.info className="h-4 w-4 mt-0.5" />
            <div>
              <p className="font-medium">Ordre de priorité:</p>
              <p className="text-blue-400/80">
                DeepSeek (1) → Groq (2) → Ollama (3) → Anthropic (4) → OpenAI (5)
              </p>
            </div>
          </div>
        </div>

        {/* DeepSeek */}
        <ProviderCard
          name="DeepSeek"
          provider="deepseek"
          description="LLM économique et performant (deepseek-chat). Idéal pour production."
          configured={config?.deepseek.configured || false}
          apiKeyMasked={config?.deepseek.apiKeyMasked || null}
          apiKey={deepseekKey}
          setApiKey={setDeepseekKey}
          showKey={showDeepseek}
          setShowKey={setShowDeepseek}
          isActive={config?.activeProvider === 'deepseek'}
          priority={1}
          disabled={DEPRECATED}
        />

        {/* Groq */}
        <ProviderCard
          name="Groq"
          provider="groq"
          description="LLM ultra-rapide (Llama 3.3 70B). Très faible latence."
          configured={config?.groq.configured || false}
          apiKeyMasked={config?.groq.apiKeyMasked || null}
          apiKey={groqKey}
          setApiKey={setGroqKey}
          showKey={showGroq}
          setShowKey={setShowGroq}
          isActive={config?.activeProvider === 'groq'}
          priority={2}
          disabled={DEPRECATED}
        />

        {/* Ollama */}
        <div className={cn(
          'space-y-3 p-4 rounded-lg border transition-colors',
          config?.activeProvider === 'ollama' ? 'bg-green-500/10 border-green-500' : 'bg-slate-700/50 border-slate-600',
          DEPRECATED && 'opacity-60'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">Ollama</h4>
              <Badge className={ollamaEnabled ? 'bg-green-500' : 'bg-slate-500'}>
                {ollamaEnabled ? 'Activé' : 'Désactivé'}
              </Badge>
              {config?.activeProvider === 'ollama' && (
                <Badge variant="outline" className="text-green-400 border-green-500">
                  Actif
                </Badge>
              )}
              <span className="text-xs text-slate-400">Priorité: 3</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => testProvider('ollama')}
                disabled={!ollamaEnabled || DEPRECATED}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <Icons.zap className="h-4 w-4 mr-1" />
                Tester
              </Button>
              <Switch
                checked={ollamaEnabled}
                onCheckedChange={setOllamaEnabled}
                disabled={DEPRECATED}
              />
            </div>
          </div>

          <p className="text-xs text-slate-400">
            LLM local gratuit (Qwen, Llama, etc.). Requiert Ollama installé sur le serveur.
          </p>

          {ollamaEnabled && (
            <div className="flex items-center gap-2">
              <Label className="text-slate-300 text-sm whitespace-nowrap">URL:</Label>
              <Input
                type="text"
                placeholder="http://localhost:11434"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="bg-slate-600 border-slate-500 text-white"
                disabled={DEPRECATED}
              />
            </div>
          )}
        </div>

        {/* Anthropic */}
        <ProviderCard
          name="Anthropic"
          provider="anthropic"
          description="Claude 3.5 Sonnet. Haute qualité pour analyses complexes."
          configured={config?.anthropic.configured || false}
          apiKeyMasked={config?.anthropic.apiKeyMasked || null}
          apiKey={anthropicKey}
          setApiKey={setAnthropicKey}
          showKey={showAnthropic}
          setShowKey={setShowAnthropic}
          isActive={config?.activeProvider === 'anthropic'}
          priority={4}
          disabled={DEPRECATED}
        />

        {/* OpenAI */}
        <ProviderCard
          name="OpenAI"
          provider="openai"
          description="GPT-4o + Embeddings. Aussi utilisé pour les embeddings si Ollama désactivé."
          configured={config?.openai.configured || false}
          apiKeyMasked={config?.openai.apiKeyMasked || null}
          apiKey={openaiKey}
          setApiKey={setOpenaiKey}
          showKey={showOpenai}
          setShowKey={setShowOpenai}
          isActive={config?.activeProvider === 'openai'}
          priority={5}
          disabled={DEPRECATED}
        />

        {/* Bouton Action */}
        <div className="flex justify-end pt-2">
          {DEPRECATED ? (
            <Button
              onClick={() => router.push('/super-admin/settings')}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Icons.arrowRight className="h-4 w-4 mr-2" />
              Modifier dans la nouvelle interface
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700"
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
          )}
        </div>
      </CardContent>
    </Card>
  )
}
