import React from 'react'
import { cn } from '../../lib/utils'

interface StandardViewShellProps {
  title: React.ReactNode
  description?: React.ReactNode
  headerIcon?: React.ReactNode
  actions?: React.ReactNode
  toolbar?: React.ReactNode
  bodyClassName?: string
  children: React.ReactNode
}

export function StandardViewShell({
  title,
  description,
  headerIcon,
  actions,
  toolbar,
  bodyClassName,
  children
}: StandardViewShellProps) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-3 py-3">
      <div className="h-full w-full flex flex-col bg-panel border border-border rounded-2xl shadow-panel box-inner-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-base/80 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-text flex items-center gap-2">
              {headerIcon}
              {title}
            </h1>
            {description && <p className="text-[11px] text-muted mt-1">{description}</p>}
          </div>
          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </div>
        {toolbar ? (
          <div className="px-5 py-2.5 border-b border-border bg-panel/70 flex items-center gap-2">
            {toolbar}
          </div>
        ) : null}
        <div className={cn('flex-1 min-h-0 p-4 overflow-y-auto', bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}
