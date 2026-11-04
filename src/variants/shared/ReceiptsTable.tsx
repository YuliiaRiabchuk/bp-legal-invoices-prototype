import { Banknote, Check, Landmark } from 'lucide-react'
import { fmtDay, invoiceTotal, invoiceVat } from '@/domain/money'
import { invoiceTitle } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Rent } from '@/mock/types'
import { InvoiceRef, NoInvoice } from './InvoiceRef'
import { Proposal } from './Proposal'

const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 @[38rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_6.5rem_5.5rem]'
// Місце клітинки у вузькому вигляді; на широкому порядок за DOM.
const NARROW = {
  invoice: 'col-span-2 order-2 @[38rem]:col-span-1 @[38rem]:order-none',
  status: 'col-span-2 order-3 @[38rem]:col-span-1 @[38rem]:order-none',
  amount: 'order-1 @[38rem]:order-none',
  vat: 'hidden @[38rem]:block',
}

/**
 * «Прийом коштів» нових варіантів: ті самі колонки, що в проді (Спосіб ·
 * Покриває · Статус · Сума · у т.ч. ПДВ), але рядки — платіжки, що вже
 * прийшли з банку чи 1С, а не чернетки способів. Кнопки «Підтвердити»
 * немає (D7): статус рахунку змінює платіжка.
 *
 * Колонка «Покриває» називає конкретний рахунок — відповідь сцени 6.
 * У проді тут лише «Оренда / Застава».
 */
export function ReceiptsTable({ rent }: { rent: Rent }) {
  const pays = [...rent.payments].filter((p) => p.booked).sort((a, b) => (a.date < b.date ? 1 : -1))
  const cash = rent.cashOrders
  if (pays.length === 0 && cash.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-3" data-testid="payments-empty">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
          Платіжок ще немає
          <Proposal note="Менеджер не підтверджує надходження кнопкою: рахунок стає оплаченим, коли платіжне доручення приходить з банку або 1С." />
        </p>
        <p className="mt-0.5 text-label text-muted-fg">Рахунок стане оплаченим сам, щойно платіжне доручення прийде з банку чи 1С.</p>
      </div>
    )
  }
  return (
    <div className="@container overflow-hidden rounded-lg border border-border bg-card" data-testid="receipts-table">
      <div className={cn(GRID, 'hidden border-b border-border bg-muted/50 py-1.5 text-label text-muted-fg @[38rem]:grid')}>
        <span>Спосіб</span>
        <span className="flex items-center gap-1.5">
          Рахунок
          <Proposal note="У проді колонка «Покриває» каже тільки «Оренда» чи «Застава». Тут — номер рахунку." />
        </span>
        <span>Статус</span>
        <span className="text-right">Сума</span>
        <span className="text-right">у т.ч. ПДВ</span>
      </div>
      {pays.map((p) => {
        const inv = p.invoiceId ? rent.invoices.find((i) => i.id === p.invoiceId) : undefined
        const vat = inv && invoiceTotal(inv) ? (invoiceVat(inv) / invoiceTotal(inv)) * p.amount : 0
        return (
          <div key={p.id} className={cn(GRID, 'border-b border-border last:border-0')} data-testid="receipt-row">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-body font-medium text-fg">
                <Landmark className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                Банківський переказ
              </p>
              <p className="truncate text-label text-muted-fg">{ORG_BY_ID[rent.orgId].name}</p>
            </div>
            {inv ? (
              <p className={cn('min-w-0 text-body text-fg-2', NARROW.invoice)}>
                <InvoiceRef inv={inv} />
                <span className="block truncate text-label text-muted-fg">{invoiceTitle(rent, inv)}</span>
              </p>
            ) : (
              <p className={cn('min-w-0 text-body text-fg-2', NARROW.invoice)}>
                <NoInvoice />
                <span className="block truncate text-label text-muted-fg">прив’яже бухгалтерія в 1С</span>
              </p>
            )}
            <div className={NARROW.status}>
              <span className="inline-flex items-center gap-1 text-body text-success-fg">
                <Check className="size-3.5" aria-hidden />
                Проведено
              </span>
              <p className="text-label text-muted-fg">
                п/д № {p.number}, {fmtDay(p.date)}
              </p>
            </div>
            <span className={cn('text-right text-body tabular-nums text-fg', NARROW.amount)}>{formatMoney(p.amount)}</span>
            <span className={cn('text-right text-body tabular-nums text-muted-fg', NARROW.vat)}>{vat ? formatMoney(Math.round(vat)) : '—'}</span>
          </div>
        )
      })}
      {cash.map((c) => {
        const ch = c.chargeId ? rent.charges.find((x) => x.id === c.chargeId) : undefined
        return (
          <div key={c.id} className={cn(GRID, 'border-b border-border last:border-0')} data-testid="cash-order">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-body font-medium text-fg">
                <Banknote className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                Готівка
              </p>
              <p className="truncate text-label text-muted-fg">{ORG_BY_ID[c.fopId].name}</p>
            </div>
            <p className={cn('min-w-0 text-body text-fg-2', NARROW.invoice)}>
              <span className="font-medium text-fg">{ch?.article ?? c.purpose}</span>
              <span className="block truncate text-label text-muted-fg">рахунки не змінюються</span>
            </p>
            <div className={NARROW.status}>
              <span className="inline-flex items-center gap-1 text-body text-success-fg">
                <Check className="size-3.5" aria-hidden />
                Підтверджено
              </span>
              <p className="text-label text-muted-fg">{c.number ? `ПКО ${c.number}` : 'ПКО — № очікується'}</p>
            </div>
            <span className={cn('text-right text-body tabular-nums text-fg', NARROW.amount)}>{formatMoney(c.amount)}</span>
            <span className={cn('text-right text-body text-muted-fg', NARROW.vat)}>—</span>
          </div>
        )
      })}
    </div>
  )
}
