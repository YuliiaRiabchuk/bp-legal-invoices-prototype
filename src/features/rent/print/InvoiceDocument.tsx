import { ORG_BY_ID } from '@/mock/orgs'
import {
  fmtDate,
  fmtPeriod,
  invoiceNet,
  invoiceTotal,
  invoiceVat,
  isVatFree,
  lineGross,
  lineNet,
} from '@/domain/money'
import { formatAmount } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import type { Invoice, Rent } from '@/mock/types'

/**
 * Друкарська форма рахунку на оплату — бланк, а не екран. Однакова для всіх
 * варіантів: варіанти відрізняються тим, як до неї дістатись.
 *
 * Повна назва послуги і повний IBAN не обрізаються: це юридичний документ
 * (§3, крайні стани).
 */
export function InvoiceDocument({ rent, invoice }: { rent: Rent; invoice: Invoice }) {
  const org = ORG_BY_ID[invoice.orgId]
  const cp = rent.counterparty
  const vatFree = isVatFree(invoice)
  return (
    <article
      className="invoice-sheet mx-auto w-full max-w-[720px] bg-white p-8 text-[12px] leading-snug text-fg"
      data-testid="invoice-document"
    >
      <header className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
        <span className="text-muted-fg">Постачальник</span>
        <div>
          <p className="font-semibold">{org.name}</p>
          <p>
            ЄДРПОУ {org.edrpou} · IBAN <span className="font-mono">{org.iban}</span> · {org.bank}
          </p>
          <p>{vatFree ? 'Без ПДВ' : 'Платник ПДВ'}</p>
        </div>
        <span className="text-muted-fg">Покупець</span>
        <div>
          <p className="font-semibold">{cp.name}</p>
          <p>
            ЄДРПОУ {cp.edrpou} · IBAN <span className="font-mono">{cp.iban}</span>
          </p>
          <p>{cp.address}</p>
        </div>
        <span className="text-muted-fg">Договір</span>
        <p>Оренда {rent.code}</p>
      </header>

      <h2 className="mt-6 text-center text-[16px] font-semibold">
        Рахунок на оплату № {invoice.number ?? '—'} від {fmtDate(invoice.date)}
      </h2>
      {invoice.period && <p className="mt-1 text-center text-muted-fg">за період {fmtPeriod(invoice.period)}</p>}

      <table className="mt-5 w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-y border-fg text-left">
            <th className="w-6 py-1.5 font-semibold">№</th>
            <th className="py-1.5 font-semibold">Послуга</th>
            <th className="py-1.5 text-right font-semibold">К-сть</th>
            <th className="py-1.5 text-right font-semibold">Ціна без ПДВ</th>
            <th className="py-1.5 text-right font-semibold">Сума без ПДВ</th>
            <th className="py-1.5 text-right font-semibold">Сума з ПДВ</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id} className="border-b border-border align-top">
              <td className="py-1.5">{i + 1}</td>
              <td className="py-1.5 pr-3">{l.service}</td>
              <td className="whitespace-nowrap py-1.5 text-right">
                {l.qty}
                {l.days != null && ` × ${daysWord(l.days)}`}
              </td>
              <td className="py-1.5 text-right">{formatAmount(l.priceNet)}</td>
              <td className="py-1.5 text-right">{formatAmount(lineNet(l))}</td>
              <td className="py-1.5 text-right">{formatAmount(lineGross(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-3 grid w-64 grid-cols-[1fr_auto] gap-y-0.5 tabular-nums">
        <dt>Разом без ПДВ</dt>
        <dd className="text-right">{formatAmount(invoiceNet(invoice))}</dd>
        <dt>{vatFree ? 'Без ПДВ' : 'у т.ч. ПДВ 20 %'}</dt>
        <dd className="text-right">{vatFree ? '—' : formatAmount(invoiceVat(invoice))}</dd>
        <dt className="font-semibold">До сплати</dt>
        <dd className="text-right font-semibold">{formatAmount(invoiceTotal(invoice))} грн</dd>
      </dl>

      <p className="mt-6 text-muted-fg">Виписав: {invoice.createdBy}</p>
    </article>
  )
}
