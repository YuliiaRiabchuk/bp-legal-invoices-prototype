import { Fragment, useEffect, useRef, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtDay, invoiceState, invoiceTotal, onBalance, paidOf } from '@/domain/money'
import { invoiceBlocked, invoiceTitle, lastRentInvoice, nextPeriod, openCharges, totalsSplit } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { InvoiceComposer, type ComposerSeed } from '../shared/InvoiceComposer'
import { OpenCharges } from '../shared/OpenCharges'
import { Proposal } from '../shared/Proposal'
import { statusView } from '../shared/invoice-status'
import {
  CancelConfirm,
  CancelledLine,
  FailedNotice,
  InvoiceMenu,
  InvoiceTrail,
  NumberSlot,
  OverpayNote,
  PrintIcons,
  StatusBadge,
} from '../shared/invoice-parts'

/**
 * Варіант A — реєстр рахунків (`docs/shape.md` §4.A).
 *
 * Рахунок — окремий документ, і для нього є окреме місце: вкладка
 * «Рахунки» в шапці картки, таблиця, як журнал у бухгалтерії. Рядок
 * розкривається: платіжки, залишок, документи 1С. Рядок з недоплатою,
 * переплатою чи помилкою 1С розкритий одразу.
 *
 * Номери платіжок і документи 1С видно й у згорнутому рядку: реєстр — це
 * відповідь «яка оплата до якого рахунку» без розкриття кожного рядка.
 */
