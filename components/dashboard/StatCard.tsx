import { memo } from 'react'
import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
    trend: 'text-muted-foreground',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    value: 'text-primary',
    trend: 'text-primary/70',
  },
  success: {
    icon: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    value: 'text-green-600 dark:text-green-400',
    trend: 'text-green-600/70 dark:text-green-400/70',
  },
  warning: {
    icon: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    value: 'text-orange-600 dark:text-orange-400',
    trend: 'text-orange-600/70 dark:text-orange-400/70',
  },
  danger: {
    icon: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    value: 'text-red-600 dark:text-red-400',
    trend: 'text-red-600/70 dark:text-red-400/70',
  },
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

  const content = (
    <Card className={cn('transition-all hover:shadow-md', href && 'cursor-pointer')}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn('mt-2 text-3xl font-bold', styles.value)}>{value}</p>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className={cn('mt-2 flex items-center gap-1 text-sm', styles.trend)}>
                {trend.value > 0 ? (
                  <Icons.trendingUp className="h-4 w-4" />
                ) : trend.value < 0 ? (
                  <Icons.trendingDown className="h-4 w-4" />
                ) : null}
                <span>{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn('rounded-full p-3', styles.icon)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

export const StatCard = memo(StatCardComponent)
