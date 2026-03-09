import { cn } from '../../lib/utils'
import { Sun, Moon } from 'lucide-react'
import React, { ReactElement } from 'react'

export interface NavItem {
  id: string
  icon: ReactElement
  tooltip: string
  isActive?: boolean
  onClick: () => void
}

interface SidebarPrimaryProps {
  className?: string
  topItems?: NavItem[]
  bottomItems?: NavItem[]
}

export function SidebarPrimary({ className, topItems = [], bottomItems = [] }: SidebarPrimaryProps) {
  const [theme, setTheme] = React.useState('dark')

  const baseButtonClasses = 'w-10 h-10 rounded-md flex items-center justify-center transition-colors'

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(newTheme)
  }

  return (
    <aside
      className={cn(
        'w-[56px] bg-panel h-full border-r border-border shrink-0 px-2 py-3 flex flex-col items-center',
        className
      )}
    >
      <nav className="mt-2 flex-1 flex flex-col items-center gap-2">
        {topItems.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={cn(
              `${baseButtonClasses} group relative`,
              item.isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-surface'
            )}
            title={item.tooltip}
          >
            {item.icon}
            {item.isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent" />}
          </button>
        ))}
      </nav>

      <div className="w-full pt-3 border-t border-border flex flex-col items-center gap-2">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={cn(
              `${baseButtonClasses} group relative`,
              item.isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-surface'
            )}
            title={item.tooltip}
          >
            {item.icon}
            {item.isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent" />}
          </button>
        ))}

        <button
          onClick={toggleTheme}
          className={`${baseButtonClasses} text-muted hover:text-text hover:bg-surface`}
          title="Toggle Theme"
        >
          {theme === 'light' ? <Moon className="w-[18px] h-[18px]" /> : <Sun className="w-[18px] h-[18px]" />}
        </button>
      </div>
    </aside>
  )
}
