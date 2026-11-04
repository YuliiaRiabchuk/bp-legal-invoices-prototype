import { Button } from '@/components/ui/button'
import { coveredUntil, dailyGross, daysIncl, fmtDate, fmtDay } from '@/domain/money'
import { rentBilledUntil } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { days as daysWord, forDays } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Rent } from '@/mock/types'
import { Proposal } from './Proposal'

/**
 * «Грошей вистачить до» — продовження (б), пропозиція (G2). Стоїть угорі
 * рейлу: для (б) це головна відповідь про строк, і на 1366×768 вона не має
 * опинятись під стосом рахунків.
 *
 * Дата рахується з проведених платіжок по рахунках оренди. Гроші на балансі
 * (нерозпізнана платіжка) названо окремим рядком, і дата з ними — окремо:
 * мовчки зливати їх не можна, бо під них немає рахунку, а значить і АВР.
 * Тому замість голого «перенести повернення» блок пропонує виставити рахунок
 * на доби, які ці гроші покривають, — повернення переноситься разом із ним.
 */
export function Coverage({ rent, onInvoiceTo }: { rent: Rent; onInvoiceTo: (to: string) => void }) {
  const c = coveredUntil(rent)
  const rate = dailyGross(rent)
  const has = c.money > 0 && c.days > 0
  const returnDays = daysIncl(rent.issueAt, rent.returnAt)
  const todayDays = daysIncl(rent.issueAt, rent.today)
  const span = Math.max(returnDays, has ? c.days : 0, todayDays)
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / span) * 100))}%`
  const extra = has ? c.days - returnDays : 0
  const billedTo = rentBilledUntil(rent)
  // Доби, які покривають гроші, але під які ще немає рахунку.
  const uninvoiced = has && billedTo && c.date > billedTo
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" aria-label="Оренда: до якої дати вистачить" data-testid="coverage">
      <header className="flex items-center gap-2">
        <h2 className="text-body font-semibold text-fg">Оренда</h2>
        <Proposal note="Замість кнопки «Продовжити оренду»: проведені платіжки по рахунках оренди з ПДВ, поділені на ставку за добу з ПДВ. Гроші на балансі — окремо. Застава не входить." />
        <span className="ml-auto text-label tabular-nums text-muted-fg">повернення {fmtDay(rent.returnAt)}</span>
      </header>
      {has ? (
        <>
          <p className="mt-1 text-body text-fg-2">
            Грошей вистачить до{' '}
            <span className="font-semibold tabular-nums text-fg" data-testid="covered-until">
              {fmtDate(c.date)}
            </span>
          </p>
          <p className="text-label tabular-nums text-muted-fg">
            {formatMoney(c.money)} з ПДВ ÷ {formatMoney(rate)} за добу = {daysWord(c.days)} від {fmtDay(rent.issueAt)}
          </p>
          {c.balance > 0 && (
            <p className="mt-0.5 text-label text-fg-2" data-testid="coverage-balance">
              з них <span className="font-medium tabular-nums">{formatMoney(c.balance)}</span> на балансі, без рахунку; за рахунками — до {fmtDay(c.invoiced.date)}
            </p>
          )}
          <div className="relative mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: pct(c.invoiced.days) }} />
            {c.balance > 0 && <div className="absolute inset-y-0 rounded-r-full bg-success/40" style={{ left: pct(c.invoiced.days), width: `calc(${pct(c.days)} - ${pct(c.invoiced.days)})` }} />}
            <div className="absolute -top-1 h-3.5 w-px bg-fg" style={{ left: pct(returnDays) }} />
            <div className="absolute -top-0.5 size-2.5 -translate-x-1/2 rounded-full border-2 border-card bg-accent" style={{ left: pct(todayDays) }} />
          </div>
        </>
      ) : (
        <p className="mt-1 text-body text-fg-2">Проведених оплат за оренду ще немає</p>
      )}
      {uninvoiced && extra > 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-success-soft px-2.5 py-1.5" data-testid="coverage-extend">
          <p className="min-w-0 flex-1 text-label text-success-fg">Гроші покривають ще {forDays(extra)} після повернення — під них потрібен рахунок.</p>
          <Button size="sm" variant="secondary" onClick={() => onInvoiceTo(c.date)} data-testid="coverage-invoice">
            Рахунок до {fmtDay(c.date)}
          </Button>
        </div>
      ) : (
        // Рядок стану є завжди: його поява не має штовхати стос рахунків нижче (вимір зсуву).
        <p className={cn('mt-1.5 text-label', has && extra < 0 ? 'text-warning-fg' : 'text-muted-fg')}>
          {has && extra < 0 ? `Оплати бракує на ${forDays(-extra)} до повернення за планом.` : 'Застава — окремо, у «вистачить до» не входить.'}
        </p>
      )}
    </section>
  )
}
