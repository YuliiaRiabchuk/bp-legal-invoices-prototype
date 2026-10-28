import { useRef, useState } from 'react'
import { CalendarClock, ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { coveredUntil, dailyGross, daysIncl, fmtDate, fmtDay, invoiceState } from '@/domain/money'
import { byFreshness, invoiceBlocked, lastRentInvoice, nextPeriod, openCharges, rentBilledUntil } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { days as daysWord, forDays, plural } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from '../shared/Proposal'
import { ChargeForm } from '../shared/ChargeForm'
import { InvoiceComposer, type ComposerSeed } from '../shared/InvoiceComposer'
import { OpenCharges } from '../shared/OpenCharges'
import { InvoiceCardB } from './InvoiceCardB'

/**
 * Варіант B — рахунки в рейлі (`docs/shape.md` §4.B).
 *
 * Рахунок — постійний супутник оренди: правий рейл на всіх п'яти етапах
 * тримає стос рахунків і дію «+ Рахунок» поруч із «+ Нарахування», як
 * «+ Доп. нарахування» у bp-1259. Менеджер не залишає етап, на якому стоїть:
 * бланк розгортається тут же, під кнопкою, і на його місці стає рахунок.
 *
 * Продовження — (б): кнопки «Продовжити» немає, блок «Оренда» каже, до якої
 * дати вистачить проведених грошей.
 */
export function RailB() {
  const { rent } = useStore()
  const [panel, setPanel] = useState<ComposerSeed | { mode: 'charge' } | null>(null)
  const nonce = useRef(0)
  const open = (p: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'nonce' | 'mode'> | { invoiceId: string }) => {
    nonce.current++
    setPanel('invoiceId' in p ? { mode: 'edit', invoiceId: p.invoiceId, nonce: nonce.current } : { mode: 'new', ...p, nonce: nonce.current })
  }

  const invoices = [...rent.invoices].sort(byFreshness)
  const live = invoices.filter((i) => !i.cancelled)
  const np = nextPeriod(rent)
  const prevRent = lastRentInvoice(rent)
  const charges = openCharges(rent)
  const blocked = invoiceBlocked(rent)

  return (
    <div className="flex flex-col gap-3" data-testid="rail-b">
      {rent.status !== 'CLOSED' && rent.status !== 'DRAFT' && <CoverageB rent={rent} onInvoiceTo={(to) => open({ via: 'period', to })} />}
      <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Рахунки оренди" data-testid="rail-invoices">
        <header className="flex items-center gap-2 px-3 py-2.5">
          <h2 className="text-title font-semibold text-fg">Рахунки</h2>
          {live.length > 0 && <span className="text-label tabular-nums text-muted-fg">{live.length}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPanel(panel?.mode === 'charge' ? null : { mode: 'charge' })}
              aria-pressed={panel?.mode === 'charge'}
              data-testid="rail-b-add-charge"
            >
              <Plus aria-hidden />
              Нарахування
            </Button>
            <Button
              size="sm"
              // Поки бланк відкритий, головна кнопка рейлу — «Сформувати»: дві чорні поруч не стоять.
              variant={panel && panel.mode !== 'charge' ? 'secondary' : 'default'}
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={() => (panel?.mode === 'new' && panel.via === 'button' ? setPanel(null) : open({ via: 'button' }))}
              aria-pressed={panel?.mode === 'new'}
              data-testid="rail-b-add-invoice"
              data-main-action="invoice"
            >
              <Plus aria-hidden />
              Рахунок
            </Button>
          </div>
        </header>

        {panel?.mode === 'charge' && (
          <ChargeForm
            onClose={(thenInvoice) => {
              if (thenInvoice) open({ via: 'charge' })
              else setPanel(null)
            }}
          />
        )}
        {panel && panel.mode !== 'charge' && <InvoiceComposer key={panel.nonce} seed={panel} onClose={() => setPanel(null)} />}

        {!panel && np.due && prevRent && (
          <div className="flex items-center gap-2.5 border-t border-border bg-accent-soft/60 px-3 py-2.5" data-testid="next-period-hint">
            <CalendarClock className="size-4 shrink-0 text-accent-fg" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-accent-fg">Наступний період з {fmtDay(np.from)}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 text-label text-fg-2">
                виставлено до {fmtDay(prevRent.period!.to)}, основа — № {prevRent.number ?? '—'}
                <Proposal note="Підказка з’являється, коли до кінця виставленого періоду менше 3 діб. Межа — за ритмом 15/30 числа; змінюється однією константою." />
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => open({ via: 'period' })} data-testid="next-period" data-main-action="next-period">
              Виставити
            </Button>
          </div>
        )}

        {!panel && charges.length > 0 && (
          <OpenCharges rent={rent} charges={charges} onInvoice={(id) => open({ via: 'charge', chargeId: id })} className="border-t border-border px-3 py-2" />
        )}

        {invoices.length === 0 ? (
          <div className="border-t border-border px-3 py-3" data-testid="invoices-empty">
            <p className="text-body font-medium text-fg">Рахунків ще немає</p>
            <p className="mt-0.5 text-label text-muted-fg">
              {rent.status === 'DRAFT' ? (
                <>
                  Оренда і застава сформуються самі, щойно оренда перейде до оплати. <Proposal note="Перші два рахунки створюються автоматично на переході «Оформлення → Оплата» і відкривають друкарські форми, щойно 1С присвоїть номери." />
                </>
              ) : (
                'Виставте перший кнопкою «+ Рахунок».'
              )}
            </p>
          </div>
        ) : (
          <Stack rent={rent} invoices={invoices} onEdit={(inv) => open({ invoiceId: inv.id })} />
        )}
      </section>

    </div>
  )
}

