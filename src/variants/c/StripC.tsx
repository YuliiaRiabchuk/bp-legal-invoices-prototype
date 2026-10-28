import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Ban, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDays, coveredUntil, dailyGross, daysIncl, fmtDate, fmtDay, invoiceState, invoiceTotal, isVatFree, paidOf, paymentsOf } from '@/domain/money'
import { invoiceBlocked, invoiceTitle, lastRentInvoice, nextPeriod, rentBilledUntil } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { formatMoney } from '@/lib/money'
import { days as daysWord, forDays } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { InvoiceComposer, type ComposerSeed } from '../shared/InvoiceComposer'
import { Proposal } from '../shared/Proposal'
import { statusView } from '../shared/invoice-status'
import { CancelConfirm, FailedNotice, InvoiceMenu, InvoiceTrail, NumberSlot, OverpayNote, PrintPair, StatusBadge } from '../shared/invoice-parts'

/**
 * Варіант C — стрічка періодів (`docs/shape.md` §4.C).
 *
 * Довга оренда — це час, тому рахунки стоять на осі часу. Рахунки оренди —
 * відрізки своїх періодів, разові (доставка, штраф, реалізація) — мітки на
 * дату, застава — свій ряд: обліково вона з орендою ніколи не сумується.
 * Прогалина після останнього відрізка — «не виставлено», з неї ж
 * виписується наступний період. Позначка «вистачить до» стоїть на тій самій
 * осі: продовження (б).
 *
 * Масштаб — весь строк у ширину стрічки (shape §7, рішення при збиранні):
 * рік оренди стискає відрізок до ширини номера, деталі — по кліку.
 * Мітки й відрізки — кнопки в порядку часу, тож стрічка проходиться Tab.
 */

const LANE_LABEL = 'w-[4.5rem] shrink-0 pt-2 text-label text-muted-fg'

type Panel = ComposerSeed

