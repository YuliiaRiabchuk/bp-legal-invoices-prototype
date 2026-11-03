import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCard } from '@/features/rent/card-context'
import type { StageKey } from '@/mock/types'
import { Proposal } from '../shared/Proposal'
import { ProdPage } from '../shared/ProdPage'

/**
 * Варіант D — рахунок живе в «Документах». Сторінка кроку — сторінка проду;
 * у таблиці «Нарахування та знижки» з'явились галочки: менеджер сам обирає,
 * що піде в новий рахунок, і виписує його одразу звідти. Усі рахунки — у
 * вкладці «Документи» деревом, як в 1С: рахунок, під ним платіжки, АВР і
 * видаткова.
 *
 * Продовження (а): кнопка «Продовжити оренду» в шапці.
 */
export function RentTabD({ stage }: { stage: StageKey }) {
  const { setTab, setInvoiceErrand } = useCard()
  const toDocs = (e: Parameters<typeof setInvoiceErrand>[0]) => {
    setInvoiceErrand(e)
    setTab('Документи')
  }
  return (
    <ProdPage
      stage={stage}
      slots={{
        where: 'у вкладці «Документи»',
        cardsFooter: (
          <div className="mt-2 flex items-center gap-2" data-testid="cards-footer">
            <p className="min-w-0 flex-1 text-label text-muted-fg">Усі рахунки — у «Документах», з платіжками, АВР і видатковими під кожним.</p>
            <Button size="sm" variant="secondary" onClick={() => setTab('Документи')} data-testid="to-documents">
              Документи
              <ArrowRight aria-hidden />
            </Button>
          </div>
        ),
        selectable: { onInvoice: (ids) => toDocs({ via: 'charge', chargeIds: ids }) },
        onChargeInvoice: (id) => toDocs({ via: 'charge', chargeId: id }),
        equipmentFooter: (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовжити оренду — кнопка в шапці картки: вона одразу виписує рахунок на нові доби.
            <Proposal note="Продовження (а): кнопка створює рахунок на новий період і зсуває повернення." />
          </p>
        ),
        closedNote: 'Оренду закрито. Рахунки відкриваються з вкладки «Документи», стан оренди від цього не змінюється.',
      }}
    />
  )
}