/**
 * Довгий стос: понад `FOLD_FROM` рахунків старіші оплачені згортаються в
 * один рядок, видно `SETTLED_SHOWN` найсвіжіших. Неоплачені не ховаються ніколи.
 */
const FOLD_FROM = 8
const SETTLED_SHOWN = 4

function Stack({ rent, invoices, onEdit }: { rent: Rent; invoices: Invoice[]; onEdit: (inv: Invoice) => void }) {
  const [all, setAll] = useState(false)
  const settled = (i: Invoice) => {
    const k = invoiceState(rent, i).kind
    return k === 'paid' || k === 'cancelled'
  }
  const older = invoices.length >= FOLD_FROM ? invoices.filter(settled).slice(SETTLED_SHOWN) : []
  const hidden = all ? [] : older
  const shown = invoices.filter((i) => !hidden.includes(i))
  return (
    <div data-testid="invoice-stack">
      {shown.map((inv) => (
        <InvoiceCardB key={inv.id} rent={rent} inv={inv} onEdit={onEdit} />
      ))}
      {older.length > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-label font-medium text-fg-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg"
          data-testid="stack-more"
        >
          <ChevronDown className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', all && 'rotate-180')} aria-hidden />
          {all ? 'Згорнути старіші' : `Ще ${older.length} ${plural(older.length, 'оплачений', 'оплачені', 'оплачених')} раніше`}
        </button>
      )}
    </div>
  )
}

/**
 * «Грошей вистачить до» — продовження (б), пропозиція (G2). Стоїть угорі
 * рейлу: для (б) це головна відповідь про строк, і на 1366×768 вона не має
 * опинятись під стосом рахунків.
 *
 * Дата рахується з проведених платіжок по рахунках оренди. Гроші на балансі
 * (нерозпізнана платіжка) названо окремим рядком, і дата з ними — окремо:
 * мовчки зливати їх не можна, бо під них немає рахунку, а значить і АВР.
 * Тому замість голого «перенести повернення» блок пропонує виставити рахунок
 * на доби, які ці гроші покривають, — повернення переноситься разом із ним.
 */
function CoverageB({ rent, onInvoiceTo }: { rent: Rent; onInvoiceTo: (to: string) => void }) {
  const c = coveredUntil(rent)
  const rate = dailyGross(rent)
  const has = c.money > 0 && c.days > 0
  const returnDays = daysIncl(rent.issueAt, rent.returnAt)
  const todayDays = daysIncl(rent.issueAt, rent.today)
  const span = Math.max(returnDays, has ? c.days : 0, todayDays)
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / span) * 100))}%`
  const extra = has ? c.days - returnDays : 0
  const billedTo = rentBilledUntil(rent)
  // Доби, які покривають гроші, але під які ще немає рахунку.
  const uninvoiced = has && billedTo && c.date > billedTo
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" aria-label="Оренда: до якої дати вистачить" data-testid="coverage">
      <header className="flex items-center gap-2">
        <h2 className="text-body font-semibold text-fg">Оренда</h2>
        <Proposal note="Замість кнопки «Продовжити оренду»: проведені платіжки по рахунках оренди з ПДВ, поділені на ставку за добу з ПДВ. Гроші на балансі — окремо. Застава не входить." />
        <span className="ml-auto text-label tabular-nums text-muted-fg">повернення {fmtDay(rent.returnAt)}</span>
      </header>
      {has ? (
        <>
          <p className="mt-1 text-body text-fg-2">
            Грошей вистачить до{' '}
            <span className="font-semibold tabular-nums text-fg" data-testid="covered-until">
              {fmtDate(c.date)}
            </span>
          </p>
          <p className="text-label tabular-nums text-muted-fg">
            {formatMoney(c.money)} з ПДВ ÷ {formatMoney(rate)} за добу = {daysWord(c.days)} від {fmtDay(rent.issueAt)}
          </p>
          {c.balance > 0 && (
            <p className="mt-0.5 text-label text-fg-2" data-testid="coverage-balance">
              з них <span className="font-medium tabular-nums">{formatMoney(c.balance)}</span> на балансі, без рахунку; за рахунками — до {fmtDay(c.invoiced.date)}
            </p>
          )}
          <div className="relative mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: pct(c.invoiced.days) }} />
            {c.balance > 0 && <div className="absolute inset-y-0 rounded-r-full bg-success/40" style={{ left: pct(c.invoiced.days), width: `calc(${pct(c.days)} - ${pct(c.invoiced.days)})` }} />}
            <div className="absolute -top-1 h-3.5 w-px bg-fg" style={{ left: pct(returnDays) }} />
            <div className="absolute -top-0.5 size-2.5 -translate-x-1/2 rounded-full border-2 border-card bg-accent" style={{ left: pct(todayDays) }} />
          </div>
        </>
      ) : (
        <p className="mt-1 text-body text-fg-2">Проведених оплат за оренду ще немає</p>
      )}
      {uninvoiced && extra > 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-success-soft px-2.5 py-1.5" data-testid="coverage-extend">
          <p className="min-w-0 flex-1 text-label text-success-fg">Гроші покривають ще {forDays(extra)} після повернення — під них потрібен рахунок.</p>
          <Button size="sm" variant="secondary" onClick={() => onInvoiceTo(c.date)} data-testid="coverage-invoice">
            Рахунок до {fmtDay(c.date)}
          </Button>
        </div>
      ) : (
        // Рядок стану є завжди: його поява не має штовхати стос рахунків нижче (вимір зсуву).
        <p className={cn('mt-1.5 text-label', has && extra < 0 ? 'text-warning-fg' : 'text-muted-fg')}>
          {has && extra < 0 ? `Оплати бракує на ${forDays(-extra)} до повернення за планом.` : 'Застава — окремо, у «вистачить до» не входить.'}
        </p>
      )}
    </section>
  )
}
