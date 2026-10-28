import { Download, FileCheck2, FileText, Landmark, Printer, Banknote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { canPrint, fmtDate, invoiceTotal, paymentsOf } from '@/domain/money'
import { byFreshness, invoiceTitle } from '@/domain/invoicing'
import { useCard } from '@/features/rent/card-context'
import { printWithName } from '@/features/rent/print/PrintDialog'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ORG_BY_ID } from '@/mock/orgs'
import { useStore } from '@/state/store'
import { Proposal } from './Proposal'
import { statusView } from './invoice-status'

/**
 * Вкладка «Документи» нових варіантів: дерево, як у 1С (B9). Рахунок —
 * батьківський документ, під ним платіжні доручення і те, що бухгалтерія
 * провела в 1С: АВР під послуги, видаткова під реалізацію (F10). ПКО — не
 * під рахунками: готівка від ЮЛ рахунків не змінює (C1, F5).
 *
 * Друк одразу з переліку, без завантаження, на будь-якому етапі (§3).
 */
export function DocumentsTree() {
  const { rent } = useStore()
  const { openPrint } = useCard()
  const invoices = [...rent.invoices].sort(byFreshness)
  return (
    <section className="rounded-lg border border-border bg-card" data-testid="documents-tree">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold">Документи</h2>
        <Proposal note="Ієрархія, як у 1С: рахунок батьківський, під ним платіжки, АВР і видаткова з 1С." />
        <span className="ml-auto text-label text-muted-fg">рахунки на всіх етапах; АВР і видаткові приходять з 1С</span>
      </header>
      {invoices.length === 0 && rent.cashOrders.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-fg">Документів ще немає. Перші рахунки з’являться на переході до оплати.</p>
      ) : (
        <ul>
          {invoices.map((inv) => {
            const v = statusView(rent, inv)
            const pays = paymentsOf(rent, inv)
            const docs = rent.docs.filter((d) => d.invoiceId === inv.id)
            const off = !!inv.cancelled
            return (
              <li key={inv.id} className="border-b border-border last:border-0" data-testid="doc-row" data-number={inv.number ?? ''}>
                <div className="grid grid-cols-[minmax(0,1fr)_8rem_11rem_5.5rem] items-center gap-x-4 px-4 py-2">
                  <div className="min-w-0">
                    <p className={cn('flex items-center gap-1.5 text-body font-medium', off ? 'text-muted-fg line-through' : 'text-fg')}>
                      <FileText className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                      Рахунок на оплату № {inv.number ?? '—'} від {fmtDate(inv.date)}
                    </p>
                    <p className="truncate pl-5 text-label text-muted-fg">
                      {invoiceTitle(rent, inv)} — {ORG_BY_ID[inv.orgId].name}
                      {off && ` — скасовано: ${inv.cancelled!.by}, ${inv.cancelled!.at}`}
                    </p>
                  </div>
                  <span className={cn('text-right text-body tabular-nums', off ? 'text-muted-fg line-through' : 'text-fg')} data-amount-due="documents">
                    {formatMoney(invoiceTotal(inv))}
                  </span>
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
                  </span>
                </div>
                {(pays.length > 0 || docs.length > 0) && (
                  <ul className="ml-[1.4rem] border-l border-border pb-2 pl-4">
                    {pays.map((p) => (
                      <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_8rem_11rem_5.5rem] items-center gap-x-4 py-1 pr-4 text-label" data-pay-invoice={inv.number ?? ''}>
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
                      <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_8rem_11rem_5.5rem] items-center gap-x-4 py-1 pr-4 text-label">
                        <span className="flex items-center gap-1.5 text-fg-2">
                          <FileCheck2 className="size-3 text-muted-fg" aria-hidden />
                          {d.kind === 'avr' ? 'Акт виконаних робіт' : 'Видаткова накладна'} {d.number} від {fmtDate(d.date)}
                        </span>
                        <span className="text-right tabular-nums text-fg-2">{formatMoney(d.amount)}</span>
                        <span className="text-muted-fg">з 1С</span>
                        <span />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          {rent.cashOrders.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_8rem_11rem_5.5rem] items-center gap-x-4 border-b border-border px-4 py-2 last:border-0">
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