export function InvoicesTabA() {
  const { rent } = useStore()
  const { invoiceErrand, setInvoiceErrand } = useCard()
  const [seed, setSeed] = useState<ComposerSeed | null>(null)
  const nonce = useRef(0)
  const open = (s: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'mode' | 'nonce'> | { invoiceId: string }) => {
    nonce.current++
    setSeed('invoiceId' in s ? { mode: 'edit', invoiceId: s.invoiceId, nonce: nonce.current } : { mode: 'new', ...s, nonce: nonce.current })
  }
  // Доручення з вкладки «Оренда» (нарахування «У рахунок») — бланк одразу.
  useEffect(() => {
    if (!invoiceErrand) return
    open(invoiceErrand)
    setInvoiceErrand(null)
  }, [invoiceErrand, setInvoiceErrand])

  // Дві групи: те, що ще чогось чекає, — зверху, решта — журналом за датою.
  // На десяти рахунках неоплачений не має опинятись під згином.
  const byDate = [...rent.invoices].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.number ?? '9999').localeCompare(b.number ?? '9999')))
  const isOpen = (i: Invoice) => !['paid', 'cancelled'].includes(invoiceState(rent, i).kind)
  const waiting = byDate.filter(isOpen)
  const settled = byDate.filter((i) => !isOpen(i))
  const last = lastRentInvoice(rent)
  const t = totalsSplit(rent)
  const balance = onBalance(rent)
  const charges = openCharges(rent)
  const np = nextPeriod(rent)
  const blocked = invoiceBlocked(rent)
  const row = (inv: Invoice) => (
    <Row
      key={inv.id}
      rent={rent}
      inv={inv}
      onEdit={() => open({ invoiceId: inv.id })}
      onNextPeriod={last?.id === inv.id && rent.status !== 'CLOSED' ? () => open({ via: 'period' }) : undefined}
    />
  )

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="invoices-registry" aria-label="Рахунки оренди">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold text-fg">Рахунки</h2>
        <Proposal note="Окрема вкладка «Рахунки»: реєстр усіх рахунків оренди з платіжками й документами 1С під кожним." />
        <span className="ml-2 text-label text-muted-fg">одержувач — {rent.orgId === 'bp-ua' ? 'ТОВ «Будпрокат Україна»' : 'організація складу'}</span>
        <Button
          size="sm"
          className="ml-auto"
          variant={seed ? 'secondary' : 'default'}
          disabled={!!blocked}
          title={blocked ?? undefined}
          onClick={() => open({ via: 'button' })}
          data-testid="registry-new"
          data-main-action="invoice"
        >
          <Plus aria-hidden />
          Новий рахунок
        </Button>
      </header>

      {seed && (
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <InvoiceComposer key={seed.nonce} seed={seed} onClose={() => setSeed(null)} className="max-w-xl rounded-lg border border-border bg-card" />
        </div>
      )}
      {!seed && np.due && last && (
        <div className="flex items-center gap-3 border-b border-border bg-accent-soft/60 px-4 py-2" data-testid="registry-next-hint">
          <p className="text-body text-accent-fg">
            <span className="font-medium">Не виставлено з {fmtDay(np.from)}</span>
            <span className="text-fg-2"> — останній рахунок оренди № {last.number ?? '—'} закінчується {fmtDay(last.period!.to)}</span>
          </p>
          <Proposal note="Підказка з’являється, коли до кінця виставленого періоду менше 3 діб; копіює рядки останнього рахунку оренди." />
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => open({ via: 'period' })} data-testid="registry-next-period-hint">
            Копіювати на {fmtDay(np.from)}–{fmtDay(np.to)}
          </Button>
        </div>
      )}
      {!seed && charges.length > 0 && (
        <OpenCharges rent={rent} charges={charges} onInvoice={(id) => open({ via: 'charge', chargeId: id })} className="max-w-xl border-b border-border px-4 py-2.5" />
      )}

      {byDate.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-fg" data-testid="invoices-empty">
          Рахунків ще немає. Оренда і застава сформуються самі на переході до оплати.
        </p>
      ) : (
        <table className="w-full text-body tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-label text-muted-fg">
              <th className="w-8" aria-label="Розкрити" />
              <th className="w-32 px-2 py-1.5 font-medium">№</th>
              <th className="w-16 px-2 py-1.5 font-medium">Дата</th>
              <th className="px-2 py-1.5 font-medium">Що</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">Сума з ПДВ</th>
              <th className="w-44 px-2 py-1.5 font-medium">Оплачено</th>
              <th className="w-44 px-2 py-1.5 font-medium">Статус</th>
              <th className="w-28" aria-label="Дії" />
            </tr>
          </thead>
          {waiting.length > 0 && (
            <tbody>
              <GroupRow label={`Чекають оплати або номера — ${waiting.length}`} />
              {waiting.map(row)}
            </tbody>
          )}
          {settled.length > 0 && (
            <tbody>
              <GroupRow label={`Оплачені й скасовані — ${settled.length}`} />
              {settled.map(row)}
            </tbody>
          )}
          <tfoot className="text-label text-muted-fg">
            {/* Застава окремим рядком: з орендою вона обліково не сумується (§3). */}
            <tr className="border-t border-border-strong">
              <td colSpan={4} className="px-4 pt-2">
                Оренда і послуги, з ПДВ
              </td>
              <td className="px-2 pt-2 text-right text-body font-medium text-fg">{formatMoney(t.main.issued)}</td>
              <td className="px-2 pt-2 text-body text-fg">{formatMoney(t.main.paid)}</td>
              <td colSpan={2} className="px-2 pt-2">
                {balance > 0 ? `на балансі ${formatMoney(balance)}` : ''}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 pb-2">
                Застава, без ПДВ
              </td>
              <td className="px-2 pb-2 text-right text-body font-medium text-fg">{formatMoney(t.deposit.issued)}</td>
              <td className="px-2 pb-2 text-body text-fg">{formatMoney(t.deposit.paid)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

function Row({ rent, inv, onEdit, onNextPeriod }: { rent: Rent; inv: Invoice; onEdit: () => void; onNextPeriod?: () => void }) {
  const view = statusView(rent, inv)
  const k = view.state.kind
  const [open, setOpen] = useState(k === 'partial' || k === 'overpaid' || k === 'number-failed')
  const [cancelling, setCancelling] = useState(false)
  const off = k === 'cancelled'
  const expanded = open || cancelling
  const paid = paidOf(rent, inv)
  return (
    <Fragment>
      <tr
        className={cn('border-b border-border align-top', expanded && 'border-b-0 bg-muted/30')}
        data-testid="registry-row"
        data-number={inv.number ?? ''}
      >
        <td className="py-2 pl-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Згорнути' : 'Розкрити'} рахунок № ${inv.number ?? ''}`}
            className="grid size-6 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            data-testid="registry-expand"
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', expanded && 'rotate-90')} aria-hidden />
          </button>
        </td>
        <td className="px-2 py-2">
          <NumberSlot inv={inv} className={cn('font-medium', off ? 'text-muted-fg line-through' : 'text-fg')} />
        </td>
        <td className={cn('px-2 py-2', off ? 'text-muted-fg' : 'text-fg-2')}>{fmtDay(inv.date)}</td>
        <td className="px-2 py-2">
          <p className={cn(off ? 'text-muted-fg line-through' : 'text-fg')}>{invoiceTitle(rent, inv)}</p>
          {off ? <CancelledLine inv={inv} /> : <DocRefs rent={rent} inv={inv} />}
        </td>
        <td className={cn('px-2 py-2 text-right font-medium', off ? 'text-muted-fg line-through' : 'text-fg')} data-amount-due="registry">
          {formatMoney(invoiceTotal(inv))}
        </td>
        <td className="px-2 py-2">
          {off ? (
            <span className="text-muted-fg">—</span>
          ) : (
            <>
              <span className={paid > 0 ? 'text-fg' : 'text-muted-fg'}>{paid > 0 ? formatMoney(paid) : '—'}</span>
              <PayRefs rent={rent} inv={inv} />
            </>
          )}
        </td>
        <td className="px-2 py-2">
          {off ? (
            <span className="text-label text-muted-fg">Скасовано</span>
          ) : k === 'number-pending' ? (
            <span className="text-label text-muted-fg">Чекає номер 1С</span>
          ) : (
            <StatusBadge rent={rent} inv={inv} />
          )}
        </td>
        <td className="py-1.5 pr-3">
          <span className="flex items-center justify-end gap-0.5">
            <PrintIcons inv={inv} />
            <InvoiceMenu
              rent={rent}
              inv={inv}
              onEdit={onEdit}
              onCancel={() => setCancelling(true)}
              extra={onNextPeriod && { label: 'Копіювати на наступний період', onSelect: onNextPeriod, testId: 'registry-next-period' }}
            />
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/30" data-testid="registry-detail">
          <td />
          <td colSpan={7} className="px-2 pb-3">
            <div className="flex max-w-md flex-col gap-2">
              <FailedNotice inv={inv} />
              <InvoiceTrail rent={rent} inv={inv} />
              {!off && k !== 'number-failed' && paid === 0 && <p className="text-label text-muted-fg">Платіжок ще немає — статус змінить платіжне доручення з банку чи 1С.</p>}
              <OverpayNote rent={rent} inv={inv} />
              <ul className="flex flex-col gap-0.5 text-label text-muted-fg">
                {inv.lines.map((l) => (
                  <li key={l.id}>{l.service}</li>
                ))}
              </ul>
              {cancelling && (
                <CancelConfirm
                  inv={inv}
                  className="max-w-md"
                  onDone={(done) => {
                    setCancelling(false)
                    if (done) setOpen(false)
                  }}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr className="border-b border-border bg-muted/50">
      <td colSpan={8} className="px-4 py-1 text-label font-medium text-muted-fg">
        {label}
      </td>
    </tr>
  )
}

/** Платіжки в згорнутому рядку: номер і дата, без розкриття. */
function PayRefs({ rent, inv }: { rent: Rent; inv: Invoice }) {
  const pays = rent.payments.filter((p) => p.booked && p.invoiceId === inv.id)
  if (pays.length === 0) return null
  return (
    <span className="flex flex-col text-label text-muted-fg">
      {pays.map((p) => (
        <span key={p.id} data-pay-invoice={inv.number ?? ''}>
          п/д № {p.number}, {fmtDay(p.date)}
        </span>
      ))}
    </span>
  )
}

/** АВР і видаткова з 1С — під назвою рахунку і в згорнутому рядку. */
function DocRefs({ rent, inv }: { rent: Rent; inv: Invoice }) {
  const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
  if (docs.length === 0) return null
  return (
    <span className="flex flex-wrap gap-x-3 text-label text-muted-fg">
      {docs.map((d) => (
        <span key={d.id}>
          {d.number} з 1С, {fmtDay(d.date)}
        </span>
      ))}
    </span>
  )
}

