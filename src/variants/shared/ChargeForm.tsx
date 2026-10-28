import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { orgOf, vatFor } from '@/domain/money'
import { ARTICLES, ARTICLE_BY_ID } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

/**
 * «+ Нарахування»: нарахування оренди без рахунку. Воно стає в
 * «Не виставлено», звідки його беруть у рахунок або закривають готівкою.
 * Штрафні санкції за замовчуванням без ПДВ, галочка міняє (§3).
 *
 * «Додати й виставити» — той самий рух, що й у проді «Додати й перейти до
 * оплати», тільки веде не на інший етап, а в бланк рахунку тут же.
 */
export function ChargeForm({ onClose, className }: { onClose: (thenInvoice: boolean) => void; className?: string }) {
  const { rent, dispatch } = useStore()
  const [kind, setKind] = useState<'charge' | 'discount'>('charge')
  const [articleId, setArticleId] = useState('')
  const [net, setNet] = useState('')
  const [vatable, setVatable] = useState(true)
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const articles = ARTICLES.filter((a) => !a.deposit && !a.sale)
  const a = ARTICLE_BY_ID.get(articleId)
  const amount = Number(net.replace(/\s/g, '').replace(',', '.')) || 0
  const valid = (kind === 'discount' || !!a) && amount > 0
  const gross = amount * (1 + vatFor(rent, vatable) / 100)

  const add = (thenInvoice: boolean) => {
    if (!valid) return
    dispatch({
      type: 'CHARGE_ADD',
      charge: {
        kind,
        article: kind === 'discount' ? 'Знижка' : a!.label,
        service: kind === 'discount' ? 'Знижка на послуги оренди' : a!.service,
        net: amount,
        vatable,
      },
    })
    onClose(thenInvoice)
  }

  return (
    <form
      className={cn('border-b border-border bg-muted/50 px-3 pb-3 pt-2.5', className)}
      data-testid="charge-form"
      onSubmit={(e) => {
        e.preventDefault()
        add(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose(false)
      }}
    >
      <header className="flex items-center gap-2">
        <h3 className="text-body font-semibold text-fg">Нове нарахування</h3>
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Закрити"
          className="ml-auto grid size-6 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      <SegmentedControl
        size="sm"
        className="mt-2"
        value={kind}
        onChange={setKind}
        ariaLabel="Що додаємо"
        options={[
          { value: 'charge', label: 'Нарахування' },
          { value: 'discount', label: 'Знижка' },
        ]}
      />
      {kind === 'charge' && (
        <select
          ref={ref}
          value={articleId}
          aria-label="Стаття"
          data-testid="charge-form-article"
          onChange={(e) => {
            setArticleId(e.target.value)
            const next = ARTICLE_BY_ID.get(e.target.value)
            if (next) setVatable(next.vatable)
          }}
          className="mt-2 h-8 w-full rounded-md border border-border-strong bg-card px-2 text-body text-fg outline-none hover:border-border-hover focus:border-border-focus"
        >
          <option value="">Стаття…</option>
          {articles.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      )}
      {a && <p className="mt-1 text-label text-muted-fg">{a.service}</p>}
      <div className="mt-2 flex items-center gap-2 text-label text-muted-fg">
        <Input
          value={net}
          inputMode="decimal"
          placeholder="0"
          onChange={(e) => setNet(e.target.value)}
          aria-label="Сума без ПДВ"
          data-testid="charge-form-net"
          className="h-8 w-28 text-right tabular-nums"
        />
        без ПДВ
        {orgOf(rent).vatPayer && (
          <label className="flex items-center gap-1">
            <Checkbox checked={vatable} onCheckedChange={(v) => setVatable(v === true)} aria-label="З ПДВ" />
            ПДВ 20 %
          </label>
        )}
        <span className="ml-auto font-medium tabular-nums text-fg">{amount > 0 ? formatMoney(kind === 'discount' ? -gross : gross) : '—'}</span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!valid} data-testid="charge-form-add">
          Додати
        </Button>
        <Button type="button" size="sm" disabled={!valid} onClick={() => add(true)} data-testid="charge-form-add-invoice">
          Додати й виставити
        </Button>
      </div>
    </form>
  )
}
