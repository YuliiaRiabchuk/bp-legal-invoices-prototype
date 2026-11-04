import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCard } from '@/features/rent/card-context'
import type { StageKey } from '@/mock/types'
import { Proposal } from '../shared/Proposal'
import { ProdPage } from '../shared/ProdPage'
import { ProdRail } from '../shared/ProdRail'
import { Coverage } from '../shared/Coverage'
import { useStore } from '@/state/store'

/**
 * Варіант A — вкладка «Рахунки». Сторінка кроку — сторінка проду без змін;
 * новий тільки таб у шапці картки: реєстр усіх рахунків з розкриттям, як
 * журнал у бухгалтерії. Вхід «новий рахунок» — у реєстрі.
 *
 * Продовження — як у BP-2307: кнопки «Продовжити оренду» для ЮЛ немає, на
 * «В роботі» стоїть «грошей вистачить до», а рахунок на нові доби
 * виписується з реєстру.
 */
export function RentTabA({ stage }: { stage: StageKey }) {
  const { setTab, setInvoiceErrand } = useCard()
  const { rent } = useStore()
  return (
    <ProdPage
      stage={stage}
      slots={{
        where: 'у вкладці «Рахунки»',
        cardsFooter: <ToRegistry />,
        onChargeInvoice: (id) => {
          setInvoiceErrand({ via: 'charge', chargeId: id })
          setTab('Рахунки')
        },
        activeBlock: (
          <Coverage
            rent={rent}
            onInvoiceTo={(to) => {
              setInvoiceErrand({ via: 'period', to })
              setTab('Рахунки')
            }}
          />
        ),
        equipmentFooter: (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовжити оренду — рахунком на новий період у вкладці «Рахунки»; кнопки продовження для ЮЛ немає.
            <Proposal note="BP-2307: кнопку «Продовжити оренду» для ЮЛ прибрано, у ФО вона лишається. Оренда ЮЛ продовжується новим рахунком." />
          </p>
        ),
        closedNote: 'Оренду закрито. Рахунки відкриваються з вкладки «Рахунки», стан оренди від цього не змінюється.',
      }}
    />
  )
}

function ToRegistry() {
  const { setTab } = useCard()
  return (
    <div className="mt-2 flex items-center gap-2" data-testid="cards-footer">
      <p className="min-w-0 flex-1 text-label text-muted-fg">Усі рахунки оренди — окремою вкладкою, зі статусами й оплатами.</p>
      <Button size="sm" variant="secondary" onClick={() => setTab('Рахунки')} data-testid="to-registry">
        Вкладка «Рахунки»
        <ArrowRight aria-hidden />
      </Button>
    </div>
  )
}

/** Рейл проду; у «Розрахунках за орендою» поруч із нарахуванням — вхід у реєстр. */
export function RailA() {
  const { setTab, setInvoiceErrand } = useCard()
  return (
    <ProdRail
      settlementExtra={
        <button
          type="button"
          className="flex items-center gap-1 text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          onClick={() => {
            setInvoiceErrand({ via: 'button' })
            setTab('Рахунки')
          }}
          data-testid="rail-add-invoice"
        >
          <Plus className="size-3" aria-hidden />
          Рахунок
        </button>
      }
    />
  )
}
