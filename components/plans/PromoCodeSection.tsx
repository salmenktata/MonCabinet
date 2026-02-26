'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import { PromoCodeInput } from './PromoCodeInput'

export function PromoCodeSection() {
  const t = useTranslations('plans')
  const [promoCode, setPromoCode] = useState<string | null>(null)
  const [discountedPrice, setDiscountedPrice] = useState<number | null>(null)
  const [activePlan, setActivePlan] = useState<'pro' | 'expert'>('pro')

  function handlePromoApplied(code: string | null, price: number | null) {
    setPromoCode(code)
    setDiscountedPrice(price)
    if (code) {
      localStorage.setItem('qadhya_promo_code', JSON.stringify({ code, plan: activePlan }))
    } else {
      localStorage.removeItem('qadhya_promo_code')
    }
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700 max-w-lg mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.tag className="h-4 w-4 text-slate-400" />
          <CardTitle className="text-white text-base">{t('promoTitle')}</CardTitle>
        </div>
        <CardDescription className="text-slate-400">
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setActivePlan('pro'); handlePromoApplied(null, null) }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activePlan === 'pro'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'text-slate-400 border-slate-600 hover:border-slate-500'
              }`}
            >
              {t('proForPlan')}
            </button>
            <button
              onClick={() => { setActivePlan('expert'); handlePromoApplied(null, null) }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activePlan === 'expert'
                  ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                  : 'text-slate-400 border-slate-600 hover:border-slate-500'
              }`}
            >
              {t('expertForPlan')}
            </button>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PromoCodeInput plan={activePlan} onPromoApplied={handlePromoApplied} />
        {promoCode && discountedPrice !== null && (
          <p className="text-xs text-slate-400 mt-3">
            {t('promoAppliedNote', { code: promoCode! })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
