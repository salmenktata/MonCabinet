'use client'

import { useTranslations } from 'next-intl'

export default function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizes[size]} animate-spin rounded-full border-4 border-gray-200 border-t-blue-600`}
      />
    </div>
  )
}

export function LoadingOverlay({ message }: { message?: string }) {
  const t = useTranslations('common')
  const displayMessage = message || t('loading')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="rounded-lg bg-white p-6 shadow-xl">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-center text-sm font-medium text-gray-700">{displayMessage}</p>
      </div>
    </div>
  )
}

export function LoadingPage() {
  const t = useTranslations('common')

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-gray-600">{t('loading')}</p>
      </div>
    </div>
  )
}

export function SavingIndicator({ isSaving }: { isSaving: boolean }) {
  const t = useTranslations('common')

  if (!isSaving) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg">
      <LoadingSpinner size="sm" />
      <span className="text-sm font-medium">{t('saving')}</span>
    </div>
  )
}
