import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarPlus, CircleAlert, HandCoins, ListChecks, PackageCheck, Plus, Receipt, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { addDays, canPrint, daysIncl, fmtDate, vatFor } from '@/domain/money'
import {
  baseInvoice,
  depositInvoice,
  depositNominal,
  prodMoney,
  prodPayments,
  rentNominal,
  unbilledGross,
} from '@/domain/prod'
import { useCard } from '@/features/rent/card-context'
import { StageRail } from '@/features/rent/StageRail'
import { useLab } from '@/lab/lab-state'
import { formatMoney } from '@/lib/money'
import { days as daysWord, plural } from '@/lib/plural'
import type { Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargeFormV0, ChargesTableV0 } from './ChargesV0'
import { MethodsV0 } from './MethodsV0'

/**
 * Варіант 0 — порт чинного проду ЮЛ (стара модель грошей) за кодом CRM
 * main від 27.10. Креслення: `reference/crm-legal-v0.md` (локально).
 * Рядки — дослівно з `locales/uk.po`. Вади проду портуються навмисно: це
 * антиреференс і база вимірів.
 */
export function RentTabV0({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  useTopupRow(rent)
  const m = prodMoney(rent)
  return (
    <div className="flex flex-col gap-3">
      {m.over > 0 && <OverpayV0 amount={m.over} />}
      {stage === 'payment' ? (
        <PaymentStageV0 />
      ) : stage === 'active' ? (
        <ActiveV0 />
      ) : (
        <p className="px-1 py-4 text-body text-muted-fg" data-testid="out-of-scope">
          {rent.status === 'CLOSED'
            ? 'Оренду закрито. Документи оренди — у вкладці «Документи».'
            : 'Цей етап поза скоупом прототипу.'}
        </p>
      )}
    </div>
  )
}

/**
 * Нарахування в проді йде в накопичувач доп. рахунку (ADR-0068): поки є
 * невиставлена доплата, на оренді живе рядок «Банківський переказ» на
 * «Дод. нарахування» з сумою накопичувача.
 */
function useTopupRow(rent: Rent) {
  const { dispatch } = useStore()
  const m = prodMoney(rent)
  const unbilled = Math.round(unbilledGross(rent))
  const open = rent.methodRows.find((r) => r.target === 'topup' && !r.invoiceId && r.method === 'bank')
  const due = Math.min(unbilled, m.topLeft)
  useEffect(() => {
    if (due > 0 && !open) dispatch({ type: 'ROW_ADD', row: { method: 'bank', target: 'topup', amount: due } })
    else if (open && due > 0 && open.amount !== due) dispatch({ type: 'ROW_PATCH', id: open.id, patch: { amount: due } })
    else if (open && due <= 0) dispatch({ type: 'ROW_REMOVE', id: open.id })
  }, [due, open, dispatch])
}

/** `detail/UlMoneyAdjustments.tsx`: переплата ЮЛ з «Повернути N» (без перевірки АВР і листа, N3). */
function OverpayV0({ amount }: { amount: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3" data-testid="v0-overpay">
      <CircleAlert className="size-4 shrink-0 text-warning-fg" aria-hidden />
      <p className="mr-auto text-body font-medium text-warning-fg">Переплата за орендою</p>
      <span className="text-body font-semibold tabular-nums text-warning-fg" data-amount-due="overpay">
        {formatMoney(amount)}
      </span>
      <Button size="sm" variant="secondary">
        Повернути {formatMoney(amount)}
      </Button>
    </div>
  )
}

/* ─── Етап «Оплата» ────────────────────────────────────────────────────── */

function PaymentStageV0() {
  const { rent, dispatch } = useStore()
  const { errand, setErrand, openPrint } = useCard()
  const { setStage } = useLab()
  const [form, setForm] = useState<'charge' | 'discount' | null>(errand)
  const [gate, setGate] = useState(false)
  useEffect(() => {
    if (errand) setForm(errand)
  }, [errand])
  const m = prodMoney(rent)
  const due = m.rentLeft + m.depLeft + m.topLeft
  const paidAny = prodPayments(rent).length > 0
  const base = baseInvoice(rent)
  const dep = depositInvoice(rent)
  const rate = vatFor(rent, true)
  const intakeStatus = due === 0 ? 'Оплачено' : paidAny ? 'Часткова оплата' : 'До приймання'
  const chargesStatus = form ? 'Додавання' : m.topLeft > 0 ? 'Нараховано' : rent.charges.length ? 'Оплачено' : undefined
  const pays = prodPayments(rent)

  return (
    <div className="flex flex-col gap-3" data-step="payment">
      {errand && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2" data-testid="errand-bar">
          <span className="text-body font-medium text-accent-fg">Нове нарахування</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setErrand(null)
              setForm(null)
              setStage('active')
            }}
          >
            <ArrowLeft aria-hidden />
            Повернутися в «В оренді»
          </Button>
        </div>
      )}
      <StageRail testId="v0-payment-rail">
        <StageRail.Step key="inv" tone="done" icon={Receipt} label="Рахунки до оплати" heading>
          <div className="grid gap-3 sm:grid-cols-2" data-testid="v0-invoice-cards">
            <InvoiceCard
              title="Рахунок оренди"
              badge={rate ? 'з ПДВ' : 'без ПДВ'}
              amount={rentNominal(rent)}
              onOpen={base && canPrint(base) ? () => openPrint(base) : undefined}
            />
            <InvoiceCard
              title="Рахунок застави"
              badge="без ПДВ"
              amount={depositNominal(rent)}
              onOpen={dep && canPrint(dep) ? () => openPrint(dep) : undefined}
            />
          </div>
        </StageRail.Step>
        <StageRail.Step
          key="charges"
          tone={m.topLeft > 0 ? 'partial' : 'done'}
          icon={ListChecks}
          label="Нарахування та знижки"
          heading
          headingStatus={chargesStatus}
          aside={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setForm('charge')} data-testid="v0-add-charge">
                <Plus aria-hidden />
                Додати нарахування
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setForm('discount')}>
                <Plus aria-hidden />
                Додати знижку
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {form && (
              <ChargeFormV0
                rent={rent}
                kind={form}
                onCancel={() => {
                  setForm(null)
                  setErrand(null)
                }}
                onDone={(goPay) => {
                  setForm(null)
                  setErrand(null)
                  if (goPay)
                    window.requestAnimationFrame(() =>
                      document.querySelector('[data-testid="methods-table"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                    )
                }}
              />
            )}
            <ChargesTableV0 rent={rent} />
          </div>
        </StageRail.Step>
        <StageRail.Step
          key="intake"
          tone={due === 0 ? 'done' : 'ready'}
          icon={Wallet}
          label="Прийом коштів"
          heading
          headingStatus={intakeStatus}
          aside={
            <span className="text-title font-semibold tabular-nums" data-amount-due="intake">
              {formatMoney(due)}
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            <MoneyBarV0 rent={rent} />
            <MethodsV0 />
          </div>
        </StageRail.Step>
        <StageRail.Step key="registry" tone={pays.length ? 'done' : 'idle'} icon={HandCoins} label="Реєстр платежів">
          <p className="text-body text-muted-fg">
            {pays.length
              ? `Прийнято ${formatMoney(pays.reduce((s, p) => s + p.amount, 0))} за ${pays.length} ${plural(pays.length, 'платіж', 'платежі', 'платежів')}`
              : 'Платежів ще не було'}{' '}
            · <span className="text-accent-fg">Реєстр платежів →</span>
          </p>
        </StageRail.Step>
        <StageRail.Step key="handover" tone="idle" icon={PackageCheck} label="Видача">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              Скасувати оренду…
            </Button>
            <Button
              className="ml-auto"
              data-main-action="handover"
              onClick={() => {
                if (!paidAny) setGate(true)
                else {
                  dispatch({ type: 'SET_STATUS', status: 'PENDING_HANDOVER' })
                  setStage('handover')
                }
              }}
            >
              <PackageCheck aria-hidden />
              До видачі
            </Button>
          </div>
        </StageRail.Step>
      </StageRail>

      <Dialog open={gate} onOpenChange={setGate}>
        <DialogContent data-testid="v0-gate">
          <DialogTitle className="text-headline font-semibold">Перейти до видачі без оплати?</DialogTitle>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-label text-muted-fg">Залишилося сплатити</p>
            <p className="text-title font-semibold tabular-nums" data-amount-due="gate">
              {formatMoney(due)}
            </p>
          </div>
          <DialogDescription>Оплата від юридичної особи ще не надійшла. Продовжити без оплати? Борг зберігається.</DialogDescription>
          <p className="text-body text-fg">Все одно перейти до видачі?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGate(false)}>
              Скасувати
            </Button>
            <Button
              onClick={() => {
                setGate(false)
                dispatch({ type: 'SET_STATUS', status: 'PENDING_HANDOVER' })
                setStage('handover')
              }}
            >
              Перейти до видачі
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** `InvoiceAccountCard`: сума статична (нараховано), дія — тільки скачування. */
function InvoiceCard({ title, badge, amount, onOpen }: { title: string; badge: string; amount: number; onOpen?: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-body font-medium text-fg">{title}</span>
        <Badge variant="outline">{badge}</Badge>
        {onOpen && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onOpen}>
            Рахунок ↓
          </Button>
        )}
      </div>
      <p className="mt-1 text-title font-semibold tabular-nums" data-amount-due="invoice-card">
        {formatMoney(amount)}
      </p>
    </div>
  )
}

