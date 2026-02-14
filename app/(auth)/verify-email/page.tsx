'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const success = searchParams.get('success')

  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState('')

  const handleResend = async () => {
    const email = prompt('Entrez votre adresse email :')

    if (!email) return

    setResendLoading(true)
    setResendError('')

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setResendError(data.error || 'Erreur lors du renvoi')
        setResendLoading(false)
        return
      }

      setResendSuccess(true)
    } catch (error) {
      setResendError('Erreur lors du renvoi')
    } finally {
      setResendLoading(false)
    }
  }

  // Succès - Email vérifié
  if (success === 'verified') {
    return (
      <div className="rounded-lg border bg-card p-8 shadow-lg max-w-md mx-auto">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-foreground">Email vérifié !</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre adresse email a été vérifiée avec succès. Vous pouvez maintenant vous connecter.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Déjà vérifié
  if (success === 'already_verified') {
    return (
      <div className="rounded-lg border bg-card p-8 shadow-lg max-w-md mx-auto">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-foreground">Email déjà vérifié</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre adresse email est déjà vérifiée. Vous pouvez vous connecter.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Erreurs
  let errorMessage = ''
  let showResend = false

  if (error === 'missing_token') {
    errorMessage = 'Lien de vérification invalide. Le token est manquant.'
    showResend = true
  } else if (error === 'invalid_token') {
    errorMessage = 'Lien de vérification invalide ou expiré.'
    showResend = true
  } else if (error === 'token_expired') {
    errorMessage = 'Ce lien de vérification a expiré.'
    showResend = true
  } else if (error === 'server_error') {
    errorMessage = 'Une erreur serveur est survenue. Veuillez réessayer.'
    showResend = true
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-8 shadow-lg max-w-md mx-auto">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-foreground">Erreur de vérification</h3>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>

          {resendSuccess && (
            <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
              Email de vérification renvoyé avec succès !
            </div>
          )}

          {resendError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {resendError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {showResend && !resendSuccess && (
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {resendLoading ? 'Envoi...' : 'Renvoyer l\'email de vérification'}
              </button>
            )}
            <div>
              <Link
                href="/login"
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                ← Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Page par défaut (pas de paramètres)
  return (
    <div className="rounded-lg border bg-card p-8 shadow-lg max-w-md mx-auto">
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground">Vérification email</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Veuillez cliquer sur le lien envoyé à votre adresse email pour vérifier votre compte.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  )
}
