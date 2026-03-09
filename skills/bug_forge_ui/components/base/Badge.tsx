import React from 'react'
import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        {
          'bg-surface text-muted border border-border': variant === 'neutral',
          'bg-success/20 text-success border border-success/30': variant === 'success',
          'bg-warning/20 text-warning border border-warning/30': variant === 'warning',
          'bg-danger/20 text-danger border border-danger/30': variant === 'danger',
          'bg-accent/20 text-accent border border-accent/30': variant === 'accent'
        },
        className
      )}
      {...props}
    />
  )
}
