import React from 'react'
import { cn } from '../../lib/utils'

interface AppShellProps {
  children: React.ReactNode
  className?: string
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn('h-screen w-full flex flex-col bg-base overflow-hidden font-sans', className)}
    >
      {children}
    </div>
  )
}
