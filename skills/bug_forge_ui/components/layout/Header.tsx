import { cn } from '../../lib/utils'
import { Search, User, Sun, Moon } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export function Header({ className }: { className?: string }) {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <header
      className={cn(
        'h-[46px] w-full bg-panel border-b border-border flex items-center justify-between px-4 shrink-0 shadow-sm z-10',
        className
      )}
    >
      <div className="w-[54px] shrink-0" />

      <div className="flex items-center justify-center flex-1 px-4">
        {/* Global Search / Command Range */}
        <div className="flex items-center gap-2 bg-base border border-border px-3 py-1.5 rounded-md text-xs text-muted w-64 focus-within:ring-1 focus-within:ring-accent/50 focus-within:border-accent transition-all">
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1">Search or jump to...</span>
          <kbd className="bg-surface text-[10px] px-1.5 py-0.5 rounded border border-border font-mono tracking-widest text-muted">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 min-w-[220px]">
        {/* Status & Profile */}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Engine Online
        </div>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={toggleTheme}
          className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-text transition-colors"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-text transition-colors">
          <User className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
