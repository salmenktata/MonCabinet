import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: keyof typeof Icons
  message: string
  iconClassName?: string
  className?: string
}

export function EmptyState({ icon, message, iconClassName, className }: EmptyStateProps) {
  const Icon = Icons[icon]
  return (
    <div className={cn('text-center py-12 text-muted-foreground', className)}>
      <Icon className={cn('h-12 w-12 mx-auto mb-4', iconClassName)} />
      <p>{message}</p>
    </div>
  )
}
