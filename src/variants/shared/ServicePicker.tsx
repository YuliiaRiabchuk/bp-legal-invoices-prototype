import { useMemo, useRef, useState, type Ref } from 'react'
import { ChevronsUpDown, Search } from 'lucide-react'
import { ComboboxPopover } from '@/components/ui/combobox-popover'
import { Input } from '@/components/ui/input'
import { ARTICLES, type Article } from '@/domain/invoicing'
import { cn } from '@/lib/utils'

/** Що менеджер найчастіше дописує в рахунок ЮЛ — блок «Рекомендовані». */
const SUGGESTED = new Set(['delivery', 'cleaning', 'deposit'])

/**
 * Вибір послуги для рядка рахунку — за зразком CRM `ServiceCombobox`
 * (`features/rents/detail/body/ServiceCombobox.tsx`): кнопка-тригер з
 * повною назвою послуги, попап з пошуком і блоком «Рекомендовані» зверху.
 * У рахунок іде повна назва послуги з довідника, без ручного перейменування.
 */
export function ServicePicker({
  value,
  onSelect,
  invalid,
  triggerRef,
}: {
  value: string
  onSelect: (a: Article) => void
  invalid?: boolean
  triggerRef?: Ref<HTMLButtonElement>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const current = ARTICLES.find((a) => a.id === value)

  const { suggested, rest } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return { suggested: [] as Article[], rest: ARTICLES.filter((a) => `${a.label} ${a.service}`.toLowerCase().includes(q)) }
    return { suggested: ARTICLES.filter((a) => SUGGESTED.has(a.id)), rest: ARTICLES.filter((a) => !SUGGESTED.has(a.id)) }
  }, [query])

  const row = (a: Article) => (
    <li key={a.id}>
      <button
        type="button"
        onClick={() => {
          onSelect(a)
          setOpen(false)
          setQuery('')
        }}
        className={cn('flex w-full flex-col px-3 py-1.5 text-left hover:bg-muted/60', a.id === value && 'bg-muted/40')}
        data-testid={`service-option-${a.id}`}
      >
        <span className={cn('truncate text-body', a.id === value && 'font-medium')}>{a.service}</span>
        <span className="text-label text-muted-fg">
          {a.label}
          {a.deposit ? ' · окремим рахунком без ПДВ' : !a.vatable ? ' · без ПДВ' : ''}
          {a.sale ? ' · реалізація, під неї видаткова' : ''}
        </span>
      </button>
    </li>
  )

  return (
    <ComboboxPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
      initialFocusRef={searchRef}
      matchTriggerWidth={false}
      minWidth="24rem"
      trigger={
        <button
          type="button"
          ref={triggerRef}
          data-testid="service-combobox-trigger"
          aria-label="Вибрати послугу"
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-1.5 rounded-md text-left',
            'border border-border bg-card px-2.5 text-body text-fg transition-colors',
            'hover:border-border-strong focus-visible:border-fg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-fg/5',
            'aria-[invalid=true]:border-danger',
          )}
        >
          <span className={cn('truncate', !current && 'text-muted-fg')}>{current?.service ?? 'Виберіть послугу'}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-fg" aria-hidden />
        </button>
      }
    >
      <div className="contents">
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          <Search className="size-3.5 text-muted-fg" aria-hidden />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук послуги"
            className="h-7 border-0 px-1 py-0 text-body focus-visible:ring-0"
            data-testid="service-combobox-search"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1" data-testid="service-combobox-list">
          {suggested.length > 0 && (
            <>
              <li className="px-3 pb-1 pt-1.5 text-mono uppercase tracking-[0.04em] text-muted-fg">Рекомендовані</li>
              {suggested.map(row)}
              <li className="my-1 border-t border-border" aria-hidden />
            </>
          )}
          {rest.map(row)}
          {rest.length === 0 && suggested.length === 0 && <li className="px-3 py-2 text-label text-muted-fg">Нічого не знайдено</li>}
        </ul>
      </div>
    </ComboboxPopover>
  )
}
