import { cn } from '../../lib/utils'

export function TrafficLights({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity" />
      </div>
      <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity" />
      </div>
      <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}
