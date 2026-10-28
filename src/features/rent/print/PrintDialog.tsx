import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { canPrint, pdfName } from '@/domain/money'
import type { Invoice, Rent } from '@/mock/types'
import { InvoiceDocument } from './InvoiceDocument'

/**
 * Перегляд рахунку. Перегляд і друк стан оренди не змінюють (§3, сцена 10).
 *
 * «Зберегти PDF» — системний діалог друку з уже підставленим ім'ям файлу:
 * браузер бере ім'я з `document.title` (D10, G3). Окремого генератора PDF у
 * прототипі немає.
 */
export function PrintDialog({
  rent,
  invoice,
  onClose,
  saveLabel = 'Зберегти PDF',
}: {
  rent: Rent
  invoice: Invoice | null
  onClose: () => void
  saveLabel?: string
}) {
  const printable = invoice ? canPrint(invoice) : false
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[780px]" data-print-dialog="">
        {invoice && (
          <>
            <div className="flex items-start justify-between gap-3 pr-8" data-print-hide="">
              <div>
                <DialogTitle className="text-headline font-semibold">
                  Рахунок № {invoice.number ?? '—'}
                </DialogTitle>
                <DialogDescription>{printable ? pdfName(invoice) : 'Друк буде доступний після присвоєння номера.'}</DialogDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" disabled={!printable} onClick={() => printWithName(invoice)} data-testid="print-save-pdf">
                  <Download aria-hidden />
                  {saveLabel}
                </Button>
                <Button disabled={!printable} onClick={() => window.print()} data-testid="print-print">
                  <Printer aria-hidden />
                  Друк
                </Button>
              </div>
            </div>
            <div data-public-invoice="" className="rounded-md border border-border">
              <InvoiceDocument rent={rent} invoice={invoice} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
