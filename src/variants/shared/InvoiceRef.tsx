import { fmtDate } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/mock/types'

/**
 * «Рах. № 1102 від 30.10.2026» біля оплати (BP-2308, крок 1). Клік відкриває
 * рахунок у «Документах» (крок 4). Зв'язок оплати з рахунком приходить з 1С;
 * менеджер його не ставить і не змінює (крок 2).
 */
export function InvoiceRef({ inv, className }: { inv: Invoice; className?: string }) {
  const { showInDocs } = useCard()
  return (
    <button
      type="button"
      onClick={() => showInDocs(inv.id)}
      className={cn('rounded-sm text-left font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg', className)}
      data-pay-invoice={inv.number ?? ''}
      data-testid="invoice-ref"
    >
      Рах. № {inv.number ?? '—'} від {fmtDate(inv.date)}
    </button>
  )
}

/** Оплата, яку бухгалтерія ще не прив'язала до рахунку (BP-2308, крок 3). */
export function NoInvoice({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm border border-warning/40 bg-warning-soft px-1.5 text-label font-medium text-warning-fg', className)} data-testid="no-invoice">
      без рахунку
    </span>
  )
}
