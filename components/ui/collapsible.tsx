'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface CollapsibleContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CollapsibleContext = React.createContext<CollapsibleContextType>({
  open: false,
  onOpenChange: () => {},
})

interface CollapsibleProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

const Collapsible = ({
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  children,
  className,
}: CollapsibleProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div className={className}>{children}</div>
    </CollapsibleContext.Provider>
  )
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactNode
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ asChild, children, className, onClick, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(CollapsibleContext)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
      onOpenChange(!open)
      if (onClick) {
        onClick(e as React.MouseEvent<HTMLButtonElement>)
      }
    }

    if (asChild && React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>
      const existingOnClick = childProps.onClick as ((e: React.MouseEvent) => void) | undefined

      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        onClick: (e: React.MouseEvent) => {
          onOpenChange(!open)
          if (existingOnClick) {
            existingOnClick(e)
          }
        },
        'aria-expanded': open,
        style: { cursor: 'pointer', ...((childProps.style as React.CSSProperties) || {}) },
      })
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        aria-expanded={open}
        className={className}
        {...props}
      >
        {children}
      </button>
    )
  }
)

CollapsibleTrigger.displayName = 'CollapsibleTrigger'

interface CollapsibleContentProps {
  children: React.ReactNode
  className?: string
}

const CollapsibleContent = ({ children, className }: CollapsibleContentProps) => {
  const { open } = React.useContext(CollapsibleContext)

  if (!open) return null

  return <div className={cn('animate-in fade-in-0', className)}>{children}</div>
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
