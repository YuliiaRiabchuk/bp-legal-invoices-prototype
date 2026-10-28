import type { ReactNode } from 'react'
import { ArrowRight, HandCoins, PackageCheck, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { daysIncl, depositLines, fmtDate, invoiceState, rentLines, vatFor } from '@/domain/money'
import { StageRail, type StageTone } from '@/features/rent/StageRail'
import { useLab } from '@/lab/lab-state'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import type { Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { PaymentsLedger } from './Ledger'
import { Proposal } from './Proposal'

/**
 * Будівельні блоки лівої колонки нових варіантів. Варіанти складають з них
 * свій крок: що з цього стоїть і в якому порядку — рішення варіанта, а вигляд
 * обладнання, видачі й надходжень однаковий, щоб виміри порівнювали
 * структуру, а не дрібниці.
 */

export function OutOfScope({ text }: { text: string }) {
  return (
    <p className="px-1 py-4 text-body text-muted-fg" data-testid="out-of-scope">
      {text}
    </p>
  )
}

export function Section({ title, aside, children, testId }: { title: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
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
export function Positions({ rent, footer }: { rent: Rent; footer?: ReactNode }) {
  const rate = vatFor(rent, true)
  const total = daysIncl(rent.issueAt, rent.returnAt)
  const day = Math.min(total, Math.max(1, daysIncl(rent.issueAt, rent.today)))
  const started = !['DRAFT', 'PENDING_PAYMENT', 'PENDING_HANDOVER'].includes(rent.status)
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

/** Оформлення: обладнання і перехід до оплати, який сам формує оренду й заставу (D1). */
export function DraftStage({ rent, where }: { rent: Rent; where: string }) {
  const { dispatch } = useStore()
  const { setStage } = useLab()
  return (
    <div className="flex flex-col gap-3" data-step="draft">
      <Positions
        rent={rent}
        footer={
          rent.status === 'DRAFT' ? (
            <div className="flex items-center gap-3">
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-label text-muted-fg">
                Перехід до оплати сам сформує два рахунки: оренду з ПДВ і заставу без ПДВ. Вони з’являться {where}.
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

/** Попередження перед видачею (C4): гейтів немає, видача на розсуд менеджера. */
export function handoverWarnings(rent: Rent): string[] {
  const live = rent.invoices.filter((i) => !i.cancelled)
  const paidAny = rent.payments.some((p) => p.booked && p.invoiceId)
  const depUnpaid = live.some((i) => i.kind === 'deposit' && invoiceState(rent, i).kind !== 'paid')
  return [
    !paidAny && 'Оплати ще немає. Видача на ваш розсуд: борг лишиться на рахунках.',
    paidAny && depUnpaid && 'Застава ще не оплачена.',
    !rent.counterparty.director && 'У реквізитах клієнта немає ПІБ директора.',
  ].filter(Boolean) as string[]
}

export function HandoverControls({ rent }: { rent: Rent }) {
  const { dispatch } = useStore()
  const { setStage } = useLab()
  const warnings = handoverWarnings(rent)
  return (
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
  )
}

/** Стан рахунків одним реченням — без сум: сума до сплати живе в одному місці варіанта. */
export function invoicesSentence(rent: Rent, where: string): { tone: StageTone; status: string; text: string } {
  const live = rent.invoices.filter((i) => !i.cancelled)
  const failed = live.some((i) => i.numberState === 'failed')
  const pending = live.some((i) => i.numberState === 'pending')
  const numbers = live.filter((i) => i.number).map((i) => `№ ${i.number}`)
  if (failed)
    return { tone: 'attention', status: 'Номер не прийшов', text: `1С не присвоїла номер. Друк і PDF недоступні, доки номер не прийде; деталі — ${where}.` }
  if (pending)
    return { tone: 'waiting', status: '№ очікується', text: `Оренда і застава сформовані на переході до оплати. Друкарська форма відкриється сама, щойно 1С присвоїть номер.` }
  return { tone: 'done', status: `${live.length} сформовано`, text: `Рахунки ${numbers.join(' і ')} готові: друк і PDF — ${where}.` }
}

/**
 * Крок «Оплата» нових варіантів: рахунки одним реченням (самі рахунки —
 * там, де їх тримає варіант), надходження з банку і видача без гейтів.
 */
export function PaymentStage({
  rent,
  where,
  whereNote,
  invoicesAction,
  showPayments = true,
}: {
  rent: Rent
  /** Де лежать рахунки: «на картках у рейлі праворуч». */
  where: string
  whereNote: string
  invoicesAction?: ReactNode
  showPayments?: boolean
}) {
  const live = rent.invoices.filter((i) => !i.cancelled)
  const states = live.map((i) => invoiceState(rent, i).kind)
  const paidAny = rent.payments.some((p) => p.booked && p.invoiceId)
  const allPaid = live.length > 0 && states.every((k) => k === 'paid' || k === 'overpaid')
  const inv = invoicesSentence(rent, where)
  return (
    <div className="flex flex-col gap-3" data-step="payment">
      <StageRail testId="payment-rail">
        <StageRail.Step key="inv" tone={inv.tone} icon={Receipt} label="Рахунки" heading headingStatus={inv.status} aside={invoicesAction}>
          <p className="flex flex-wrap items-center gap-1.5 text-body text-fg-2">
            {inv.text}
            <Proposal note={whereNote} />
          </p>
        </StageRail.Step>
        {showPayments && (
          <StageRail.Step key="money" tone={allPaid ? 'done' : paidAny ? 'partial' : 'ready'} icon={HandCoins} label="Надходження" heading headingStatus={allPaid ? 'Оплачено' : paidAny ? 'Частково' : 'Чекаємо платіжку'}>
            <PaymentsLedger rent={rent} />
          </StageRail.Step>
        )}
        <StageRail.Step key="handover" tone="idle" icon={PackageCheck} label="Видача">
          <HandoverControls rent={rent} />
        </StageRail.Step>
      </StageRail>
    </div>
  )
}

/** «Перейти до закриття» — кінець кроку «В роботі». */
export function ToClosing() {
  const { dispatch } = useStore()
  return (
    <div className="flex justify-end">
      <Button variant="secondary" onClick={() => dispatch({ type: 'SET_STATUS', status: 'AWAITING_CLOSURE' })}>
        Перейти до закриття
      </Button>
    </div>
  )
}
