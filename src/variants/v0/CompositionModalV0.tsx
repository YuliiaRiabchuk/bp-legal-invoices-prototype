import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { lineGross } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import type { InvoiceLine } from '@/mock/types'

/**
 * Порт модалки «Склад рахунку» (`detail/body/InvoiceCompositionEditor.tsx`).
 * Сума рахунку фіксована сумою рядка способу: рядки треба розподілити до неї.
 * Рядки предзаповнені з оплати; «+ Додати послугу» дає порожній рядок.
 */
export function CompositionModalV0({
  open,
  amount,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  amount: number
  initial: InvoiceLine[]
  onClose: () => void
  onSubmit: (lines: InvoiceLine[]) => void
}) {
  const [lines, setLines] = useState<InvoiceLine[]>(initial)
  const [tried, setTried] = useState(false)
  const total = Math.round(lines.reduce((s, l) => s + lineGross(l), 0) * 100) / 100
  const diff = Math.round((amount - total) * 100) / 100
  const empty = lines.some((l) => !l.service)
  const error = empty
    ? 'У кожному рядку виберіть послугу.'
    : diff > 0
      ? `Не вистачає ${formatMoney(diff)} до суми оплати.`
      : diff < 0
        ? `Перевищення на ${formatMoney(-diff)} — приберіть зайве.`
        : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]" data-testid="composition-modal">
        <div>
          <DialogTitle className="text-headline font-semibold">Склад рахунку</DialogTitle>
          <DialogDescription>Виберіть послуги для друку. Позиції та суми взято з оплати.</DialogDescription>
        </div>
        <table className="w-full text-body tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-label text-muted-fg">
              <th className="py-1.5 font-medium">Послуга</th>
              <th className="w-14 py-1.5 text-right font-medium">К-сть</th>
              <th className="w-24 py-1.5 text-right font-medium">Ціна</th>
              <th className="w-24 py-1.5 text-right font-medium">Сума</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border align-top">
                <td className="py-1.5 pr-2">
                  <span
                    className={
                      l.service
                        ? 'block rounded-md border border-border px-2 py-1 text-fg'
                        : 'block rounded-md border border-dashed border-border-strong px-2 py-1 text-muted-fg'
                    }
                  >
                    {l.service || 'Вибрати послугу'}
                  </span>
                </td>
                <td className="py-2 text-right">{l.qty * (l.days ?? 1)}</td>
                <td className="py-2 text-right">{formatMoney(l.priceNet * (1 + l.vatRate / 100))}</td>
                <td className="py-2 text-right">{formatMoney(lineGross(l))}</td>
                <td className="py-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Видалити рядок"
                    onClick={() => setLines((xs) => xs.filter((x) => x.id !== l.id))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setLines((xs) => [...xs, { id: `new-${xs.length}`, service: '', qty: 1, days: null, priceNet: 0, vatRate: 20 }])
            }
          >
            <Plus aria-hidden />
            Додати послугу
          </Button>
          <span className="text-label text-muted-fg">
            Розподілено {formatMoney(total)} з {formatMoney(amount)} (сума рахунку)
          </span>
        </div>
        {tried && error && <p className="text-label text-danger-fg">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
          <Button
            data-testid="composition-submit"
            onClick={() => {
              setTried(true)
              if (!error) onSubmit(lines)
            }}
          >
            Сформувати рахунок
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
