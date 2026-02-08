'use client'

import * as React from 'react'
import { useState, useRef, useEffect, ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

// =============================================================================
// RADIX UI TOOLTIP (for shadcn/ui compatibility)
// =============================================================================

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

// =============================================================================
// CUSTOM SIMPLE TOOLTIP (legacy)
// =============================================================================

interface SimpleTooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export default function SimpleTooltip({ content, children, position = 'top', delay = 300 }: SimpleTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [showTimeout, setShowTimeout] = useState<NodeJS.Timeout | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => setIsVisible(true), delay)
    setShowTimeout(timeout)
  }

  const handleMouseLeave = () => {
    if (showTimeout) {
      clearTimeout(showTimeout)
      setShowTimeout(null)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (showTimeout) clearTimeout(showTimeout)
    }
  }, [showTimeout])

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrows = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900',
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 ${positions[position]} pointer-events-none`}
        >
          <div className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg whitespace-nowrap">
            {content}
          </div>
          <div
            className={`absolute ${arrows[position]} h-0 w-0 border-4 border-transparent`}
          />
        </div>
      )}
    </div>
  )
}

// Composant d'aide avec icône
export function HelpTooltip({ content }: { content: string }) {
  return (
    <SimpleTooltip content={content}>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-muted-foreground transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </SimpleTooltip>
  )
}
