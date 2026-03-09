import React, { useEffect } from 'react'
import { cn } from '../../lib/utils'
import { X } from 'lucide-react'
import { Button } from './Button'

interface DrawerProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
    className?: string
    position?: 'left' | 'right'
}

export function Drawer({ isOpen, onClose, title, children, footer, className, position = 'left' }: DrawerProps) {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
        }
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-40 flex bg-black/45 backdrop-blur-sm animate-in fade-in">
            {/* Background overlay click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div
                className={cn(
                    "relative flex flex-col w-[420px] max-w-[96vw] h-full bg-panel border-border shadow-2xl transition-transform duration-300",
                    position === 'left' ? 'border-r animate-in slide-in-from-left' : 'ml-auto border-l animate-in slide-in-from-right',
                    className
                )}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-base/80">
                    <h2 className="text-sm font-semibold text-text">{title}</h2>
                    <Button variant="icon" size="sm" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto bg-panel text-sm text-text">
                    {children}
                </div>
                {footer && (
                    <div className="p-4 border-t border-border bg-base/70">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
