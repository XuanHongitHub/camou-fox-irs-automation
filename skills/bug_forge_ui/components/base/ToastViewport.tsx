import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useToastStore, type ToastItem } from '../../store/toastStore'

function toneClasses(tone: ToastItem['tone']): string {
  if (tone === 'success') return 'border-emerald-500/45 bg-emerald-500/12 text-emerald-100'
  if (tone === 'error') return 'border-rose-500/45 bg-rose-500/12 text-rose-100'
  if (tone === 'warning') return 'border-amber-500/45 bg-amber-500/12 text-amber-100'
  return 'border-sky-500/45 bg-sky-500/12 text-sky-100'
}

function ToneIcon({ tone }: { tone: ToastItem['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300" />
  if (tone === 'error') return <AlertCircle className="w-4 h-4 shrink-0 text-rose-300" />
  if (tone === 'warning') return <TriangleAlert className="w-4 h-4 shrink-0 text-amber-300" />
  return <Info className="w-4 h-4 shrink-0 text-sky-300" />
}

export function ToastViewport() {
  const items = useToastStore((s) => s.items)
  const remove = useToastStore((s) => s.remove)

  if (!items.length) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex max-h-[80vh] w-[360px] flex-col gap-2 overflow-hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-enter pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${toneClasses(item.tone)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <ToneIcon tone={item.tone} />
            <div className="min-w-0 flex-1">
              {item.title && <div className="text-[11px] font-semibold tracking-wide">{item.title}</div>}
              <div className="text-xs leading-5 break-words">{item.message}</div>
            </div>
            <button
              className="rounded p-0.5 text-current/70 hover:bg-white/10 hover:text-current"
              onClick={() => remove(item.id)}
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

