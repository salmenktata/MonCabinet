'use client'

import { useState, useEffect, useRef } from 'react'

export type TransitionType = 'initial' | 'normal' | 'bypass' | 'revert'

interface WorkflowTransitionModalProps {
  isOpen: boolean
  etapeFromLibelle: string
  etapeToLibelle: string
  typeTransition: TransitionType
  etapesSkippees?: number
  onConfirm: (note?: string) => void
  onCancel: () => void
}

const TRANSITION_CONFIG: Record<
  TransitionType,
  { label: string; badgeClass: string; emoji: string; warningMessage?: (skipped?: number) => string }
> = {
  initial: {
    label: 'Initialisation',
    badgeClass: 'bg-blue-100 text-blue-700',
    emoji: '🟢',
  },
  normal: {
    label: 'Avancement normal',
    badgeClass: 'bg-green-100 text-green-700',
    emoji: '➡️',
  },
  bypass: {
    label: 'Saut d\'étapes',
    badgeClass: 'bg-orange-100 text-orange-700',
    emoji: '⏭️',
    warningMessage: (skipped) =>
      `Vous allez sauter ${skipped ?? 'plusieurs'} étape${(skipped ?? 2) > 1 ? 's' : ''}. Les actions liées à ces étapes seront ignorées.`,
  },
  revert: {
    label: 'Retour en arrière',
    badgeClass: 'bg-red-100 text-red-700',
    emoji: '↩️',
    warningMessage: () =>
      'Vous revenez en arrière. Le workflow sera rouvert à cette étape antérieure.',
  },
}

export default function WorkflowTransitionModal({
  isOpen,
  etapeFromLibelle,
  etapeToLibelle,
  typeTransition,
  etapesSkippees,
  onConfirm,
  onCancel,
}: WorkflowTransitionModalProps) {
  const [note, setNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      setNote('')
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const config = TRANSITION_CONFIG[typeTransition]
  const warning = config.warningMessage?.(etapesSkippees)

  const handleConfirm = () => {
    onConfirm(note.trim() || undefined)
    setNote('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transition-modal-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Contenu */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-card shadow-2xl border p-6 mx-4">
        {/* En-tête */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg" aria-hidden="true">{config.emoji}</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badgeClass}`}
            >
              {config.label}
            </span>
          </div>
          <h2
            id="transition-modal-title"
            className="text-base font-semibold text-foreground mt-2"
          >
            Changer l&apos;étape du workflow
          </h2>
        </div>

        {/* Transition visuelle */}
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3 mb-4">
          <span className="flex-1 text-sm font-medium text-foreground truncate">
            {etapeFromLibelle || '—'}
          </span>
          <svg
            className="h-4 w-4 flex-shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
          </svg>
          <span className="flex-1 text-sm font-medium text-foreground truncate text-right">
            {etapeToLibelle}
          </span>
        </div>

        {/* Avertissement contextuel */}
        {warning && (
          <div
            className={`flex gap-2 rounded-lg p-3 mb-4 text-sm ${
              typeTransition === 'revert'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-orange-50 text-orange-700 border border-orange-200'
            }`}
          >
            <span className="flex-shrink-0" aria-hidden="true">
              {typeTransition === 'revert' ? '⚠️' : 'ℹ️'}
            </span>
            <p>{warning}</p>
          </div>
        )}

        {/* Champ note */}
        <div className="mb-5">
          <label
            htmlFor="transition-note"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Motif / Note{' '}
            <span className="text-muted-foreground font-normal">(optionnel)</span>
          </label>
          <textarea
            id="transition-note"
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex : Renvoi du juge, Décision client, Accord à l'amiable…"
            rows={2}
            maxLength={500}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {note.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground text-right">
              {note.length}/500
            </p>
          )}
        </div>

        {/* Boutons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground rounded-md border hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
              typeTransition === 'revert'
                ? 'bg-red-600 hover:bg-red-700'
                : typeTransition === 'bypass'
                ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
