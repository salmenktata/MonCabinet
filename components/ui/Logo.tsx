'use client'

import { cn } from '@/lib/utils'

export type LogoVariant = 'juridique' | 'fiscal' | 'notarial'
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

interface LogoProps {
  variant?: LogoVariant
  size?: LogoSize
  showTag?: boolean
  showText?: boolean
  animate?: boolean
  className?: string
}

const variantConfig: Record<LogoVariant, { label: string; color: string }> = {
  juridique: { label: 'Juridique', color: 'from-amber-400 to-amber-600' },
  fiscal: { label: 'Fiscal', color: 'from-emerald-400 to-emerald-600' },
  notarial: { label: 'Notarial', color: 'from-purple-400 to-purple-600' },
}

const sizeConfig: Record<LogoSize, { icon: number; text: string; tag: string; gap: string }> = {
  sm: { icon: 32, text: 'text-lg', tag: 'text-[10px] px-2 py-0.5', gap: 'gap-1' },
  md: { icon: 40, text: 'text-xl', tag: 'text-xs px-2.5 py-0.5', gap: 'gap-1.5' },
  lg: { icon: 56, text: 'text-2xl', tag: 'text-sm px-3 py-1', gap: 'gap-2' },
  xl: { icon: 72, text: 'text-3xl', tag: 'text-base px-4 py-1.5', gap: 'gap-3' },
}

export function Logo({
  variant = 'juridique',
  size = 'md',
  showTag = true,
  showText = true,
  animate = true,
  className,
}: LogoProps) {
  const { label, color } = variantConfig[variant]
  const { icon, text, tag, gap } = sizeConfig[size]

  return (
    <div className={cn('flex flex-col items-center', gap, className)}>
      {/* Logo Icon: Bouclier avec Balance */}
      <div
        className={cn(
          'relative transition-all duration-300',
          animate && 'hover:scale-105 group'
        )}
        style={{ width: icon, height: icon }}
      >
        {/* Glow effect */}
        {animate && (
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
            style={{
              background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)',
            }}
          />
        )}

        {/* SVG Logo */}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            'w-full h-full relative z-10 drop-shadow-lg',
            animate && 'transition-transform duration-300'
          )}
        >
          {/* Defs for gradients */}
          <defs>
            {/* Bouclier gradient */}
            <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>

            {/* Bordure dorée */}
            <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>

            {/* Balance gradient */}
            <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="100%" stopColor="#fcd34d" />
            </linearGradient>

            {/* Inner shadow */}
            <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset in="blur" dx="1" dy="2" result="offsetBlur" />
              <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
            </filter>
          </defs>

          {/* Bouclier - forme principale */}
          <path
            d="M32 4C32 4 8 12 8 24C8 36 8 44 32 60C56 44 56 36 56 24C56 12 32 4 32 4Z"
            fill="url(#shieldGradient)"
            stroke="url(#borderGradient)"
            strokeWidth="2.5"
            filter="url(#innerShadow)"
          />

          {/* Highlight intérieur */}
          <path
            d="M32 8C32 8 12 15 12 25C12 35 12 42 32 56"
            fill="none"
            stroke="rgba(254, 243, 199, 0.3)"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* Balance de justice */}
          <g className="origin-center">
            {/* Pilier central */}
            <rect
              x="30"
              y="18"
              width="4"
              height="26"
              rx="1"
              fill="url(#balanceGradient)"
            />

            {/* Base du pilier */}
            <rect
              x="26"
              y="42"
              width="12"
              height="3"
              rx="1.5"
              fill="url(#balanceGradient)"
            />

            {/* Barre horizontale */}
            <rect
              x="14"
              y="20"
              width="36"
              height="3"
              rx="1.5"
              fill="url(#balanceGradient)"
            />

            {/* Plateau gauche */}
            <path
              d="M14 22L18 32H10L14 22Z"
              fill="none"
              stroke="url(#balanceGradient)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <ellipse
              cx="14"
              cy="32"
              rx="5"
              ry="2"
              fill="url(#balanceGradient)"
            />

            {/* Plateau droit */}
            <path
              d="M50 22L54 32H46L50 22Z"
              fill="none"
              stroke="url(#balanceGradient)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <ellipse
              cx="50"
              cy="32"
              rx="5"
              ry="2"
              fill="url(#balanceGradient)"
            />

            {/* Chaînes stylisées */}
            <line x1="14" y1="22" x2="14" y2="30" stroke="url(#balanceGradient)" strokeWidth="1" />
            <line x1="50" y1="22" x2="50" y2="30" stroke="url(#balanceGradient)" strokeWidth="1" />
          </g>

          {/* Étoile décorative au sommet */}
          <circle cx="32" cy="13" r="2" fill="#fef3c7" />
        </svg>
      </div>

      {/* Texte du logo */}
      {showText && (
        <span
          className={cn(
            'font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent',
            'dark:from-slate-100 dark:to-slate-300',
            'light:from-slate-800 light:to-slate-600',
            text
          )}
        >
          Qadhya
        </span>
      )}

      {/* Tag de variante */}
      {showTag && (
        <div
          className={cn(
            'flex items-center gap-1.5',
            tag
          )}
        >
          <span className="w-6 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <span
            className={cn(
              'font-medium tracking-widest uppercase',
              'bg-gradient-to-r bg-clip-text text-transparent',
              color
            )}
          >
            {label}
          </span>
          <span className="w-6 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        </div>
      )}
    </div>
  )
}

