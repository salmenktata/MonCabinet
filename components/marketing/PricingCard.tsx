'use client'

import Link from 'next/link'

interface PricingCardProps {
  name: string
  description: string
  price: string
  currency: string
  perMonth: string
  features: string[]
  cta: string
  ctaHref: string
  popular?: boolean
  free?: boolean
}

export function PricingCard({ name, description, price, currency, perMonth, features, cta, ctaHref, popular, free }: PricingCardProps) {
  return (
    <div className={`relative glass-card rounded-2xl p-8 flex flex-col ${popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}>
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
          {name === 'Pro' ? '⭐' : ''} Le plus populaire
        </div>
      )}
      <h3 className="text-xl font-bold text-white">{name}</h3>
      <p className="text-sm text-slate-400 mt-1 mb-6">{description}</p>

      <div className="mb-6">
        {free ? (
          <div className="text-4xl font-bold text-white">{price}</div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white">{price}</span>
            <span className="text-lg text-slate-400">{currency}</span>
            <span className="text-slate-400">{perMonth}</span>
          </div>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`text-center py-3 px-6 rounded-xl font-semibold transition-all ${
          popular
            ? 'btn-premium text-white'
            : 'glass border border-white/20 text-white hover:bg-white/10'
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}
