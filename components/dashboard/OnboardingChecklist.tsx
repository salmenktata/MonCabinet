'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'onboarding_dismissed'

interface OnboardingChecklistProps {
  hasClients: boolean
  hasDossiers: boolean
  hasConversations: boolean
}

interface Step {
  id: string
  label: string
  description: string
  href: string
  done: boolean
  icon: keyof typeof Icons
}

export function OnboardingChecklist({ hasClients, hasDossiers, hasConversations }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true) // true par défaut pour éviter flash

  useEffect(() => {
    const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true'
    setDismissed(isDismissed)
  }, [])

  const steps: Step[] = [
    {
      id: 'client',
      label: 'Ajouter votre premier client',
      description: 'Créez la fiche d\'un client pour démarrer',
      href: '/clients/new',
      done: hasClients,
      icon: 'clients',
    },
    {
      id: 'dossier',
      label: 'Créer votre premier dossier',
      description: 'Ouvrez un dossier juridique et suivez son avancement',
      href: '/dossiers/new',
      done: hasDossiers,
      icon: 'dossiers',
    },
    {
      id: 'ia',
      label: 'Poser une question à l\'IA juridique',
      description: 'Interrogez la base de 6 800+ textes tunisiens',
      href: '/assistant-ia',
      done: hasConversations,
      icon: 'sparkles',
    },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const allDone = completedCount === steps.length

  // Ne pas afficher si déjà ignoré ou tout complété
  if (dismissed || allDone) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Icons.zap className="h-4 w-4 text-amber-400" />
            Démarrez en {steps.length} étapes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{steps.length} étapes complétées
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
        >
          Passer
        </Button>
      </div>

      {/* Barre de progression */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {steps.map((step) => {
          const StepIcon = Icons[step.icon]
          return (
            <Link
              key={step.id}
              href={step.done ? '#' : step.href}
              onClick={step.done ? (e) => e.preventDefault() : undefined}
              className={cn(
                'flex items-start gap-3 rounded-lg p-3 transition-colors',
                step.done
                  ? 'bg-green-500/10 border border-green-500/20 cursor-default'
                  : 'bg-slate-800/60 border border-slate-700 hover:border-blue-500/40 hover:bg-slate-800'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  step.done ? 'bg-green-500/20' : 'bg-slate-700'
                )}
              >
                {step.done ? (
                  <Icons.checkCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <StepIcon className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xs font-medium leading-snug',
                    step.done ? 'text-green-400 line-through decoration-green-600' : 'text-white'
                  )}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {step.description}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
