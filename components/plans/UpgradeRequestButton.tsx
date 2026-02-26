'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

type Plan = 'solo' | 'cabinet'

interface UpgradeRequestButtonProps {
  plan: Plan
  highlighted?: boolean
  alreadyRequested?: boolean
}

export function UpgradeRequestButton({ plan, highlighted, alreadyRequested }: UpgradeRequestButtonProps) {
  const t = useTranslations('plans')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(alreadyRequested ?? false)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)

  const planLabel = plan === 'solo' ? 'Pro' : 'Expert'

  async function handleRequest() {
    setLoading(true)
    try {
      // Lire le code promo éventuellement saisi dans PromoCodeSection
      let promoCode: string | undefined
      try {
        const stored = localStorage.getItem('qadhya_promo_code')
        if (stored) {
          const parsed = JSON.parse(stored)
          const planForPromo = plan === 'solo' ? 'pro' : 'expert'
          if (parsed?.plan === planForPromo) promoCode = parsed.code
        }
      } catch { /* ignore */ }

      const res = await fetch('/api/user/request-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, note: note || undefined, promoCode }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || t('requestError'))
        return
      }
      setDone(true)
      localStorage.removeItem('qadhya_promo_code')
      toast.success(t('requestSuccess'))
    } catch {
      toast.error(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="w-full text-center py-3 px-6 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
        ✅ {t('requestSent')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('messageOptional')}
          className="w-full rounded-lg bg-slate-700/50 border border-slate-600 text-slate-200 placeholder:text-slate-500 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={handleRequest}
          disabled={loading}
          className={`flex-1 text-center py-3 px-6 rounded-xl font-semibold transition-all disabled:opacity-60 ${
            highlighted
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
          }`}
        >
          {loading ? t('sending') : t('requestPlan', { plan: planLabel })}
        </button>

        {!showNote && (
          <button
            onClick={() => setShowNote(true)}
            title={t('addMessage')}
            className="px-3 py-2 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors text-lg"
          >
            ✏️
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 text-center">
        {t('contactDelay')}
      </p>
    </div>
  )
}
