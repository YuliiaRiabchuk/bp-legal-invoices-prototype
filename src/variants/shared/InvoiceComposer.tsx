import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { chargeLine, daysIncl, fmtDay, lineGross, lineNet, orgOf, vatFor } from '@/domain/money'
import { ARTICLES, ARTICLE_BY_ID, kindFor, linesTotal, nextPeriod, openCharges, periodLines } from '@/domain/invoicing'
import { formatAmount, formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Charge, InvoiceLine } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from './Proposal'

/**
 * Бланк нового рахунку — спільний для варіантів A–D; різниться тільки місце,
 * де він розгортається (рейл, реєстр, книга, стрічка). Одна форма на три входи:
 *  - «+ Рахунок» — відмічено все невиставлене; якщо виставляти нічого,
 *    одразу порожній рядок, як «+» у 1С;
 *  - «наступний період» — відмічено оренду з датами «з … по …» на основі
 *    попереднього рахунку;
 *  - «У рахунок» на нарахуванні — відмічено тільки його.
 *
 * Менеджер сам обирає, що йде в рахунок (§3): галочка на кожному рядку.
 * Рахунок народжується без номера; номер присвоює 1С.
 *
 * Застава ніколи не сумується з орендою: рядок «Гарантійний платіж» іде
 * окремим рахунком без ПДВ, і кнопка прямо каже «2 рахунки».
 */

export type ComposerSeed =
  | {
      mode: 'new'
      via: 'button' | 'period' | 'charge'
      chargeId?: string
      /** «По яке число» замість межі ритму — напр. дата «вистачить до». */
      to?: string
      nonce: number
    }
  | { mode: 'edit'; invoiceId: string; nonce: number }

interface FreeRow {
  key: string
  articleId: string
  service: string
  qty: string
  price: string
  vatable: boolean
  checked: boolean
}

const num = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

let freeSeq = 0
const blankFree = (): FreeRow => ({ key: `f${++freeSeq}`, articleId: '', service: '', qty: '1', price: '', vatable: true, checked: true })

