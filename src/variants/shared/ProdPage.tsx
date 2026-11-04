import { useEffect, useState, type ReactNode } from 'react'
import { HandCoins, ListChecks, PackageCheck, Plus, Receipt, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { invoiceState, invoiceTotal, totals, unbilledCharges, vatFor } from '@/domain/money'
import { baseInvoice, depositInvoice } from '@/domain/prod'
import { useCard } from '@/features/rent/card-context'
import { StageRail } from '@/features/rent/StageRail'
import { formatMoney } from '@/lib/money'
import type { Invoice, Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargeForm } from './ChargeForm'
import { ChargesTable } from './ChargesTable'
import { ReceiptsTable } from './ReceiptsTable'
import { PrintIcons, StatusBadge } from './invoice-parts'
import { DraftStage, HandoverControls, OutOfScope, Positions, Section, ToClosing } from './stage-blocks'

/**
 * Сторінка кроку нових варіантів = сторінка варіанта 0, а не нова. Той самий
 * хребет вузлів (`StageRail`), ті самі «Рахунки до оплати», «Нарахування та
 * знижки», «Прийом коштів», «Реєстр платежів», «Видача»; на «В роботі» —
 * «Обладнання в оренді», нарахування, «Перейти до закриття».
 *
 * Варіант міняє тільки те, що стосується рахунків, і тільки через слоти:
 * де лежать усі рахунки, чим їх виписують, як показане продовження.
 */
export interface ProdSlots {
  /** Рядок під картками «Рахунки до оплати»: куди йти по всі рахунки. */
  cardsFooter?: ReactNode
  /** Додатковий вузол хребта між «Нарахуваннями» і «Прийомом коштів» (C). Має бути `StageRail.Step`. */
  invoicesNode?: ReactNode
  /** Той самий блок на «В роботі», над нарахуваннями (C). */
  activeBlock?: ReactNode
  /** Блок рахунків на закритій оренді: рахунок відкривається й друкується звідти (C). */
  closedBlock?: ReactNode
  /** Футер картки «Обладнання в оренді»: продовження (а) чи «вистачить до» (б). */
  equipmentFooter?: ReactNode
  /** «У рахунок» на невиставленому нарахуванні. */
  onChargeInvoice?: (chargeId?: string) => void
  /** Де лежать рахунки — для тексту переходу з оформлення. */
  where: string
  /** Що показати на закритій оренді під обладнанням. */
  closedNote: string
}

export function ProdPage({ stage, slots }: { stage: StageKey; slots: ProdSlots }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return <DraftStage rent={rent} where={slots.where} />
    case 'payment':
      return <PaymentPage rent={rent} slots={slots} />
    case 'active':
      return <ActivePage rent={rent} slots={slots} />
    case 'closing':
      return rent.status === 'CLOSED' ? (
        <div className="flex flex-col gap-4" data-step="closed">
          <Positions rent={rent} footer={<p className="text-label text-muted-fg">{slots.closedNote}</p>} />
          {slots.closedBlock}
          <Section title="Прийом коштів">
            <ReceiptsTable rent={rent} />
          </Section>
        </div>
      ) : (
        <OutOfScope text="Повернення і закриття поза скоупом прототипу." />
      )
    default:
      return <OutOfScope text="Видача поза скоупом прототипу." />
  }
}

/* ── Нарахування: форма і таблиця ───────────────────────────────────── */

function useChargeForm() {
  const { errand, setErrand } = useCard()
  const [form, setForm] = useState(false)
  // Вхід з рейлу «+ Додати нарахування» веде на крок з уже розкритою формою.
  useEffect(() => {
    if (errand) {
      setForm(true)
      setErrand(null)
    }
  }, [errand, setErrand])
  return [form, setForm] as const
}

function ChargesBlock({ rent, slots, form, setForm }: { rent: Rent; slots: ProdSlots; form: boolean; setForm: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {form && (
        <div className="overflow-hidden rounded-lg border border-border bg-card" data-testid="charge-form-wrap">
          <ChargeForm
            className="border-b-0"
            onClose={(thenInvoice) => {
              setForm(false)
              if (thenInvoice && slots.onChargeInvoice) slots.onChargeInvoice()
            }}
          />
        </div>
      )}
      <ChargesTable rent={rent} onInvoice={slots.onChargeInvoice} />
    </div>
  )
}

function ChargeButtons({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={onOpen} data-testid="add-charge">
        <Plus aria-hidden />
        Додати нарахування
      </Button>
      <Button size="sm" variant="secondary" onClick={onOpen}>
        <Plus aria-hidden />
        Додати знижку
      </Button>
    </div>
  )
}

/* ── Крок «Оплата» ──────────────────────────────────────────────────── */

