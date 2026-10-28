import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/state/store'

/**
 * Хронологія оренди — бокова панель із шапки. Скасування і номери з 1С теж
 * події: запис лишається, нічого не видаляється (§3).
 */
export function Chronology({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rent } = useStore()
  if (!open) return null
  const events = [...rent.events].reverse()
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose} data-testid="chronology">
      <aside
        className="flex h-full w-[24rem] flex-col border-l border-border bg-card shadow-dialog"
        onClick={(e) => e.stopPropagation()}
        aria-label="Хронологія"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-headline font-semibold">Хронологія</h2>
          <Button variant="ghost" size="icon" aria-label="Закрити" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </header>
        <ol className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {events.length === 0 && <li className="py-3 text-body text-muted-fg">Подій за сесію ще немає.</li>}
          {events.map((e) => (
            <li key={e.id} className="border-b border-border py-2.5 last:border-0">
              <p className="text-body text-fg">{e.text}</p>
              <p className="mt-0.5 text-label text-muted-fg">
                {e.at} · {e.who}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
