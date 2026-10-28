import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { daysIncl, fmtDate } from '@/domain/money'
import { days as daysWord } from '@/lib/plural'
import { useStore } from '@/state/store'

/**
 * Рейл варіантів, де рахунки живуть не в рейлі (A, C, D): обладнання,
 * строк і клієнт. Сум до сплати тут немає — їх друкує одне місце варіанта.
 * `children` — що варіант кладе в рейл понад це (A: вхід у реєстр).
 */
export function SummaryRail({ children }: { children?: ReactNode }) {
  const { rent } = useStore()
  const cp = rent.counterparty
  return (
    <div className="flex flex-col gap-3" data-testid="summary-rail">
      {children}
      <section className="rounded-lg border border-border bg-card px-3 py-2.5">
        <h2 className="text-body font-semibold text-fg">Обладнання і строк</h2>
        <ul className="mt-1.5 flex flex-col gap-1">
          {rent.positions.map((p) => (
            <li key={p.id} className="text-body text-fg">
              {p.name} <span className="text-muted-fg">× {p.qty}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-label tabular-nums text-muted-fg">
          {fmtDate(rent.issueAt)} — {fmtDate(rent.returnAt)}, {daysWord(daysIncl(rent.issueAt, rent.returnAt))}
        </p>
      </section>
      <section className="rounded-lg border border-border bg-card px-3 py-2.5">
        <h2 className="text-body font-semibold text-fg">Клієнт</h2>
        <p className="mt-1 text-body text-fg">{cp.name}</p>
        <p className="text-label text-muted-fg">ЄДРПОУ {cp.edrpou}</p>
        {cp.director ? (
          <p className="text-label text-muted-fg">Директор: {cp.director}</p>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-label text-warning-fg">
            <TriangleAlert className="size-3" aria-hidden />
            немає ПІБ директора
          </p>
        )}
      </section>
    </div>
  )
}
