'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'

interface SourceFeedbackProps {
  sourceId: string
  sourceTitre: string
  onFeedback?: (sourceId: string, isPositive: boolean) => void
}

export default function SourceFeedback({
  sourceId,
  sourceTitre,
  onFeedback,
}: SourceFeedbackProps) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (isPositive: boolean) => {
    if (isSubmitting) return

    setIsSubmitting(true)
    const newFeedback = feedback === (isPositive ? 'positive' : 'negative') ? null : (isPositive ? 'positive' : 'negative')

    try {
      // Appeler l'API de feedback
      const response = await fetch('/api/feedback/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          sourceTitre,
          isPositive: newFeedback === 'positive',
          isNegative: newFeedback === 'negative',
        }),
      })

      if (response.ok) {
        setFeedback(newFeedback)
        onFeedback?.(sourceId, isPositive)
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi du feedback:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleFeedback(true)}
        disabled={isSubmitting}
        className={`p-1 rounded transition-colors ${
          feedback === 'positive'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'hover:bg-green-50 dark:hover:bg-green-900/10 text-gray-400 hover:text-green-600 dark:hover:text-green-400'
        }`}
        title="Source utile"
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleFeedback(false)}
        disabled={isSubmitting}
        className={`p-1 rounded transition-colors ${
          feedback === 'negative'
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'hover:bg-red-50 dark:hover:bg-red-900/10 text-gray-400 hover:text-red-600 dark:hover:text-red-400'
        }`}
        title="Source non pertinente"
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  )
}
