import type { StageKey } from '@/mock/types'
import { useCard } from '@/features/rent/card-context'
import { Proposal } from '../shared/Proposal'
import { ProdPage } from '../shared/ProdPage'

/**
 * Варіант B — рахунки в рейлі. Сторінка кроку — сторінка проду без змін;
 * новий тільки правий рейл: у ньому стос рахунків на всіх етапах, «+ Рахунок»
 * поруч із «+ Нарахування» (як «+ Доп. нарахування» в bp-1259) і «Оренда:
 * грошей вистачить до» замість кнопки продовження.
 *
 * Продовження (б).
 */
export function RentTabB({ stage }: { stage: StageKey }) {
  const { setInvoiceErrand } = useCard()
  return (
    <ProdPage
      stage={stage}
      slots={{
        where: 'у рейлі праворуч',
        cardsFooter: (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-label text-muted-fg" data-testid="cards-footer">
            Усі рахунки оренди — стосом у рейлі праворуч, на кожному етапі.
            <Proposal note="Рахунки живуть у рейлі й не дублюються на кроці." />
          </p>
        ),
        onChargeInvoice: (id) => setInvoiceErrand({ via: 'charge', chargeId: id }),
        equipmentFooter: (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовжити оренду — рахунком на новий період із рейлу; блок «Оренда» там показує, до якої дати вистачить грошей.
            <Proposal note="Продовження (б): кнопки «Продовжити оренду» немає." />
          </p>
        ),
        closedNote: 'Оренду закрито. Рахунки відкриваються й друкуються з рейлу, стан оренди від цього не змінюється.',
      }}
    />
  )
}
