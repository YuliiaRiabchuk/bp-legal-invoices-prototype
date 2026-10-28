import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { chargeLine, daysIncl, fmtDay, lineGross, lineNet, orgOf, vatFor } from '@/domain/money'
import { ARTICLES, ARTICLE_BY_ID, kindFor, linesTotal, nextPeriod, openCharges, periodLines } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Charge, InvoiceLine } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from '../shared/Proposal'

/**
 * Бланк нового рахунку в рейлі. Одна форма на три входи:
 *  - «+ Рахунок» — відмічено все невиставлене; якщо виставляти нічого,
 *    одразу порожній рядок, як «+» у 1С;
 *  - підказка «наступний період» — відмічено оренду з датами «з … по …»;
 *  - «Виставити» на нарахуванні — відмічено тільки його.
 *
 * Менеджер сам обирає, що йде в рахунок (§3): галочка на кожному рядку.
 * Рахунок народжується без номера; номер присвоює 1С.
 *
 * Застава ніколи не сумується з орендою: рядок «Гарантійний платіж» іде
 * окремим рахунком без ПДВ, і кнопка прямо каже «2 рахунки».
 */

export type ComposerSeed =
  | { mode: 'new'; via: 'button' | 'hint' | 'charge'; chargeId?: string; nonce: number }
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

