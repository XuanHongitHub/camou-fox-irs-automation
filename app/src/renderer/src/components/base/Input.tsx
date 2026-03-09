import React, { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'mini'
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', variant = 'default', icon, ...props }, ref) => {
    return (
      <div
        className={cn(
          'relative flex items-center bg-base border border-border shadow-sm transition-all focus-within:ring-1 focus-within:ring-accent/50 focus-within:border-accent text-text placeholder:text-muted/50',
          variant === 'default' ? 'h-8 rounded-md' : 'h-6 rounded-[4px]',
          className
        )}
      >
        {icon && <div className="pl-2.5 flex items-center justify-center text-muted">{icon}</div>}
        <input
          type={type}
          className={cn(
            'flex w-full h-full bg-transparent px-3 py-1 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50',
            icon && 'pl-2'
          )}
          ref={ref}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = 'Input'
