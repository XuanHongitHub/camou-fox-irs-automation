import { cn } from '../../lib/utils'

export function PulseIndicator({
  className,
  active = true
}: {
  className?: string
  active?: boolean
}) {
  if (!active) {
    return <div className={cn('w-1.5 h-1.5 rounded-full bg-muted', className)} />
  }

  return (
    <div className={cn('relative flex h-1.5 w-1.5', className)}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
    </div>
  )
}
