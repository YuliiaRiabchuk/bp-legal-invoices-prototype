import { Download, ExternalLink, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canPrint, invoiceTotal } from '@/domain/money'
import { baseInvoice } from '@/domain/prod'
import { useCard } from '@/features/rent/card-context'
import { printWithName } from '@/features/rent/print/PrintDialog'
import { formatMoney } from '@/lib/money'
import type { Invoice, Rent } from '@/mock/types'
import { useStore } from '@/state/store'

/** Тип документа рахунку, як у `documents/model.ts:140-161,280`. */
export function docTitleV0(rent: Rent, i: Invoice): string {
  if (i.kind === 'deposit') return 'Рахунок застави'
  if (baseInvoice(rent)?.id === i.id) return 'Рахунок на оплату'
  if (i.kind === 'extension' || i.kind === 'period') return 'Рахунок за продовження'
  return 'Дод. рахунок'
}

/**
 * Порт вкладки «Документи» (`documents/RentDocumentsTable.tsx`). Колонки:
 * Сформовано · Документ · Номер · Сума · Версія · Статус · Автор · Дії.
 * АВР і видаткової тут немає (B9): вони в 1С і M.E.Doc.
 */
export function DocumentsV0() {
  const { rent } = useStore()
  const { openPrint } = useCard()
  const rows = [
    ...rent.invoices.map((i) => ({
      id: i.id,
      at: i.createdAt,
      title: docTitleV0(rent, i),
      number: i.number ?? '—',
      sum: formatMoney(invoiceTotal(i)),
      status: i.cancelled ? 'анульовано' : i.number ? 'не підписано' : 'не сформовано',
      author: i.createdBy,
      inv: i,
    })),
    ...rent.cashOrders.map((c) => ({
      id: c.id,
      at: c.at,
      title: 'Прибутковий касовий ордер',
      number: c.number ?? '—',
      sum: formatMoney(c.amount),
      status: c.number ? 'не підписано' : 'не сформовано',
      author: c.by,
      inv: null as Invoice | null,
    })),
  ]
  return (
    <section className="rounded-lg border border-border bg-card" data-testid="documents-v0">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold">Документи</h2>
        <input placeholder="Назва або номер" className="h-control w-56 rounded-md border border-border px-2 text-body" />
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-fg">Документів ще немає — сформуйте перший кнопкою справа.</p>
      ) : (
        <table className="w-full text-body tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-label text-muted-fg">
              {['Сформовано', 'Документ', 'Номер', 'Сума', 'Версія', 'Статус', 'Автор', 'Дії'].map((h) => (
                <th key={h} className="px-3 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0" data-testid="doc-row" data-number={r.number}>
                <td className="px-3 py-2 text-muted-fg">{r.at}</td>
                <td className="px-3 py-2 text-fg">{r.title}</td>
                <td className="px-3 py-2">{r.number}</td>
                <td className="px-3 py-2">{r.sum}</td>
                <td className="px-3 py-2 text-muted-fg">1</td>
                <td className="px-3 py-2 text-label text-muted-fg">{r.status}</td>
                <td className="px-3 py-2 text-muted-fg">{r.author || '—'}</td>
                <td className="px-3 py-1">
                  {r.inv && (
                    <div className="flex gap-0.5">
                      <Button size="icon" variant="ghost" aria-label="Відкрити в новій вкладці" disabled={!canPrint(r.inv)} onClick={() => openPrint(r.inv!)}>
                        <ExternalLink aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Друк" disabled={!canPrint(r.inv)} onClick={() => openPrint(r.inv!)} data-testid="doc-print">
                        <Printer aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Завантажити PDF" disabled={!canPrint(r.inv)} onClick={() => printWithName(r.inv!)}>
                        <Download aria-hidden />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
