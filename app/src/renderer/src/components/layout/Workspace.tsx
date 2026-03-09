import React from 'react'
import { cn } from '../../lib/utils'

export function Workspace({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <main className={cn('flex flex-1 overflow-hidden relative', className)}>{children}</main>
}
