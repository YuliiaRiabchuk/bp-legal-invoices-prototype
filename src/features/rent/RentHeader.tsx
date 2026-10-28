import { ChevronLeft, Copy, History, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { statusLabel } from './stages'
import type { Rent, RentStatus } from '@/mock/types'

const STATUS_TONE: Record<RentStatus, 'warning' | 'success' | 'accent' | 'danger' | 'default'> = {
  DRAFT: 'default',
  PENDING_PAYMENT: 'warning',
  PENDING_HANDOVER: 'accent',
  ACTIVE: 'success',
  EXPIRING_SOON: 'warning',
  OVERDUE: 'danger',
  AWAITING_CLOSURE: 'accent',
  CLOSED: 'default',
}

/**
 * Шапка картки оренди: ім'я контрагента, код оренди, статус, хто оформив.
 * Праворуч «Хронологія» і меню. Нижче — таби картки варіанта.
 *
 * Чип «1С: очікує №» у проді стосується акта оренди, а не рахунку (N7), тому
 * в прототипі його немає.
 */
export function RentHeader({
  rent,
  tabs,
  tab,
  onTab,
  onOpenTimeline,
  action,
}: {
  rent: Rent
  tabs: string[]
  tab: string
  onTab: (tab: string) => void
  onOpenTimeline: () => void
  /** Дія варіанта в шапці оренди (продовження (а) в A і D). */
  action?: React.ReactNode
}) {
  return (
    <header className="bg-card px-4">
      <div className="mx-auto flex max-w-page items-start justify-between gap-3 pt-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button variant="ghost" size="icon" aria-label="Назад до реєстру оренд" className="size-control shrink-0">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-headline font-semibold tracking-tight" data-testid="rent-title">
              {rent.counterparty.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-body font-semibold text-fg-2">
                {rent.code}
                <Copy className="size-3 text-muted-fg" aria-hidden />
              </span>
              <Badge variant={STATUS_TONE[rent.status]} data-testid="rent-status">
                {statusLabel(rent.status)}
              </Badge>
              <Badge variant="outline">Активних оренд: {rent.counterparty.activeRents}</Badge>
              <span className="flex items-center gap-1.5 text-label text-muted-fg">
                Оформлена:
                <span className="grid size-5 place-items-center rounded-full bg-teal-soft text-mono font-semibold text-teal-fg">
                  {rent.manager.initials}
                </span>
                <span className="text-fg-2">{rent.manager.name}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <Button variant="ghost" size="sm" onClick={onOpenTimeline} data-testid="open-timeline">
            <History className="size-3.5" aria-hidden />
            Хронологія
          </Button>
          <Button variant="ghost" size="icon" aria-label="Ще дії">
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </div>
      <nav className="mx-auto mt-2 flex max-w-page gap-5 pl-10" aria-label="Розділи оренди та клієнта" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => onTab(t)}
            data-testid={`tab-${t}`}
            className={cn(
              'border-b-2 pb-2 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
              t === tab ? 'border-fg font-medium text-fg' : 'border-transparent text-muted-fg hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </nav>
    </header>
  )
}
