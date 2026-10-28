import { useMemo, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RentHeader } from './RentHeader'
import { RentStageStepper } from './RentStageStepper'
import { CardContext, type CardActions } from './card-context'
import { Chronology } from './Chronology'
import { PrintDialog } from './print/PrintDialog'
import { rentStageForStatus } from './stages'
import { useLab } from '@/lab/lab-state'
import { useStore } from '@/state/store'
import { VARIANT_UI } from '@/variants/registry'
import type { Invoice } from '@/mock/types'

/**
 * Картка оренди: шапка з табами, степер етапів, вміст табу і липкий рейл
 * варіанта. Перегляд етапу (`stage` у віджеті) не змінює стан оренди —
 * фронтир степера показує, де оренда стоїть насправді.
 *
 * Скрол живе в області вмісту: `globals.css` ставить `html { overflow: clip }`.
 */
export function RentCard() {
  const { step, stage, setStage, party } = useLab()
  const { rent } = useStore()
  // Фізособа — чинним флоу: у скоупі прототипу тільки юрособа.
  const ui = party === 'fl' ? VARIANT_UI['0'] : (VARIANT_UI[step] ?? VARIANT_UI['0'])
  const [tab, setTab] = useState(ui.tabs[0])
  const [chronology, setChronology] = useState(false)
  const [printing, setPrinting] = useState<{ id: string; set: string[] } | null>(null)
  const [errand, setErrand] = useState<CardActions['errand']>(null)

  const actions = useMemo<CardActions>(
    () => ({
      tab,
      setTab: (t) => (t === 'Хронологія' ? setChronology(true) : setTab(t)),
      openPrint: (inv, set) => setPrinting({ id: inv.id, set: (set ?? [inv]).map((i) => i.id) }),
      openChronology: () => setChronology(true),
      errand,
      setErrand,
    }),
    [tab, errand],
  )

  const frontier = rentStageForStatus(rent.status)
  // Діалог читає рахунки з живого стору: номер, що прийшов з 1С, видно одразу.
  const live = printing ? (rent.invoices.find((i) => i.id === printing.id) ?? null) : null
  const liveSet = printing ? (printing.set.map((id) => rent.invoices.find((i) => i.id === id)).filter(Boolean) as Invoice[]) : []
  const Other = ui.Tabs[tab]

  return (
    <CardContext.Provider value={actions}>
      <TooltipProvider delayDuration={150}>
        <div className="flex h-full flex-col overflow-hidden bg-bg">
          <div className="shrink-0 border-b border-border">
            <RentHeader rent={rent} tabs={ui.tabs} tab={tab} onTab={actions.setTab} onOpenTimeline={() => setChronology(true)} />
          </div>

          <div data-testid="card-scroll" className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 pb-6 pt-3">
              <div className="mx-auto flex max-w-page flex-col gap-3">
                {party === 'fl' && (
                  <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-label text-muted-fg" data-testid="fl-note">
                    Фізособа показана чинним флоу проду. Варіанти прототипу стосуються тільки юрособи.
                  </p>
                )}
                {tab === 'Оренда' ? (
                  <>
                    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                      <RentStageStepper current={stage} maxStage={frontier} onStageSelect={setStage} allowAllStages />
                    </div>
                    <div className={ui.wideRail ? 'rent-grid rent-grid--wide' : 'rent-grid'}>
                      <div className="min-w-0" data-testid="step-column">
                        <ui.RentTab stage={stage} />
                      </div>
                      <aside className="min-w-0 self-start lg:sticky lg:top-0" data-testid="rail" aria-label="Підсумок оренди">
                        <ui.Rail />
                      </aside>
                    </div>
                  </>
                ) : Other ? (
                  <Other />
                ) : (
                  <p className="px-1 py-6 text-body text-muted-fg" data-testid="out-of-scope">
                    Вкладка «{tab}» поза скоупом прототипу.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        <Chronology open={chronology} onClose={() => setChronology(false)} />
        <PrintDialog
          rent={rent}
          invoice={live}
          set={liveSet}
          onPick={(inv) => setPrinting((p) => (p ? { ...p, id: inv.id } : p))}
          onClose={() => setPrinting(null)}
        />
      </TooltipProvider>
    </CardContext.Provider>
  )
}
