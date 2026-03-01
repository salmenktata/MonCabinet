import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface PageHeaderProps {
  title: string
  description?: string
  backHref?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, backHref, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {backHref && (
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
              <Icons.arrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {description && <p className="text-slate-400">{description}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
