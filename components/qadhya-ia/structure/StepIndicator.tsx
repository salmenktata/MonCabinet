'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = 'input' | 'clarifying' | 'analyzing' | 'result'

const STEPS: Step[] = ['input', 'clarifying', 'analyzing', 'result']

interface StepIndicatorProps {
  currentStep: Step
  onStepClick?: (step: Step) => void
}

export default function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const t = useTranslations('assistant.steps')

  const currentIndex = STEPS.indexOf(currentStep)

  const labels: Record<Step, string> = {
    input: t('input'),
    clarifying: t('clarifying'),
    analyzing: t('analyzing'),
    result: t('result'),
  }

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex
        const isActive = step === currentStep
        const canClick = isCompleted && onStepClick

        return (
          <div key={step} className="flex items-center gap-2">
            {index > 0 && (
              <div
                className={cn(
                  'h-0.5 w-8 rounded-full transition-colors',
                  isCompleted || isActive ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick(step)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                isCompleted &&
                  'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                isActive && 'bg-primary text-primary-foreground',
                !isCompleted && !isActive && 'bg-muted text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                  {index + 1}
                </span>
              )}
              <span className="hidden sm:inline">{labels[step]}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