export function ComposerB({ seed, onClose }: { seed: ComposerSeed; onClose: (created: boolean) => void }) {
  const { rent, dispatch } = useStore()
  const editing = seed.mode === 'edit' ? rent.invoices.find((i) => i.id === seed.invoiceId) : undefined
  const np = nextPeriod(rent)
  const charges = openCharges(rent)

  // ── Оренда за період ──
  const editRent = editing?.period && editing.lines.some((l) => l.days != null) ? editing : undefined
  const periodFrom = editRent?.period?.from ?? np.from
  const [rentOn, setRentOn] = useState(seed.mode === 'edit' ? !!editRent : seed.via === 'hint')
  const [periodTo, setPeriodTo] = useState(editRent?.period?.to ?? np.to)
  const days = Math.max(0, daysIncl(periodFrom, periodTo))
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
  useEffect(() => {
    // Тільки на відкритті бланка: порожній рядок чекає на вибір послуги.
    if (free.length === 1 && !free[0].articleId) firstFreeRef.current?.focus()
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
    onClose(true)
  }

  const patchFree = (key: string, patch: Partial<FreeRow>) => setFree((xs) => xs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  return (
    <form
      className="border-b border-border bg-muted/50 px-3 pb-3 pt-2.5"
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
      <header className="flex items-center gap-2">
        <h3 className="text-body font-semibold text-fg">
          {editing ? `Рахунок № ${editing.number ?? '—'}: правка` : 'Новий рахунок'}
        </h3>
        <Proposal note="Рахунок виписується з рейлу на будь-якому етапі оренди. Склад обирає менеджер галочками; вільний рядок — як «+» у бланку 1С." />
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Закрити бланк"
          className="ml-auto grid size-6 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      <p className="mt-0.5 text-label text-muted-fg">
        від {orgOf(rent).name}
        {editing && ' — номер 1С лишиться той самий, клієнту треба надіслати новий PDF'}
      </p>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {/* Правка не-орендного рахунку оренду не пропонує: це інший документ. */}
        {((seed.mode === 'new' && rentRows.length > 0) || editRent) && (
          <Row
            checked={rentOn}
            onCheck={setRentOn}
            testId="composer-rent"
            title={`Оренда з ${fmtDay(periodFrom)}`}
            amount={rentOn ? linesTotal(rentRows) : null}
          >
            {rentOn ? (
              <>
                <label className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-fg">
                  по яке число
                  <Input
                    type="date"
                    value={periodTo}
                    min={periodFrom}
                    onChange={(e) => e.target.value && setPeriodTo(e.target.value)}
                    className="h-7 w-[9.5rem] px-2 text-label"
                    data-testid="composer-period-to"
                  />
                  <span className="tabular-nums text-fg-2">{days > 0 ? daysWord(days) : 'дата раніша за початок'}</span>
                </label>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {rentRows.map((l) => (
                    <li key={l.id} className="text-label text-fg-2">
                      <span className="text-fg">{l.service}</span>
                      <span className="block tabular-nums text-muted-fg">
                        {l.qty} × {daysWord(l.days ?? 0)} × {formatMoney(l.priceNet)} без ПДВ = {formatMoney(lineGross(l))}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-label text-muted-fg">на основі попереднього рахунку, «по яке число» оберете далі</p>
            )}
          </Row>
        )}

        {kept.map((k, i) => (
          <Row
            key={k.line.id}
            checked={k.checked}
            onCheck={(v) => setKept((xs) => xs.map((x, j) => (j === i ? { ...x, checked: v } : x)))}
            title={k.line.service}
            amount={lineGross(k.line)}
          >
            <p className="text-label text-muted-fg">{k.line.vatRate ? 'з ПДВ' : 'без ПДВ'}</p>
          </Row>
        ))}

        {charges.length > 0 && (
          <p className="mt-1 text-label font-medium text-muted-fg">Не виставлено</p>
        )}
        {charges.map((c) => {
          const l = chargeLine(rent, c, 'p')
          return (
            <Row
              key={c.id}
              checked={picked.has(c.id)}
              onCheck={(v) =>
                setPicked((s) => {
                  const n = new Set(s)
                  if (v) n.add(c.id)
                  else n.delete(c.id)
                  return n
                })
              }
              testId="composer-charge"
              title={c.article}
              amount={lineGross(l)}
            >
              <p className="text-label text-muted-fg">
                {c.service} — {l.vatRate ? `${formatMoney(lineNet(l))} без ПДВ` : 'без ПДВ'}
              </p>
            </Row>
          )
        })}

        {free.map((f, i) => {
          const a = ARTICLE_BY_ID.get(f.articleId)
          const l = freeLine(f)
          return (
            <div key={f.key} className="rounded-md border border-border-strong bg-card p-2" data-testid="composer-free">
              <div className="flex items-center gap-1.5">
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
                  className="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-card px-1.5 text-label text-fg outline-none hover:border-border-hover focus:border-border-focus"
                >
                  <option value="">Оберіть послугу…</option>
                  {ARTICLES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setFree((xs) => xs.filter((x) => x.key !== f.key))}
                  aria-label="Прибрати рядок"
                  className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-fg hover:bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              {/* Поля стоять одразу, ще до вибору послуги: бланк не росте під
                  рукою, і «Сформувати» не з'їжджає між кліками (вимір зсуву). */}
              <textarea
                value={f.service}
                onChange={(e) => patchFree(f.key, { service: e.target.value })}
                rows={f.service.length > 42 ? 2 : 1}
                disabled={!a}
                placeholder="Назва послуги в рахунку"
                aria-label="Назва послуги в рахунку"
                className="mt-1.5 block w-full resize-none rounded-md border border-border-strong bg-card px-2 py-1 text-label leading-snug text-fg outline-none placeholder:text-subtle hover:border-border-hover focus:border-border-focus disabled:bg-muted"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-fg">
                {a?.sale && (
                  <>
                    <Input
                      value={f.qty}
                      inputMode="numeric"
                      onChange={(e) => patchFree(f.key, { qty: e.target.value })}
                      aria-label="Кількість"
                      className="h-7 w-12 px-2 text-right text-label tabular-nums"
                    />
                    ×
                  </>
                )}
                <Input
                  value={f.price}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={!a}
                  onChange={(e) => patchFree(f.key, { price: e.target.value })}
                  aria-label="Ціна без ПДВ"
                  data-testid="composer-free-price"
                  className="h-7 w-[5.5rem] px-2 text-right text-label tabular-nums"
                />
                <span>без ПДВ</span>
                {vatPayer && !a?.deposit && (
                  <label className="flex items-center gap-1">
                    <Checkbox checked={f.vatable} disabled={!a} onCheckedChange={(v) => patchFree(f.key, { vatable: v === true })} aria-label="З ПДВ" />
                    ПДВ 20 %
                  </label>
                )}
                <span className="ml-auto font-medium tabular-nums text-fg">{l ? formatMoney(lineGross(l)) : '—'}</span>
              </div>
              {a?.deposit && <p className="mt-1 text-label text-notice-fg">Застава — окремим рахунком без ПДВ</p>}
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => setFree((xs) => [...xs, blankFree()])}
          className="flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-label font-medium text-accent-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          data-testid="composer-add-line"
        >
          <Plus className="size-3" aria-hidden />
          Рядок
        </button>
      </div>

      <footer className="mt-2.5 border-t border-border pt-2">
        {/* Підсумок — завжди один рядок: поки рядок не заповнено, там «—», а
            не підказка чи помилка, що з'являються й зсувають «Сформувати». */}
        <p className="flex items-baseline justify-between text-body">
          <span className="text-fg-2">{deposit.length ? 'Рахунок з ПДВ' : 'Разом з ПДВ'}</span>
          <span className="font-semibold tabular-nums text-fg">{main.length ? formatMoney(linesTotal(main)) : '—'}</span>
        </p>
        {deposit.length > 0 && (
          <p className="flex items-baseline justify-between text-body">
            <span className="text-fg-2">Застава, без ПДВ</span>
            <span className="font-semibold tabular-nums text-fg">{formatMoney(linesTotal(deposit))}</span>
          </p>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onClose(false)}>
            Скасувати
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit} data-testid="composer-submit" data-main-action="compose">
            {editing ? 'Зберегти зміни' : count > 1 ? 'Сформувати 2 рахунки' : 'Сформувати рахунок'}
          </Button>
        </div>
      </footer>
    </form>
  )
}

function Row({
  checked,
  onCheck,
  title,
  amount,
  testId,
  children,
}: {
  checked: boolean
  onCheck: (v: boolean) => void
  title: string
  amount: number | null
  testId?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('flex gap-2 rounded-md px-1 py-1', checked ? 'bg-card' : '')} data-testid={testId} data-checked={checked || undefined}>
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(v === true)} className="mt-0.5" aria-label={title} data-testid={testId ? `${testId}-check` : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 text-body', checked ? 'font-medium text-fg' : 'text-fg-2')}>{title}</span>
          {amount != null && <span className="shrink-0 text-body tabular-nums text-fg">{formatMoney(amount)}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