export function StripC() {
  const { rent } = useStore()
  const { invoiceErrand, setInvoiceErrand } = useCard()
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const nonce = useRef(0)
  const open = (p: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'mode' | 'nonce'> | { invoiceId: string }) => {
    nonce.current++
    setCancelling(false)
    setPanel('invoiceId' in p ? { mode: 'edit', invoiceId: p.invoiceId, nonce: nonce.current } : { mode: 'new', ...p, nonce: nonce.current })
  }
  useEffect(() => {
    if (!invoiceErrand) return
    open(invoiceErrand)
    setInvoiceErrand(null)
  }, [invoiceErrand, setInvoiceErrand])

  // Новий рахунок стає обраним: на стрічці видно, куди він ліг.
  const count = rent.invoices.length
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) setSelected(rent.invoices.at(-1)!.id)
    prevCount.current = count
  }, [count, rent.invoices])

  const lanesRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useLayoutEffect(() => {
    const el = lanesRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isRent = (i: Invoice) => i.kind !== 'deposit' && !!i.period && i.lines.some((l) => l.days != null)
  const rentInv = rent.invoices.filter(isRent)
  const oneOff = rent.invoices.filter((i) => !isRent(i) && i.kind !== 'deposit')
  const deposits = rent.invoices.filter((i) => i.kind === 'deposit')
  const lastRent = lastRentInvoice(rent)
  const np = nextPeriod(rent)
  const billed = rentBilledUntil(rent)
  const cov = coveredUntil(rent)
  const live = !['DRAFT', 'CLOSED', 'AWAITING_CLOSURE'].includes(rent.status)
  const hasCov = live && cov.money > 0 && cov.days > 0
  // Прогалина «не виставлено» має сенс, коли оренда вже йде; на «Оплаті» перші рахунки ще без номера.
  const showGap = !!lastRent && ['ACTIVE', 'EXPIRING_SOON', 'OVERDUE'].includes(rent.status)
  const blocked = invoiceBlocked(rent)

  // ── Вісь ──
  const starts = [rent.issueAt, ...rent.invoices.map((i) => i.period?.from ?? i.date)]
  const start = starts.sort()[0]
  const ends = [rent.returnAt, rent.today, billed ?? rent.issueAt, hasCov ? cov.date : rent.issueAt, showGap ? np.to : rent.issueAt, showGap ? addDays(np.from, 9) : rent.issueAt]
  const end = addDays(ends.sort().at(-1)!, 1)
  const span = daysIncl(start, end)
  const px = width / span
  const x = (iso: string) => (daysIncl(start, iso) - 1) * px
  const w = (from: string, to: string) => Math.max(6, daysIncl(from, to) * px)

  // Позначки осі: 1-ше і 16-те число кожного місяця.
  const ticks: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) if (d.endsWith('-01') || d.endsWith('-16')) ticks.push(d)

  const chosen = rent.invoices.find((i) => i.id === selected) ?? defaultPick(rent)

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="strip" aria-label="Рахунки на осі оренди">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold text-fg">Рахунки на осі оренди</h2>
        <Proposal note="Рахунки оренди — відрізки своїх періодів, разові — мітки на дату, застава — окремий ряд. Прогалина — не виставлено; з неї виписується наступний період." />
        <span className="ml-2 text-label text-muted-fg">
          {fmtDate(rent.issueAt)} — повернення {fmtDate(rent.returnAt)}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          variant={panel ? 'secondary' : 'default'}
          disabled={!!blocked}
          title={blocked ?? undefined}
          onClick={() => open({ via: 'button' })}
          data-testid="strip-new"
          data-main-action="invoice"
        >
          <Plus aria-hidden />
          Рахунок
        </Button>
      </header>

      <div className="px-4 pb-2 pt-1.5">
        <div className="flex">
          <span className={LANE_LABEL} aria-hidden />
          <div className="relative h-5 min-w-0 flex-1 text-[11px] tabular-nums text-muted-fg" aria-hidden>
            {ticks.map((d) => (
              <span key={d} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap" style={{ left: x(d) }}>
                {fmtDay(d)}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Сьогодні і повернення — через усі ряди. */}
          <div className="pointer-events-none absolute inset-y-0 left-[4.5rem] right-0" aria-hidden>
            <div className="absolute inset-y-0 w-px bg-accent" style={{ left: x(rent.today) + px / 2 }} />
            <div className="absolute inset-y-0 border-l border-dashed border-fg-2" style={{ left: x(rent.returnAt) + px }} />
          </div>

          <Lane label="Оренда">
            <div ref={lanesRef} className="relative h-11">
              {rentInv.map((inv) => (
                <Segment key={inv.id} rent={rent} inv={inv} left={x(inv.period!.from)} width={w(inv.period!.from, inv.period!.to)} selected={chosen?.id === inv.id} onSelect={() => select(inv.id)} />
              ))}
              {showGap && (
                <div
                  className="absolute top-0 flex h-11 items-center rounded-md border border-dashed border-border-strong"
                  style={{
                    left: x(np.from),
                    width: w(np.from, np.to),
                    backgroundImage: 'repeating-linear-gradient(135deg, var(--color-muted) 0 6px, transparent 6px 12px)',
                  }}
                  data-testid="strip-gap"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-1.5 shadow-xs"
                    onClick={() => open({ via: 'period' })}
                    data-testid="strip-gap-invoice"
                    data-main-action="gap"
                    title={`Не виставлено з ${fmtDay(np.from)}`}
                  >
                    <Plus aria-hidden />
                    Рахунок на {fmtDay(np.from)}–{fmtDay(np.to)}
                  </Button>
                </div>
              )}
            </div>
          </Lane>
          <Lane label="Разові">
            <Points rent={rent} items={oneOff} x={x} chosen={chosen?.id} onSelect={select} />
          </Lane>
          <Lane label="Застава">
            <Points rent={rent} items={deposits} x={x} chosen={chosen?.id} onSelect={select} />
          </Lane>
        </div>

        <div className="flex">
          <span className={LANE_LABEL} aria-hidden />
          {/* Підписи «сьогодні» і «вистачить до» поруч розходяться в два рядки, щоб не злипатись. */}
          <div className={cn('relative min-w-0 flex-1 text-[11px] tabular-nums', hasCov && Math.abs(x(cov.date) + px - x(rent.today)) < 110 ? 'h-9' : 'h-5')} aria-hidden>
            <span className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-accent-fg" style={{ left: x(rent.today) + px / 2 }}>
              сьогодні
            </span>
            {hasCov && (
              <span
                className={cn('absolute whitespace-nowrap font-medium text-success-fg', x(cov.date) + px > width - 130 && '-translate-x-full')}
                style={{ left: x(cov.date) + px - 3, top: Math.abs(x(cov.date) + px - x(rent.today)) < 110 ? 18 : 2 }}
              >
                {x(cov.date) + px > width - 130 ? `вистачить до ${fmtDay(cov.date)} ▲` : `▲ вистачить до ${fmtDay(cov.date)}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <Coverage rent={rent} onInvoiceTo={(to) => open({ via: 'period', to })} />

      <div className="border-t border-border bg-muted/30 px-4 py-3" data-testid="strip-detail">
        {panel ? (
          <InvoiceComposer key={panel.nonce} seed={panel} onClose={() => setPanel(null)} className="max-w-xl rounded-lg border border-border bg-card" />
        ) : chosen ? (
          <Detail rent={rent} inv={chosen} cancelling={cancelling} setCancelling={setCancelling} onEdit={() => open({ invoiceId: chosen.id })} />
        ) : (
          <p className="text-body text-muted-fg">Рахунків ще немає. Оренда і застава сформуються самі на переході до оплати.</p>
        )}
      </div>
    </section>
  )

  function select(id: string) {
    setPanel(null)
    setCancelling(false)
    setSelected(id)
  }
}

/** Що показати, поки менеджер нічого не обрав: те, що чекає уваги, інакше найсвіжіше. */
function defaultPick(rent: Rent): Invoice | undefined {
  const order = ['number-failed', 'partial', 'number-pending', 'unpaid', 'overpaid']
  for (const k of order) {
    // Серед рівних — рахунок оренди раніше за заставу: строк питають частіше.
    const hits = rent.invoices.filter((i) => invoiceState(rent, i).kind === k)
    const hit = hits.filter((i) => i.kind !== 'deposit').at(-1) ?? hits.at(-1)
    if (hit) return hit
  }
  return [...rent.invoices].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-t border-border/70 py-1.5">
      <span className={LANE_LABEL}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const STATE_EDGE: Record<string, string> = {
  paid: 'border-success/60',
  overpaid: 'border-success/60',
  partial: 'border-warning',
  unpaid: 'border-accent/70',
  'number-pending': 'border-dashed border-border-strong',
  'number-failed': 'border-danger',
  cancelled: 'border-border bg-muted text-muted-fg',
}

/** Відрізок рахунку оренди: заливка — оплачена частка. */
function Segment({ rent, inv, left, width, selected, onSelect }: { rent: Rent; inv: Invoice; left: number; width: number; selected: boolean; onSelect: () => void }) {
  const st = invoiceState(rent, inv).kind
  const total = invoiceTotal(inv)
  const paid = Math.min(paidOf(rent, inv), total)
  const pays = paymentsOf(rent, inv)
  const roomy = width >= 96
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Рахунок № ${inv.number ?? 'очікується'}, ${invoiceTitle(rent, inv)}, ${statusView(rent, inv).label}`}
      className={cn(
        'absolute top-0 flex h-11 flex-col justify-center overflow-hidden rounded-md border bg-card px-2 text-left transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg motion-reduce:transition-none',
        STATE_EDGE[st],
        selected && 'ring-2 ring-fg ring-offset-1',
      )}
      style={{ left, width }}
      data-testid="strip-segment"
      data-number={inv.number ?? ''}
    >
      <span className={cn('absolute inset-y-0 left-0', st === 'partial' ? 'bg-warning-soft' : 'bg-success-soft')} style={{ width: `${total ? (paid / total) * 100 : 0}%` }} aria-hidden />
      <span className={cn('relative flex items-center gap-1 whitespace-nowrap text-label font-semibold text-fg', st === 'cancelled' && 'line-through')}>
        {st === 'paid' && <Check className="size-3 text-success" aria-hidden />}
        {st === 'cancelled' && <Ban className="size-3 text-subtle" aria-hidden />}
        <NumberSlot inv={inv} />
      </span>
      {roomy && (
        <span className="relative truncate text-[11px] leading-tight text-fg-2">
          {pays.length ? (
            pays.map((p, i) => (
              <span key={p.id} data-pay-invoice={inv.number ?? ''}>
                {i > 0 && ', '}п/д {p.number}
              </span>
            ))
          ) : (
            <span className="text-muted-fg">{fmtDay(inv.period!.from)}–{fmtDay(inv.period!.to)}</span>
          )}
        </span>
      )}
    </button>
  )
}

/**
 * Разові рахунки й застава — мітки на дату. Мітки, що налазять одна на
 * одну, розходяться по підрядках: дата лишається читаною, ряд росте.
 */
function Points({ rent, items, x, chosen, onSelect }: { rent: Rent; items: Invoice[]; x: (iso: string) => number; chosen?: string; onSelect: (id: string) => void }) {
  const CHIP = 132
  const rows: { inv: Invoice; left: number; row: number }[] = []
  const lastRight: number[] = []
  for (const inv of [...items].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const left = x(inv.date)
    let row = lastRight.findIndex((r) => r + 6 <= left)
    if (row === -1) row = lastRight.length
    lastRight[row] = left + CHIP
    rows.push({ inv, left, row })
  }
  const height = Math.max(1, lastRight.length) * 38
  if (items.length === 0) return <div className="h-7 pt-1.5 text-label text-muted-fg">немає</div>
  return (
    <div className="relative" style={{ height }}>
      {rows.map(({ inv, left, row }) => {
        const st = invoiceState(rent, inv).kind
        const pays = paymentsOf(rent, inv)
        return (
          <button
            key={inv.id}
            type="button"
            onClick={() => onSelect(inv.id)}
            aria-pressed={chosen === inv.id}
            aria-label={`Рахунок № ${inv.number ?? 'очікується'}, ${invoiceTitle(rent, inv)}, ${statusView(rent, inv).label}`}
            className={cn(
              'absolute flex h-[34px] flex-col justify-center rounded-md border bg-card px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
              STATE_EDGE[st],
              (st === 'paid' || st === 'overpaid') && 'bg-success-soft/60',
              chosen === inv.id && 'ring-2 ring-fg ring-offset-1',
            )}
            style={{ left, top: row * 38, width: CHIP }}
            title={`№ ${inv.number ?? 'очікується'} — ${invoiceTitle(rent, inv)}`}
            data-testid="strip-point"
            data-number={inv.number ?? ''}
          >
            <span className={cn('flex items-center gap-1 truncate text-label font-semibold text-fg', st === 'cancelled' && 'line-through')}>
              {st === 'paid' && <Check className="size-3 shrink-0 text-success" aria-hidden />}
              {st === 'cancelled' && <Ban className="size-3 shrink-0 text-subtle" aria-hidden />}
              <NumberSlot inv={inv} />
              <span className="truncate font-normal text-fg-2">{inv.kind === 'deposit' ? '' : invoiceTitle(rent, inv)}</span>
            </span>
            <span className="truncate text-[11px] leading-tight text-fg-2">
              {pays.length ? (
                pays.map((p, i) => (
                  <span key={p.id} data-pay-invoice={inv.number ?? ''}>
                    {i > 0 && ', '}п/д {p.number}
                  </span>
                ))
              ) : (
                <span className="text-muted-fg">{fmtDay(inv.date)}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Обраний рахунок: сума, статус, платіжки, документи 1С, дії. Сума до сплати — тільки тут. */
function Detail({ rent, inv, cancelling, setCancelling, onEdit }: { rent: Rent; inv: Invoice; cancelling: boolean; setCancelling: (v: boolean) => void; onEdit: () => void }) {
  const off = !!inv.cancelled
  return (
    <div className="flex flex-col gap-2" data-testid="strip-selected" data-number={inv.number ?? ''}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={cn('text-body font-semibold text-fg', off && 'text-muted-fg line-through')}>
          <NumberSlot inv={inv} /> <span className="font-normal text-fg-2">— {invoiceTitle(rent, inv)} — від {fmtDate(inv.date)}, {isVatFree(inv) ? 'без ПДВ' : 'з ПДВ'}</span>
        </p>
        <span className="text-title font-semibold tabular-nums text-fg" data-amount-due="strip-detail">
          {formatMoney(invoiceTotal(inv))}
        </span>
        {off ? (
          <span className="text-label text-muted-fg">
            скасовано — {inv.cancelled!.by}, {inv.cancelled!.at}
            {inv.cancelled!.comment && ` — «${inv.cancelled!.comment}»`}
          </span>
        ) : (
          <StatusBadge rent={rent} inv={inv} />
        )}
        <span className="ml-auto flex items-center gap-1">
          {!cancelling && <PrintPair inv={inv} />}
          <InvoiceMenu rent={rent} inv={inv} onEdit={onEdit} onCancel={() => setCancelling(true)} />
        </span>
      </div>
      <div className="flex max-w-2xl flex-col gap-1.5">
        <FailedNotice inv={inv} />
        <InvoiceTrail rent={rent} inv={inv} />
        <OverpayNote rent={rent} inv={inv} />
        {cancelling && <CancelConfirm inv={inv} className="max-w-md" onDone={() => setCancelling(false)} />}
      </div>
    </div>
  )
}

/**
 * «Вистачить до» словами під стрічкою. Гроші на балансі (нерозпізнана
 * платіжка) названо окремо, і замість голого «перенести повернення» —
 * рахунок на доби, які вони покривають: під нього бухгалтер закриє АВР.
 */
function Coverage({ rent, onInvoiceTo }: { rent: Rent; onInvoiceTo: (to: string) => void }) {
  if (['CLOSED', 'DRAFT', 'AWAITING_CLOSURE'].includes(rent.status)) return null
  const c = coveredUntil(rent)
  const has = c.money > 0 && c.days > 0
  const extra = has ? c.days - daysIncl(rent.issueAt, rent.returnAt) : 0
  const billedTo = rentBilledUntil(rent)
  const uninvoiced = has && billedTo && c.date > billedTo
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-label" data-testid="coverage">
      {has ? (
        <>
          <span className="text-body text-fg-2">
            Грошей вистачить до{' '}
            <span className="font-semibold tabular-nums text-fg" data-testid="covered-until">
              {fmtDate(c.date)}
            </span>
          </span>
          <span className="tabular-nums text-muted-fg">
            {formatMoney(c.money)} з ПДВ ÷ {formatMoney(dailyGross(rent))} за добу = {daysWord(c.days)}
            {c.balance > 0 && `, з них ${formatMoney(c.balance)} на балансі без рахунку (за рахунками — до ${fmtDay(c.invoiced.date)})`}
          </span>
          <Proposal note="Продовження (б): кнопки «Продовжити» немає, позначка «вистачить до» стоїть на тій самій осі, що й рахунки. Застава не входить." />
          {uninvoiced && extra > 0 && (
            <span className="ml-auto flex items-center gap-2 text-success-fg" data-testid="coverage-extend">
              ще {forDays(extra)} після повернення без рахунку
              <Button size="sm" variant="secondary" onClick={() => onInvoiceTo(c.date)} data-testid="coverage-invoice">
                Рахунок до {fmtDay(c.date)}
              </Button>
            </span>
          )}
          {extra < 0 && rent.today <= rent.returnAt && <span className="ml-auto text-warning-fg">Оплати бракує на {forDays(-extra)} до повернення за планом</span>}
        </>
      ) : (
        <span className="text-body text-fg-2">Проведених оплат за оренду ще немає — «вистачить до» з’явиться з першою платіжкою.</span>
      )}
    </div>
  )
}
