import { useEffect, useState } from 'react'
import {
  Banknote,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Download,
  FileText,
  Landmark,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/components/ui/toast'
import { canPrint, unbilledCharges, vatFor } from '@/domain/money'
import { compositionFor, paymentTarget, prodMoney, prodPayments, TARGET_LABEL } from '@/domain/prod'
import { useCard } from '@/features/rent/card-context'
import { printWithName } from '@/features/rent/print/PrintDialog'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import type { BankPayment, CashOrder, MethodRow, MethodTarget, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { CompositionModalV0 } from './CompositionModalV0'

/**
 * Порт таблиці «Прийом коштів» (`payment/MethodsSection.tsx`, `methods/*`).
 * Рахунок на оплату — НЕОБОВ'ЯЗКОВИЙ крок усередині рядка «Банківський
 * переказ» (BP-1507). Саме цю зв'язку бриф §2 називає болем.
 *
 * Колонки: Спосіб · Покриває · Статус · Сума · у т.ч. ПДВ · дія.
 */
export function MethodsV0({ only }: { only?: MethodTarget[] }) {
  const { rent } = useStore()
  const rows = rent.methodRows.filter((r) => !only || only.includes(r.target))
  const accepted = prodPayments(rent).filter((p) => !only || only.includes(paymentTarget(rent, p)))
  const cash = rent.cashOrders
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card" data-testid="methods-table">
      <div className="grid grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1.3fr)_6.5rem_5.5rem_8.5rem] gap-x-3 border-b border-border bg-muted/50 px-3 py-1.5 text-label text-muted-fg">
        <span>Спосіб</span>
        <span>Покриває</span>
        <span>Статус</span>
        <span className="text-right">Сума</span>
        <span className="text-right">у т.ч. ПДВ</span>
        <span />
      </div>
      {accepted.map((p) => (
        <AcceptedRow key={p.id} rent={rent} payment={p} />
      ))}
      {cash.map((c) => (
        <CashRow key={c.id} order={c} />
      ))}
      {rows.map((r) => (
        <DraftRow key={r.id} rent={rent} row={r} />
      ))}
      <AddMethod rent={rent} />
    </div>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1.3fr)_6.5rem_5.5rem_8.5rem] items-center gap-x-3 px-3 py-2'

function vatOf(rent: Rent, target: MethodTarget, amount: number) {
  const rate = target === 'deposit' ? 0 : vatFor(rent, true)
  return rate ? Math.round((amount * rate) / (100 + rate)) : 0
}

function AcceptedRow({ rent, payment: p }: { rent: Rent; payment: BankPayment }) {
  const t = paymentTarget(rent, p)
  return (
    <div className={cn(GRID, 'border-b border-border')} data-testid="accepted-row">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-body font-medium text-fg">
          <Landmark className="size-3.5 text-muted-fg" aria-hidden />
          Банківський переказ
        </p>
        <p className="truncate text-label text-muted-fg">{ORG_BY_ID[rent.orgId].name}</p>
      </div>
      <span className="text-body text-fg-2">{TARGET_LABEL[t]}</span>
      <div>
        <span className="inline-flex items-center gap-1 text-body text-success-fg">
          <Check className="size-3.5" aria-hidden />
          Підтверджено
        </span>
        {/* Номер рахунку біля платежу прод не показує (креслення §8). */}
        <p className="text-label text-muted-fg">{p.confirmedBy?.at}</p>
      </div>
      <span className="text-right text-body tabular-nums text-fg">{formatMoney(p.amount)}</span>
      <span className="text-right text-body tabular-nums text-muted-fg">{vatOf(rent, t, p.amount) ? formatMoney(vatOf(rent, t, p.amount)) : '—'}</span>
      <span />
    </div>
  )
}

function CashRow({ order }: { order: CashOrder }) {
  return (
    <div className={cn(GRID, 'border-b border-border')} data-testid="accepted-cash">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-body font-medium text-fg">
          <Banknote className="size-3.5 text-muted-fg" aria-hidden />
          Готівка
        </p>
        <p className="truncate text-label text-muted-fg">{ORG_BY_ID['fop-1'].name}</p>
      </div>
      <span className="text-body text-fg-2">Дод. нарахування</span>
      <div>
        <span className="inline-flex items-center gap-1 text-body text-success-fg">
          <Check className="size-3.5" aria-hidden />
          Підтверджено
        </span>
        <p className="text-label text-muted-fg">
          {order.number ? `Касовий ордер ${order.number}` : 'Очікуємо № від 1С — касовий ордер з\'явиться після присвоєння номера'}
        </p>
      </div>
      <span className="text-right text-body tabular-nums text-fg">{formatMoney(order.amount)}</span>
      <span className="text-right text-body text-muted-fg">—</span>
      <span />
    </div>
  )
}

function DraftRow({ rent, row }: { rent: Rent; row: MethodRow }) {
  const { dispatch } = useStore()
  const { openPrint } = useCard()
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const inv = row.invoiceId ? rent.invoices.find((i) => i.id === row.invoiceId) : undefined
  const vat = vatOf(rent, row.target, row.amount)
  const bank = row.method === 'bank'
  const status = inv ? 'Очікує надходження' : 'Очікує прийому'
  const steps = bank ? (vatFor(rent, true) && row.target !== 'deposit' ? 3 : 2) : 2

  // Стеля очікування номера (6 хв) у проді закінчується лише тостом (B6).
  const failed = inv?.numberState === 'failed'
  useEffect(() => {
    if (failed) toast('№ від 1С поки немає — відкрийте рахунок кнопкою в рядку, коли номер надійде')
  }, [failed])

  const confirm = () => {
    if (bank) dispatch({ type: 'ROW_CONFIRM', id: row.id })
    else dispatch({ type: 'ROW_CASH', id: row.id, purpose: 'Оплата додаткових нарахувань', chargeId: unbilledCharges(rent)[0]?.id })
  }

  return (
    <div className="border-b border-border" data-testid="method-row" data-target={row.target} data-method={row.method}>
      <div className={GRID}>
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Показати кроки способу"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            data-testid="row-chevron"
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-body font-medium text-fg">
              {bank ? <Landmark className="size-3.5 text-muted-fg" aria-hidden /> : <Banknote className="size-3.5 text-muted-fg" aria-hidden />}
              {bank ? 'Банківський переказ' : 'Готівка'}
            </p>
            <p className="truncate text-label text-muted-fg">{bank ? ORG_BY_ID[rent.orgId].name : (row.cashbox ?? 'Каса')}</p>
          </div>
        </div>
        <span className="text-body text-fg-2">{TARGET_LABEL[row.target]}</span>
        <div>
          <span className={cn('inline-flex items-center gap-1 text-body', inv ? 'text-accent-fg' : 'text-muted-fg')}>
            {inv ? <Clock className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
            {status}
          </span>
          <p className="text-label text-muted-fg">
            крок {inv ? 2 : 1} з {steps}
          </p>
        </div>
        <span className="text-right text-body tabular-nums text-fg">{row.amount ? formatMoney(row.amount) : '—'}</span>
        <span className="text-right text-body tabular-nums text-muted-fg">{vat ? formatMoney(vat) : '—'}</span>
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={confirm} aria-label={`Підтвердити ${formatMoney(row.amount)}`} data-testid="row-confirm" disabled={!row.amount}>
            <Check aria-hidden />
            {bank ? 'Підтвердити' : 'Прийняти'}
          </Button>
          <Button size="icon" variant="ghost" aria-label="Видалити спосіб" onClick={() => (inv ? setRemoving(true) : dispatch({ type: 'ROW_REMOVE', id: row.id }))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-4 border-t border-border bg-muted/30 px-3 py-3" data-testid="row-steps">
          <section className="rounded-md border border-border bg-card p-3">
            <h4 className="text-label font-semibold text-fg-2">Документи та прийом</h4>
            <p className="mt-2 text-body text-fg">{TARGET_LABEL[row.target]}</p>
            <p className="text-label text-muted-fg">
              {formatMoney(row.amount)} з {formatMoney(row.amount)}
            </p>
            <p className="mt-2 text-label text-muted-fg">{row.target === 'deposit' ? 'Без ПДВ' : `ПДВ ${vatFor(rent, true)}%`}</p>
          </section>
          <ol className="flex flex-col gap-3">
            {bank && vat > 0 && (
              <li className="text-body text-fg-2">
                <span className="font-medium text-fg">ПДВ нараховано {vatFor(rent, true)} %</span>
                <span className="ml-2 text-label text-muted-fg tabular-nums">
                  без ПДВ {formatMoney(row.amount - vat)} · ПДВ {formatMoney(vat)} · до сплати {formatMoney(row.amount)}
                </span>
              </li>
            )}
            {bank && (
              <li>
                <p className="flex items-center gap-2 text-body font-medium text-fg">
                  <FileText className="size-4 text-muted-fg" aria-hidden />
                  {inv ? 'Рахунок на оплату сформовано' : 'Сформувати рахунок на оплату'}
                  {!inv && <span className="text-label font-normal text-muted-fg">Необов'язково</span>}
                </p>
                <div className="mt-1.5 pl-6">
                  {!inv && (
                    <Button size="sm" variant="secondary" onClick={() => setComposing(true)} data-testid="row-form-invoice" data-main-action="invoice">
                      <FileText aria-hidden />
                      Сформувати рахунок
                    </Button>
                  )}
                  {inv?.numberState === 'pending' && (
                    <p className="flex items-center gap-2 text-label text-muted-fg" data-testid="v0-awaiting-number">
                      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                      Очікуємо № від 1С — друк буде доступний після присвоєння
                    </p>
                  )}
                  {inv && inv.numberState !== 'pending' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2" data-testid="step-document">
                      <span className="grid size-7 place-items-center rounded-sm bg-danger-soft text-mono font-semibold text-danger-fg">PDF</span>
                      <span className="mr-auto text-body text-fg">
                        Рахунок на оплату{inv.number ? ` № ${inv.number}` : ''}
                        <span className="block text-label text-muted-fg">Додано в документи оренди</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setComposing(true)}>
                        <Pencil aria-hidden />
                        Редагувати рахунок
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!canPrint(inv)} onClick={() => printWithName(inv)}>
                        <Download aria-hidden />
                        Завантажити документ
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!canPrint(inv)} onClick={() => openPrint(inv)} data-testid="step-document-print">
                        <Printer aria-hidden />
                        Друк документа
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )}
            <li>
              <p className="flex items-center gap-2 text-body font-medium text-fg">
                <span className="grid size-5 place-items-center rounded-full border border-border-strong text-mono">1</span>
                {bank ? 'Очікуємо надходження' : 'Прийняти готівку в касу'}
              </p>
              <div className="mt-1.5 pl-7">
                <Button size="sm" onClick={confirm} disabled={!row.amount}>
                  <Check aria-hidden />
                  {bank ? 'Підтвердити' : 'Прийняти'}
                </Button>
              </div>
            </li>
            {!bank && (
              <li className="flex items-center gap-2 text-body text-muted-fg">
                <Lock className="size-3.5" aria-hidden />
                Касовий ордер буде виписано
                <span className="inline-flex items-center gap-1 text-label">
                  <Zap className="size-3" aria-hidden />
                  Автоматично
                </span>
              </li>
            )}
          </ol>
        </div>
      )}

      {composing && (
        <CompositionModalV0
          open
          amount={row.amount}
          initial={inv ? inv.lines : compositionFor(rent, row, `c${row.id}`)}
          onClose={() => setComposing(false)}
          onSubmit={(lines) => {
            dispatch({ type: 'ROW_INVOICE', id: row.id, lines })
            setComposing(false)
            setOpen(true)
            if (!inv) toast('Рахунок сформовано — очікуємо № від 1С', 'Друк буде доступний після присвоєння номера.')
          }}
        />
      )}

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogTitle className="text-headline font-semibold">Зняти рахунок № {inv?.number ?? '—'}?</DialogTitle>
          <DialogDescription>
            Спосіб оплати буде видалено разом із рахунком. Документ залишиться в оренді як анульований — номер із загальної нумерації не зникне.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(false)}>
              Залишити як є
            </Button>
            <Button
              variant="danger"
              data-testid="remove-method-confirm"
              onClick={() => {
                dispatch({ type: 'ROW_REMOVE', id: row.id })
                setRemoving(false)
              }}
            >
              Видалити спосіб
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** «+ Додати спосіб» з поповером «Чим платить» (`methods/MethodSetupPopover.tsx`). */
function AddMethod({ rent }: { rent: Rent }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'bank' | 'cash'>('bank')
  const m = prodMoney(rent)
  const targets: { t: MethodTarget; left: number }[] = [
    { t: 'rent' as const, left: m.rentLeft },
    { t: 'deposit' as const, left: m.depLeft },
    { t: 'topup' as const, left: m.topLeft },
  ].filter((x) => x.left > 0)
  const [target, setTarget] = useState<MethodTarget | null>(null)
  const chosen = target ?? targets[0]?.t ?? 'rent'
  const left = targets.find((x) => x.t === chosen)?.left ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-body text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          data-testid="add-method"
        >
          <Plus className="size-3.5" aria-hidden />
          Додати спосіб
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3" data-testid="method-popover">
        <p className="text-label font-semibold text-fg-2">Чим платить</p>
        <div className="mt-1.5 flex flex-col gap-1">
          {(
            [
              ['bank', 'Банківський переказ'],
              ['cash', 'Готівка'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-body">
              <input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} data-testid={`method-radio-${k}`} />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-body text-subtle">
            <input type="radio" disabled />
            Термінал
          </label>
        </div>
        <p className="mt-3 text-label font-semibold text-fg-2">Зарахувати</p>
        <p className="text-label text-muted-fg">Рахунок, до якого зарахувати платіж</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {targets.map((x) => (
            <button
              key={x.t}
              type="button"
              onClick={() => setTarget(x.t)}
              className={cn('rounded-sm border px-2 py-0.5 text-label', chosen === x.t ? 'border-fg bg-fg text-primary-fg' : 'border-border')}
            >
              {TARGET_LABEL[x.t]}
            </button>
          ))}
          {targets.length === 0 && <span className="text-label text-muted-fg">Оренда вже оплачена</span>}
        </div>
        {method === 'cash' && (
          <>
            <p className="mt-3 text-label font-semibold text-fg-2">Мої каси</p>
            <label className="mt-1 flex items-center gap-2 text-body">
              <input type="radio" defaultChecked data-testid="cashbox-mine" />
              Каса Київ-Північ · {ORG_BY_ID[rent.fopId].name}
              <span className="text-label text-accent-fg">рекомендуємо</span>
            </label>
          </>
        )}
        <Button
          className="mt-3 w-full"
          disabled={!targets.length}
          data-testid="method-done"
          onClick={() => {
            dispatch({
              type: 'ROW_ADD',
              row: { method, target: chosen, amount: left, cashbox: method === 'cash' ? 'Каса Київ-Північ' : undefined },
            })
            setOpen(false)
          }}
        >
          Готово
        </Button>
      </PopoverContent>
    </Popover>
  )
}
