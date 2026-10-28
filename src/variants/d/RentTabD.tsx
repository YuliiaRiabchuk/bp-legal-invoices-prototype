import type { Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from '../shared/Proposal'
import { DraftStage, HandoverControls, OutOfScope, Positions, ToClosing } from '../shared/stage-blocks'
import { BookD } from './BookD'

/**
 * Вкладка «Оренда» варіанта D: книга розрахунків на кожному етапі після
 * оформлення. Книга і є крок «Оплата» — окремого блоку способів немає.
 */
export function RentTabD({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return (
        <div className="flex flex-col gap-4">
          <DraftStage rent={rent} where="у книзі «Рахунки і оплати»" />
          <BookD />
        </div>
      )
    case 'payment':
      return (
        <div className="flex flex-col gap-4" data-step="payment">
          <BookD />
          <section className="rounded-lg border border-border bg-card px-4 py-3" data-testid="handover-block">
            <h2 className="mb-2 text-title font-semibold text-fg">Видача</h2>
            <HandoverControls rent={rent} />
          </section>
        </div>
      )
    case 'active':
      return <ActiveD rent={rent} />
    case 'closing':
      return (
        <div className="flex flex-col gap-4">
          {rent.status !== 'CLOSED' && <OutOfScope text="Повернення і закриття поза скоупом прототипу." />}
          <BookD />
        </div>
      )
    default:
      return (
        <div className="flex flex-col gap-4">
          <OutOfScope text="Видача поза скоупом прототипу." />
          <BookD />
        </div>
      )
  }
}

function ActiveD({ rent }: { rent: Rent }) {
  return (
    <div className="flex flex-col gap-4" data-step="active">
      <BookD />
      <Positions
        rent={rent}
        footer={
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовження — кнопкою «Продовжити оренду» в шапці: вона одразу виписує рахунок на нові доби.
            <Proposal note="Продовження (а): кнопка створює рахунок на новий період і зсуває повернення." />
          </p>
        }
      />
      <ToClosing />
    </div>
  )
}
