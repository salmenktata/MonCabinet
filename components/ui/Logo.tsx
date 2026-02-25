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

        {/* SVG Logo — bouclier amber + balance marine réseau */}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            'w-full h-full relative z-10 drop-shadow-lg',
            animate && 'transition-transform duration-300'
          )}
        >
          {/* Bouclier amber plat */}
          <path
            d="M32 3C32 3 7 11 7 24C7 37 7 45 32 61C57 45 57 37 57 24C57 11 32 3 32 3Z"
            fill="#E8951A"
          />
          {/* Ombre portée droite (flat shadow) */}
          <path
            d="M32 3C32 3 57 11 57 24C57 37 57 45 32 61L32 3Z"
            fill="#C47A10"
            opacity="0.4"
          />
          {/* Bordure interne */}
          <path
            d="M32 6C32 6 10 13 10 24C10 36 10 44 32 59C54 44 54 36 54 24C54 13 32 6 32 6Z"
            fill="none"
            stroke="#C47A10"
            strokeWidth="1"
            opacity="0.6"
          />

          {/* Balance marine avec nœuds réseau */}
          <g fill="#1E3464" stroke="#1E3464">
            {/* Diamant au sommet */}
            <path d="M32 11 L30 14.5 L32 16.5 L34 14.5 Z" />

            {/* Pilier central vertical */}
            <rect x="31" y="16" width="2" height="26" rx="1" />

            {/* Nœud central haut */}
            <circle cx="32" cy="20" r="2" />

            {/* Bras gauche haut (vers nœud ext gauche) */}
            <line x1="32" y1="20" x2="19" y2="20" strokeWidth="1.8" />
            {/* Bras droit haut (vers nœud ext droit) */}
            <line x1="32" y1="20" x2="45" y2="20" strokeWidth="1.8" />

            {/* Nœud extérieur gauche */}
            <circle cx="19" cy="20" r="2" />
            {/* Nœud extérieur droit */}
            <circle cx="45" cy="20" r="2" />

            {/* Diagonale gauche (nœud ext → nœud mid) */}
            <line x1="19" y1="20" x2="24" y2="26" strokeWidth="1.8" />
            {/* Diagonale droite (nœud ext → nœud mid) */}
            <line x1="45" y1="20" x2="40" y2="26" strokeWidth="1.8" />

            {/* Nœud milieu gauche */}
            <circle cx="24" cy="26" r="2" />
            {/* Nœud milieu droit */}
            <circle cx="40" cy="26" r="2" />

            {/* Converge vers nœud central bas */}
            <line x1="24" y1="26" x2="32" y2="30" strokeWidth="1.8" />
            <line x1="40" y1="26" x2="32" y2="30" strokeWidth="1.8" />

            {/* Nœud central bas */}
            <circle cx="32" cy="30" r="2.5" />

            {/* Chaînes vers plateaux */}
            <line x1="19" y1="22" x2="19" y2="31" strokeWidth="1.5" />
            <line x1="45" y1="22" x2="45" y2="31" strokeWidth="1.5" />

            {/* Plateau gauche */}
            <path d="M13 31 L25 31 L23 37 L15 37 Z" />
            {/* Plateau droit */}
            <path d="M39 31 L51 31 L49 37 L41 37 Z" />

            {/* Base du pilier — socle */}
            <rect x="29" y="42" width="6" height="2" rx="1" />
            <rect x="27" y="43.5" width="10" height="2" rx="1" />
            <rect x="24" y="45" width="16" height="3" rx="1.5" />
          </g>
        </svg>
      </div>

      {/* Texte du logo */}
      {showText && (
        <span
          className={cn(
            'font-bold tracking-tight bg-gradient-to-r from-slate-700 to-slate-900 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent',
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
          <path d="M32 3C32 3 7 11 7 24C7 37 7 45 32 61C57 45 57 37 57 24C57 11 32 3 32 3Z" fill="#E8951A" />
          <path d="M32 3C32 3 57 11 57 24C57 37 57 45 32 61L32 3Z" fill="#C47A10" opacity="0.4" />
          <path d="M32 6C32 6 10 13 10 24C10 36 10 44 32 59C54 44 54 36 54 24C54 13 32 6 32 6Z" fill="none" stroke="#C47A10" strokeWidth="1" opacity="0.6" />
          <g fill="#1E3464" stroke="#1E3464">
            <path d="M32 11 L30 14.5 L32 16.5 L34 14.5 Z" />
            <rect x="31" y="16" width="2" height="26" rx="1" />
            <circle cx="32" cy="20" r="2" />
            <line x1="32" y1="20" x2="19" y2="20" strokeWidth="1.8" />
            <line x1="32" y1="20" x2="45" y2="20" strokeWidth="1.8" />
            <circle cx="19" cy="20" r="2" />
            <circle cx="45" cy="20" r="2" />
            <line x1="19" y1="20" x2="24" y2="26" strokeWidth="1.8" />
            <line x1="45" y1="20" x2="40" y2="26" strokeWidth="1.8" />
            <circle cx="24" cy="26" r="2" />
            <circle cx="40" cy="26" r="2" />
            <line x1="24" y1="26" x2="32" y2="30" strokeWidth="1.8" />
            <line x1="40" y1="26" x2="32" y2="30" strokeWidth="1.8" />
            <circle cx="32" cy="30" r="2.5" />
            <line x1="19" y1="22" x2="19" y2="31" strokeWidth="1.5" />
            <line x1="45" y1="22" x2="45" y2="31" strokeWidth="1.5" />
            <path d="M13 31 L25 31 L23 37 L15 37 Z" />
            <path d="M39 31 L51 31 L49 37 L41 37 Z" />
            <rect x="29" y="42" width="6" height="2" rx="1" />
            <rect x="27" y="43.5" width="10" height="2" rx="1" />
            <rect x="24" y="45" width="16" height="3" rx="1.5" />
          </g>
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
