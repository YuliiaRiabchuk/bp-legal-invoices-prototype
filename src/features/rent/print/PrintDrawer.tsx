import { useEffect, useState } from 'react'
import { Download, FileText, MessageSquare, Printer, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { canPrint, fmtDate, pdfName } from '@/domain/money'
import type { Doc1c, Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'
import { DocSheet, DOC_TITLE } from './DocSheet'
import { InvoiceDocument } from './InvoiceDocument'

/**
 * Перегляд документа — docked-панель праворуч, як у CRM (`RentDocumentDrawer`,
 * `DrawerShell`): шапка-смуга h-12, тіло на тоні `canvas`, футер з діями.
 * Не оверлей і не модалка; сама ніколи не відкривається.
 *
 * Рахунок (BP-2298, крок 6): друк, PDF, «Відкрити у Word», «Переформувати»
 * (нова версія з тим самим номером 1С) і коментар для менеджерів (крок 7).
 * АВР і видаткова (BP-2299): тільки перегляд і друк.
 *
 * Перегляд і друк стан оренди не змінюють (§3, сцена 10).
 */
export function PrintDrawer({
  rent,
  invoice,
  doc,
  set = [],
  onPick,
  onClose,
}: {
  rent: Rent
  invoice?: Invoice | null
  doc?: Doc1c | null
  /** Рахунки, відкриті разом; більше одного — перемикач над бланком. */
  set?: Invoice[]
  onPick?: (invoice: Invoice) => void
  onClose: () => void
}) {
  // Docked-панель не оверлей, фокус-пастки немає: Esc ловимо на window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = invoice ? `Рахунок на оплату № ${invoice.number ?? '—'}` : doc ? `${DOC_TITLE[doc.kind]} № ${doc.number}` : ''
  const sub = invoice
    ? `від ${fmtDate(invoice.date)}${invoice.source === '1c' ? ' · з 1С' : ''}${(invoice.version ?? 1) > 1 ? ` · версія ${invoice.version}` : ''}`
    : doc
      ? `від ${fmtDate(doc.date)} · з 1С, тільки перегляд`
      : ''
  const printable = invoice ? canPrint(invoice) && !invoice.cancelled : !!doc

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col border-l border-border bg-card" aria-label={title} data-print-drawer="" data-testid="print-drawer">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3" data-print-hide="">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-fg">{title}</p>
          <p className="truncate text-label text-muted-fg">{sub}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Закрити" onClick={onClose} data-testid="print-close">
          <X aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas px-3 py-4">
        {invoice && set.length > 1 && (
          <div className="flex gap-1" role="tablist" aria-label="Рахунки" data-print-hide="">
            {set.map((i) => (
              <button
                key={i.id}
                type="button"
                role="tab"
                aria-selected={i.id === invoice.id}
                onClick={() => onPick?.(i)}
                data-testid="print-set-tab"
                className={
                  i.id === invoice.id
                    ? 'rounded-md border border-fg bg-fg px-2.5 py-1 text-label font-medium text-primary-fg'
                    : 'rounded-md border border-border bg-card px-2.5 py-1 text-label text-fg-2 hover:bg-muted'
                }
              >
                № {i.number ?? 'очікується'} — {i.kind === 'deposit' ? 'застава' : 'оренда'}
              </button>
            ))}
          </div>
        )}
        {invoice && <CommentBox invoice={invoice} />}
        <div data-public-invoice="" className="overflow-hidden rounded-lg border border-border bg-card">
          {invoice ? <InvoiceDocument rent={rent} invoice={invoice} compact /> : doc ? <DocSheet rent={rent} doc={doc} compact /> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-3 py-3" data-print-hide="">
        {invoice && <InvoiceActions invoice={invoice} printable={printable} />}
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-label text-muted-fg">
            {invoice ? (printable ? pdfName(invoice) : 'Друк буде доступний після присвоєння номера.') : 'Документ 1С — тільки для перегляду й друку.'}
          </p>
          {invoice && (
            <Button variant="secondary" disabled={!printable} onClick={() => printWithName(invoice)} data-testid="print-save-pdf">
              <Download aria-hidden />
              Зберегти PDF
            </Button>
          )}
          <Button disabled={!printable} onClick={() => window.print()} data-testid="print-print">
            <Printer aria-hidden />
            Друк
          </Button>
        </div>
      </div>
    </aside>
  )
}

/** Дії рахунку з BP-2298, крок 6: відкрити у Word, завантажити, переформувати. */
function InvoiceActions({ invoice, printable }: { invoice: Invoice; printable: boolean }) {
  const { dispatch } = useStore()
  return (
    <div className="-ml-2 flex items-center gap-1">
      <Button variant="ghost" size="sm" disabled={!printable} onClick={() => openInWord(invoice)} data-testid="print-word">
        <FileText aria-hidden />
        Відкрити у Word
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!printable}
        onClick={() => {
          dispatch({ type: 'INVOICE_REISSUE', id: invoice.id })
          toast(`Рахунок № ${invoice.number} переформовано`, 'Номер 1С той самий. Попередня версія лишилась в історії документа.')
        }}
        data-testid="print-reissue"
      >
        <RefreshCw aria-hidden />
        Переформувати
      </Button>
    </div>
  )
}

/** Коментар до рахунку для менеджерів (BP-2298, крок 7). */
function CommentBox({ invoice }: { invoice: Invoice }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(invoice.comment?.text ?? '')
  useEffect(() => {
    setText(invoice.comment?.text ?? '')
    setEditing(false)
  }, [invoice.id, invoice.comment?.text])
  return (
    <section className="rounded-lg border border-border bg-card" data-print-hide="" data-testid="comment-box">
      <header className="flex items-center gap-2 border-b border-border bg-muted/30 px-3.5 py-1.5">
        <h3 className="text-mono font-semibold uppercase tracking-wider text-muted-fg">Коментар</h3>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="ml-auto text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg" data-testid="comment-edit">
            {invoice.comment ? 'Змінити' : 'Додати'}
          </button>
        )}
      </header>
      <div className="px-3.5 py-2.5">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              dispatch({ type: 'INVOICE_COMMENT', id: invoice.id, text })
              setEditing(false)
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Напр.: клієнт просить оригінал поштою"
              aria-label="Коментар до рахунку"
              data-testid="comment-text"
              className="block w-full resize-none rounded-md border border-border-strong bg-card px-2 py-1 text-body text-fg outline-none placeholder:text-subtle hover:border-border-hover focus:border-border-focus"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Скасувати
              </Button>
              <Button type="submit" size="sm" data-testid="comment-save">
                Зберегти
              </Button>
            </div>
          </form>
        ) : invoice.comment ? (
          <p className="flex items-start gap-1.5 text-body text-fg">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-fg" aria-hidden />
            <span>
              {invoice.comment.text}
              <span className="block text-label text-muted-fg">
                {invoice.comment.by}, {invoice.comment.at} · бачать менеджери, у друк не йде
              </span>
            </span>
          </p>
        ) : (
          <p className="text-label text-muted-fg">Коментарів немає. Його бачать менеджери оренди; у друковану форму він не йде.</p>
        )}
      </div>
    </section>
  )
}

/** Тимчасово підміняє заголовок вкладки: його браузер пропонує як ім'я PDF. */
export function printWithName(invoice: Invoice) {
  const prev = document.title
  document.title = pdfName(invoice).replace(/\.pdf$/, '')
  window.print()
  window.setTimeout(() => {
    document.title = prev
  }, 500)
}

/**
 * «Відкрити у Word»: у прототипі — файл .doc з розміткою бланка, Word його
 * відкриває. У продукті це буде документ із сервера 1С / BP Space.
 */
export function openInWord(invoice: Invoice) {
  const sheet = document.querySelector('[data-public-invoice]')?.innerHTML ?? ''
  const html = `<html><head><meta charset="utf-8"><title>${pdfName(invoice)}</title></head><body>${sheet}</body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'application/msword' }))
  const a = document.createElement('a')
  a.href = url
  a.download = pdfName(invoice).replace(/\.pdf$/, '.doc')
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