function PaymentPage({ rent, slots }: { rent: Rent; slots: ProdSlots }) {
  const [form, setForm] = useChargeForm()
  const t = totals(rent)
  const live = rent.invoices.filter((i) => !i.cancelled)
  const paidAny = rent.payments.some((p) => p.booked && p.invoiceId)
  const allPaid = live.length > 0 && live.every((i) => ['paid', 'overpaid'].includes(invoiceState(rent, i).kind))
  const open = unbilledCharges(rent)
  const chargesStatus = form ? 'Додавання' : open.length ? 'Нараховано' : rent.charges.length ? 'Оплачено' : undefined
  const intakeStatus = allPaid ? 'Оплачено' : paidAny ? 'Часткова оплата' : 'До приймання'
  const pays = rent.payments.filter((p) => p.booked)

  return (
    <div className="flex flex-col gap-3" data-step="payment">
      <StageRail testId="payment-rail">
        <StageRail.Step key="inv" tone="done" icon={Receipt} label="Рахунки до оплати" heading>
          <AccountCards rent={rent} />
          {slots.cardsFooter}
        </StageRail.Step>
        {slots.invoicesNode}
        <StageRail.Step
          key="charges"
          tone={open.length ? 'partial' : 'done'}
          icon={ListChecks}
          label="Нарахування та знижки"
          heading
          headingStatus={chargesStatus}
          aside={<ChargeButtons onOpen={() => setForm(true)} />}
        >
          <ChargesBlock rent={rent} slots={slots} form={form} setForm={setForm} />
        </StageRail.Step>
        <StageRail.Step
          key="intake"
          tone={allPaid ? 'done' : paidAny ? 'partial' : 'ready'}
          icon={Wallet}
          label="Прийом коштів"
          heading
          headingStatus={intakeStatus}
          aside={
            <span className="text-title font-semibold tabular-nums" data-amount-due="intake">
              {formatMoney(t.left)}
            </span>
          }
        >
          <ReceiptsTable rent={rent} />
        </StageRail.Step>
        <StageRail.Step key="registry" tone={pays.length ? 'done' : 'idle'} icon={HandCoins} label="Реєстр платежів">
          <p className="text-body text-muted-fg">
            {pays.length ? `Прийнято ${formatMoney(pays.reduce((s, p) => s + p.amount, 0))}` : 'Платежів ще не було'} ·{' '}
            <span className="text-accent-fg">Реєстр платежів →</span>
          </p>
        </StageRail.Step>
        <StageRail.Step key="handover" tone="idle" icon={PackageCheck} label="Видача">
          <HandoverControls rent={rent} />
        </StageRail.Step>
      </StageRail>
    </div>
  )
}

/**
 * Картки «Рахунок оренди» і «Рахунок застави», як у проді: назва, мітка ПДВ,
 * сума. Додано статус і друк, бо рахунок тепер окремий документ з номером 1С.
 * Решту рахунків (доплати, продовження, період) тримає місце варіанта.
 */
function AccountCards({ rent }: { rent: Rent }) {
  const rate = vatFor(rent, true)
  const base = baseInvoice(rent)
  const dep = depositInvoice(rent)
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="account-cards">
      <AccountCard rent={rent} title="Рахунок оренди" badge={rate ? 'з ПДВ' : 'без ПДВ'} inv={base} />
      <AccountCard rent={rent} title="Рахунок застави" badge="без ПДВ" inv={dep} />
    </div>
  )
}

function AccountCard({ rent, title, badge, inv }: { rent: Rent; title: string; badge: string; inv?: Invoice }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5" data-testid="account-card">
      <div className="flex items-center gap-2">
        <span className="text-body font-medium text-fg">{title}</span>
        <Badge variant="outline">{badge}</Badge>
        {inv && (
          <span className="ml-auto flex items-center gap-0.5">
            <PrintIcons inv={inv} />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-title font-semibold tabular-nums">{inv ? formatMoney(invoiceTotal(inv)) : '—'}</p>
        {inv && <StatusBadge rent={rent} inv={inv} />}
        {inv && inv.numberState === 'pending' && <span className="text-label text-muted-fg">№ очікується</span>}
        {inv && inv.numberState === 'ok' && <span className="text-label tabular-nums text-muted-fg">№ {inv.number}</span>}
      </div>
    </div>
  )
}

/* ── Етап «В роботі» ────────────────────────────────────────────────── */

function ActivePage({ rent, slots }: { rent: Rent; slots: ProdSlots }) {
  const [form, setForm] = useChargeForm()
  return (
    <div className="flex flex-col gap-3" data-step="active">
      <Positions rent={rent} title="Обладнання в оренді" footer={slots.equipmentFooter} />
      {slots.activeBlock}
      <Section title="Нарахування та знижки" aside={<ChargeButtons onOpen={() => setForm(true)} />} testId="charges-section">
        <ChargesBlock rent={rent} slots={slots} form={form} setForm={setForm} />
      </Section>
      <Section title="Прийом коштів" testId="payments-section">
        <ReceiptsTable rent={rent} />
      </Section>
      <ToClosing />
    </div>
  )
}
