'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface PromoResult {
  valid: boolean
  code?: string
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  originalPrice?: number
  discountedPrice?: number
  savings?: number
  error?: string
}

interface PromoCodeInputProps {
  plan: 'pro' | 'expert'
  onPromoApplied: (code: string | null, discountedPrice: number | null) => void
}

export function PromoCodeInput({ plan, onPromoApplied }: PromoCodeInputProps) {
  const t = useTranslations('plans')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PromoResult | null>(null)

  async function handleValidate() {
    if (!code.trim()) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch(`/api/user/validate-promo?code=${encodeURIComponent(code.trim())}&plan=${plan}`)
      const data: PromoResult = await res.json()
      setResult(data)

      if (data.valid && data.code && data.discountedPrice !== undefined) {
        onPromoApplied(data.code, data.discountedPrice)
      }
    } catch {
      setResult({ valid: false, error: t('validationError') })
    } finally {
      setLoading(false)
    }
  }

  function handleRemove() {
    setCode('')
    setResult(null)
    onPromoApplied(null, null)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder={t('promoPlaceholder')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
          disabled={result?.valid}
          className="font-mono uppercase"
          maxLength={30}
        />
        {result?.valid ? (
          <Button variant="outline" size="sm" onClick={handleRemove} className="shrink-0">
            <Icons.x className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={loading || !code.trim()}
            className="shrink-0"
          >
            {loading ? <Icons.spinner className="h-4 w-4 animate-spin" /> : t('validate')}
          </Button>
        )}
      </div>

      {result && (
        <div className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
          result.valid
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {result.valid ? (
            <>
              <Icons.check className="h-4 w-4 shrink-0" />
              <span>
                Code <strong>{result.code}</strong> appliqué —{' '}
                {result.discount_type === 'percent'
                  ? `-${result.discount_value}%`
                  : `-${result.discount_value} DT`}{' '}
                (économie : <strong>{result.savings} DT</strong>)
              </span>
            </>
          ) : (
            <>
              <Icons.x className="h-4 w-4 shrink-0" />
              <span>{result.error}</span>
            </>
          )}
        </div>
      )}

      {result?.valid && result.discountedPrice !== undefined && result.originalPrice !== undefined && (
        <div className="flex items-center gap-3 text-sm">
          <span className="line-through text-muted-foreground">{result.originalPrice} DT/mois</span>
          <span className="text-xl font-bold text-emerald-400">{result.discountedPrice} DT/mois</span>
        </div>
      )}
    </div>
  )
}
