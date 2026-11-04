import { Fragment, useState } from 'react'
import { chargeGross, chargePlace } from '@/domain/invoicing'
import { vatFor } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Rent } from '@/mock/types'
import { CashConfirm } from './OpenCharges'

/**
 * «Нарахування та знижки» нових варіантів: та сама таблиця, що в проді
 * (Найменування · Без ПДВ · ПДВ · Сума), замість колонки «Статус» —
 * «Рахунок»: де зараз нарахування. Нарахування не прив'язане до способу
 * оплати: його кладуть у рахунок або закривають готівкою (C1, F5).
 */
export function ChargesTable({
  rent,
  onInvoice,
}: {
  rent: Rent
  /** «У рахунок» на рядку невиставленого нарахування. */
  onInvoice?: (chargeId: string) => void
}) {
  const [cashFor, setCashFor] = useState<string | null>(null)
  if (rent.charges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-4" data-testid="charges-empty">
        <p className="text-body font-medium text-fg">Додаткових нарахувань поки немає</p>
        <p className="text-label text-muted-fg">Доставка, послуги та інші витрати за орендою з'являться тут.</p>
      </div>
    )
  }
  return (
    <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-body tabular-nums" data-testid="charges-table">
      <thead>
        <tr className="border-b border-border bg-muted/50 text-left text-label text-muted-fg">
          <th className="px-3 py-1.5 font-medium">Найменування</th>
          <th className="px-3 py-1.5 text-right font-medium">Без ПДВ</th>
          <th className="px-3 py-1.5 text-right font-medium">ПДВ</th>
          <th className="px-3 py-1.5 text-right font-medium">Сума</th>
          <th className="px-3 py-1.5 font-medium">Рахунок</th>
        </tr>
      </thead>
      <tbody>
        {rent.charges.map((c) => {
          const place = chargePlace(rent, c)
          const off = place.kind === 'cancelled'
          const open = place.kind === 'open'
          const rate = vatFor(rent, c.vatable)
          const vat = Math.round(c.net * rate) / 100
          const sign = c.kind === 'discount' ? -1 : 1
          return (
            <Fragment key={c.id}>
              <tr className={cn('border-b border-border last:border-0', off && 'text-subtle')} data-testid="charge-row" data-charge={c.id}>
                <td className={cn('px-3 py-2', off && 'line-through')}>
                  {c.article}
                  <span className="block text-label text-muted-fg">{c.service}</span>
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(sign * c.net)}</td>
                <td className="px-3 py-2 text-right">{vat ? formatMoney(sign * vat) : '—'}</td>
                <td className="px-3 py-2 text-right">{formatMoney(chargeGross(rent, c))}</td>
                <td className="px-3 py-2 text-label text-fg-2">
                  {place.kind === 'invoice' &&
                    (place.invoice.number ? (
                      <>
                        у рахунку <span className="font-medium text-fg">№ {place.invoice.number}</span>
                      </>
                    ) : (
                      'у новому рахунку, № очікується'
                    ))}
                  {place.kind === 'cash' && <>готівкою, {place.number ? `ПКО ${place.number}` : 'ПКО — № очікується'}</>}
                  {off && <>скасовано, {c.cancelled?.by}</>}
                  {open && (
                    <span className="flex flex-wrap items-center gap-x-3">
                      <span className="font-medium text-notice-fg">не виставлено</span>
                      {onInvoice && (
                        <button
                          type="button"
                          onClick={() => onInvoice(c.id)}
                          className="-my-1 inline-flex min-h-6 items-center rounded-sm px-1 font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                          data-testid="open-charge-invoice"
                        >
                          У рахунок
                        </button>
                      )}
                      {c.kind === 'charge' && (
                        <button
                          type="button"
                          onClick={() => setCashFor(c.id)}
                          className="-my-1 inline-flex min-h-6 items-center rounded-sm px-1 font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                          data-testid="open-charge-cash"
                        >
                          Готівкою
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
              {cashFor === c.id && (
                <tr className="border-b border-border bg-muted/40">
                  <td colSpan={5} className="px-3 py-2">
                    <CashConfirm rent={rent} charge={c} onDone={() => setCashFor(null)} className="max-w-sm" />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
