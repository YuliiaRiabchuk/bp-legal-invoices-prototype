import { useState } from 'react'
import { Ban, Check, ChevronDown, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPrint, fmtDate, invoiceTotal, isVatFree } from '@/domain/money'
import { invoiceTitle } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { statusView } from '../shared/invoice-status'
import {
  CancelConfirm,
  CancelledLine,
  FailedNotice,
  InvoiceMenu,
  InvoiceTrail,
  NumberSlot,
  OverpayNote,
  PrintPair,
  StatusBadge,
  TrailRefs,
} from '../shared/invoice-parts'

/**
 * Рахунок у стосі рейлу. Два вигляди:
 *
 *  - **розгорнутий** — усе, що ще чогось чекає (номер, гроші, помилка 1С,
 *    переплата): сума, статус, кожна платіжка своїм рядком, документи 1С,
 *    друк і PDF;
 *  - **згорнутий** — оплачений або скасований: один рядок плюс рядок
 *    посилань «п/д № … АВР-…». Посилання лишаються видимими і згорнутими —
 *    інакше сцена 6 («яка оплата до якого рахунку») коштувала б клік на
 *    кожен рахунок.
 *
 * Суму до сплати по рахунку друкує тільки ця картка (вимір «поверхні»).
 */
export function InvoiceCardB({ rent, inv, onEdit }: { rent: Rent; inv: Invoice; onEdit: (inv: Invoice) => void }) {
  const { openPrint } = useCard()
  const view = statusView(rent, inv)
  const settled = view.state.kind === 'paid' || view.state.kind === 'cancelled'
  const [open, setOpen] = useState(!settled)
  const [cancelling, setCancelling] = useState(false)
  const title = invoiceTitle(rent, inv)
  const total = invoiceTotal(inv)
  const off = view.state.kind === 'cancelled'

  if (!open) {
    return (
      <article className="border-t border-border px-3 py-2" data-testid="invoice-card" data-number={inv.number ?? ''} data-collapsed="">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label={`Розгорнути рахунок № ${inv.number ?? ''}`}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            {off ? <Ban className="size-3.5 shrink-0 text-subtle" aria-hidden /> : <Check className="size-3.5 shrink-0 text-success" aria-hidden />}
            <NumberSlot inv={inv} className={cn('shrink-0 text-body font-medium', off ? 'text-muted-fg line-through' : 'text-fg')} />
            <span className={cn('min-w-0 truncate text-body', off ? 'text-muted-fg line-through' : 'text-fg-2')}>{title}</span>
          </button>
          <span className={cn('shrink-0 text-body tabular-nums', off ? 'text-muted-fg line-through' : 'text-fg-2')}>{formatMoney(total)}</span>
          <Button
            size="icon"
            variant="ghost"
            className="-mr-1 size-7"
            aria-label={`Друк рахунку № ${inv.number ?? ''}`}
            disabled={!canPrint(inv)}
            onClick={() => openPrint(inv)}
            data-testid="invoice-print"
          >
            <Printer aria-hidden />
          </Button>
        </div>
        <div className="mt-0.5 pl-5">{off ? <CancelledLine inv={inv} /> : <TrailRefs rent={rent} inv={inv} />}</div>
      </article>
    )
  }

  return (
    <article className="border-t border-border px-3 pb-3 pt-2.5" data-testid="invoice-card" data-number={inv.number ?? ''} data-state={view.state.kind}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-fg">
            <NumberSlot inv={inv} />
            <span className="font-normal text-fg-2">{title}</span>
          </p>
          <p className="mt-0.5 text-label text-muted-fg">
            від {fmtDate(inv.date)} — {isVatFree(inv) ? 'без ПДВ' : 'з ПДВ'}
            {inv.auto && ' — сформовано автоматично'}
          </p>
        </div>
        {settled ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Згорнути"
            aria-expanded
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <ChevronDown className="size-3.5 rotate-180" aria-hidden />
          </button>
        ) : (
          <span className="-mr-1 -mt-0.5">
            <InvoiceMenu rent={rent} inv={inv} onEdit={() => onEdit(inv)} onCancel={() => setCancelling(true)} />
          </span>
        )}
      </header>

      <div className="mt-1.5 flex items-baseline justify-between gap-2" data-amount-due="rail-card">
        <span className="text-title font-semibold tabular-nums text-fg">{formatMoney(total)}</span>
        {/* Помилку 1С уже названо нижче — бейдж лише про гроші. */}
        {view.state.kind !== 'number-failed' && <StatusBadge rent={rent} inv={inv} />}
      </div>

      <FailedNotice inv={inv} className="mt-2" />
      <InvoiceTrail rent={rent} inv={inv} className="mt-2" />
      <OverpayNote rent={rent} inv={inv} className="mt-1.5" />

      {cancelling ? (
        <CancelConfirm
          inv={inv}
          className="mt-2.5"
          onDone={(done) => {
            setCancelling(false)
            if (done) setOpen(false)
          }}
        />
      ) : (
        <PrintPair inv={inv} className="mt-2.5" />
      )}
    </article>
  )
}
