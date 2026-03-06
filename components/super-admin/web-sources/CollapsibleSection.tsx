'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground text-lg flex items-center gap-2">
                <Icons.chevronDown
                  className={cn(
                    'h-5 w-5 transition-transform duration-200',
                    !isOpen && '-rotate-90'
                  )}
                />
                {title}
                {subtitle && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">{subtitle}</span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
