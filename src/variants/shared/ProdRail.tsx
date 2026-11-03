import type { ReactNode } from 'react'
import { ArrowUpRight, FileText, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { daysIncl, fmtDate, invoiceTotal, paidOf, totals, vatFor } from '@/domain/money'
import { byFreshness, invoiceTitle } from '@/domain/invoicing'
import { unbilledCharges } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import { useLab } from '@/lab/lab-state'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Rent } from '@/mock/types'
import { useStore } from '@/state/store'

/**
 * Правий рейл нових варіантів — той самий, що в проді (`detail/RentSummaryRail`):
 * «Обладнання і термін», «Клієнт», «Розрахунки за орендою», «Застава»,
 * «Документи». Варіант лише докладає свій блок (`top`) або свій рядок у
 * футер «Розрахунків» (`settlementExtra`); решта рейлу не змінюється.
 */
export function ProdRail({
  top,
  hideSettlement,
  settlementExtra,
}: {
  /** Блок варіанта над рештою рейлу (B: рахунки, «вистачить до»). */
  top?: ReactNode
  /** Рахунки забрали «Розрахунки за орендою» собі (B). */
  hideSettlement?: boolean
  /** Дія варіанта поруч із «+ Додати нарахування». */
  settlementExtra?: ReactNode
}) {
  const { rent } = useStore()
  return (
    <div className="flex flex-col gap-3" data-testid="prod-rail">
      {top}
      <Card title="Обладнання і термін">
        <ul className="flex flex-col gap-1">
          {rent.positions.map((p) => (
            <li key={p.id} className="text-body text-fg">
              {p.name} <span className="text-muted-fg">× {p.qty}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-label tabular-nums text-muted-fg">
          {fmtDate(rent.issueAt)} — {fmtDate(rent.returnAt)} · {daysWord(daysIncl(rent.issueAt, rent.returnAt))}
        </p>
      </Card>
      <ClientCard rent={rent} />
      {!hideSettlement && <Settlement rent={rent} extra={settlementExtra} />}
      <DepositCard rent={rent} />
      <DocsCard rent={rent} />
    </div>
  )
}

function Card({ title, aside, children, testId }: { title: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" data-testid={testId}>
      <header className="mb-1.5 flex items-center gap-2">
        <h3 className="text-body font-semibold text-fg">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

function ClientCard({ rent }: { rent: Rent }) {
  const cp = rent.counterparty
  return (
    <Card title="Клієнт">
      <p className="text-body text-fg">{cp.name}</p>
      <p className="text-label text-muted-fg">ЄДРПОУ {cp.edrpou}</p>
      {cp.director ? (
        <p className="text-label text-muted-fg">Директор: {cp.director}</p>
      ) : (
        <p className="mt-1 flex items-center gap-1.5 text-label text-warning-fg">
          <TriangleAlert className="size-3" aria-hidden />
          немає ПІБ директора
        </p>
      )}
    </Card>
  )
}

/** «Розрахунки за орендою»: один рядок на рахунок, «оплачено X з Y». */
function Settlement({ rent, extra }: { rent: Rent; extra?: ReactNode }) {
  const { setErrand } = useCard()
  const { setStage } = useLab()
  const t = totals(rent)
  const live = rent.invoices.filter((i) => !i.cancelled).sort(byFreshness)
  const open = unbilledCharges(rent)
  const state = t.left > 0 ? 'борг' : t.balance > 0 ? 'переплата' : live.length ? 'оплачено' : 'розрахунок'
  const big = t.left > 0 ? t.left : t.balance > 0 ? t.balance : t.issued
  const rate = vatFor(rent, true)
  const go = (kind: 'charge' | 'discount') => {
    setErrand(kind)
    setStage('payment')
  }
  return (
    <Card
      title="Розрахунки за орендою"
      testId="settlement"
      aside={
        <>
          <Badge variant={state === 'борг' ? 'danger' : state === 'переплата' ? 'warning' : state === 'оплачено' ? 'success' : 'default'}>{state}</Badge>
          <Badge variant="outline" className="ml-auto">
            {rate ? 'з ПДВ' : 'без ПДВ'}
          </Badge>
        </>
      }
    >
      <p className="text-title font-semibold tabular-nums" data-amount-due="rail">
        {formatMoney(big)}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {live.map((i) => {
          const paid = paidOf(rent, i)
          const total = invoiceTotal(i)
          const tone = paid >= total ? 'bg-success' : paid > 0 ? 'bg-warning' : 'bg-danger'
          return (
            <li key={i.id} className="flex items-start gap-2 text-label">
              <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', tone)} aria-hidden />
              <span className="min-w-0 flex-1 text-fg-2">
                {i.number ? `№ ${i.number} — ` : ''}
                {invoiceTitle(rent, i)}
              </span>
              <span className="shrink-0 text-right tabular-nums text-fg-2">
                {formatMoney(Math.min(paid, total))} з {formatMoney(total)}
              </span>
            </li>
          )
        })}
        {open.length > 0 && (
          <li className="flex items-start gap-2 text-label">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-notice" aria-hidden />
            <span className="min-w-0 flex-1 text-fg-2">Не виставлено: {open.map((c) => c.article.toLowerCase()).join(', ')}</span>
          </li>
        )}
      </ul>
      {rate > 0 && <p className="mt-1 text-label text-muted-fg">ПДВ {rate} %</p>}
      <footer className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2">
        <button type="button" className="flex items-center gap-1 text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" onClick={() => go('charge')} data-testid="rail-add-charge">
          + Додати нарахування
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
        <button type="button" className="flex items-center gap-1 text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" onClick={() => go('discount')}>
          + Додати знижку
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
        {extra}
      </footer>
    </Card>
  )
}

function DepositCard({ rent }: { rent: Rent }) {
  const dep = rent.invoices.filter((i) => !i.cancelled && i.kind === 'deposit')
  const due = dep.reduce((s, i) => s + invoiceTotal(i), 0)
  const paid = dep.reduce((s, i) => s + Math.min(paidOf(rent, i), invoiceTotal(i)), 0)
  return (
    <Card title="Застава">
      <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-label tabular-nums">
        <dt className="text-muted-fg">До внесення</dt>
        <dd className="text-right text-fg">{formatMoney(due)}</dd>
        <dt className="text-muted-fg">Оплачено</dt>
        <dd className="text-right text-fg">{formatMoney(paid)}</dd>
      </dl>
    </Card>
  )
}

function DocsCard({ rent }: { rent: Rent }) {
  const { setTab } = useCard()
  const docs = [...rent.invoices].sort(byFreshness)
  return (
    <Card title="Документи">
      {docs.length === 0 ? (
        <p className="text-label text-muted-fg">Документів ще немає.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {docs.slice(0, 5).map((i) => (
            <li key={i.id} className={cn('flex items-center gap-1.5 text-label text-fg-2', i.cancelled && 'text-muted-fg line-through')}>
              <FileText className="size-3 shrink-0 text-muted-fg" aria-hidden />
              <span className="min-w-0 truncate">
                Рахунок {i.number ? `№ ${i.number}` : '— № очікується'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setTab('Документи')} className="mt-1.5 text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg">
        Усі документи
      </button>
    </Card>
  )
}
