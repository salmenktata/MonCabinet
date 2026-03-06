import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface PaginationControlsProps {
  page: number
  totalPages: number
  prevHref: string
  nextHref: string
}

export function PaginationControls({ page, totalPages, prevHref, nextHref }: PaginationControlsProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <Link href={prevHref} aria-label="Page précédente">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
        >
          <Icons.chevronLeft className="h-4 w-4" />
        </Button>
      </Link>

      <span className="text-sm text-muted-foreground">
        Page {page} / {totalPages}
      </span>

      <Link href={nextHref} aria-label="Page suivante">
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
        >
          <Icons.chevronRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  )
}
