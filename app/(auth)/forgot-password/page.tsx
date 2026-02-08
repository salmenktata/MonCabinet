'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function LockKeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  )
}

function EnvelopeAnimatedIcon() {
  return (
    <div className="relative w-20 h-20 mx-auto">
      {/* Enveloppe principale */}
      <svg
        className="w-full h-full text-blue-500 animate-float"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
        />
      </svg>
      {/* Checkmark animé */}
      <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center animate-scale-in">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
  )
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const startCooldown = useCallback(() => {
    setResendCooldown(60)
  }, [])

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!email) {
      setError(t('validation.emailRequired'))
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Une erreur est survenue')
        setLoading(false)
        return
      }

      setSuccess(true)
      startCooldown()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    await handleSubmit({ preventDefault: () => {} } as React.FormEvent)
  }

  return (
    <div className="space-y-6">
      {success ? (
        /* État de succès */
        <div className="text-center space-y-6 animate-fade-in">
          <EnvelopeAnimatedIcon />

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              {t('emailSent')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('emailSentMessage')}
            </p>
          </div>

          <div className="glass rounded-lg p-4 text-sm text-muted-foreground">
            <p>{t('checkSpam')}</p>
          </div>

          {/* Bouton de renvoi */}
          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                resendCooldown > 0
                  ? 'bg-slate-700/50 text-muted-foreground cursor-not-allowed'
                  : 'bg-slate-700 hover:bg-slate-600 text-foreground'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  {t('sendingResetLink')}
                </span>
              ) : resendCooldown > 0 ? (
                `Renvoyer dans ${resendCooldown}s`
              ) : (
                'Renvoyer l\'email'
              )}
            </button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              {t('backToLogin')}
            </Link>
          </div>
        </div>
      ) : (
        /* Formulaire */
        <>
          {/* Header avec illustration */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl flex items-center justify-center">
              <LockKeyIcon className="w-8 h-8 text-blue-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {t('forgotPasswordTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('forgotPasswordSubtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Message d'erreur */}
            {error && (
              <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm animate-fade-in">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                {t('email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MailIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-premium w-full pl-10 pr-4 py-2.5 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none"
                  placeholder={t('emailPlaceholder')}
                />
              </div>
            </div>

            {/* Bouton d'envoi */}
            <button
              type="submit"
              disabled={loading}
              className="btn-premium w-full py-3 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  <span>{t('sendingResetLink')}</span>
                </>
              ) : (
                t('sendResetLink')
              )}
            </button>

            {/* Lien retour */}
            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                {t('backToLogin')}
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
