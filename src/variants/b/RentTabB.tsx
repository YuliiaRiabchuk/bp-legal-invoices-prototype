import type { Rent, StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { ChargesLedger, PaymentsLedger } from '../shared/Ledger'
import { Proposal } from '../shared/Proposal'
import { DraftStage, OutOfScope, PaymentStage, Positions, Section, ToClosing } from '../shared/stage-blocks'

/**
 * Ліва колонка варіанта B. Рахунків тут немає зовсім — вони в рейлі на
 * всіх етапах, тому крок не дублює ні суму до сплати, ні дії з рахунком.
 * Крок тримає те, що до рахунку не належить: обладнання, нарахування як
 * реєстр, гроші, що прийшли, і перехід далі.
 */
export function RentTabB({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return <DraftStage rent={rent} where="у рейлі праворуч" />
    case 'payment':
      return (
        <PaymentStage
          rent={rent}
          where="на картках у рейлі праворуч"
          whereNote="Рахунки живуть у рейлі на всіх етапах; крок оплати їх не дублює."
        />
      )
    case 'active':
      return <ActiveB rent={rent} />
    case 'closing':
      return rent.status === 'CLOSED' ? <ClosedB rent={rent} /> : <OutOfScope text="Повернення і закриття поза скоупом прототипу. Рахунки — у рейлі праворуч." />
    default:
      return <OutOfScope text="Видача поза скоупом прототипу. Рахунки — у рейлі праворуч." />
  }
}

function ActiveB({ rent }: { rent: Rent }) {
  return (
    <div className="flex flex-col gap-4" data-step="active">
      <Positions
        rent={rent}
        footer={
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовження — рахунком на новий період у рейлі; блок «Оренда» показує, до якої дати вистачить грошей.
            <Proposal note="Кнопки «Продовжити оренду» у варіанті B немає (продовження (б))." />
          </p>
        }
      />
      <Section title="Нарахування" testId="charges-section" aside={<Proposal note="Реєстр нарахувань з місцем кожного: у якому рахунку, оплачене готівкою чи ще не виставлене." />}>
        <ChargesLedger rent={rent} />
      </Section>
      <Section title="Надходження" testId="payments-section" aside={<Proposal note="Кожна платіжка називає свій рахунок. У проді біля платежу видно лише «Покриває: Оренда / Застава»." />}>
        <PaymentsLedger rent={rent} />
      </Section>
      <ToClosing />
    </div>
  )
}

function ClosedB({ rent }: { rent: Rent }) {
  return (
    <div className="flex flex-col gap-4" data-step="closed">
      <Positions rent={rent} footer={<p className="text-label text-muted-fg">Оренду закрито. Рахунки відкриваються й друкуються з рейлу, стан оренди від цього не змінюється.</p>} />
      <Section title="Надходження">
        <PaymentsLedger rent={rent} />
      </Section>
    </div>
  )
}
