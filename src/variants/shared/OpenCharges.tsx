import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { chargeGross } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Charge, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { cn } from '@/lib/utils'
import { Proposal } from './Proposal'

/**
 * Нарахування, яких немає в жодному рахунку. Звідси два шляхи: у рахунок
 * (бланк з цим рядком) або готівкою — ПКО на ФОП, рахунки не змінюються
 * (C1, F5).
 */
export function OpenCharges({
  rent,
  charges,
  onInvoice,
  className,
}: {
  rent: Rent
  charges: Charge[]
  onInvoice: (id: string) => void
  className?: string
}) {
  const [cashFor, setCashFor] = useState<string | null>(null)
  return (
    <div className={className} data-testid="open-charges">
      <p className="flex items-center gap-1.5 text-label font-medium text-muted-fg">
        Не виставлено
        <Proposal note="Нарахування, яких ще немає в жодному рахунку: звідси — у рахунок або готівкою." />
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {charges.map((c) => {
          return (
            <li key={c.id} data-testid="open-charge">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-body text-fg">{c.article}</span>
                <span className="shrink-0 text-body tabular-nums text-fg">{formatMoney(chargeGross(rent, c))}</span>
              </div>
              {cashFor === c.id ? (
                <CashConfirm rent={rent} charge={c} onDone={() => setCashFor(null)} className="mt-1.5" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-label text-muted-fg">
                    {c.vatable && ORG_BY_ID[rent.orgId].vatPayer ? 'з ПДВ' : 'без ПДВ'} — {c.createdAt}
                  </span>
                  {c.kind === 'charge' && (
                    <button type="button" onClick={() => setCashFor(c.id)} className="text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" data-testid="open-charge-cash">
                      Готівкою
                    </button>
                  )}
                  <button type="button" onClick={() => onInvoice(c.id)} className="text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" data-testid="open-charge-invoice">
                    У рахунок
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Готівка від ЮЛ за нарахування: ПКО на ФОП, без ПДВ, тільки коли гроші
 * фізично в касі (C1, F5). Жоден рахунок не змінюється.
 */
export function CashConfirm({ rent, charge: c, onDone, className }: { rent: Rent; charge: Charge; onDone: () => void; className?: string }) {
  const { dispatch } = useStore()
  const cash = c.kind === 'charge' ? c.net : 0
  return (
    <div className={cn('rounded-md border border-border-strong bg-card p-2', className)} data-testid="cash-confirm">
      <p className="flex flex-wrap items-center gap-1.5 text-label text-fg">
        Прийняти готівкою <span className="font-medium tabular-nums">{formatMoney(cash)}</span> без ПДВ
        <Proposal note="Готівка закриває нарахування прямо з «Не виставлено»: ПКО на ФОП, рахунки ЮЛ не змінюються." />
      </p>
      <p className="text-label text-muted-fg">ПКО на {ORG_BY_ID[rent.fopId].name} — рахунки ЮЛ не зміняться.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Ні
        </Button>
        <Button
          size="sm"
          data-testid="cash-submit"
          onClick={() => {
            dispatch({ type: 'CASH_ACCEPT', amount: cash, purpose: c.service, chargeId: c.id })
            onDone()
          }}
        >
          Прийняти, виписати ПКО
        </Button>
      </div>
    </div>
  )
}
