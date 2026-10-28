import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowRight, Banknote, Ban, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtDate, fmtDay, invoiceState, invoiceTotal } from '@/domain/money'
import { invoiceBlocked, invoiceTitle, lastRentInvoice, nextPeriod, openCharges, totalsSplit } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargeForm } from '../shared/ChargeForm'
import { InvoiceComposer, type ComposerSeed } from '../shared/InvoiceComposer'
import { OpenCharges } from '../shared/OpenCharges'
import { Proposal } from '../shared/Proposal'
import { statusView } from '../shared/invoice-status'
import { CancelConfirm, CancelledLine, FailedNotice, InvoiceMenu, InvoiceTrail, NumberSlot, OverpayNote, PrintIcons, StatusBadge } from '../shared/invoice-parts'

/**
 * Варіант D — книга розрахунків (`docs/shape.md` §4.D).
 *
 * Менеджер і бухгалтер читають одне й те саме: рахунок — рядок
 * «нараховано», під ним з відступом його платіжки, АВР і видаткова, як
 * дерево документів 1С. Книга стоїть на кроці замість блоку способів оплати
 * і читається згори вниз, у порядку дат: пізніший рахунок — нижче.
 *
 * Бланк наступного періоду розгортається рядком у книзі, там, де стояла
 * підказка, і сформований рахунок стає на те саме місце.
 */
type Panel = ComposerSeed | { mode: 'charge'; nonce: number }

