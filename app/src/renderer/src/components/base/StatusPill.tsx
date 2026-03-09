import React from 'react'
import { cn } from '../../lib/utils'

export interface StatusPillProps extends React.HTMLAttributes<HTMLDivElement> {
    status: 'idle' | 'running' | 'success' | 'error' | 'warning'
    label?: string
}

export function StatusPill({ status, label, className, ...props }: StatusPillProps) {
    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border',
                {
                    'bg-surface text-muted border-border': status === 'idle',
                    'bg-accent/10 text-accent border-accent/20': status === 'running',
                    'bg-success/10 text-success border-success/20': status === 'success',
                    'bg-danger/10 text-danger border-danger/20': status === 'error',
                    'bg-warning/10 text-warning border-warning/20': status === 'warning',
                },
                className
            )}
            {...props}
        >
            <div
                className={cn('h-1.5 w-1.5 rounded-full', {
                    'bg-muted': status === 'idle',
                    'bg-accent animate-pulse': status === 'running',
                    'bg-success': status === 'success',
                    'bg-danger': status === 'error',
                    'bg-warning': status === 'warning',
                })}
            />
            {label || status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
    )
}
