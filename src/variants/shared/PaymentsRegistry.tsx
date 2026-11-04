import { Banknote, Landmark } from 'lucide-react'
import { fmtDate } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import { ORG_BY_ID } from '@/mock/orgs'
import { useStore } from '@/state/store'
import { InvoiceRef, NoInvoice } from './InvoiceRef'
import { Proposal } from './Proposal'

/**
 * Вкладка «Реєстр платежів» для ЮЛ (BP-2308). Біля кожної оплати — за яким
 * рахунком вона пройшла: «Рах. № … від …», клік веде в «Документи». Оплата,
 * яку бухгалтерія ще не прив'язала, — «без рахунку». Готівка від ЮЛ (ПКО на
 * ФОП) показується як є, без рахунку: її реєстр не змінюємо (крок 5).
 */
export function PaymentsRegistry() {
  const { rent } = useStore()
  const pays = [...rent.payments].filter((p) => p.booked).sort((a, b) => (a.date < b.date ? 1 : -1))
  const total = pays.reduce((s, p) => s + p.amount, 0) + rent.cashOrders.reduce((s, c) => s + c.amount, 0)
  return (
    <section className="rounded-lg border border-border bg-card" data-testid="payments-registry">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-title font-semibold">Реєстр платежів</h2>
        <Proposal note="BP-2308: біля кожної оплати ЮЛ — номер і дата рахунку, зв'язок приходить з 1С. Клік по номеру відкриває рахунок у «Документах»." />
        <span className="ml-auto text-label tabular-nums text-muted-fg">прийнято {formatMoney(total)}</span>
      </header>
      {pays.length === 0 && rent.cashOrders.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-fg">Платежів ще не було.</p>
      ) : (
        <table className="w-full text-body tabular-nums">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-label text-muted-fg">
              <th className="px-4 py-1.5 font-medium">Дата</th>
              <th className="px-3 py-1.5 font-medium">Документ</th>
              <th className="px-3 py-1.5 font-medium">Призначення</th>
              <th className="px-3 py-1.5 font-medium">Рахунок</th>
              <th className="px-4 py-1.5 text-right font-medium">Сума</th>
            </tr>
          </thead>
          <tbody>
            {pays.map((p) => {
              const inv = p.invoiceId ? rent.invoices.find((i) => i.id === p.invoiceId) : undefined
              return (
                <tr key={p.id} className="border-b border-border last:border-0" data-testid="registry-payment">
                  <td className="px-4 py-2 text-fg-2">{fmtDate(p.date)}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-fg">
                      <Landmark className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                      Платіжне доручення № {p.number}
                    </span>
                    <span className="block pl-5 text-label text-muted-fg">банк → {ORG_BY_ID[rent.orgId].name}</span>
                  </td>
                  <td className="max-w-[18rem] px-3 py-2 text-label text-fg-2">{p.purpose}</td>
                  <td className="px-3 py-2">{inv ? <InvoiceRef inv={inv} /> : <NoInvoice />}</td>
                  <td className="px-4 py-2 text-right font-medium text-fg">{formatMoney(p.amount)}</td>
                </tr>
              )
            })}
            {rent.cashOrders.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0" data-testid="registry-cash">
                <td className="px-4 py-2 text-fg-2">{c.at}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 text-fg">
                    <Banknote className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
                    ПКО {c.number ?? '— № очікується'}
                  </span>
                  <span className="block pl-5 text-label text-muted-fg">готівка → {ORG_BY_ID[c.fopId].name}</span>
                </td>
                <td className="px-3 py-2 text-label text-fg-2">{c.purpose}</td>
                <td className="px-3 py-2 text-label text-muted-fg">готівка, рахунків не стосується</td>
                <td className="px-4 py-2 text-right font-medium text-fg">{formatMoney(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
