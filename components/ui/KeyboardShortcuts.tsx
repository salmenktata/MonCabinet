'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface Shortcut {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  description: string
  action: () => void
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()

        if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
          event.preventDefault()
          shortcut.action()
        }
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}

export function GlobalKeyboardShortcuts() {
  const router = useRouter()
  const t = useTranslations('shortcuts')
  const [showHelp, setShowHelp] = useState(false)

  const shortcuts: Shortcut[] = [
    {
      key: 'k',
      ctrl: true,
      description: t('globalSearch'),
      action: () => {
        // TODO: Ouvrir une modale de recherche
        console.log('Recherche globale')
      },
    },
    {
      key: 'h',
      ctrl: true,
      description: t('backToDashboard'),
      action: () => router.push('/dashboard'),
    },
    {
      key: 'c',
      ctrl: true,
      alt: true,
      description: t('newClient'),
      action: () => router.push('/clients/new'),
    },
    {
      key: 'd',
      ctrl: true,
      alt: true,
      description: t('newDossier'),
      action: () => router.push('/dossiers/new'),
    },
    {
      key: 'f',
      ctrl: true,
      alt: true,
      description: t('newInvoice'),
      action: () => router.push('/factures/new'),
    },
    {
      key: '?',
      shift: true,
      description: t('showShortcuts'),
      action: () => setShowHelp(true),
    },
  ]

  useKeyboardShortcuts(shortcuts)

  // Fermer avec Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showHelp])

  return (
    <>
      {/* Bouton d'aide visible */}
      <button
        onClick={() => setShowHelp(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full bg-gray-800 p-3 text-white shadow-lg hover:bg-gray-700 transition-colors"
        title={t('title') + ' (Shift + ?)'}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Modale d'aide */}
      {showHelp && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={() => setShowHelp(false)}
            />

            <div className="relative z-10 w-full max-w-2xl transform rounded-lg bg-white p-6 shadow-xl transition-all">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.ctrl && (
                        <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 border border-gray-300">
                          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                        </kbd>
                      )}
                      {shortcut.alt && (
                        <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 border border-gray-300">
                          Alt
                        </kbd>
                      )}
                      {shortcut.shift && (
                        <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 border border-gray-300">
                          Shift
                        </kbd>
                      )}
                      <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 border border-gray-300">
                        {shortcut.key.toUpperCase()}
                      </kbd>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  {t('tip')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
