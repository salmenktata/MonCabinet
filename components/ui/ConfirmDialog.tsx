'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui')
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    setIsOpen(true)

    return new Promise((resolve) => {
      setResolver(() => resolve)
    })
  }

  const handleConfirm = () => {
    resolver?.(true)
    setIsOpen(false)
  }

  const handleCancel = () => {
    resolver?.(false)
    setIsOpen(false)
  }

  const typeStyles = {
    danger: {
      bg: 'bg-red-600 hover:bg-red-700',
      icon: (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      ),
    },
    warning: {
      bg: 'bg-yellow-600 hover:bg-yellow-700',
      icon: (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
          <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      ),
    },
    info: {
      bg: 'bg-blue-600 hover:bg-blue-700',
      icon: (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      ),
    },
  }

  const type = options?.type || 'info'
  const style = typeStyles[type]

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {isOpen && options && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleCancel}
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-md transform rounded-lg bg-white p-6 shadow-xl transition-all">
              {style.icon}

              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-gray-900">{options.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{options.message}</p>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {options.cancelText || t('cancel')}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${style.bg}`}
                >
                  {options.confirmText || t('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider')
  }
  return context
}
