/**
 * Modal Feedback RAG (Phase 5.1)
 *
 * Modal post-réponse pour collecter feedback avocat tunisien :
 * - Rating 1-5 étoiles
 * - Types problèmes (checkboxes)
 * - Commentaire libre
 * - Suggestions sources manquantes
 * - Signalement hallucinations
 *
 * @module components/chat/FeedbackModal
 */

'use client'

import { useState } from 'react'
import {
  Star,
  X,
  AlertTriangle,
  FileQuestion,
  FileX,
  MessageSquare,
  Send,
  CheckCircle,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

export interface FeedbackData {
  conversationId?: string
  messageId?: string
  question: string
  answer?: string
  sourcesUsed?: string[]
  rating: number
  feedbackType: string[]
  missingInfo?: string
  incorrectCitation?: string
  incompleteReason?: string
  hallucinationDetails?: string
  suggestedSources?: string[]
  comment?: string
  domain?: string
  ragConfidence?: number
  sourcesCount?: number
  responseTimeMs?: number
}

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  conversationId?: string
  messageId?: string
  question: string
  answer?: string
  sourcesUsed?: string[]
  domain?: string
  ragConfidence?: number
  sourcesCount?: number
  responseTimeMs?: number
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function FeedbackModal({
  isOpen,
  onClose,
  conversationId,
  messageId,
  question,
  answer,
  sourcesUsed,
  domain,
  ragConfidence,
  sourcesCount,
  responseTimeMs,
}: FeedbackModalProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [feedbackTypes, setFeedbackTypes] = useState<string[]>([])
  const [missingInfo, setMissingInfo] = useState('')
  const [incorrectCitation, setIncorrectCitation] = useState('')
  const [incompleteReason, setIncompleteReason] = useState('')
  const [hallucinationDetails, setHallucinationDetails] = useState('')
  const [suggestedSources, setSuggestedSources] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  // Toggle feedback type
  const toggleFeedbackType = (type: string) => {
    if (feedbackTypes.includes(type)) {
      setFeedbackTypes(feedbackTypes.filter(t => t !== type))
    } else {
      setFeedbackTypes([...feedbackTypes, type])
    }
  }

  // Submit feedback
  const handleSubmit = async () => {
    if (rating === 0) {
      alert('Veuillez donner une note (étoiles)')
      return
    }

    setSubmitting(true)

    const feedbackData: FeedbackData = {
      conversationId,
      messageId,
      question,
      answer,
      sourcesUsed,
      rating,
      feedbackType: feedbackTypes,
      missingInfo: missingInfo || undefined,
      incorrectCitation: incorrectCitation || undefined,
      incompleteReason: incompleteReason || undefined,
      hallucinationDetails: hallucinationDetails || undefined,
      suggestedSources: suggestedSources ? suggestedSources.split('\n').filter(s => s.trim()) : undefined,
      comment: comment || undefined,
      domain,
      ragConfidence,
      sourcesCount,
      responseTimeMs,
    }

    try {
      const response = await fetch('/api/rag/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      })

      if (response.ok) {
        setSubmitted(true)
        setTimeout(() => {
          onClose()
          resetForm()
        }, 2000)
      } else {
        alert('Erreur lors de l\'envoi du feedback')
      }
    } catch (error) {
      console.error('[FeedbackModal] Erreur:', error)
      alert('Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setRating(0)
    setFeedbackTypes([])
    setMissingInfo('')
    setIncorrectCitation('')
    setIncompleteReason('')
    setHallucinationDetails('')
    setSuggestedSources('')
    setComment('')
    setSubmitted(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-lg font-semibold">
            Évaluer cette réponse
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {submitted ? (
            // Success state
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-600" />
              <h4 className="mb-2 text-xl font-semibold text-green-600">
                Merci pour votre retour !
              </h4>
              <p className="text-gray-600 dark:text-gray-400">
                Votre feedback nous aide à améliorer la qualité des réponses juridiques.
              </p>
            </div>
          ) : (
            <>
              {/* Question preview */}
              <div className="mb-6 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Question :
                </p>
                <p className="mt-1 text-sm">
                  {question.substring(0, 200)}
                  {question.length > 200 ? '...' : ''}
                </p>
              </div>

              {/* Rating stars */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium">
                  Évaluation globale <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-8 w-8 ${
                          star <= (hoveredRating || rating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 self-center text-sm text-gray-600 dark:text-gray-400">
                      {rating === 1 && 'Très mauvais'}
                      {rating === 2 && 'Mauvais'}
                      {rating === 3 && 'Moyen'}
                      {rating === 4 && 'Bon'}
                      {rating === 5 && 'Excellent'}
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback types */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium">
                  Type(s) de problème (optionnel)
                </label>
                <div className="space-y-2">
                  <FeedbackTypeCheckbox
                    icon={<FileQuestion className="h-4 w-4" />}
                    label="Informations manquantes"
                    checked={feedbackTypes.includes('missing_info')}
                    onChange={() => toggleFeedbackType('missing_info')}
                  />
                  <FeedbackTypeCheckbox
                    icon={<FileX className="h-4 w-4" />}
                    label="Citation incorrecte"
                    checked={feedbackTypes.includes('incorrect_citation')}
                    onChange={() => toggleFeedbackType('incorrect_citation')}
                  />
                  <FeedbackTypeCheckbox
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="Réponse incomplète"
                    checked={feedbackTypes.includes('incomplete')}
                    onChange={() => toggleFeedbackType('incomplete')}
                  />
                  <FeedbackTypeCheckbox
                    icon={<AlertTriangle className="h-4 w-4" />}
                    label="Hallucination (citation inventée)"
                    checked={feedbackTypes.includes('hallucination')}
                    onChange={() => toggleFeedbackType('hallucination')}
                    variant="danger"
                  />
                </div>
              </div>

              {/* Conditional details */}
              {feedbackTypes.includes('missing_info') && (
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium">
                    Quelles informations manquent ?
                  </label>
                  <textarea
                    value={missingInfo}
                    onChange={e => setMissingInfo(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Ex: Jurisprudence récente, articles COC, etc."
                  />
                </div>
              )}

              {feedbackTypes.includes('incorrect_citation') && (
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium">
                    Quelle citation est incorrecte ?
                  </label>
                  <textarea
                    value={incorrectCitation}
                    onChange={e => setIncorrectCitation(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Ex: Arrêt n° 12345/2020 - Cour de Cassation"
                  />
                </div>
              )}

              {feedbackTypes.includes('hallucination') && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                  <label className="mb-1 block text-sm font-medium text-red-700 dark:text-red-400">
                    ⚠️ Détails hallucination (citation inventée)
                  </label>
                  <textarea
                    value={hallucinationDetails}
                    onChange={e => setHallucinationDetails(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-red-300 p-2 text-sm dark:border-red-600 dark:bg-gray-700"
                    placeholder="Ex: L'arrêt n° 99999/2025 cité n'existe pas"
                  />
                </div>
              )}

              {/* Suggested sources */}
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium">
                  Suggestions sources manquantes (optionnel)
                </label>
                <textarea
                  value={suggestedSources}
                  onChange={e => setSuggestedSources(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Une source par ligne :&#10;Arrêt Cassation n° 12345/2020&#10;Article 242 COC&#10;https://cassation.tn/arret/..."
                />
              </div>

              {/* Free comment */}
              <div className="mb-6">
                <label className="mb-1 block text-sm font-medium">
                  Commentaire libre (optionnel)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Tout autre commentaire pour améliorer la réponse..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || rating === 0}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Envoyer feedback
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANT AUXILIAIRE
// =============================================================================

function FeedbackTypeCheckbox({
  icon,
  label,
  checked,
  onChange,
  variant = 'default',
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: () => void
  variant?: 'default' | 'danger'
}) {
  const bgColor = variant === 'danger' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-900'
  const borderColor =
    variant === 'danger'
      ? checked
        ? 'border-red-500'
        : 'border-red-200 dark:border-red-800'
      : checked
        ? 'border-blue-500'
        : 'border-gray-200 dark:border-gray-700'

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${bgColor} ${borderColor} ${checked ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
      />
      <span className={variant === 'danger' ? 'text-red-600 dark:text-red-400' : ''}>
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}
