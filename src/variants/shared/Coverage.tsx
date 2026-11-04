import { Button } from '@/components/ui/button'
import { coveredUntil, dailyGross, daysIncl, fmtDate, fmtDay } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import { days as daysWord, forDays } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Rent } from '@/mock/types'
import { Proposal } from './Proposal'

/**
 * «Грошей вистачить до» — продовження ЮЛ без кнопки (BP-2307, рішення Саші).
 *
 * Формула з тікета, розписана поруч із датою, щоб менеджер міг її
 * перевірити: оплачено за рахунками оренди − нарахування = залишок, ÷ ставка
 * за добу з ПДВ = доби від початку оренди. Рахуються тільки проведені
 * платіжні доручення, застава не входить.
 *
 * Гроші на балансі (платіжка без рахунку) у дату не входять. Якщо вони є,
 * блок каже, на скільки їх вистачило б, і пропонує рахунок на ці доби: під
 * рахунок бухгалтерія їх і прив'яже.
 */
export function Coverage({ rent, onInvoiceTo }: { rent: Rent; onInvoiceTo: (to: string) => void }) {
  const c = coveredUntil(rent)
  const rate = dailyGross(rent)
  const has = c.days > 0
  const returnDays = daysIncl(rent.issueAt, rent.returnAt)
  const todayDays = daysIncl(rent.issueAt, rent.today)
  const span = Math.max(returnDays, c.withBalance.days, todayDays, 1)
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / span) * 100))}%`
  const short = has ? returnDays - c.days : 0
  const balanceDays = c.withBalance.days - c.days
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3" aria-label="Оренда: до якої дати вистачить" data-testid="coverage">
      <header className="flex items-center gap-2">
        <h2 className="text-body font-semibold text-fg">Оренда</h2>
        <Proposal note="Замість кнопки «Продовжити оренду» (BP-2307): оплати за рахунками оренди мінус нарахування, поділені на ставку за добу з ПДВ. Тільки проведені платіжки, застава не входить." />
        <span className="ml-auto text-label tabular-nums text-muted-fg">повернення за планом {fmtDay(rent.returnAt)}</span>
      </header>

      <p className="mt-1 text-body text-fg-2">
        Грошей вистачить до{' '}
        <span className="font-semibold tabular-nums text-fg" data-testid="covered-until">
          {has ? fmtDate(c.date) : '—'}
        </span>
      </p>
      {/* Формула — рядком, як у тікеті: кожен доданок видно і можна звірити. */}
      <p className="mt-0.5 text-label tabular-nums text-muted-fg" data-testid="coverage-formula">
        оплачено за рахунками {formatMoney(c.paid)} − нарахування {formatMoney(c.charges)} = {formatMoney(c.money)} ÷ {formatMoney(rate)} за добу з ПДВ ={' '}
        {daysWord(c.days)} від {fmtDay(rent.issueAt)}
      </p>

      <div className="relative mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: pct(c.days) }} />
        {balanceDays > 0 && <div className="absolute inset-y-0 rounded-r-full bg-success/35" style={{ left: pct(c.days), width: `calc(${pct(c.withBalance.days)} - ${pct(c.days)})` }} />}
        <div className="absolute -top-1 h-3.5 w-px bg-fg" style={{ left: pct(returnDays) }} title="повернення за планом" />
        <div className="absolute -top-0.5 size-2.5 -translate-x-1/2 rounded-full border-2 border-card bg-accent" style={{ left: pct(todayDays) }} title="сьогодні" />
      </div>

      {c.balance > 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5" data-testid="coverage-balance">
          <p className="min-w-0 flex-1 text-label text-fg-2">
            Ще <span className="font-medium tabular-nums">{formatMoney(c.balance)}</span> на балансі без рахунку — у дату не входять.
            {balanceDays > 0 && <> Під рахунок їх вистачить ще на {forDays(balanceDays)}, до {fmtDay(c.withBalance.date)}.</>}
          </p>
          {balanceDays > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onInvoiceTo(c.withBalance.date)} data-testid="coverage-invoice">
              Рахунок до {fmtDay(c.withBalance.date)}
            </Button>
          )}
        </div>
      ) : (
        <p className={cn('mt-1.5 text-label', has && short > 0 ? 'text-warning-fg' : 'text-muted-fg')}>
          {has && short > 0 ? `Оплати бракує на ${forDays(short)} до повернення за планом.` : 'Застава — окремо, у «вистачить до» не входить.'}
        </p>
      )}
    </section>
  )
}
