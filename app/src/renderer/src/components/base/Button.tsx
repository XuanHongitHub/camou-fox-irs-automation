import React, { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger'
  size?: 'xs' | 'sm' | 'md'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50',
          {
            // Variants
            'bg-accent text-white hover:bg-accentHover shadow-sm box-inner-border':
              variant === 'primary',
            'bg-surface text-text hover:bg-surface/80 border border-border':
              variant === 'secondary',
            'hover:bg-surface/50 text-muted hover:text-text': variant === 'ghost',
            'bg-danger text-white hover:bg-danger/90': variant === 'danger',
            'p-0 hover:bg-surface text-muted hover:text-text': variant === 'icon',

            // Sizes
            'h-6 px-2 text-[11px]': size === 'xs' && variant !== 'icon',
            'h-7 px-3 text-xs': size === 'sm' && variant !== 'icon',
            'h-8 px-4 text-xs': size === 'md' && variant !== 'icon',

            // Icon specific sizing
            'h-6 w-6': size === 'xs' && variant === 'icon',
            'h-7 w-7': size === 'sm' && variant === 'icon',
            'h-8 w-8': size === 'md' && variant === 'icon'
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
