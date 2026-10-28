import { useState } from 'react'
import { Ban, Check, ChevronDown, Download, FileCheck2, Landmark, Loader2, MoreHorizontal, OctagonAlert, Pencil, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { canPrint, fmtDate, fmtDay, invoiceTotal, isCancellable, isEditable, isVatFree, paymentsOf } from '@/domain/money'
import { invoiceTitle } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { printWithName } from '@/features/rent/print/PrintDialog'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from '../shared/Proposal'
import { statusView } from '../shared/invoice-status'

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
  const { dispatch } = useStore()
  const view = statusView(rent, inv)
  const settled = view.state.kind === 'paid' || view.state.kind === 'cancelled'
  const [open, setOpen] = useState(!settled)
  const [cancelling, setCancelling] = useState(false)
  const [comment, setComment] = useState('')
  const pays = paymentsOf(rent, inv)
  const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
  const printable = canPrint(inv)
  const title = invoiceTitle(rent, inv)
  const total = invoiceTotal(inv)

  const numberSlot =
    inv.numberState === 'ok' ? (
      <span className="tabular-nums">№ {inv.number}</span>
    ) : inv.numberState === 'pending' ? (
      <span className="inline-flex items-center gap-1 text-muted-fg" data-testid="number-pending">
        <Loader2 className="size-3 animate-spin motion-reduce:hidden" aria-hidden />№ очікується
      </span>
    ) : (
      <span className="text-danger-fg">№ —</span>
    )

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
            {view.state.kind === 'cancelled' ? (
              <Ban className="size-3.5 shrink-0 text-subtle" aria-hidden />
            ) : (
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
            )}
            <span className={cn('shrink-0 text-body font-medium', view.state.kind === 'cancelled' ? 'text-subtle line-through' : 'text-fg')}>
              {numberSlot}
            </span>
            <span className={cn('min-w-0 truncate text-body', view.state.kind === 'cancelled' ? 'text-subtle line-through' : 'text-fg-2')}>{title}</span>
          </button>
          <span className={cn('shrink-0 text-body tabular-nums', view.state.kind === 'cancelled' ? 'text-subtle line-through' : 'text-fg-2')}>
            {formatMoney(total)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="-mr-1 size-7"
            aria-label={`Друк рахунку № ${inv.number ?? ''}`}
            disabled={!printable}
            onClick={() => openPrint(inv)}
            data-testid="invoice-print"
          >
            <Printer aria-hidden />
          </Button>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-5 text-label text-muted-fg">
          {view.state.kind === 'cancelled' ? (
            <span>
              скасовано — {inv.cancelled!.by}, {inv.cancelled!.at}
              {inv.cancelled!.comment && <> — «{inv.cancelled!.comment}»</>}
            </span>
          ) : (
            <>
              {pays.map((p) => (
                <span key={p.id} className="tabular-nums" data-pay-invoice={inv.number ?? ''}>
                  п/д № {p.number}, {fmtDay(p.date)}
                </span>
              ))}
              {docs.map((d) => (
                <span key={d.id}>
                  {d.number} з 1С, {fmtDay(d.date)}
                </span>
              ))}
            </>
          )}
        </div>
      </article>
    )
  }

  return (
    <article
      className="border-t border-border px-3 pb-3 pt-2.5"
      data-testid="invoice-card"
      data-number={inv.number ?? ''}
      data-state={view.state.kind}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-fg">
            {numberSlot}
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
          <InvoiceMenu
            editable={isEditable(rent, inv)}
            cancellable={isCancellable(rent, inv)}
            createdDay={fmtDate(inv.date)}
            onEdit={() => onEdit(inv)}
            onCancel={() => setCancelling(true)}
          />
        )}
      </header>

      <div className="mt-1.5 flex items-baseline justify-between gap-2" data-amount-due="rail-card">
        <span className="text-title font-semibold tabular-nums text-fg">{formatMoney(total)}</span>
        {/* Номер у дорозі чи не прийшов — це вже сказано в шапці й нижче; бейдж лише про гроші. */}
        {view.state.kind !== 'number-pending' && view.state.kind !== 'number-failed' && <StatusBadge rent={rent} inv={inv} />}
      </div>

      {view.state.kind === 'number-failed' && (
        <div className="mt-2 flex gap-2 rounded-md border border-danger/30 bg-card px-2.5 py-2" role="status" data-testid="number-failed">
          <OctagonAlert className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden />
          <div className="min-w-0 text-label">
            <p className="flex flex-wrap items-center gap-1.5 font-medium text-danger-fg">
              1С не присвоїла номер
              <Proposal note="Окремий стан на рахунку замість тосту. Аварійний режим вмикають розробники, у прототип він не йде." />
            </p>
            <p className="mt-0.5 text-fg-2">
              Чекали 6 хв, з {inv.createdAt.slice(-5)}. Розробників повідомлено — номер з’явиться тут сам.
            </p>
          </div>
        </div>
      )}

      {(pays.length > 0 || docs.length > 0) && (
        <ul className="mt-2 flex flex-col gap-0.5 border-l border-border pl-2.5" aria-label="Документи під рахунком">
          {pays.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2 text-label" data-pay-invoice={inv.number ?? ''}>
              <Landmark className="size-3 shrink-0 translate-y-0.5 text-muted-fg" aria-hidden />
              <span className="min-w-0 flex-1 text-fg-2">
                Платіжне доручення № {p.number}, {fmtDay(p.date)}
              </span>
              <span className="shrink-0 tabular-nums text-fg">{formatMoney(p.amount)}</span>
            </li>
          ))}
          {docs.map((d) => (
            <li key={d.id} className="flex items-baseline gap-2 text-label" data-testid="doc-1c">
              <FileCheck2 className="size-3 shrink-0 translate-y-0.5 text-muted-fg" aria-hidden />
              <span className="min-w-0 flex-1 text-fg-2">
                {d.kind === 'avr' ? 'Акт виконаних робіт' : 'Видаткова накладна'} {d.number}, {fmtDay(d.date)}
              </span>
              <span className="shrink-0 text-muted-fg">з 1С</span>
            </li>
          ))}
        </ul>
      )}
      {view.state.kind === 'overpaid' && (
        <p className="mt-1.5 text-label text-muted-fg">
          Переплата лягла на баланс оренди. До іншого рахунку її прив’язує бухгалтерія за листом клієнта.
        </p>
      )}

      {cancelling ? (
        <div className="mt-2.5 rounded-md border border-border-strong bg-card p-2.5" data-testid="cancel-confirm">
          <p className="flex flex-wrap items-center gap-1.5 text-label font-medium text-fg">
            Скасувати рахунок № {inv.number ?? '—'}?
            <Proposal note="Скасування — дія на самому рахунку, тільки в день створення; коментар необов’язковий. Запис лишається з тим, хто і коли скасував." />
          </p>
          <p className="mt-0.5 text-label text-muted-fg">Він лишиться в стосі закресленим, з тим, хто і коли скасував.</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Коментар, якщо треба"
            rows={2}
            aria-label="Коментар до скасування"
            data-testid="cancel-comment"
            className="mt-2 block w-full resize-none rounded-md border border-border-strong bg-card px-2 py-1 text-label text-fg outline-none hover:border-border-hover focus:border-border-focus"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
              Ні
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-testid="cancel-submit"
              onClick={() => {
                dispatch({ type: 'INVOICE_CANCEL', id: inv.id, comment: comment.trim() || undefined })
                setCancelling(false)
                setOpen(false)
              }}
            >
              Скасувати рахунок
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5">
          <PrintButton disabled={!printable} onClick={() => openPrint(inv)} testId="invoice-print">
            <Printer aria-hidden />
            Друк
          </PrintButton>
          <PrintButton disabled={!printable} onClick={() => printWithName(inv)} testId="invoice-pdf">
            <Download aria-hidden />
            PDF
          </PrintButton>
          {!printable && (
            <span className="text-label text-muted-fg">{inv.numberState === 'failed' ? 'недоступно без номера' : 'після номера від 1С'}</span>
          )}
        </div>
      )}
    </article>
  )
}

