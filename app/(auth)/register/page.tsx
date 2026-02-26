'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

interface PasswordStrength {
  score: number
  label: 'weak' | 'fair' | 'good' | 'strong'
  color: string
  width: string
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 2) {
    return { score, label: 'weak', color: 'password-strength-weak', width: '25%' }
  } else if (score <= 3) {
    return { score, label: 'fair', color: 'password-strength-fair', width: '50%' }
  } else if (score <= 4) {
    return { score, label: 'good', color: 'password-strength-good', width: '75%' }
  } else {
    return { score, label: 'strong', color: 'password-strength-strong', width: '100%' }
  }
}

interface PasswordCriteria {
  minLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

function getPasswordCriteria(password: string): PasswordCriteria {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^a-zA-Z0-9]/.test(password),
  }
}

export default function RegisterPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  })

  // Token d'invitation beta (phase 2) + code parrainage (phase 3) depuis l'URL
  const invitationToken = searchParams.get('invite') || ''
  const isInvited = !!invitationToken

  // Pré-remplir le formulaire avec les paramètres URL
  useEffect(() => {
    const nom = searchParams.get('nom')
    const prenom = searchParams.get('prenom')
    const email = searchParams.get('email')
    const password = searchParams.get('password')
    const confirmPassword = searchParams.get('confirmPassword')
    const ref = searchParams.get('ref') // code parrainage

    if (nom || prenom || email || password || confirmPassword || ref) {
      setFormData(prev => ({
        ...prev,
        ...(nom && { nom }),
        ...(prenom && { prenom }),
        ...(email && { email }),
        ...(password && { password }),
        ...(confirmPassword && { confirmPassword }),
        ...(ref && { referralCode: ref.toUpperCase() }),
      }))
    }
  }, [searchParams])
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const passwordStrength = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password]
  )

  const passwordCriteria = useMemo(
    () => getPasswordCriteria(formData.password),
    [formData.password]
  )

  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleBlur = (field: string) => {
    setTouched({ ...touched, [field]: true })
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    if (formData.password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }

    if (!formData.nom) {
      setError(t('validation.nameRequired'))
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          ...(invitationToken && { invitationToken }),
          ...(formData.referralCode && { referralCode: formData.referralCode }),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.details) {
          const errorMessages = data.details.map((d: { message: string }) => d.message).join(', ')
          setError(errorMessages)
        } else {
          setError(data.error || t('registerError'))
        }
        setLoading(false)
        return
      }

      // Si invitation valide → accès direct au dashboard (trial déjà actif)
      // Sinon → page d'attente d'approbation
      const redirectUrl = data.isInvited
        ? '/dashboard'
        : data.emailSent === false
          ? '/pending-approval?emailFailed=true'
          : '/pending-approval'
      router.push(redirectUrl)
    } catch {
      setError(t('registerError'))
      setLoading(false)
    }
  }

  const CriteriaItem = ({ met, label }: { met: boolean; label: string }) => (
    <div className={`flex items-center gap-2 text-xs transition-colors ${met ? 'text-emerald-400' : 'text-muted-foreground'}`}>
      {met ? (
        <CheckIcon className="w-3.5 h-3.5" />
      ) : (
        <XIcon className="w-3.5 h-3.5" />
      )}
      <span>{label}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          {t('createAccount')}
        </h1>
        {isInvited ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400">
            Invitation valide — Votre accès gratuit sera activé immédiatement.
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('registerSubtitle')}
          </p>
        )}
      </div>

      {/* Formulaire */}
      <form onSubmit={handleRegister} className="space-y-4">
        {/* Message d'erreur */}
        {error && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Nom et Prénom */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="nom" className="block text-sm font-medium text-foreground">
              {t('lastName')} *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                id="nom"
                name="nom"
                type="text"
                value={formData.nom}
                onChange={handleChange}
                onBlur={() => handleBlur('nom')}
                required
                className={`input-premium w-full pl-9 pr-3 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                  touched.nom && formData.nom ? 'border-emerald-500/50' : ''
                }`}
                placeholder={t('lastNamePlaceholder')}
              />
              {touched.nom && formData.nom && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                  <CheckIcon className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prenom" className="block text-sm font-medium text-foreground">
              {t('firstName')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                id="prenom"
                name="prenom"
                type="text"
                value={formData.prenom}
                onChange={handleChange}
                onBlur={() => handleBlur('prenom')}
                className={`input-premium w-full pl-9 pr-3 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                  touched.prenom && formData.prenom ? 'border-emerald-500/50' : ''
                }`}
                placeholder={t('firstNamePlaceholder')}
              />
              {touched.prenom && formData.prenom && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                  <CheckIcon className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            {t('email')} *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MailIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur('email')}
              required
              className={`input-premium w-full pl-9 pr-3 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                touched.email && formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ? 'border-emerald-500/50' : ''
              }`}
              placeholder={t('emailPlaceholder')}
            />
            {touched.email && formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && (
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                <CheckIcon className="w-4 h-4 text-emerald-400" />
              </div>
            )}
          </div>
        </div>

        {/* Mot de passe */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            {t('password')} *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LockIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              onBlur={() => handleBlur('password')}
              required
              className="input-premium w-full pl-9 pr-10 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder={t('passwordPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          {/* Indicateur de force du mot de passe */}
          {formData.password && (
            <div className="space-y-2 mt-2 animate-fade-in">
              {/* Barre de progression */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full password-strength-bar ${passwordStrength.color} transition-all duration-300`}
                    style={{ width: passwordStrength.width }}
                  />
                </div>
                <span className={`text-xs font-medium ${
                  passwordStrength.label === 'weak' ? 'text-red-400' :
                  passwordStrength.label === 'fair' ? 'text-amber-400' :
                  passwordStrength.label === 'good' ? 'text-emerald-400' :
                  'text-emerald-400'
                }`}>
                  {t(`passwordStrength.${passwordStrength.label}`)}
                </span>
              </div>

              {/* Critères */}
              <div className="grid grid-cols-2 gap-1">
                <CriteriaItem met={passwordCriteria.minLength} label={t('validation.minLength')} />
                <CriteriaItem met={passwordCriteria.hasUppercase} label={t('validation.hasUppercase')} />
                <CriteriaItem met={passwordCriteria.hasLowercase} label={t('validation.hasLowercase')} />
                <CriteriaItem met={passwordCriteria.hasNumber} label={t('validation.hasNumber')} />
                <CriteriaItem met={passwordCriteria.hasSpecial} label={t('validation.hasSpecial')} />
              </div>
            </div>
          )}
        </div>

        {/* Confirmer mot de passe */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
            {t('confirmPassword')} *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LockIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleChange}
              onBlur={() => handleBlur('confirmPassword')}
              required
              className={`input-premium w-full pl-9 pr-10 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                touched.confirmPassword && formData.confirmPassword
                  ? passwordsMatch
                    ? 'border-emerald-500/50'
                    : 'border-red-500/50'
                  : ''
              }`}
              placeholder={t('passwordPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirmPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          {touched.confirmPassword && formData.confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-400 mt-1 animate-fade-in">{t('passwordMismatch')}</p>
          )}
          {touched.confirmPassword && passwordsMatch && (
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 animate-fade-in">
              <CheckIcon className="w-3 h-3" />
              <span>Les mots de passe correspondent</span>
            </p>
          )}
        </div>

        {/* Code de parrainage (optionnel) — Phase 3 */}
        {!isInvited && (
          <div className="space-y-1.5">
            <label htmlFor="referralCode" className="block text-sm font-medium text-foreground">
              Code de parrainage <span className="text-muted-foreground font-normal">(optionnel)</span>
            </label>
            <input
              id="referralCode"
              name="referralCode"
              type="text"
              value={formData.referralCode}
              onChange={handleChange}
              maxLength={20}
              className="input-premium w-full px-3 py-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none uppercase"
              placeholder="ABCD1234"
            />
            {formData.referralCode && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckIcon className="w-3 h-3" />
                Votre parrain recevra 1 mois offert si vous souscrivez
              </p>
            )}
          </div>
        )}

        {/* Bouton d'inscription */}
        <button
          type="submit"
          disabled={loading}
          className="btn-premium w-full py-3 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
        >
          {loading ? (
            <>
              <LoadingSpinner />
              <span>{t('registering')}</span>
            </>
          ) : (
            t('registerButton')
          )}
        </button>
      </form>

      {/* Lien connexion */}
      <div className="text-center text-sm text-muted-foreground">
        {t('alreadyHaveAccount')}{' '}
        <Link
          href="/login"
          className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
        >
          {t('loginButton')}
        </Link>
      </div>
    </div>
  )
}
