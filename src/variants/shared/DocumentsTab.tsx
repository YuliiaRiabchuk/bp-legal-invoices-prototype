import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoiceBlocked, lastRentInvoice, nextPeriod } from '@/domain/invoicing'
import { fmtDay } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import type { Invoice } from '@/mock/types'
import { useStore } from '@/state/store'
import { DocumentsTree } from './DocumentsTree'
import { InvoiceComposer, type ComposerSeed } from './InvoiceComposer'
import { CancelConfirm, InvoiceMenu } from './invoice-parts'

/**
 * «Документи» нових варіантів — як домовились на синку 23.10 (BP-2060):
 * усі рахунки оренди списком з номерами 1С, там же кнопка «Додатковий
 * рахунок». Бланк розгортається під шапкою, правка і скасування — з меню.
 */
export function DocumentsTab() {
  const { rent } = useStore()
  const [seed, setSeed] = useState<ComposerSeed | null>(null)
  const [cancelling, setCancelling] = useState<Invoice | null>(null)
  const nonce = useRef(0)
  const { invoiceErrand, setInvoiceErrand, tab } = useCard()
  const open = (s: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'mode' | 'nonce'> | { invoiceId: string }) => {
    nonce.current++
    setSeed('invoiceId' in s ? { mode: 'edit', invoiceId: s.invoiceId, nonce: nonce.current } : { mode: 'new', ...s, nonce: nonce.current })
  }
  // Доручення «виписати рахунок» забирає тільки та вкладка, що зараз відкрита.
  useEffect(() => {
    if (!invoiceErrand || tab !== 'Документи') return
    open(invoiceErrand)
    setInvoiceErrand(null)
  }, [invoiceErrand, setInvoiceErrand, tab])
  const blocked = invoiceBlocked(rent)
  const np = nextPeriod(rent)
  const prev = lastRentInvoice(rent)
  return (
    <DocumentsTree
      action={
        <Button
          size="sm"
          disabled={!!blocked}
          title={blocked ?? undefined}
          variant={seed ? 'secondary' : 'default'}
          onClick={() => open({ via: 'button' })}
          data-testid="docs-new-invoice"
          data-main-action="invoice"
        >
          <Plus aria-hidden />
          Додатковий рахунок
        </Button>
      }
      menu={(inv) => <InvoiceMenu rent={rent} inv={inv} onEdit={() => open({ invoiceId: inv.id })} onCancel={() => setCancelling(inv)} />}
      panel={
        <>
          {!seed && np.due && prev && rent.status !== 'CLOSED' && (
            <div className="flex items-center gap-3 border-b border-border bg-accent-soft/60 px-4 py-2" data-testid="next-period-hint">
              <p className="min-w-0 flex-1 text-body text-accent-fg">
                Наступний період {fmtDay(np.from)}–{fmtDay(np.to)} на основі № {prev.number ?? '—'}
              </p>
              <Button size="sm" variant="secondary" onClick={() => open({ via: 'period' })} data-testid="docs-next-period">
                Виставити
              </Button>
            </div>
          )}
          {seed && (
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <InvoiceComposer key={seed.nonce} seed={seed} onClose={() => setSeed(null)} />
            </div>
          )}
          {cancelling && (
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <CancelConfirm inv={cancelling} className="max-w-md" onDone={() => setCancelling(null)} />
            </div>
          )}
        </>
      }
    />
  )
}