export function LogoIcon({
  size = 'md',
  animate = true,
  className,
}: Pick<LogoProps, 'size' | 'animate' | 'className'>) {
  return (
    <Logo
      size={size}
      animate={animate}
      showTag={false}
      showText={false}
      className={className}
    />
  )
}

export function LogoHorizontal({
  variant = 'juridique',
  size = 'md',
  showTag = true,
  animate = true,
  className,
}: Omit<LogoProps, 'showText'>) {
  const { label, color } = variantConfig[variant]
  const { icon, text, tag } = sizeConfig[size]
  const iconSize = Math.round(icon * 0.8)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Logo Icon */}
      <div
        className={cn(
          'relative transition-all duration-300 flex-shrink-0',
          animate && 'hover:scale-105 group'
        )}
        style={{ width: iconSize, height: iconSize }}
      >
        {animate && (
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
            style={{
              background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)',
            }}
          />
        )}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 drop-shadow-lg"
        >
          <defs>
            <linearGradient id="shieldGradientH" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="borderGradientH" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="balanceGradientH" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="100%" stopColor="#fcd34d" />
            </linearGradient>
          </defs>
          <path
            d="M32 4C32 4 8 12 8 24C8 36 8 44 32 60C56 44 56 36 56 24C56 12 32 4 32 4Z"
            fill="url(#shieldGradientH)"
            stroke="url(#borderGradientH)"
            strokeWidth="2.5"
          />
          <g>
            <rect x="30" y="18" width="4" height="26" rx="1" fill="url(#balanceGradientH)" />
            <rect x="26" y="42" width="12" height="3" rx="1.5" fill="url(#balanceGradientH)" />
            <rect x="14" y="20" width="36" height="3" rx="1.5" fill="url(#balanceGradientH)" />
            <ellipse cx="14" cy="32" rx="5" ry="2" fill="url(#balanceGradientH)" />
            <ellipse cx="50" cy="32" rx="5" ry="2" fill="url(#balanceGradientH)" />
            <line x1="14" y1="22" x2="14" y2="30" stroke="url(#balanceGradientH)" strokeWidth="1" />
            <line x1="50" y1="22" x2="50" y2="30" stroke="url(#balanceGradientH)" strokeWidth="1" />
          </g>
          <circle cx="32" cy="13" r="2" fill="#fef3c7" />
        </svg>
      </div>

      {/* Texte et tag */}
      <div className="flex flex-col">
        <span
          className={cn(
            'font-bold tracking-tight text-foreground',
            text
          )}
        >
          Qadhya
        </span>
        {showTag && (
          <span
            className={cn(
              'font-medium tracking-widest uppercase',
              'bg-gradient-to-r bg-clip-text text-transparent',
              color,
              tag,
              'px-0'
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
