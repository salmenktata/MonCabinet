'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function LoginPage() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState<'error' | 'warning' | 'info'>('error')
  const [loading, setLoading] = useState(false)

  // Gérer les erreurs passées en paramètre URL
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'account_suspended') {
      setError('Votre compte a été suspendu. Contactez le support pour plus d\'informations.')
      setErrorType('error')
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (data.success) {
        // Récupérer le callbackUrl ou utiliser le dashboard par défaut
        const callbackUrl = searchParams.get('callbackUrl')
        const defaultUrl = data.user?.role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard'
        const redirectUrl = callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : defaultUrl

        window.location.href = redirectUrl
      } else {
        // Gérer les différents codes d'erreur
        if (data.errorCode === 'PENDING_APPROVAL') {
          // Rediriger vers la page d'attente
          window.location.href = '/pending-approval'
          return
        }

        if (data.errorCode === 'ACCOUNT_SUSPENDED') {
          setError('Votre compte a été suspendu. Contactez le support pour plus d\'informations.')
          setErrorType('error')
        } else if (data.errorCode === 'ACCOUNT_REJECTED') {
          setError('Votre demande d\'inscription a été refusée. Contactez le support si vous pensez qu\'il s\'agit d\'une erreur.')
          setErrorType('warning')
        } else {
          setError(data.error || 'Email ou mot de passe incorrect')
          setErrorType('error')
        }
        setLoading(false)
      }
    } catch {
      setError('Erreur de connexion au serveur')
      setErrorType('error')
      setLoading(false)
    }
  }

  const getErrorStyles = () => {
    switch (errorType) {
      case 'warning':
        return 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
      case 'info':
        return 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      default:
        return 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    }
  }

  return (
    <div className="rounded-lg border bg-card p-8 shadow-lg">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-blue-900">{tCommon('appName')}</h1>
        <p className="mt-2 text-muted-foreground">{t('loginTitle')}</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className={`rounded-md p-3 text-sm ${getErrorStyles()}`}>
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="votre@email.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            {t('password')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        <div className="flex items-center justify-end">
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
            Mot de passe oublié ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? `${tCommon('loading')}` : t('loginButton')}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
          {tCommon('register')}
        </Link>
      </div>
    </div>
  )
}
