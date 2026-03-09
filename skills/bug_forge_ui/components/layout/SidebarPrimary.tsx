import { cn } from '../../lib/utils'
import { Activity, Bot, Home, Settings, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export function SidebarPrimary({ className }: { className?: string }) {
  const activeView = useAppStore((state) => state.activeView)
  const setActiveView = useAppStore((state) => state.setActiveView)

  const navItems = [
    { id: 'home', icon: Home, label: 'Home' as const },
    { id: 'monitor', icon: Activity, label: 'Crawl Monitor' as const },
    { id: 'terminal', icon: Terminal, label: 'Terminal Logs' as const },
    { id: 'bots', icon: Bot, label: 'Bot Center' as const },
    { id: 'settings', icon: Settings, label: 'Settings' as const }
  ]

  return (
    <aside
      className={cn(
        'w-[54px] bg-panel h-full border-r border-border shrink-0 px-2 py-4 flex flex-col gap-2 items-center',
        className
      )}
    >
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id
        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id as any)}
            className={cn(
              'w-10 h-10 rounded-md flex items-center justify-center transition-colors group relative',
              isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-surface'
            )}
            title={item.label}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2 : 1.5} />
            {/* Tooltip implementation later or native title above */}
            {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent" />}
          </button>
        )
      })}
    </aside>
  )
}
