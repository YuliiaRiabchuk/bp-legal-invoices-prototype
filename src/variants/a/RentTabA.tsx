import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoiceState } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import { plural } from '@/lib/plural'
import type { Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargesLedger } from '../shared/Ledger'
import { Proposal } from '../shared/Proposal'
import { SummaryRail } from '../shared/SummaryRail'
import { DraftStage, OutOfScope, PaymentStage, Positions, Section, ToClosing } from '../shared/stage-blocks'

/**
 * Вкладка «Оренда» варіанта A. Рахунків тут немає: вони у вкладці «Рахунки»,
 * крок лише рахує їх словами й веде туди. Платіжки теж живуть у реєстрі —
 * під своїм рахунком.
 */
export function RentTabA({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return <DraftStage rent={rent} where="у вкладці «Рахунки»" />
    case 'payment':
      return (
        <PaymentStage
          rent={rent}
          where="у вкладці «Рахунки»"
          whereNote="Крок оплати рахунків не тримає: вони і платіжки під ними — у вкладці «Рахунки»."
          invoicesAction={<ToRegistry />}
          showPayments={false}
        />
      )
    case 'active':
      return <ActiveA rent={rent} />
    case 'closing':
      return rent.status === 'CLOSED' ? (
        <Positions rent={rent} footer={<p className="text-label text-muted-fg">Оренду закрито. Рахунки відкриваються й друкуються з вкладки «Рахунки», стан оренди від цього не змінюється.</p>} />
      ) : (
        <OutOfScope text="Повернення і закриття поза скоупом прототипу." />
      )
    default:
      return <OutOfScope text="Видача поза скоупом прототипу." />
  }
}

function ToRegistry({ label = 'Відкрити рахунки' }: { label?: string }) {
  const { setTab } = useCard()
  return (
    <Button size="sm" variant="secondary" onClick={() => setTab('Рахунки')} data-testid="to-registry">
      {label}
      <ArrowRight aria-hidden />
    </Button>
  )
}

function ActiveA({ rent }: { rent: Rent }) {
  const { setTab, setInvoiceErrand } = useCard()
  return (
    <div className="flex flex-col gap-4" data-step="active">
      <Positions
        rent={rent}
        footer={
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовження — кнопкою «Продовжити оренду» в шапці: вона одразу виписує рахунок на нові доби.
            <Proposal note="Продовження (а): кнопка створює рахунок на новий період і зсуває повернення." />
          </p>
        }
      />
      <Section title="Нарахування" testId="charges-section" aside={<Proposal note="Реєстр нарахувань з місцем кожного; невиставлене — одразу в рахунок або готівкою." />}>
        <ChargesLedger
          rent={rent}
          onInvoice={(id) => {
            setInvoiceErrand({ via: 'charge', chargeId: id })
            setTab('Рахунки')
          }}
        />
      </Section>
      <ToClosing />
    </div>
  )
}

/** Рейл A: замість сум — лічильник рахунків за станом і вхід у реєстр. */
export function RailA() {
  const { rent } = useStore()
  const live = rent.invoices.filter((i) => !i.cancelled)
  const count = (k: string[]) => live.filter((i) => k.includes(invoiceState(rent, i).kind)).length
  const waiting = count(['unpaid', 'number-pending'])
  const partial = count(['partial'])
  const failed = count(['number-failed'])
  const parts = [
    waiting && `${waiting} ${plural(waiting, 'чекає', 'чекають', 'чекають')} оплати`,
    partial && `${partial} з недоплатою`,
    failed && `${failed} без номера 1С`,
  ].filter(Boolean)
  return (
    <SummaryRail>
      <section className="rounded-lg border border-border bg-card px-3 py-2.5" data-testid="rail-a-invoices">
        <h2 className="flex items-center gap-2 text-body font-semibold text-fg">
          Рахунки
          <span className="text-label font-normal tabular-nums text-muted-fg">{live.length}</span>
        </h2>
        <p className="mt-1 text-label text-fg-2">{live.length === 0 ? 'Рахунків ще немає.' : parts.length ? parts.join(', ') : 'усі оплачені'}</p>
        <div className="mt-2">
          <ToRegistry label="Реєстр рахунків" />
        </div>
      </section>
    </SummaryRail>
  )
}
