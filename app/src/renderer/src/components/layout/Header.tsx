import { Search, Bell, Settings } from 'lucide-react'

export function Header({ title, subtitle, statusBadge }) {
  const baseButtonClasses = 'p-1.5 rounded-md text-muted hover:text-text hover:bg-surface transition-colors'

  return (
    <header className="h-[48px] bg-panel border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <h1 className="text-sm font-medium text-text leading-tight">{title}</h1>
          {subtitle && <span className="text-[10px] text-muted font-medium">{subtitle}</span>}
        </div>
        {statusBadge && <div className="ml-2">{statusBadge}</div>}
      </div>

      <div className="flex items-center gap-2">
        <button className={baseButtonClasses} title="Search" aria-label="Search">
          <Search className="w-4 h-4" />
        </button>
        <button className={baseButtonClasses} title="Notifications" aria-label="Notifications">
          <div className="relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-accent rounded-full border border-panel" />
          </div>
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button className={baseButtonClasses} title="Quick Settings" aria-label="Quick Settings">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
