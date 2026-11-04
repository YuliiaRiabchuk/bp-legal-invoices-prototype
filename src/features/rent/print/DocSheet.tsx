import { fmtDate, invoiceTotal } from '@/domain/money'
import { formatAmount } from '@/lib/money'
import { ORG_BY_ID } from '@/mock/orgs'
import type { Doc1c, Rent } from '@/mock/types'

export const DOC_TITLE: Record<Doc1c['kind'], string> = {
  avr: 'Акт виконаних робіт',
  waybill: 'Видаткова накладна',
}

/**
 * Друкована форма документа з 1С: АВР під послуги, видаткова під реалізацію.
 * Тільки для читання (BP-2299): BP Space їх не створює й не змінює, лише
 * показує, до якого рахунку вони належать.
 */
export function DocSheet({ rent, doc, compact }: { rent: Rent; doc: Doc1c; compact?: boolean }) {
  const inv = rent.invoices.find((i) => i.id === doc.invoiceId)
  const org = ORG_BY_ID[inv?.orgId ?? rent.orgId]
  const cp = rent.counterparty
  return (
    <article className={`invoice-sheet mx-auto w-full max-w-[720px] bg-white ${compact ? 'p-4' : 'p-8'} text-[12px] leading-snug text-fg`} data-testid="doc-sheet">
      <header className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1">
        <span className="text-muted-fg">Виконавець</span>
        <p className="font-semibold">{org.name}</p>
        <span className="text-muted-fg">Замовник</span>
        <p className="font-semibold">{cp.name}</p>
        <span className="text-muted-fg">Підстава</span>
        <p>
          Рахунок на оплату № {inv?.number ?? '—'} від {inv ? fmtDate(inv.date) : '—'} · оренда {rent.code}
        </p>
      </header>
      <h2 className="mt-6 text-center text-[16px] font-semibold">
        {DOC_TITLE[doc.kind]} № {doc.number} від {fmtDate(doc.date)}
      </h2>
      {doc.annulled && <p className="mt-1 text-center font-semibold text-danger-fg">Анульовано в 1С {doc.annulled.at}</p>}
      <table className="mt-5 w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-y border-fg text-left">
            <th className="w-6 py-1.5 font-semibold">№</th>
            <th className="py-1.5 font-semibold">{doc.kind === 'avr' ? 'Послуга' : 'Товар'}</th>
          </tr>
        </thead>
        <tbody>
          {(inv?.lines ?? []).map((l, i) => (
            <tr key={l.id} className="border-b border-border align-top">
              <td className="py-1.5">{i + 1}</td>
              <td className="py-1.5 pr-3">{l.service}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ml-auto mt-3 w-64 text-right font-semibold tabular-nums">Разом: {formatAmount(doc.amount)} грн</p>
      {inv && doc.amount < invoiceTotal(inv) && <p className="mt-1 text-right text-muted-fg">частина рахунку на {formatAmount(invoiceTotal(inv))} грн</p>}
      <p className="mt-6 text-muted-fg">Документ сформовано бухгалтерією в 1С. У BP Space — тільки для перегляду й друку.</p>
    </article>
  )
}
