import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoiceBlocked, lastRentInvoice, nextPeriod } from '@/domain/invoicing'
import { fmtDay } from '@/domain/money'
import { useCard } from '@/features/rent/card-context'
import type { Invoice } from '@/mock/types'
import { useStore } from '@/state/store'
import { DocumentsTree } from '../shared/DocumentsTree'
import { InvoiceComposer, type ComposerSeed } from '../shared/InvoiceComposer'
import { CancelConfirm, InvoiceMenu } from '../shared/invoice-parts'

/**
 * «Документи» варіанта D: дерево, як в 1С, плюс кнопка «Додатковий рахунок».
 * Бланк розгортається під шапкою списку; до нього ж веде «Виписати рахунок
 * на обрані» з кроку. Редагування й скасування — з меню рядка.
 */
export function DocumentsD() {
  const { rent } = useStore()
  const { invoiceErrand, setInvoiceErrand } = useCard()
  const [seed, setSeed] = useState<ComposerSeed | null>(null)
  const [cancelling, setCancelling] = useState<Invoice | null>(null)
  const nonce = useRef(0)
  const open = (s: Omit<Extract<ComposerSeed, { mode: 'new' }>, 'mode' | 'nonce'> | { invoiceId: string }) => {
    nonce.current++
    setSeed('invoiceId' in s ? { mode: 'edit', invoiceId: s.invoiceId, nonce: nonce.current } : { mode: 'new', ...s, nonce: nonce.current })
  }
  useEffect(() => {
    if (!invoiceErrand) return
    open(invoiceErrand)
    setInvoiceErrand(null)
  }, [invoiceErrand, setInvoiceErrand])
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
              <Button size="sm" variant="secondary" onClick={() => open({ via: 'period' })} data-testid="docs-next-period" data-main-action="next-period">
                Виставити
              </Button>
            </div>
          )}
          {seed && (
            <div className="border-b border-border bg-muted/50 px-4 py-3">
              <InvoiceComposer key={seed.nonce} seed={seed} onClose={() => setSeed(null)} className="max-w-xl rounded-lg border border-border bg-card" />
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
