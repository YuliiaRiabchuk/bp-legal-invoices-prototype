import { useState } from 'react'
import { ArrowRight, Banknote, Landmark } from 'lucide-react'
import { fmtDay } from '@/domain/money'
import { chargeGross, chargePlace, invoiceTitle } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Rent } from '@/mock/types'
import { CashConfirm } from './OpenCharges'
import { Proposal } from './Proposal'

/**
 * Надходження оренди: платіжні доручення з банку чи 1С і ПКО на ФОП.
 * Кожна платіжка називає свій рахунок — це відповідь сцени 6 «яка оплата
 * до якого рахунку». Сум до сплати тут немає: тільки гроші, що прийшли.
 *
 * Кнопки «Підтвердити надходження» немає (D7, F2а): статус рахунку
 * змінює тільки платіжка, що прийшла з банку або 1С.
 */
export function PaymentsLedger({ rent, emptyHint }: { rent: Rent; emptyHint?: string }) {
  const pays = [...rent.payments].filter((p) => p.booked).sort((a, b) => (a.date < b.date ? 1 : -1))
  const cash = rent.cashOrders
  if (pays.length === 0 && cash.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong px-4 py-3" data-testid="payments-empty">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
          Платіжок ще немає
          <Proposal note="Менеджер не підтверджує надходження кнопкою: рахунок стає оплаченим, коли платіжне доручення приходить з банку або 1С." />
        </p>
        <p className="mt-0.5 text-label text-muted-fg">
          {emptyHint ?? 'Рахунок стане оплаченим сам, щойно платіжне доручення прийде з банку чи 1С.'}
        </p>
      </div>
    )
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-card" data-testid="payments-ledger">
      {pays.map((p) => {
        const inv = p.invoiceId ? rent.invoices.find((i) => i.id === p.invoiceId) : undefined
        return (
          <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_7rem] items-center gap-x-4 border-b border-border px-4 py-2 last:border-0">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-body font-medium text-fg">
                <Landmark className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                Платіжне доручення № {p.number}
              </p>
              <p className="truncate pl-5 text-label text-muted-fg">
                {fmtDay(p.date)} — з банку — {p.purpose}
              </p>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-body text-fg-2">
              <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-hidden />
              {inv ? (
                <span className="min-w-0 truncate" data-pay-invoice={inv.number ?? ''}>
                  <span className="font-medium text-fg">рахунок № {inv.number}</span> — {invoiceTitle(rent, inv)}
                </span>
              ) : (
                <span className="min-w-0">
                  <span className="font-medium text-fg">на балансі</span> — рахунок не розпізнано, прив’яже бухгалтерія
                </span>
              )}
            </p>
            <span className="text-right text-body font-medium tabular-nums text-fg">{formatMoney(p.amount)}</span>
          </li>
        )
      })}
      {cash.map((c) => {
        const ch = c.chargeId ? rent.charges.find((x) => x.id === c.chargeId) : undefined
        return (
          <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_7rem] items-center gap-x-4 border-b border-border px-4 py-2 last:border-0" data-testid="cash-order">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-body font-medium text-fg">
                <Banknote className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                {c.number ? `ПКО ${c.number}` : 'ПКО — № очікується'}
              </p>
              <p className="truncate pl-5 text-label text-muted-fg">
                {c.at} — готівка на {ORG_BY_ID[c.fopId].name}
              </p>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-body text-fg-2">
              <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium text-fg">{ch?.article ?? c.purpose}</span> — рахунки не змінюються
              </span>
            </p>
            <span className="text-right text-body font-medium tabular-nums text-fg">{formatMoney(c.amount)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Нарахування оренди і де кожне зараз: у рахунку, оплачене готівкою, ще не
 * виставлене. Додаються вони однією точкою входу варіанта (рейл у B), тут
 * — лише реєстр.
 */
export function ChargesLedger({ rent, onInvoice }: { rent: Rent; onInvoice?: (chargeId: string) => void }) {
  const [cashFor, setCashFor] = useState<string | null>(null)
  if (rent.charges.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-label text-muted-fg" data-testid="charges-empty">
        Додаткових нарахувань немає. Доставка, чистка, штрафи з’являться тут, щойно їх додадуть.
      </p>
    )
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-card" data-testid="charges-ledger">
      {rent.charges.map((c) => {
        const place = chargePlace(rent, c)
        return (
          <li
            key={c.id}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] items-center gap-x-4 border-b border-border px-4 py-2 last:border-0',
              place.kind === 'cancelled' && 'text-subtle',
            )}
          >
            <div className="min-w-0">
              <p className={cn('text-body font-medium', place.kind === 'cancelled' ? 'line-through' : 'text-fg')}>{c.article}</p>
              <p className="text-label text-muted-fg">
                {c.service} — {c.vatable ? 'з ПДВ' : 'без ПДВ'}
              </p>
            </div>
            <p className="text-label text-fg-2">
              {place.kind === 'invoice' && (
                place.invoice.number ? (
                  <>
                    у рахунку <span className="font-medium text-fg">№ {place.invoice.number}</span>
                  </>
                ) : (
                  <>у новому рахунку, № очікується від 1С</>
                )
              )}
              {place.kind === 'cash' && <>оплачено готівкою, {place.number ? `ПКО ${place.number}` : 'ПКО — № очікується'}</>}
              {place.kind === 'open' && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-medium text-notice-fg">ще не виставлено</span>
                  {onInvoice && (
                    <>
                      <button type="button" onClick={() => onInvoice(c.id)} className="font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" data-testid="open-charge-invoice">
                        У рахунок
                      </button>
                      {c.kind === 'charge' && (
                        <button type="button" onClick={() => setCashFor(c.id)} className="font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" data-testid="open-charge-cash">
                          Готівкою
                        </button>
                      )}
                    </>
                  )}
                </span>
              )}
              {place.kind === 'cancelled' && <>скасовано, {c.cancelled?.by}</>}
            </p>
            <span className="text-right text-body tabular-nums text-fg">{formatMoney(chargeGross(rent, c))}</span>
            {cashFor === c.id && (
              <div className="col-span-3 mt-2 flex justify-end">
                <CashConfirm rent={rent} charge={c} onDone={() => setCashFor(null)} className="w-full max-w-sm" />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
