import { useEffect, useRef, type ReactNode } from 'react'
import { Banknote, Download, Eye, FileCheck2, FileText, Landmark, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { canPrint, fmtDate, invoiceTotal, paymentsOf } from '@/domain/money'
import { byFreshness, invoiceTitle } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { DOC_TITLE } from '@/features/rent/print/DocSheet'
import { printWithName } from '@/features/rent/print/PrintDrawer'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Invoice } from '@/mock/types'
import { useStore } from '@/state/store'
import { CancelledLine, CommentLine, SourceTag } from './invoice-parts'
import { Proposal } from './Proposal'
import { statusView } from './invoice-status'

const ROW = 'grid grid-cols-[minmax(0,1fr)_8rem_11rem_7.5rem] items-center gap-x-4'

/**
 * Вкладка «Документи»: дерево, як у 1С (B9). Рахунок — батьківський
 * документ, під ним платіжні доручення і те, що бухгалтерія провела в 1С:
 * АВР під послуги, видаткова під реалізацію (BP-2299). ПКО — не під
 * рахунками: готівка від ЮЛ рахунків не змінює (C1, F5).
 *
 * Рахунки й документи, що прийшли з 1С, мають позначку «з 1С»; позначені в
 * 1С на видалення лишаються з «анульовано» (BP-2298 кроки 3, 5; BP-2299 крок 5).
 * Друк одразу з переліку, без завантаження, на будь-якому етапі (§3).
 */
