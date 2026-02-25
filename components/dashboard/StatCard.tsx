import { memo } from 'react'
import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
  }
  href?: string
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

const variantStyles = {
  default: {
    card: 'bg-gradient-to-br from-muted/60 to-muted/20 border-border/50',
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
    trend: 'text-muted-foreground',
    glow: '',
    sparkColor: '#94a3b8',
  },
  primary: {
    card: 'bg-gradient-to-br from-blue-600/15 to-blue-500/5 border-blue-500/20',
    icon: 'bg-blue-500/15 text-blue-400',
    value: 'text-blue-400',
    trend: 'text-blue-400/80',
    glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
    sparkColor: '#60a5fa',
  },
  success: {
    card: 'bg-gradient-to-br from-green-600/15 to-green-500/5 border-green-500/20',
    icon: 'bg-green-500/15 text-green-400',
    value: 'text-green-400',
    trend: 'text-green-400/80',
    glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]',
    sparkColor: '#4ade80',
  },
  warning: {
    card: 'bg-gradient-to-br from-orange-600/15 to-orange-500/5 border-orange-500/20',
    icon: 'bg-orange-500/15 text-orange-400',
    value: 'text-orange-400',
    trend: 'text-orange-400/80',
    glow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]',
    sparkColor: '#fb923c',
  },
  danger: {
    card: 'bg-gradient-to-br from-red-600/15 to-red-500/5 border-red-500/20',
    icon: 'bg-red-500/15 text-red-400',
    value: 'text-red-400',
    trend: 'text-red-400/80',
    glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]',
    sparkColor: '#f87171',
  },
}

// Mini-sparkline SVG inline — 5 barres statiques basées sur la valeur numérique
function Sparkline({ value, color }: { value: number; color: string }) {
  const n = typeof value === 'number' ? value : 0
  // Générer 5 hauteurs pseudo-aléatoires dérivées de la valeur
  const heights = [
    Math.max(4, (n % 5) * 4 + 8),
    Math.max(4, ((n + 2) % 5) * 4 + 6),
    Math.max(4, ((n + 4) % 5) * 4 + 10),
    Math.max(4, ((n + 1) % 5) * 4 + 7),
    Math.max(4, ((n + 3) % 5) * 4 + 12),
  ]
  const maxH = Math.max(...heights)

  return (
    <svg
      width="40"
      height="24"
      viewBox="0 0 40 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {heights.map((h, i) => {
        const barH = (h / maxH) * 20
        return (
          <rect
            key={i}
            x={i * 9}
            y={24 - barH}
            width="6"
            height={barH}
            rx="2"
            fill={color}
            opacity={i === heights.length - 1 ? 1 : 0.4 + i * 0.12}
          />
        )
      })}
    </svg>
  )
}

function StatCardComponent({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  href,
  variant = 'default',
}: StatCardProps) {
  const styles = variantStyles[variant]
  const numericValue = typeof value === 'number' ? value : 0

  const content = (
    <div
      className={cn(
        'rounded-xl border p-4 sm:p-5 transition-all duration-200',
        styles.card,
        styles.glow,
        href && 'cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </p>
          <p className={cn('mt-2 text-3xl sm:text-4xl font-bold leading-none', styles.value)}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', styles.trend)}>
              {trend.value > 0 ? (
                <Icons.trendingUp className="h-3 w-3 shrink-0" />
              ) : trend.value < 0 ? (
                <Icons.trendingDown className="h-3 w-3 shrink-0" />
              ) : null}
              <span className="truncate">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className={cn('rounded-lg p-2.5', styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
          {typeof value === 'number' && (
            <Sparkline value={numericValue} color={styles.sparkColor} />
          )}
        </div>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

export const StatCard = memo(StatCardComponent)
