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
  sm: { icon: 36, text: 'text-lg', tag: 'text-[10px] px-2 py-0.5', gap: 'gap-1' },
  md: { icon: 48, text: 'text-xl', tag: 'text-xs px-2.5 py-0.5', gap: 'gap-1.5' },
  lg: { icon: 64, text: 'text-2xl', tag: 'text-sm px-3 py-1', gap: 'gap-2' },
  xl: { icon: 96, text: 'text-3xl', tag: 'text-base px-4 py-1.5', gap: 'gap-3' },
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

        {/* Logo PNG — transparent, sans fond blanc */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Qadhya"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            'w-full h-full relative z-10 object-contain drop-shadow-lg select-none',
            animate && 'transition-transform duration-300'
          )}
        />
      </div>

      {/* Texte du logo */}
      {showText && (
        <span className={cn('font-bold tracking-tight', text)}>
          <span className="text-sky-400 dark:text-sky-300">Qadh</span>
          <span style={{ color: '#C9A84C' }}>ya</span>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Qadhya"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className="w-full h-full relative z-10 object-contain drop-shadow-lg select-none"
        />
      </div>

      {/* Texte et tag */}
      <div className="flex flex-col">
        <span className={cn('font-bold tracking-tight', text)}>
          <span className="text-sky-400 dark:text-sky-300">Qadh</span>
          <span style={{ color: '#C9A84C' }}>ya</span>
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
