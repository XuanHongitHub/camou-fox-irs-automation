import React from 'react'
import { cn } from '../../lib/utils'

export interface PanelInspectorProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
}

export function PanelInspector({ className, title, children, ...props }: PanelInspectorProps) {
  return (
    <aside
      className={cn(
        'w-[260px] lg:w-[280px] bg-panel h-full border-l border-border shrink-0 flex flex-col',
        className
      )}
      {...props}
    >
      {title && (
        <div className="h-[46px] border-b border-border flex items-center px-4 shrink-0 font-medium text-xs tracking-wide text-text">
          {title}
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-6">
        {children}
      </div>
    </aside>
  )
}

export function PropertyRow({
  label,
  children,
  vertical = false,
  className
}: {
  label: string
  children: React.ReactNode
  vertical?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex',
        vertical ? 'flex-col gap-1.5' : 'items-center justify-between gap-4',
        className
      )}
    >
      <span
        className={cn(
          'text-muted text-[11px] font-medium tracking-wide',
          !vertical && 'w-1/3 shrink-0'
        )}
      >
        {label}
      </span>
      <div className={cn('flex items-center', !vertical && 'flex-1 justify-end min-w-0')}>
        {children}
      </div>
    </div>
  )
}
