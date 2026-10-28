import { useState } from 'react'
import { Ban, CalendarPlus, Download, FileCheck2, Landmark, Loader2, MoreHorizontal, OctagonAlert, Pencil, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { canPrint, fmtDate, fmtDay, isCancellable, isEditable, paymentsOf } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import { printWithName } from '@/features/rent/print/PrintDialog'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from './Proposal'
import { statusView } from './invoice-status'

/**
 * Деталі рахунку, однакові в усіх нових варіантах. Варіанти різняться
 * тим, ДЕ стоїть рахунок (рейл, реєстр, книга, стрічка), а не тим, як
 * виглядає номер, статус, платіжка чи скасування.
 */

/** Номер 1С: є, у дорозі або не прийшов. */
export function NumberSlot({ inv, className }: { inv: Invoice; className?: string }) {
  if (inv.numberState === 'ok') return <span className={cn('tabular-nums', className)}>№ {inv.number}</span>
  if (inv.numberState === 'pending')
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-fg', className)} data-testid="number-pending">
        <Loader2 className="size-3 animate-spin motion-reduce:hidden" aria-hidden />№ очікується
      </span>
    )
  return <span className={cn('text-danger-fg', className)}>№ —</span>
}

/** Статус грошей. Номер у дорозі чи помилка 1С — не бейдж: про це каже номер і пояснення. */
export function StatusBadge({ rent, inv, className }: { rent: Rent; inv: Invoice; className?: string }) {
  const v = statusView(rent, inv)
  if (v.state.kind === 'number-pending') return null
  return (
    <Badge variant={v.tone} className={cn('shrink-0 tabular-nums', className)} data-testid="invoice-status">
      {v.state.kind === 'overpaid' ? `${v.label} на балансі` : v.label}
    </Badge>
  )
}

/** Номер не прийшов (сцена 8, B6, F9): стан на рахунку, а не тост. */
export function FailedNotice({ inv, className }: { inv: Invoice; className?: string }) {
  if (inv.numberState !== 'failed' || inv.cancelled) return null
  return (
    <div className={cn('flex gap-2 rounded-md border border-danger/30 bg-card px-2.5 py-2', className)} role="status" data-testid="number-failed">
      <OctagonAlert className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden />
      <div className="min-w-0 text-label">
        <p className="flex flex-wrap items-center gap-1.5 font-medium text-danger-fg">
          1С не присвоїла номер
          <Proposal note="Окремий стан на рахунку замість тосту. Аварійний режим вмикають розробники, у прототип він не йде." />
        </p>
        <p className="mt-0.5 text-fg-2">Чекали 6 хв, з {inv.createdAt.slice(-5)}. Розробників повідомлено — номер з’явиться тут сам.</p>
      </div>
    </div>
  )
}

/**
 * Що висить під рахунком, як у дереві 1С (B9): платіжні доручення, АВР під
 * послуги, видаткова під реалізацію (F10). Платіжка несе `data-pay-invoice` —
 * за ним прогін рахує відповідь сцени 6.
 */