export function BookD() {
  const { rent } = useStore()
  const { invoiceErrand, setInvoiceErrand } = useCard()
  const [panel, setPanel] = useState<Panel | null>(null)
  const nonce = useRef(0)
  const open = (p: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'mode' | 'nonce'> | { invoiceId: string } | 'charge') => {
    nonce.current++
    if (p === 'charge') setPanel({ mode: 'charge', nonce: nonce.current })
    else setPanel('invoiceId' in p ? { mode: 'edit', invoiceId: p.invoiceId, nonce: nonce.current } : { mode: 'new', ...p, nonce: nonce.current })
  }
  useEffect(() => {
    if (!invoiceErrand) return
    open(invoiceErrand)
    setInvoiceErrand(null)
  }, [invoiceErrand, setInvoiceErrand])

  const invoices = [...rent.invoices].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.number ?? '9999').localeCompare(b.number ?? '9999')))
  const lastRent = lastRentInvoice(rent)
  const np = nextPeriod(rent)
  const t = totalsSplit(rent)
  const charges = openCharges(rent)
  const blocked = invoiceBlocked(rent)
  // Що чекає — номерами в шапці: книга лишається хронологією, а відповідь «чого чекаємо» видно без прокрутки.
  const waiting = invoices.filter((i) => !['paid', 'cancelled', 'overpaid'].includes(invoiceState(rent, i).kind))
  const periodOpen = panel?.mode === 'new' && panel.via === 'period'
  const topPanel = panel && !periodOpen ? panel : null

  const periodRow = lastRent && np.due && rent.status !== 'CLOSED' && (
    periodOpen ? (
      <li className="border-b border-border bg-muted/40 px-4 py-2.5" key="period-composer">
        <InvoiceComposer key={panel!.nonce} seed={panel as ComposerSeed} onClose={() => setPanel(null)} className="max-w-xl rounded-lg border border-border bg-card" />
      </li>
    ) : (
      <li className="border-b border-border px-4 py-1.5" key="period-hint">
        <button
          type="button"
          onClick={() => open({ via: 'period' })}
          className="flex items-center gap-2 rounded-sm py-0.5 text-body font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          data-testid="book-next-period"
          data-main-action="next-period"
        >
          Наступний період {fmtDay(np.from)}–{fmtDay(np.to)} на основі № {lastRent.number ?? '—'}
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </li>
    )
  )

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="book" aria-label="Рахунки і оплати">
      {/* Шапка липка: на десяти рахунках «+ Рахунок» і «чекають» не прокручуються геть. */}
      <header className="sticky top-0 z-10 rounded-t-lg border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-title font-semibold text-fg">Рахунки і оплати</h2>
          <Proposal note="Книга замість блоку способів оплати: рахунок і під ним його платіжки, АВР і видаткова — як дерево документів 1С." />
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => (panel?.mode === 'charge' ? setPanel(null) : open('charge'))} data-testid="book-add-charge">
              <Plus aria-hidden />
              Нарахування
            </Button>
            <Button
              size="sm"
              variant={topPanel && topPanel.mode !== 'charge' ? 'secondary' : 'default'}
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={() => open({ via: 'button' })}
              data-testid="book-new"
              data-main-action="invoice"
            >
              <Plus aria-hidden />
              Рахунок
            </Button>
          </div>
        </div>
        {invoices.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-label tabular-nums text-muted-fg">
            {/* Застава окремо: обліково не сумується з орендою (§3). */}
            <span>
              оренда і послуги: виставлено {formatMoney(t.main.issued)}, оплачено {formatMoney(t.main.paid)}
            </span>
            {t.deposit.count > 0 && (
              <span>
                застава: {formatMoney(t.deposit.issued)}, оплачено {formatMoney(t.deposit.paid)}
              </span>
            )}
            {waiting.length > 0 && (
              <span className="flex flex-wrap items-center gap-1" data-testid="book-waiting">
                чекають:
                {waiting.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => document.querySelector(`[data-entry-id="${i.id}"]`)?.scrollIntoView({ block: 'center' })}
                    className="inline-flex min-h-6 items-center rounded-sm px-1 font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                  >
                    № {i.number ?? 'очікується'}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </header>

      {topPanel?.mode === 'charge' && (
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <ChargeForm onClose={(thenInvoice) => (thenInvoice ? open({ via: 'charge' }) : setPanel(null))} className="max-w-md rounded-lg border border-border bg-card" />
        </div>
      )}
      {topPanel && topPanel.mode !== 'charge' && (
        <div className="border-b border-border bg-muted/50 px-4 py-3">
          <InvoiceComposer key={topPanel.nonce} seed={topPanel} onClose={() => setPanel(null)} className="max-w-xl rounded-lg border border-border bg-card" />
        </div>
      )}

      {invoices.length === 0 ? (
        <p className="px-4 py-4 text-body text-muted-fg" data-testid="invoices-empty">
          Рахунків ще немає. Оренда і застава сформуються самі на переході до оплати.
        </p>
      ) : (
        <ul>
          {invoices.map((inv) => (
            <Fragment key={inv.id}>
              <BookEntry rent={rent} inv={inv} onEdit={() => open({ invoiceId: inv.id })} />
              {inv.id === lastRent?.id && periodRow}
            </Fragment>
          ))}
        </ul>
      )}

      {charges.length > 0 && (
        <OpenCharges rent={rent} charges={charges} onInvoice={(id) => open({ via: 'charge', chargeId: id })} className="max-w-xl border-t border-border px-4 py-2.5" />
      )}
      {rent.cashOrders.length > 0 && (
        <ul className="border-t border-border px-4 py-2" aria-label="Готівка від юрособи">
          {rent.cashOrders.map((c) => (
            <li key={c.id} className="flex items-baseline gap-2 text-label text-fg-2" data-testid="cash-order">
              <Banknote className="size-3.5 shrink-0 translate-y-0.5 text-muted-fg" aria-hidden />
              <span className="min-w-0 flex-1">
                Готівка від ЮЛ: {c.number ? `ПКО ${c.number}` : 'ПКО, № очікується'}, {c.at} → {ORG_BY_ID[c.fopId].name} — рахунки не змінює
              </span>
              <span className="tabular-nums text-fg">{formatMoney(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BookEntry({ rent, inv, onEdit }: { rent: Rent; inv: Invoice; onEdit: () => void }) {
  const view = statusView(rent, inv)
  const [cancelling, setCancelling] = useState(false)
  const off = view.state.kind === 'cancelled'
  if (off) {
    return (
      <li className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-4 py-1.5 text-body text-muted-fg" data-testid="book-entry" data-number={inv.number ?? ''}>
        <Ban className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
        <span className="line-through">
          Рахунок № {inv.number ?? '—'} — {fmtDay(inv.date)} — {invoiceTitle(rent, inv)} — {formatMoney(invoiceTotal(inv))}
        </span>
        <CancelledLine inv={inv} />
      </li>
    )
  }
  return (
    <li className="scroll-mt-24 border-b border-border px-4 py-2" data-testid="book-entry" data-entry-id={inv.id} data-number={inv.number ?? ''} data-state={view.state.kind}>
      <div className="flex items-center gap-3">
        <span className={cn('size-2 shrink-0 rounded-[2px]', view.state.kind === 'paid' || view.state.kind === 'overpaid' ? 'bg-fg' : 'border border-fg-2')} aria-hidden />
        <p className="min-w-0 flex-1 text-body text-fg">
          <span className="font-medium">
            Рахунок <NumberSlot inv={inv} />
          </span>
          <span className="text-muted-fg"> — {fmtDate(inv.date)} — </span>
          {invoiceTitle(rent, inv)}
        </p>
        <span className="w-28 shrink-0 text-right text-body font-semibold tabular-nums text-fg" data-amount-due="book">
          {formatMoney(invoiceTotal(inv))}
        </span>
        <span className="w-48 shrink-0">
          <StatusBadge rent={rent} inv={inv} />
        </span>
        <span className="flex shrink-0 items-center">
          <PrintIcons inv={inv} />
          <InvoiceMenu rent={rent} inv={inv} onEdit={onEdit} onCancel={() => setCancelling(true)} />
        </span>
      </div>
      <div className="ml-5 flex max-w-2xl flex-col gap-1.5 empty:hidden">
        <FailedNotice inv={inv} className="mt-1.5 max-w-lg" />
        <InvoiceTrail rent={rent} inv={inv} className="mt-1" signed />
        <OverpayNote rent={rent} inv={inv} />
        {cancelling && <CancelConfirm inv={inv} className="mt-1.5 max-w-md" onDone={() => setCancelling(false)} />}
      </div>
    </li>
  )
}