function StatusBadge({ rent, inv }: { rent: Rent; inv: Invoice }) {
  const v = statusView(rent, inv)
  return (
    <Badge variant={v.tone} className="shrink-0 tabular-nums" data-testid="invoice-status">
      {v.state.kind === 'overpaid' ? `${v.label} на балансі` : v.label}
    </Badge>
  )
}

function PrintButton({ disabled, onClick, testId, children }: { disabled: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <Button size="sm" variant="secondary" disabled={disabled} onClick={onClick} data-testid={testId}>
      {children}
    </Button>
  )
}

/** Меню рахунку: правка, поки немає оплат (B1), скасування — в день створення (B7). */
function InvoiceMenu({
  editable,
  cancellable,
  createdDay,
  onEdit,
  onCancel,
}: {
  editable: boolean
  cancellable: boolean
  createdDay: string
  onEdit: () => void
  onCancel: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="-mr-1 -mt-0.5 size-7 shrink-0" aria-label="Дії з рахунком" title="Дії з рахунком" data-testid="invoice-menu">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem disabled={!editable} onSelect={onEdit} data-testid="invoice-edit">
          <Pencil aria-hidden />
          <span className="flex flex-col">
            Редагувати
            {!editable && <span className="text-label text-muted-fg">по рахунку вже є оплата</span>}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!cancellable} onSelect={onCancel} data-testid="invoice-cancel">
          <Ban aria-hidden />
          <span className="flex flex-col">
            Скасувати рахунок
            {!cancellable && (
              <span className="text-label text-muted-fg">
                {editable ? `тільки в день створення, ${createdDay}; наступного дня документи закриті` : 'по рахунку вже є оплата'}
              </span>
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
