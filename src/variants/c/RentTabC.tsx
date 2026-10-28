import type { Rent, StageKey } from '@/mock/types'
import { useCard } from '@/features/rent/card-context'
import { useStore } from '@/state/store'
import { ChargesLedger, PaymentsLedger } from '../shared/Ledger'
import { Proposal } from '../shared/Proposal'
import { DraftStage, OutOfScope, PaymentStage, Positions, Section, ToClosing } from '../shared/stage-blocks'

/**
 * Ліва колонка варіанта C. Рахунки — на стрічці над кроком; крок тримає
 * обладнання, нарахування з виходом на стрічку («У рахунок») і перехід далі.
 */
export function RentTabC({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  switch (stage) {
    case 'draft':
      return <DraftStage rent={rent} where="на стрічці вгорі" />
    case 'payment':
      return (
        <PaymentStage
          rent={rent}
          where="на стрічці вгорі, в деталях обраного рахунку"
          whereNote="Рахунки — на стрічці над кроком на всіх етапах; крок оплати їх не дублює."
          showPayments={false}
        />
      )
    case 'active':
      return <ActiveC rent={rent} />
    case 'closing':
      return rent.status === 'CLOSED' ? (
        <div className="flex flex-col gap-4">
          <Positions rent={rent} footer={<p className="text-label text-muted-fg">Оренду закрито. Рахунок відкривається з мітки на стрічці, стан оренди від цього не змінюється.</p>} />
          <Section title="Надходження">
            <PaymentsLedger rent={rent} />
          </Section>
        </div>
      ) : (
        <OutOfScope text="Повернення і закриття поза скоупом прототипу. Рахунки — на стрічці вгорі." />
      )
    default:
      return <OutOfScope text="Видача поза скоупом прототипу. Рахунки — на стрічці вгорі." />
  }
}

function ActiveC({ rent }: { rent: Rent }) {
  const { setInvoiceErrand } = useCard()
  return (
    <div className="flex flex-col gap-4" data-step="active">
      <Section title="Нарахування" testId="charges-section" aside={<Proposal note="Реєстр нарахувань з місцем кожного; невиставлене — у рахунок на стрічці або готівкою." />}>
        <ChargesLedger rent={rent} onInvoice={(id) => setInvoiceErrand({ via: 'charge', chargeId: id })} />
      </Section>
      <Positions
        rent={rent}
        footer={
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовження — рахунком з прогалини на стрічці; «вистачить до» стоїть на тій самій осі.
            <Proposal note="Продовження (б): кнопки «Продовжити оренду» немає." />
          </p>
        }
      />
      <ToClosing />
    </div>
  )
}
