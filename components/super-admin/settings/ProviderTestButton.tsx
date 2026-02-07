'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'

type EmailProvider = 'brevo' | 'resend'
type AIProvider = 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'ollama'
type AllProvider = EmailProvider | AIProvider

interface ProviderTestButtonProps {
  provider: AllProvider
  disabled?: boolean
  testEmail?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

const AI_PROVIDERS: AIProvider[] = ['deepseek', 'groq', 'openai', 'anthropic', 'ollama']

export function ProviderTestButton({
  provider,
  disabled = false,
  testEmail,
  variant = 'outline',
  size = 'sm',
  className,
}: ProviderTestButtonProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const isAIProvider = AI_PROVIDERS.includes(provider as AIProvider)

  const handleTest = async () => {
    setLoading(true)
    try {
      let url: string
      let body: Record<string, string> | undefined

      if (isAIProvider) {
        url = '/api/super-admin/providers/ai/test'
        body = { provider }
      } else {
        url = '/api/super-admin/providers/email/test'
        body = { provider }
        if (testEmail) {
          body.email = testEmail
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await res.json()

      if (data.success) {
        toast({
          title: 'Test réussi',
          description: data.message || `Test ${provider} effectué avec succès`,
        })
      } else {
        toast({
          title: 'Erreur',
          description: data.error || `Échec du test ${provider}`,
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

  const getIcon = () => {
    if (loading) {
      return <Icons.spinner className="h-4 w-4 animate-spin" />
    }
    if (isAIProvider) {
      return <Icons.zap className="h-4 w-4" />
    }
    return <Icons.mail className="h-4 w-4" />
  }

  const getLabel = () => {
    if (loading) return 'Test...'
    return 'Tester'
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleTest}
      disabled={disabled || loading}
      className={cn(
        'border-slate-600 text-slate-300 hover:bg-slate-700',
        className
      )}
    >
      {getIcon()}
      <span className="ml-1">{getLabel()}</span>
    </Button>
  )
}