/** MoneyBar: дві доріжки «Оренда» і «Застава». */
function MoneyBarV0({ rent }: { rent: Rent }) {
  const m = prodMoney(rent)
  const lanes = [
    { label: 'Оренда', due: m.rentDue + m.topDue, paid: m.rentPaid + m.topPaid },
    { label: 'Застава', due: m.depDue, paid: m.depPaid },
  ]
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="v0-moneybar">
      {lanes.map((l) => (
        <div key={l.label}>
          <div className="flex justify-between text-label text-muted-fg">
            <span>{l.label}</span>
            <span className="tabular-nums" data-amount-due="moneybar">
              {formatMoney(Math.max(0, l.due - l.paid))}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-success" style={{ width: `${l.due ? Math.min(100, (l.paid / l.due) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Етап «В оренді» ─────────────────────────────────────────────────── */

function ActiveV0() {
  const { rent, dispatch } = useStore()
  const [extending, setExtending] = useState(false)
  const m = prodMoney(rent)
  const total = daysIncl(rent.issueAt, rent.returnAt)
  const day = Math.min(total, daysIncl(rent.issueAt, rent.today))
  const showDoplata = m.debt > 0 || rent.methodRows.length > 0
  return (
    <div className="flex flex-col gap-3" data-step="active">
      <section className="rounded-lg border border-border bg-card" data-testid="v0-items">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-title font-semibold">Обладнання в оренді</h2>
          <span className="text-label text-muted-fg">
            {day}-а доба з {total}
          </span>
        </header>
        <ul>
          {rent.positions.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-border px-4 py-2 last:border-0">
              <span className="text-body text-fg">
                {p.name} <span className="text-muted-fg">× {p.qty}</span>
              </span>
              <span className="text-label tabular-nums text-muted-fg">{formatMoney(p.pricePerDay)} / доба без ПДВ</span>
            </li>
          ))}
        </ul>
        <footer className="border-t border-border px-4 py-2.5">
          {extending ? (
            <ChangeTermV0 onClose={() => setExtending(false)} />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setExtending(true)} data-testid="v0-extend" data-main-action="extend">
              <CalendarPlus aria-hidden />
              Продовжити оренду
            </Button>
          )}
        </footer>
      </section>

      {showDoplata && (
        <section className="flex flex-col gap-2" data-testid="v0-doplata">
          <h2 className="text-title font-semibold">Доплата</h2>
          <MethodsV0 only={['rent', 'topup']} />
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => dispatch({ type: 'SET_STATUS', status: 'AWAITING_CLOSURE' })}>
          Перейти до закриття
        </Button>
      </div>
    </div>
  )
}

/**
 * `detail/body/ChangeTermEditor.tsx`: нове планове повернення → рядок
 * доп. рахунку «Доплата за продовження (+N діб)». Окремого рахунку
 * продовження не випускає (N1).
 */
function ChangeTermV0({ onClose }: { onClose: () => void }) {
  const { rent, dispatch } = useStore()
  const [to, setTo] = useState(addDays(rent.returnAt, 1))
  const n = Math.max(0, daysIncl(rent.returnAt, to) - 1)
  const netRate = rent.positions.reduce((s, p) => s + p.qty * p.pricePerDay, 0)
  const rate = vatFor(rent, true)
  const perDay = netRate * (1 + rate / 100)
  return (
    <div className="flex flex-col gap-3" data-testid="v0-change-term">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-label text-muted-fg">
          Нове планове повернення
          <Input type="date" value={to} min={addDays(rent.returnAt, 1)} onChange={(e) => setTo(e.target.value)} className="w-44" data-testid="v0-return-date" />
        </label>
        <label className="flex flex-col gap-1 text-label text-muted-fg">
          Час повернення
          <Input value="18:00" readOnly className="w-24" />
        </label>
      </div>
      {n > 0 && (
        <div className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-body text-accent-fg">
          Продовження на {daysWord(n)}: {formatMoney(perDay)}/доба × {n} ={' '}
          <span className="font-semibold tabular-nums">+{formatMoney(perDay * n)}</span>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Скасувати
        </Button>
        <Button
          disabled={n <= 0}
          data-testid="v0-extend-submit"
          onClick={() => {
            dispatch({
              type: 'CHARGE_ADD',
              charge: {
                kind: 'charge',
                article: `Продовження ${fmtDate(to).slice(0, 5)}`,
                service: `Доплата за продовження (+${n} ${plural(n, 'доба', 'доби', 'діб')})`,
                net: netRate * n,
                vatable: true,
              },
            })
            dispatch({ type: 'EXTEND', to })
            onClose()
          }}
        >
          Продовжити строк
        </Button>
      </div>
    </div>
  )
}
