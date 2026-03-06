import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

const COLOR_MAP: Record<string, { text: string; icon: string; ring: string }> = {
  yellow: { text: 'text-yellow-500', icon: 'text-yellow-500/20', ring: 'ring-yellow-500' },
  green:  { text: 'text-green-500',  icon: 'text-green-500/20',  ring: 'ring-green-500' },
  red:    { text: 'text-red-500',    icon: 'text-red-500/20',    ring: 'ring-red-500' },
  blue:   { text: 'text-blue-500',   icon: 'text-blue-500/20',   ring: 'ring-blue-500' },
  orange: { text: 'text-orange-500', icon: 'text-orange-500/20', ring: 'ring-orange-500' },
  purple: { text: 'text-purple-500', icon: 'text-purple-500/20', ring: 'ring-purple-500' },
  slate:  { text: 'text-muted-foreground',  icon: 'text-muted-foreground/20',  ring: 'ring-border' },
}

interface KPICardProps {
  value: string | number
  label: string
  icon: keyof typeof Icons
  color?: keyof typeof COLOR_MAP
  href?: string
  isActive?: boolean
  progress?: number
}

export function KPICard({ value, label, icon, color = 'slate', href, isActive, progress }: KPICardProps) {
  const Icon = Icons[icon]
  const colors = COLOR_MAP[color] ?? COLOR_MAP.slate

  const card = (
    <Card
      className={cn(
        'transition',
        href && 'cursor-pointer hover:bg-muted',
        isActive && `ring-2 ${colors.ring}`
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className={cn('text-2xl font-bold', colors.text)}>{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <Icon className={cn('h-8 w-8', colors.icon)} />
        </div>
        {progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', colors.text.replace('text-', 'bg-'))}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{card}</Link>
  }
  return card
}
