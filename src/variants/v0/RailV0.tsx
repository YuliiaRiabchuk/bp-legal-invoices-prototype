import { ArrowUpRight, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { daysIncl, fmtDate, fmtDay, invoiceTotal, lineGross, paidOf, unbilledCharges, vatFor } from '@/domain/money'
import { baseInvoice, prodMoney, rentNominal, topupInvoices } from '@/domain/prod'
import { useCard } from '@/features/rent/card-context'
import { useLab } from '@/lab/lab-state'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { docTitleV0 } from './DocumentsV0'

/**
 * Порт правого рейлу (`detail/RentSummaryRail.tsx`): «Обладнання і термін»,
 * «Клієнт», «Розрахунки за орендою», «Застава», «Документи».
 */
export function RailV0() {
  const { rent } = useStore()
  return (
    <div className="flex flex-col gap-3">
      <Card title="Обладнання і термін">
        <ul className="flex flex-col gap-1">
          {rent.positions.map((p) => (
            <li key={p.id} className="text-body text-fg">
              {p.name} <span className="text-muted-fg">× {p.qty}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-label text-muted-fg">
          {fmtDate(rent.issueAt)} — {fmtDate(rent.returnAt)} · {daysWord(daysIncl(rent.issueAt, rent.returnAt))}
        </p>
      </Card>
      <Card title="Клієнт">
        <p className="text-body text-fg">{rent.counterparty.name}</p>
        <p className="text-label text-muted-fg">ЄДРПОУ {rent.counterparty.edrpou}</p>
      </Card>
      <SettlementV0 rent={rent} />
      <DepositV0 rent={rent} />
      <DocsV0 rent={rent} />
    </div>
  )
}

function Card({ title, aside, children, testId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; testId?: string }) {
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

/** `RailSettlementCard`: борг посчетно, переплата згорткою (N5). */
function SettlementV0({ rent }: { rent: Rent }) {
  const { setErrand } = useCard()
  const { setStage } = useLab()
  const m = prodMoney(rent)
  const rate = vatFor(rent, true)
  const base = baseInvoice(rent)
  const tops = topupInvoices(rent)
  const state = m.debt > 0 ? 'борг' : m.over > 0 ? 'переплата' : tops.length || base ? 'оплачено' : 'розрахунок'
  const big = m.debt > 0 ? m.debt : m.over > 0 ? m.over : m.rentDue + m.topDue
  const paidBase = base ? paidOf(rent, base, 'prod') : m.rentPaid
  const open = (kind: 'charge' | 'discount') => {
    setErrand(kind)
    setStage('payment')
  }
  return (
    <Card
      title="Розрахунки за орендою"
      testId="v0-settlement"
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
        {base ? (
          base.lines.map((l) => (
            <Line key={l.id} label={l.service} amount={lineGross(l)} paid={Math.round((paidBase * lineGross(l)) / invoiceTotal(base))} />
          ))
        ) : (
          <Line label="Рахунок оренди" amount={rentNominal(rent)} paid={paidBase} />
        )}
        {rate > 0 && <li className="text-label text-muted-fg">ПДВ {rate} %</li>}
        {tops.map((i) => (
          <Line
            key={i.id}
            label={i.kind === 'extension' || i.kind === 'period' ? `Продовження ${fmtDay(i.date)}` : (i.lines[0]?.service ?? `Дод. нарахування ${fmtDay(i.date)}`)}
            amount={invoiceTotal(i)}
            paid={paidOf(rent, i, 'prod')}
          />
        ))}
        {unbilledCharges(rent).map((c) => (
          <Line key={c.id} label={c.service.startsWith('Доплата за продовження') ? c.service : `Дод. нарахування ${c.createdAt.slice(0, 5)}`} amount={c.net * (1 + vatFor(rent, c.vatable) / 100)} paid={0} />
        ))}
      </ul>
      <footer className="mt-3 flex gap-3 border-t border-border pt-2">
        <button type="button" className="flex items-center gap-1 text-label font-medium text-accent-fg hover:underline" onClick={() => open('charge')} data-testid="rail-add-charge">
          + Додати нарахування
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
        <button type="button" className="flex items-center gap-1 text-label font-medium text-accent-fg hover:underline" onClick={() => open('discount')}>
          + Додати знижку
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
      </footer>
    </Card>
  )
}

function Line({ label, amount, paid }: { label: string; amount: number; paid: number | null }) {
  const tone = paid == null ? null : paid >= amount ? 'bg-success' : paid > 0 ? 'bg-warning' : 'bg-danger'
  return (
    <li className="flex items-start gap-2 text-label">
      {tone && <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', tone)} aria-hidden />}
      <span className="min-w-0 flex-1 text-fg-2">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-fg-2">
        {paid != null ? `${formatMoney(paid)} з ${formatMoney(amount)}` : formatMoney(amount)}
      </span>
    </li>
  )
}

function DepositV0({ rent }: { rent: Rent }) {
  const m = prodMoney(rent)
  return (
    <Card title="Застава">
      <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-label tabular-nums">
        <dt className="text-muted-fg">До внесення</dt>
        <dd className="text-right text-fg">{formatMoney(m.depDue)}</dd>
        <dt className="text-muted-fg">Оплачено</dt>
        <dd className="text-right text-fg">{formatMoney(m.depPaid)}</dd>
      </dl>
    </Card>
  )
}

function DocsV0({ rent }: { rent: Rent }) {
  const docs = rent.invoices
  return (
    <Card title="Документи">
      {docs.length === 0 ? (
        <p className="text-label text-muted-fg">Документів ще немає — сформуйте перший кнопкою справа.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {docs.map((i) => (
            <li key={i.id} className="flex items-center gap-1.5 text-label text-fg-2">
              <FileText className="size-3 text-muted-fg" aria-hidden />
              {docTitleV0(rent, i)} {i.number ? `№ ${i.number}` : ''}
              {i.cancelled && <span className="text-muted-fg">анульовано</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