export function InvoiceComposer({
  seed,
  onClose,
  className,
}: {
  seed: ComposerSeed
  onClose: (created: boolean) => void
  /** Обгортка: у рейлі — смуга на всю ширину, у реєстрі й книзі — вужчий бланк. */
  className?: string
}) {
  const { rent, dispatch } = useStore()
  const editing = seed.mode === 'edit' ? rent.invoices.find((i) => i.id === seed.invoiceId) : undefined
  const np = nextPeriod(rent)
  const charges = openCharges(rent)

  // ── Оренда за період ──
  const editRent = editing?.period && editing.lines.some((l) => l.days != null) ? editing : undefined
  const periodFrom = editRent?.period?.from ?? np.from
  const [rentOn, setRentOn] = useState(seed.mode === 'edit' ? !!editRent : seed.via === 'period')
  const [periodTo, setPeriodTo] = useState(editRent?.period?.to ?? (seed.mode === 'new' && seed.to && seed.to >= periodFrom ? seed.to : np.to))
  const days = Math.max(0, daysIncl(periodFrom, periodTo))
  // Рахунок за доби після планового повернення — сам привід перенести повернення,
  // інакше завтра оренда виглядатиме простроченою з оплаченим рахунком на руках.
  const [moveReturn, setMoveReturn] = useState(true)
  const beyondReturn = rentOn && days > 0 && periodTo > rent.returnAt
  const rentRows: InvoiceLine[] = useMemo(() => {
    if (editRent) return editRent.lines.filter((l) => l.days != null).map((l) => ({ ...l, days }))
    return periodLines(rent, days, 'draft').filter((l) => l.days != null)
  }, [editRent, rent, days])

  // ── Наявні рядки рахунку, що правиться (крім оренди) ──
  const [kept, setKept] = useState<{ line: InvoiceLine; checked: boolean }[]>(
    () => (editing?.lines ?? []).filter((l) => l.days == null).map((line) => ({ line, checked: true })),
  )

  // ── Невиставлені нарахування ──
  const [picked, setPicked] = useState<Set<string>>(() => {
    if (seed.mode === 'edit') return new Set()
    // «Додати й виставити»: id нового нарахування ще не відомий — беремо останнє.
    if (seed.via === 'charge') return new Set([seed.chargeId ?? charges.at(-1)?.id].filter(Boolean) as string[])
    if (seed.via === 'button') return new Set(charges.map((c) => c.id))
    return new Set()
  })

  // ── Вільні рядки (як «+» у 1С) ──
  const [free, setFree] = useState<FreeRow[]>(() =>
    seed.mode === 'new' && seed.via === 'button' && charges.length === 0 && !np.due ? [blankFree()] : [],
  )
  const firstFreeRef = useRef<HTMLSelectElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // Бланк, що розгорнувся нижче згину (книга, стрічка), підтягується в кадр
  // цілком: «Сформувати» має бути видно без ручної прокрутки.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  // Фокус — у бланк одразу, щоб Esc і Tab працювали без пошуку; після
  // закриття — назад на кнопку, з якої бланк відкрили.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (free.length === 1 && !free[0].articleId) firstFreeRef.current?.focus()
    else formRef.current?.querySelector<HTMLElement>('button[role="checkbox"], select, input, textarea')?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  const vatPayer = orgOf(rent).vatPayer
  const freeLine = (f: FreeRow): InvoiceLine | null => {
    const a = ARTICLE_BY_ID.get(f.articleId)
    const price = num(f.price)
    const qty = Math.max(1, Math.round(num(f.qty)))
    if (!a || !f.service.trim() || price <= 0) return null
    return {
      id: `free-${f.key}`,
      service: f.service.trim(),
      qty: a.sale ? qty : 1,
      days: null,
      priceNet: price,
      vatRate: a.deposit ? 0 : vatFor(rent, f.vatable),
      from: a.deposit ? { deposit: true } : { chargeId: `new:${f.key}` },
      sale: a.sale,
    }
  }

  const chosenCharges = charges.filter((c) => picked.has(c.id))
  const chargeLines = chosenCharges.map((c) => chargeLine(rent, c, 'draft'))
  const freeLines = free.filter((f) => f.checked).map((f) => [f, freeLine(f)] as const)
  const freeValid = freeLines.filter(([, l]) => l).map(([f, l]) => [f, l!] as const)
  const freeInvalid = freeLines.length - freeValid.length

  const main: InvoiceLine[] = [
    ...(rentOn ? rentRows : []),
    ...kept.filter((k) => k.checked && !k.line.from?.deposit).map((k) => k.line),
    ...chargeLines,
    ...freeValid.filter(([, l]) => !l.from?.deposit).map(([, l]) => l),
  ]
  const deposit: InvoiceLine[] = [
    ...kept.filter((k) => k.checked && k.line.from?.deposit).map((k) => k.line),
    ...freeValid.filter(([, l]) => l.from?.deposit).map(([, l]) => l),
  ]
  const count = (main.length ? 1 : 0) + (deposit.length ? 1 : 0)
  const canSubmit = count > 0 && freeInvalid === 0 && (!rentOn || days > 0) && !(editing && count > 1)

  const submit = () => {
    if (!canSubmit) return
    const period = rentOn ? { from: periodFrom, to: periodTo } : undefined
    const newCharges = freeValid
      .filter(([, l]) => !l.from?.deposit)
      .map(([f, l]) => {
        const a = ARTICLE_BY_ID.get(f.articleId)!
        const charge: Omit<Charge, 'id' | 'createdAt' | 'createdBy'> = {
          kind: 'charge',
          article: a.label,
          service: l.service,
          net: lineNet(l),
          vatable: l.vatRate > 0,
        }
        return { key: f.key, charge }
      })
    if (editing) {
      const lines = main.length ? main : deposit
      dispatch({ type: 'INVOICE_COMPOSE', editId: editing.id, kind: kindFor(rent, lines, period), lines, period, newCharges })
    } else {
      if (main.length) dispatch({ type: 'INVOICE_COMPOSE', kind: kindFor(rent, main, period), lines: main, period, newCharges })
      if (deposit.length) dispatch({ type: 'INVOICE_COMPOSE', kind: 'deposit', lines: deposit })
    }
    if (beyondReturn && moveReturn) dispatch({ type: 'EXTEND', to: periodTo })
    onClose(true)
  }

  const patchFree = (key: string, patch: Partial<FreeRow>) => setFree((xs) => xs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  return (
    <form
      ref={formRef}
      className={cn('w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card', className)}
      data-testid="composer"
      aria-label={editing ? `Редагування рахунку № ${editing.number ?? ''}` : 'Новий рахунок'}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose(false)
      }}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="text-body font-semibold text-fg">{editing ? `Рахунок № ${editing.number ?? '—'}` : 'Новий рахунок'}</h3>
        <span className="min-w-0 truncate text-label text-muted-fg">від {orgOf(rent).name}</span>
        <Proposal note="Рахунок виписується окремою дією на будь-якому етапі оренди. Склад обирає менеджер галочками; «+ Додати послугу» — як рядок у бланку 1С." />
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Закрити бланк"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {editing && (
        <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-label text-fg-2">Номер 1С лишиться той самий. Після збереження надішліть клієнту новий PDF.</p>
      )}

      <div className="px-3">
        <div className={cn(GRID, 'border-b border-border py-1.5 text-label text-muted-fg')}>
          <span />
          <span>Послуга</span>
          <span className="text-right">К-сть</span>
          <span className="text-right">Ціна без ПДВ</span>
          <span className="text-right">ПДВ</span>
          <span className="text-right">Сума з ПДВ</span>
          <span />
        </div>

        {/* Оренда за період — група: рядок з датами, під ним послуги оренди. */}
        {((seed.mode === 'new' && rentRows.length > 0) || editRent) && (
          <div className="border-b border-border py-1" data-testid="composer-rent" data-checked={rentOn || undefined}>
            <div className={cn(GRID, 'min-h-9')}>
              <Checkbox
                checked={rentOn}
                onCheckedChange={(v) => setRentOn(v === true)}
                aria-label={`Оренда з ${fmtDay(periodFrom)}`}
                data-testid="composer-rent-check"
              />
              <div className="col-span-5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body">
                <span className={cn(rentOn ? 'font-medium text-fg' : 'text-fg-2')}>Оренда з {fmtDay(periodFrom)}</span>
                {rentOn ? (
                  <>
                    <span className="text-muted-fg">по</span>
                    <Input
                      type="date"
                      value={periodTo}
                      min={periodFrom}
                      onChange={(e) => e.target.value && setPeriodTo(e.target.value)}
                      aria-label="По яке число"
                      className="h-7 w-[9.5rem] px-2 text-label"
                      data-testid="composer-period-to"
                    />
                    <span className="text-label tabular-nums text-muted-fg">{days > 0 ? daysWord(days) : 'дата раніша за початок'}</span>
                  </>
                ) : (
                  <span className="text-label text-muted-fg">на основі попереднього рахунку</span>
                )}
              </div>
              <span />
            </div>
            {rentOn &&
              rentRows.map((l) => (
                <div key={l.id} className={cn(GRID, 'py-1 text-body')}>
                  <span />
                  <span className="min-w-0 text-fg-2">{l.service}</span>
                  <span className="text-right tabular-nums text-fg-2">{l.qty > 1 ? `${l.qty} × ` : ''}{daysWord(l.days ?? 0)}</span>
                  <span className="text-right tabular-nums text-fg-2">{formatAmount(l.priceNet)}</span>
                  <span className="text-right tabular-nums text-muted-fg">{l.vatRate ? `${l.vatRate} %` : '—'}</span>
                  <span className="text-right tabular-nums text-fg">{formatMoney(lineGross(l))}</span>
                  <span />
                </div>
              ))}
            {rentOn && beyondReturn && (
              <label className="ml-7 mt-0.5 flex items-center gap-1.5 pb-1 text-label text-fg-2" data-testid="composer-move-return">
                <Checkbox checked={moveReturn} onCheckedChange={(v) => setMoveReturn(v === true)} aria-label="Перенести планове повернення" />
                Перенести повернення з {fmtDay(rent.returnAt)} на {fmtDay(periodTo)}
                <Proposal note="Рахунок за доби після планового повернення пропонує одразу перенести повернення; галочку можна зняти." />
              </label>
            )}
          </div>
        )}

        {kept.map((k, i) => (
          <div key={k.line.id} className={cn(GRID, 'min-h-9 border-b border-border py-1 text-body')}>
            <Checkbox
              checked={k.checked}
              onCheckedChange={(v) => setKept((xs) => xs.map((x, j) => (j === i ? { ...x, checked: v === true } : x)))}
              aria-label={k.line.service}
            />
            <span className={cn('min-w-0', k.checked ? 'text-fg' : 'text-fg-2')}>{k.line.service}</span>
            <span className="text-right tabular-nums text-fg-2">{k.line.qty}</span>
            <span className="text-right tabular-nums text-fg-2">{formatAmount(k.line.priceNet)}</span>
            <span className="text-right tabular-nums text-muted-fg">{k.line.vatRate ? `${k.line.vatRate} %` : '—'}</span>
            <span className="text-right tabular-nums text-fg">{formatMoney(lineGross(k.line))}</span>
            <span />
          </div>
        ))}

        {charges.map((c) => {
          const l = chargeLine(rent, c, 'p')
          const on = picked.has(c.id)
          return (
            <div key={c.id} className={cn(GRID, 'min-h-9 border-b border-border py-1 text-body')} data-testid="composer-charge" data-checked={on || undefined}>
              <Checkbox
                checked={on}
                onCheckedChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s)
                    if (v === true) n.add(c.id)
                    else n.delete(c.id)
                    return n
                  })
                }
                aria-label={c.article}
                data-testid="composer-charge-check"
              />
              <span className="min-w-0">
                <span className={on ? 'text-fg' : 'text-fg-2'}>{c.service}</span>
                <span className="block text-label text-muted-fg">не виставлено · {c.article}</span>
              </span>
              <span className="text-right tabular-nums text-fg-2">1</span>
              <span className="text-right tabular-nums text-fg-2">{formatAmount(Math.abs(l.priceNet))}</span>
              <span className="text-right tabular-nums text-muted-fg">{l.vatRate ? `${l.vatRate} %` : '—'}</span>
              <span className="text-right tabular-nums text-fg">{formatMoney(lineGross(l))}</span>
              <span />
            </div>
          )
        })}

        {free.map((f, i) => {
          const a = ARTICLE_BY_ID.get(f.articleId)
          const l = freeLine(f)
          return (
            <div key={f.key} className="border-b border-border py-1.5" data-testid="composer-free">
              <div className={cn(GRID, 'items-start text-body')}>
                <Checkbox
                  checked={f.checked}
                  onCheckedChange={(v) => patchFree(f.key, { checked: v === true })}
                  aria-label="Рядок у рахунку"
                  className="mt-1.5"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <select
                    ref={i === 0 ? firstFreeRef : undefined}
                    value={f.articleId}
                    aria-label="Послуга"
                    data-testid="composer-free-article"
                    onChange={(e) => {
                      const next = ARTICLE_BY_ID.get(e.target.value)
                      patchFree(f.key, {
                        articleId: e.target.value,
                        service: next?.service ?? '',
                        vatable: next ? next.vatable : true,
                      })
                    }}
                    className="h-7 w-full rounded-md border border-border-strong bg-card px-1.5 text-body text-fg outline-none hover:border-border-hover focus:border-border-focus"
                  >
                    <option value="">Вибрати послугу</option>
                    {ARTICLES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  {/* Поле назви займає місце одразу, але видиме лише після вибору послуги: рядок не росте під рукою, «Сформувати» не з'їжджає. */}
                  {(
                    <input
                      tabIndex={a ? undefined : -1}
                      aria-hidden={!a || undefined}
                      value={f.service}
                      onChange={(e) => patchFree(f.key, { service: e.target.value })}
                      placeholder="Назва послуги в рахунку"
                      aria-label="Назва послуги в рахунку"
                      className={cn('h-7 w-full rounded-md border border-border bg-card px-2 text-label text-fg-2 outline-none placeholder:text-subtle hover:border-border-hover focus:border-border-focus', !a && 'invisible')}
                    />
                  )}
                  {a?.deposit && <span className="text-label text-notice-fg">Застава піде окремим рахунком без ПДВ</span>}
                </div>
                {a?.sale ? (
                  <Input
                    value={f.qty}
                    inputMode="numeric"
                    onChange={(e) => patchFree(f.key, { qty: e.target.value })}
                    aria-label="Кількість"
                    className="h-7 px-2 text-right text-body tabular-nums"
                  />
                ) : (
                  <span className="pt-1 text-right tabular-nums text-fg-2">1</span>
                )}
                <Input
                  value={f.price}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={!a}
                  onChange={(e) => patchFree(f.key, { price: e.target.value })}
                  aria-label="Ціна без ПДВ"
                  data-testid="composer-free-price"
                  className="h-7 px-2 text-right text-body tabular-nums"
                />
                {vatPayer && !a?.deposit ? (
                  <label className="flex h-7 items-center justify-end gap-1 text-label text-fg-2">
                    <Checkbox checked={f.vatable} disabled={!a} onCheckedChange={(v) => patchFree(f.key, { vatable: v === true })} aria-label="ПДВ 20 %" />
                    20 %
                  </label>
                ) : (
                  <span className="pt-1 text-right text-muted-fg">—</span>
                )}
                <span className="pt-1 text-right tabular-nums text-fg">{l ? formatMoney(lineGross(l)) : '—'}</span>
                <button
                  type="button"
                  onClick={() => setFree((xs) => xs.filter((x) => x.key !== f.key))}
                  aria-label="Видалити рядок"
                  className="grid size-7 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )
        })}

        <div className="py-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => setFree((xs) => [...xs, blankFree()])} data-testid="composer-add-line">
            <Plus aria-hidden />
            Додати послугу
          </Button>
        </div>
      </div>

      {/* Підсумок і дії — один рядок футера; сума займає своє місце завжди, тож «Сформувати» не з'їжджає. */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/40 px-3 py-2.5">
        <p className="mr-auto flex flex-wrap items-baseline gap-x-4 text-body">
          <span>
            <span className="text-fg-2">{deposit.length ? 'Рахунок, з ПДВ ' : 'Разом з ПДВ '}</span>
            <span className="font-semibold tabular-nums text-fg">{main.length ? formatMoney(linesTotal(main)) : '—'}</span>
          </span>
          {deposit.length > 0 && (
            <span>
              <span className="text-fg-2">Застава, без ПДВ </span>
              <span className="font-semibold tabular-nums text-fg">{formatMoney(linesTotal(deposit))}</span>
            </span>
          )}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => onClose(false)}>
          Скасувати
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit} data-testid="composer-submit" data-main-action="compose">
          {editing ? 'Зберегти зміни' : count > 1 ? 'Сформувати 2 рахунки' : 'Сформувати рахунок'}
        </Button>
      </footer>
    </form>
  )
}

/** Сітка бланка: галочка · послуга · к-сть · ціна без ПДВ · ПДВ · сума з ПДВ · дія. */
const GRID = 'grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_6.5rem_3.75rem_6.5rem_1.75rem] items-center gap-x-2'