export function InvoiceTrail({ rent, inv, className, signed }: { rent: Rent; inv: Invoice; className?: string; /** Платіжка зі знаком «−», як у книзі: гроші зменшують борг. */ signed?: boolean }) {
  const pays = paymentsOf(rent, inv)
  const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
  if (pays.length === 0 && docs.length === 0) return null
  return (
    <ul className={cn('flex flex-col gap-0.5 border-l border-border pl-2.5', className)} aria-label="Документи під рахунком">
      {pays.map((p) => (
        <li key={p.id} className="flex items-baseline gap-2 text-label" data-pay-invoice={inv.number ?? ''}>
          <Landmark className="size-3 shrink-0 translate-y-0.5 text-muted-fg" aria-hidden />
          <span className="min-w-0 flex-1 text-fg-2">
            Платіжне доручення № {p.number}, {fmtDay(p.date)}
          </span>
          <span className="shrink-0 tabular-nums text-fg">{formatMoney(signed ? -p.amount : p.amount)}</span>
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
  )
}

/** Коротке посилання «п/д № 201, 21.10» — для згорнутих рядків. */
export function TrailRefs({ rent, inv, className }: { rent: Rent; inv: Invoice; className?: string }) {
  const pays = paymentsOf(rent, inv)
  const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
  if (pays.length === 0 && docs.length === 0) return null
  return (
    <span className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-label text-muted-fg', className)}>
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
    </span>
  )
}

/** Переплата: на балансі, прив'язує бухгалтерія (F4, G4, G5а). */
export function OverpayNote({ rent, inv, className }: { rent: Rent; inv: Invoice; className?: string }) {
  if (statusView(rent, inv).state.kind !== 'overpaid') return null
  return (
    <p className={cn('text-label text-muted-fg', className)}>
      Переплата лягла на баланс оренди. До іншого рахунку її прив’язує бухгалтерія за листом клієнта.
    </p>
  )
}

/** Друк і PDF — тільки з номером 1С (§3). */
export function PrintPair({ inv, className }: { inv: Invoice; className?: string }) {
  const { openPrint } = useCard()
  const printable = canPrint(inv)
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button size="sm" variant="secondary" disabled={!printable} onClick={() => openPrint(inv)} data-testid="invoice-print">
        <Printer aria-hidden />
        Друк
      </Button>
      <Button size="sm" variant="secondary" disabled={!printable} onClick={() => printWithName(inv)} data-testid="invoice-pdf">
        <Download aria-hidden />
        PDF
      </Button>
      {!printable && !inv.cancelled && (
        <span className="text-label text-muted-fg">{inv.numberState === 'failed' ? 'недоступно без номера' : 'після номера від 1С'}</span>
      )}
    </div>
  )
}

/** Іконки друку й PDF — для рядків таблиці й книги. */
export function PrintIcons({ inv }: { inv: Invoice }) {
  const { openPrint } = useCard()
  const printable = canPrint(inv)
  const hint = printable ? '' : inv.numberState === 'failed' ? ' — недоступно без номера' : ' — після номера від 1С'
  return (
    <span className="flex shrink-0 gap-0.5">
      <Button size="icon" variant="ghost" className="size-7" aria-label={`Друк рахунку № ${inv.number ?? ''}${hint}`} title={`Друк${hint}`} disabled={!printable} onClick={() => openPrint(inv)} data-testid="invoice-print">
        <Printer aria-hidden />
      </Button>
      <Button size="icon" variant="ghost" className="size-7" aria-label={`Зберегти PDF рахунку № ${inv.number ?? ''}${hint}`} title={`Зберегти PDF${hint}`} disabled={!printable} onClick={() => printWithName(inv)} data-testid="invoice-pdf">
        <Download aria-hidden />
      </Button>
    </span>
  )
}

/**
 * Меню рахунку: правка, поки немає оплат (B1), скасування — в день
 * створення (B7, F3). `extra` — дія варіанта (напр. «Копіювати на наступний
 * період» у реєстрі A).
 */
export function InvoiceMenu({
  rent,
  inv,
  onEdit,
  onCancel,
  extra,
}: {
  rent: Rent
  inv: Invoice
  onEdit: () => void
  onCancel: () => void
  extra?: { label: string; onSelect: () => void; testId: string }
}) {
  if (inv.cancelled) return null
  const editable = isEditable(rent, inv)
  const cancellable = isCancellable(rent, inv)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`Дії з рахунком № ${inv.number ?? ''}`} title="Дії з рахунком" data-testid="invoice-menu">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {extra && (
          <DropdownMenuItem onSelect={extra.onSelect} data-testid={extra.testId}>
            <CalendarPlus aria-hidden />
            {extra.label}
          </DropdownMenuItem>
        )}
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
                {editable ? `тільки в день створення, ${fmtDate(inv.date)}; наступного дня документи закриті` : 'по рахунку вже є оплата'}
              </span>
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Скасування — подія, запис лишається (§3); коментар необов'язковий (C7). */
export function CancelConfirm({ inv, onDone, className }: { inv: Invoice; onDone: (cancelled: boolean) => void; className?: string }) {
  const { dispatch } = useStore()
  const [comment, setComment] = useState('')
  return (
    <div className={cn('rounded-md border border-border-strong bg-card p-2.5', className)} data-testid="cancel-confirm">
      <p className="flex flex-wrap items-center gap-1.5 text-label font-medium text-fg">
        Скасувати рахунок № {inv.number ?? '—'}?
        <Proposal note="Скасування — дія на самому рахунку, тільки в день створення; коментар необов’язковий. Запис лишається з тим, хто і коли скасував." />
      </p>
      <p className="mt-0.5 text-label text-muted-fg">Він лишиться видимим, закресленим, з тим, хто і коли скасував.</p>
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
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Ні
        </Button>
        <Button
          size="sm"
          variant="danger"
          data-testid="cancel-submit"
          onClick={() => {
            dispatch({ type: 'INVOICE_CANCEL', id: inv.id, comment: comment.trim() || undefined })
            onDone(true)
          }}
        >
          Скасувати рахунок
        </Button>
      </div>
    </div>
  )
}

/** «скасовано — хто, коли — «коментар»». */
export function CancelledLine({ inv, className }: { inv: Invoice; className?: string }) {
  if (!inv.cancelled) return null
  return (
    <span className={cn('text-label text-muted-fg', className)}>
      скасовано — {inv.cancelled.by || 'з 1С'}, {inv.cancelled.at}
      {inv.cancelled.comment && <> — «{inv.cancelled.comment}»</>}
    </span>
  )
}
