import React from 'react'
import { cn } from '../../lib/utils'

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
    return (
        <div className="w-full overflow-auto rounded-lg border border-border bg-base">
            <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
        </div>
    )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead className={cn('bg-surface sticky top-0 z-10 border-b border-border', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={cn('', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    return (
        <tr
            className={cn(
                'border-b border-border transition-colors hover:bg-surface/50 data-[state=selected]:bg-accent/10',
                className
            )}
            {...props}
        />
    )
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return (
        <th
            className={cn(
                'h-8 px-4 text-left align-middle text-[10px] uppercase tracking-widest font-mono text-muted [&:has([role=checkbox])]:pr-0',
                className
            )}
            {...props}
        />
    )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            className={cn('p-3 align-middle text-xs text-text [&:has([role=checkbox])]:pr-0 py-2', className)}
            {...props}
        />
    )
}