export function DocumentsTree({
  action,
  panel,
  menu,
}: {
  /** Дія в шапці: «Додатковий рахунок». */
  action?: ReactNode
  /** Бланк, що розгорнувся під шапкою. */
  panel?: ReactNode
  /** Меню рядка рахунку: редагувати, скасувати. */
  menu?: (inv: Invoice) => ReactNode
} = {}) {
  const { rent } = useStore()
  const { openPrint, openDoc, docFocus } = useCard()
  const invoices = [...rent.invoices].sort(byFreshness)
  const focusRef = useRef<HTMLLIElement>(null)
  // Перехід з реєстру платежів: рахунок одразу в кадрі й підсвічений.
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' })
  }, [docFocus])
  return (
    <section className="rounded-lg border border-border bg-card" data-testid="documents-tree">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold">Документи</h2>
        <Proposal note="Ієрархія, як у 1С: рахунок батьківський, під ним платіжки, АВР і видаткова з 1С." />
        <span className="ml-auto text-label text-muted-fg">рахунки на всіх етапах; АВР і видаткові приходять з 1С</span>
        {action}
      </header>
      {panel}
      {invoices.length === 0 && rent.cashOrders.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-fg">Документів ще немає. Перші рахунки з’являться на переході до оплати.</p>
      ) : (
        <ul>
          {invoices.map((inv) => {
            const v = statusView(rent, inv)
            const pays = paymentsOf(rent, inv)
            const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
            const off = !!inv.cancelled
            const focused = docFocus === inv.id
            return (
              <li
                key={inv.id}
                ref={focused ? focusRef : undefined}
                className={cn('scroll-mt-24 border-b border-border last:border-0', focused && 'bg-accent-soft/50')}
                data-testid="doc-row"
                data-number={inv.number ?? ''}
                data-focused={focused || undefined}
              >
                <div className={cn(ROW, 'px-4 py-2')}>
                  <div className="min-w-0">
                    <p className={cn('flex items-center gap-1.5 text-body font-medium', off ? 'text-muted-fg' : 'text-fg')}>
                      <FileText className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                      <span className={off ? 'line-through' : undefined}>
                        Рахунок на оплату № {inv.number ?? '—'} від {fmtDate(inv.date)}
                      </span>
                      <SourceTag inv={inv} />
                    </p>
                    <p className="truncate pl-5 text-label text-muted-fg">
                      {invoiceTitle(rent, inv)} — {ORG_BY_ID[inv.orgId].name}
                      {(inv.version ?? 1) > 1 && ` — версія ${inv.version}`}
                    </p>
                    {off && <CancelledLine inv={inv} className="block pl-5" />}
                    <CommentLine inv={inv} className="pl-5" />
                  </div>
                  <span className={cn('text-right text-body tabular-nums', off ? 'text-muted-fg line-through' : 'text-fg')}>{formatMoney(invoiceTotal(inv))}</span>
                  <span>
                    <Badge variant={v.tone}>{v.label}</Badge>
                  </span>
                  <span className="flex justify-end gap-0.5">
                    <Button size="icon" variant="ghost" aria-label={`Друк рахунку № ${inv.number ?? ''}`} disabled={!canPrint(inv)} onClick={() => openPrint(inv)} data-testid="doc-print">
                      <Printer aria-hidden />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Зберегти PDF рахунку № ${inv.number ?? ''}`} disabled={!canPrint(inv)} onClick={() => printWithName(inv)}>
                      <Download aria-hidden />
                    </Button>
                    {menu?.(inv)}
                  </span>
                </div>
                {(pays.length > 0 || docs.length > 0) && (
                  <ul className="ml-[1.4rem] border-l border-border pb-2 pl-4">
                    {pays.map((p) => (
                      <li key={p.id} className={cn(ROW, 'py-1 pr-4 text-label')} data-pay-invoice={inv.number ?? ''}>
                        <span className="flex items-center gap-1.5 text-fg-2">
                          <Landmark className="size-3 text-muted-fg" aria-hidden />
                          Платіжне доручення № {p.number} від {fmtDate(p.date)}
                        </span>
                        <span className="text-right tabular-nums text-fg-2">{formatMoney(p.amount)}</span>
                        <span className="text-muted-fg">з банку</span>
                        <span />
                      </li>
                    ))}
                    {docs.map((d) => (
                      <li key={d.id} className={cn(ROW, 'py-1 pr-0 text-label')} data-testid="doc-1c" data-annulled={d.annulled ? '' : undefined}>
                        <span className={cn('flex min-w-0 items-center gap-1.5', d.annulled ? 'text-muted-fg' : 'text-fg-2')}>
                          <FileCheck2 className="size-3 shrink-0 text-muted-fg" aria-hidden />
                          <span className={cn('truncate', d.annulled && 'line-through')}>
                            {DOC_TITLE[d.kind]} {d.number} від {fmtDate(d.date)}
                          </span>
                          <span className="shrink-0 rounded-sm border border-border px-1 text-mono font-medium text-muted-fg">з 1С</span>
                        </span>
                        <span className={cn('text-right tabular-nums', d.annulled ? 'text-muted-fg line-through' : 'text-fg-2')}>{formatMoney(d.amount)}</span>
                        <span className="text-muted-fg">{d.annulled ? `анульовано в 1С, ${d.annulled.at}` : 'проведено в 1С'}</span>
                        <span className="flex justify-end gap-0.5">
                          <Button size="icon" variant="ghost" className="size-7" aria-label={`Переглянути ${DOC_TITLE[d.kind].toLowerCase()} ${d.number}`} onClick={() => openDoc(d)} data-testid="doc-1c-view">
                            <Eye aria-hidden />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7" aria-label={`Друк ${DOC_TITLE[d.kind].toLowerCase()} ${d.number}`} onClick={() => openDoc(d)} data-testid="doc-1c-print">
                            <Printer aria-hidden />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          {rent.cashOrders.map((c) => (
            <li key={c.id} className={cn(ROW, 'border-b border-border px-4 py-2 last:border-0')}>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-body font-medium text-fg">
                  <Banknote className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                  Прибутковий касовий ордер {c.number ?? '— № очікується'}
                </p>
                <p className="truncate pl-5 text-label text-muted-fg">
                  {c.purpose} — {ORG_BY_ID[c.fopId].name}, рахунки не змінює
                </p>
              </div>
              <span className="text-right text-body tabular-nums text-fg">{formatMoney(c.amount)}</span>
              <span className="text-label text-muted-fg">готівка, {c.at}</span>
              <span />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
