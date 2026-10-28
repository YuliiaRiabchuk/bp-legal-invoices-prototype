import { ArrowRight, HandCoins, PackageCheck, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { daysIncl, depositLines, fmtDate, invoiceState, rentLines, vatFor } from '@/domain/money'
import { StageRail, type StageTone } from '@/features/rent/StageRail'
import { useLab } from '@/lab/lab-state'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import type { Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargesLedger, PaymentsLedger } from '../shared/Ledger'
import { Proposal } from '../shared/Proposal'

/**
 * Ліва колонка варіанта B. Рахунків тут немає зовсім — вони в рейлі на
 * всіх етапах, тому крок не дублює ні суму до сплати, ні дії з рахунком.
 * Крок тримає те, що до рахунку не належить: обладнання, нарахування як
 * реєстр, гроші, що прийшли, і перехід далі.
 */
export function RentTabB({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return <DraftB rent={rent} />
    case 'payment':
      return <PaymentB rent={rent} />
    case 'active':
      return <ActiveB rent={rent} />
    case 'closing':
      return rent.status === 'CLOSED' ? <ClosedB rent={rent} /> : <OutOfScope text="Повернення і закриття поза скоупом прототипу. Рахунки — у рейлі праворуч." />
    default:
      return <OutOfScope text="Видача поза скоупом прототипу. Рахунки — у рейлі праворуч." />
  }
}

function OutOfScope({ text }: { text: string }) {
  return (
    <p className="px-1 py-4 text-body text-muted-fg" data-testid="out-of-scope">
      {text}
    </p>
  )
}

function Section({ title, aside, children, testId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-1.5" data-testid={testId}>
      <header className="flex min-h-7 items-center gap-2 px-1">
        <h2 className="text-title font-semibold text-fg">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** Обладнання з цінами: дві колонки, без ПДВ і з ПДВ (C8). */
function Positions({ rent, footer }: { rent: Rent; footer?: React.ReactNode }) {
  const rate = vatFor(rent, true)
  const total = daysIncl(rent.issueAt, rent.returnAt)
  const day = Math.min(total, Math.max(1, daysIncl(rent.issueAt, rent.today)))
  const started = rent.status !== 'DRAFT' && rent.status !== 'PENDING_PAYMENT' && rent.status !== 'PENDING_HANDOVER'
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="positions">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold">Обладнання</h2>
        <span className="text-label tabular-nums text-muted-fg">
          {fmtDate(rent.issueAt)} — {fmtDate(rent.returnAt)}, {started ? `${day}-а доба з ${total}` : daysWord(total)}
        </span>
      </header>
      <table className="w-full text-body tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-label text-muted-fg">
            <th className="px-4 py-1.5 font-medium">Номенклатура</th>
            <th className="px-3 py-1.5 text-right font-medium">Доба без ПДВ</th>
            <th className="px-3 py-1.5 text-right font-medium">з ПДВ</th>
            <th className="px-4 py-1.5 text-right font-medium">Застава</th>
          </tr>
        </thead>
        <tbody>
          {rent.positions.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2 text-fg">
                {p.name} <span className="text-muted-fg">× {p.qty}</span>
              </td>
              <td className="px-3 py-2 text-right text-fg-2">{formatMoney(p.pricePerDay)}</td>
              <td className="px-3 py-2 text-right text-fg">{formatMoney(p.pricePerDay * (1 + rate / 100))}</td>
              <td className="px-4 py-2 text-right text-fg-2">{formatMoney(p.deposit * p.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <footer className="border-t border-border px-4 py-2.5">{footer}</footer>}
    </section>
  )
}

/* ─── Оформлення ───────────────────────────────────────────────────────── */

function DraftB({ rent }: { rent: Rent }) {
  const { dispatch } = useStore()
  const { setStage } = useLab()
  const draft = rent.status === 'DRAFT'
  return (
    <div className="flex flex-col gap-3" data-step="draft">
      <Positions
        rent={rent}
        footer={
          draft ? (
            <div className="flex items-center gap-3">
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-label text-muted-fg">
                Перехід до оплати сам сформує два рахунки: оренду з ПДВ і заставу без ПДВ.
                <Proposal note="Перші два рахунки створюються автоматично, подальші — дією менеджера." />
              </p>
              <Button
                data-main-action="to-payment"
                data-testid="to-payment"
                onClick={() => {
                  const days = daysIncl(rent.issueAt, rent.returnAt)
                  dispatch({ type: 'START_PAYMENT', rentLines: rentLines(rent, days, 'auto'), depositLines: depositLines(rent, 'auto') })
                  setStage('payment')
                }}
              >
                До оплати
                <ArrowRight aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="text-label text-muted-fg">Оформлення завершено. Усе, що впливає на гроші, міняється тут, а не на кроці оплати.</p>
          )
        }
      />
    </div>
  )
}

/* ─── Оплата ───────────────────────────────────────────────────────────── */

function PaymentB({ rent }: { rent: Rent }) {
  const { dispatch } = useStore()
  const { setStage } = useLab()
  const live = rent.invoices.filter((i) => !i.cancelled)
  const states = live.map((i) => invoiceState(rent, i).kind)
  const failed = live.some((i) => i.numberState === 'failed')
  const pending = live.some((i) => i.numberState === 'pending')
  const paidAny = rent.payments.some((p) => p.booked && p.invoiceId)
  const allPaid = live.length > 0 && states.every((k) => k === 'paid' || k === 'overpaid')
  const invTone: StageTone = failed ? 'attention' : pending ? 'waiting' : 'done'
  const payTone: StageTone = allPaid ? 'done' : paidAny ? 'partial' : 'ready'
  const depUnpaid = live.some((i) => i.kind === 'deposit' && invoiceState(rent, i).kind !== 'paid')
  const warnings = [
    !paidAny && 'Оплати ще немає. Видача на ваш розсуд: борг лишиться на рахунках.',
    paidAny && depUnpaid && 'Застава ще не оплачена.',
    !rent.counterparty.director && 'У реквізитах клієнта немає ПІБ директора.',
  ].filter(Boolean) as string[]
  const numbers = live.filter((i) => i.number).map((i) => `№ ${i.number}`)

  return (
    <div className="flex flex-col gap-3" data-step="payment">
      <StageRail testId="b-payment-rail">
        <StageRail.Step
          key="inv"
          tone={invTone}
          icon={Receipt}
          label="Рахунки"
          heading
          headingStatus={failed ? 'Номер не прийшов' : pending ? '№ очікується' : `${live.length} сформовано`}
        >
          <p className="flex flex-wrap items-center gap-1.5 text-body text-fg-2">
            {failed
              ? '1С не присвоїла номер. Друк і PDF недоступні, доки номер не прийде; деталі — на рахунку в рейлі.'
              : pending
                ? 'Оренда і застава сформовані на переході до оплати. Друкарська форма відкриється сама, щойно 1С присвоїть номер.'
                : `Рахунки ${numbers.join(' і ')} готові: друк і PDF — на картках у рейлі праворуч.`}
            <Proposal note="Рахунки живуть у рейлі на всіх етапах; крок оплати їх не дублює." />
          </p>
        </StageRail.Step>
        <StageRail.Step key="money" tone={payTone} icon={HandCoins} label="Надходження" heading headingStatus={allPaid ? 'Оплачено' : paidAny ? 'Частково' : 'Чекаємо платіжку'}>
          <PaymentsLedger rent={rent} />
        </StageRail.Step>
        <StageRail.Step key="handover" tone="idle" icon={PackageCheck} label="Видача">
          <div className="flex items-start gap-3">
            {warnings.length > 0 ? (
              <Callout variant="warning" className="min-w-0 flex-1 py-2" data-testid="handover-warnings">
                <ul className="flex flex-col gap-0.5 font-normal">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <p className="min-w-0 flex-1 text-body text-muted-fg">Перешкод для видачі немає.</p>
            )}
            <Button
              className="shrink-0"
              data-main-action="handover"
              data-testid="to-handover"
              onClick={() => {
                dispatch({ type: 'SET_STATUS', status: 'PENDING_HANDOVER' })
                setStage('handover')
              }}
            >
              <PackageCheck aria-hidden />
              До видачі
            </Button>
          </div>
        </StageRail.Step>
      </StageRail>
    </div>
  )
}

/* ─── В роботі ─────────────────────────────────────────────────────────── */

function ActiveB({ rent }: { rent: Rent }) {
  const { dispatch } = useStore()
  return (
    <div className="flex flex-col gap-4" data-step="active">
      <Positions
        rent={rent}
        footer={
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовження — рахунком на новий період у рейлі; блок «Оренда» показує, до якої дати вистачить грошей.
            <Proposal note="Кнопки «Продовжити оренду» у варіанті B немає (продовження (б))." />
          </p>
        }
      />
      <Section title="Нарахування" testId="charges-section" aside={<Proposal note="Реєстр нарахувань з місцем кожного: у якому рахунку, оплачене готівкою чи ще не виставлене." />}>
        <ChargesLedger rent={rent} />
      </Section>
      <Section title="Надходження" testId="payments-section" aside={<Proposal note="Кожна платіжка називає свій рахунок. У проді біля платежу видно лише «Покриває: Оренда / Застава»." />}>
        <PaymentsLedger rent={rent} />
      </Section>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => dispatch({ type: 'SET_STATUS', status: 'AWAITING_CLOSURE' })}>
          Перейти до закриття
        </Button>
      </div>
    </div>
  )
}

/* ─── Закрита ──────────────────────────────────────────────────────────── */

function ClosedB({ rent }: { rent: Rent }) {
  return (
    <div className="flex flex-col gap-4" data-step="closed">
      <Positions rent={rent} footer={<p className="text-label text-muted-fg">Оренду закрито. Рахунки відкриваються й друкуються з рейлу, стан оренди від цього не змінюється.</p>} />
      <Section title="Надходження">
        <PaymentsLedger rent={rent} />
      </Section>
    </div>
  )
}
