import { useEffect } from 'react'
import { Download, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPrint, fmtDate, pdfName } from '@/domain/money'
import type { Invoice, Rent } from '@/mock/types'
import { InvoiceDocument } from './InvoiceDocument'

/**
 * Перегляд рахунку — docked-панель праворуч, як у CRM (`RentDocumentDrawer`,
 * `DrawerShell`): шапка-смуга h-12, тіло на тоні `canvas`, футер з діями.
 * Це не оверлей і не модалка: сторінка лишається поруч і ніколи не
 * закривається сама. Модалка в CRM — для коротких підтверджень (story
 * Primitives/Dialog), документи відкриваються панеллю.
 *
 * Перегляд і друк стан оренди не змінюють (§3, сцена 10). «Зберегти PDF» —
 * системний діалог друку з підставленим ім'ям файлу: браузер бере його з
 * `document.title` (D10, G3).
 */
export function PrintDrawer({
  rent,
  invoice,
  set = [],
  onPick,
  onClose,
}: {
  rent: Rent
  invoice: Invoice
  /** Рахунки, відкриті разом; більше одного — перемикач над бланком. */
  set?: Invoice[]
  onPick?: (invoice: Invoice) => void
  onClose: () => void
}) {
  const printable = canPrint(invoice)
  // Docked-панель не оверлей, фокус-пастки немає: Esc ловимо на window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <aside
      className="flex h-full w-[34rem] shrink-0 flex-col border-l border-border bg-card"
      aria-label={`Рахунок № ${invoice.number ?? ''}`}
      data-print-drawer=""
      data-testid="print-drawer"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3" data-print-hide="">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-fg">Рахунок на оплату № {invoice.number ?? '—'}</p>
          <p className="truncate text-label text-muted-fg">від {fmtDate(invoice.date)}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Закрити" onClick={onClose} data-testid="print-close">
          <X aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas px-3 py-4">
        {set.length > 1 && (
          <div className="flex gap-1" role="tablist" aria-label="Рахунки" data-print-hide="">
            {set.map((i) => (
              <button
                key={i.id}
                type="button"
                role="tab"
                aria-selected={i.id === invoice.id}
                onClick={() => onPick?.(i)}
                data-testid="print-set-tab"
                className={
                  i.id === invoice.id
                    ? 'rounded-md border border-fg bg-fg px-2.5 py-1 text-label font-medium text-primary-fg'
                    : 'rounded-md border border-border bg-card px-2.5 py-1 text-label text-fg-2 hover:bg-muted'
                }
              >
                № {i.number ?? 'очікується'} — {i.kind === 'deposit' ? 'застава' : 'оренда'}
              </button>
            ))}
          </div>
        )}
        <div data-public-invoice="" className="overflow-hidden rounded-lg border border-border bg-card">
          <InvoiceDocument rent={rent} invoice={invoice} compact />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-3" data-print-hide="">
        <p className="min-w-0 flex-1 truncate text-label text-muted-fg">{printable ? pdfName(invoice) : 'Друк буде доступний після присвоєння номера.'}</p>
        <Button variant="secondary" disabled={!printable} onClick={() => printWithName(invoice)} data-testid="print-save-pdf">
          <Download aria-hidden />
          Зберегти PDF
        </Button>
        <Button disabled={!printable} onClick={() => window.print()} data-testid="print-print">
          <Printer aria-hidden />
          Друк
        </Button>
      </div>
    </aside>
  )
}

/** Тимчасово підміняє заголовок вкладки: його браузер пропонує як ім'я PDF. */
export function printWithName(invoice: Invoice) {
  const prev = document.title
  document.title = pdfName(invoice).replace(/\.pdf$/, '')
  window.print()
  window.setTimeout(() => {
    document.title = prev
  }, 500)
}
