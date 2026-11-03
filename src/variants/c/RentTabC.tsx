import { FileText } from 'lucide-react'
import { StageRail } from '@/features/rent/StageRail'
import { useCard } from '@/features/rent/card-context'
import { invoiceState } from '@/domain/money'
import type { StageKey } from '@/mock/types'
import { useStore } from '@/state/store'
import { CoverageB } from '../b/RailB'
import { InvoiceBook } from '../shared/InvoiceBook'
import { Proposal } from '../shared/Proposal'
import { ProdPage } from '../shared/ProdPage'
import { ProdRail } from '../shared/ProdRail'
import { Section } from '../shared/stage-blocks'

/**
 * Варіант C — вузол «Рахунки на оплату» на хребті етапу. Сторінка проду
 * лишається: у вертикальний рейл вузлів між «Нарахуваннями» і «Прийомом
 * коштів» вставлено ще один вузол, де живуть усі рахунки, кожен зі своїми
 * платіжками, і «+ Рахунок». На «В роботі» той самий блок стоїть над
 * нарахуваннями.
 *
 * Продовження (б): кнопки немає, блок «до якої дати вистачить» стоїть там
 * само, де рахунки.
 */
export function RentTabC({ stage }: { stage: StageKey }) {
  const { rent } = useStore()
  const { setInvoiceErrand } = useCard()
  const live = rent.invoices.filter((i) => !i.cancelled)
  const waiting = live.filter((i) => !['paid', 'overpaid'].includes(invoiceState(rent, i).kind)).length
  const failed = live.some((i) => i.numberState === 'failed')
  const node = (
    <StageRail.Step
      key="invoices"
      tone={failed ? 'attention' : waiting ? 'partial' : live.length ? 'done' : 'idle'}
      icon={FileText}
      label="Рахунки на оплату"
      heading
      headingStatus={live.length ? (waiting ? `${waiting} чекає` : 'усі оплачені') : undefined}
    >
      <InvoiceBook embedded />
    </StageRail.Step>
  )
  return (
    <ProdPage
      stage={stage}
      slots={{
        where: 'у вузлі «Рахунки на оплату»',
        invoicesNode: node,
        activeBlock: (
          <>
            <CoverageB rent={rent} onInvoiceTo={(to) => setInvoiceErrand({ via: 'period', to })} />
            <Section title="Рахунки на оплату" aside={<Proposal note="Той самий вузол, що на кроці «Оплата»: рахунки не ховаються після видачі." />} testId="invoices-section">
              <InvoiceBook embedded />
            </Section>
          </>
        ),
        closedBlock: (
          <Section title="Рахунки на оплату" testId="invoices-section">
            <InvoiceBook embedded />
          </Section>
        ),
        onChargeInvoice: (id) => setInvoiceErrand({ via: 'charge', chargeId: id }),
        equipmentFooter: (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-fg">
            Продовжити оренду — рахунком на новий період у блоці нижче; кнопки продовження немає.
            <Proposal note="Продовження (б): система показує «грошей вистачить до <дата>», а рахунок на нові доби виписується з цієї дати." />
          </p>
        ),
        closedNote: 'Оренду закрито. Рахунок відкривається і друкується зі свого рядка в блоці «Рахунки на оплату», стан оренди не змінюється.',
      }}
    />
  )
}

export const RailC = ProdRail
