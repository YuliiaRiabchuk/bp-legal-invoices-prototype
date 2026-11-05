import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { addDays, chargeLine, daysIncl, fmtDay, lineGross, lineNet, orgOf, vatFor } from '@/domain/money'
import { ARTICLE_BY_ID, kindFor, linesTotal, nextPeriod, openCharges, periodLines, rhythmEnd } from '@/domain/invoicing'
import { formatAmount, formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { Charge, InvoiceLine } from '@/mock/types'
import { useStore } from '@/state/store'
import { Proposal } from './Proposal'
import { ServicePicker } from './ServicePicker'

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
  const firstFreeRef = useRef<HTMLButtonElement>(null)
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

  const missingService = free.some((f) => f.checked && !f.articleId)
  const missingPrice = free.some((f) => f.checked && f.articleId && num(f.price) <= 0)
  const totalNet = linesNet(main) + linesNet(deposit)
  const totalGross = linesTotal(main) + linesTotal(deposit)
  const rhythm = rhythmEnd(periodFrom)
  const quick: { label: string; to: string }[] = [
    { label: `до ${fmtDay(rhythm)}`, to: rhythm },
    { label: '+7 діб', to: addDays(periodFrom, 6) },
    { label: '+14 діб', to: addDays(periodFrom, 13) },
  ]

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
      <header className="flex items-start gap-3 px-4 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-headline font-semibold text-fg">
            {editing ? `Рахунок № ${editing.number ?? '—'}` : 'Новий рахунок'}
            <Proposal note="Рахунок виписується окремою дією на будь-якому етапі оренди. Склад — галочками на невиставленому і рядками з довідника послуг, як у бланку 1С." />
          </h3>
          <p className="mt-0.5 text-label text-muted-fg">
            {editing ? 'Номер 1С лишиться той самий. Після збереження надішліть клієнту новий PDF.' : `Від ${orgOf(rent).name}. Номер присвоїть 1С за кілька секунд.`}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Закрити бланк" onClick={() => onClose(false)}>
          <X aria-hidden />
        </Button>
      </header>

      <div className="px-4 pb-3">
        <div className="overflow-hidden rounded-lg border border-border">
          <div className={cn(GRID, 'border-b border-border bg-muted/40 px-3 py-2 text-mono uppercase tracking-[0.04em] text-muted-fg')}>
            <span />
            <span>Послуга</span>
            <span className="text-right">К-сть</span>
            <span className="text-right">Ціна без ПДВ</span>
            <span className="text-right">ПДВ</span>
            <span className="text-right">Сума</span>
            <span aria-hidden />
          </div>

          <ul className="divide-y divide-border">
            {/* Оренда за період: рядок з датами, під ним послуги оренди. */}
            {((seed.mode === 'new' && rentRows.length > 0) || editRent) && (
              <li className="px-3 py-2" data-testid="composer-rent" data-checked={rentOn || undefined}>
                <div className={cn(GRID, 'min-h-8')}>
                  <Checkbox checked={rentOn} onCheckedChange={(v) => setRentOn(v === true)} aria-label={`Оренда з ${fmtDay(periodFrom)}`} data-testid="composer-rent-check" />
                  <div className="col-span-5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className={cn('text-body', rentOn ? 'font-medium text-fg' : 'text-fg-2')}>Оренда з {fmtDay(periodFrom)}</span>
                    {rentOn ? (
                      <>
                        <span className="text-body text-muted-fg">по</span>
                        <div className="w-[10.5rem]">
                          <DatePicker
                            value={isoToDate(periodTo)}
                            fromDate={isoToDate(periodFrom)}
                            onChange={(d) => d && setPeriodTo(dateToIso(d))}
                            aria-invalid={days <= 0}
                            data-testid="composer-period-to"
                          />
                        </div>
                        <span className="text-label tabular-nums text-muted-fg">{days > 0 ? daysWord(days) : 'дата раніша за початок'}</span>
                        {/* Швидкий вибір «по яке число»: межа ритму 15/30 і типові продовження. */}
                        <span className="flex gap-1">
                          {quick.map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              onClick={() => setPeriodTo(q.to)}
                              aria-pressed={periodTo === q.to}
                              className={cn(
                                'h-6 rounded-sm border px-1.5 text-label tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
                                periodTo === q.to ? 'border-fg bg-fg text-primary-fg' : 'border-border bg-card text-fg-2 hover:border-border-strong hover:text-fg',
                              )}
                            >
                              {q.label}
                            </button>
                          ))}
                        </span>
                      </>
                    ) : (
                      <span className="text-label text-muted-fg">на основі попереднього рахунку</span>
                    )}
                  </div>
                  <span />
                </div>
                {rentOn &&
                  rentRows.map((l) => (
                    <div key={l.id} className={cn(GRID, 'mt-1.5')}>
                      <span />
                      <div className="min-w-0">
                        <p className="text-body text-fg">{l.service}</p>
                        <p className="text-label tabular-nums text-muted-fg">
                          {l.qty > 1 ? `${l.qty} шт × ` : ''}
                          {daysWord(l.days ?? 0)} × {formatMoney(l.priceNet)} без ПДВ
                        </p>
                      </div>
                      <span className="text-right text-body tabular-nums text-fg-2">{l.qty * (l.days ?? 1)}</span>
                      <span className="text-right text-body tabular-nums text-fg-2">{formatAmount(l.priceNet)}</span>
                      <span className="text-right text-body tabular-nums text-muted-fg">{l.vatRate ? `${l.vatRate} %` : 'без'}</span>
                      <span className="text-right text-body font-semibold tabular-nums text-fg">{formatMoney(lineGross(l))}</span>
                      <span />
                    </div>
                  ))}
                {rentOn && beyondReturn && (
                  <label className="ml-7 mt-2 flex w-fit items-center gap-2 text-body text-fg-2" data-testid="composer-move-return">
                    <Checkbox checked={moveReturn} onCheckedChange={(v) => setMoveReturn(v === true)} aria-label="Перенести планове повернення" />
                    Перенести повернення з {fmtDay(rent.returnAt)} на {fmtDay(periodTo)}
                  </label>
                )}
              </li>
            )}

            {kept.map((k, i) => (
              <li key={k.line.id} className={cn(GRID, 'px-3 py-2')}>
                <Checkbox
                  checked={k.checked}
                  onCheckedChange={(v) => setKept((xs) => xs.map((x, j) => (j === i ? { ...x, checked: v === true } : x)))}
                  aria-label={k.line.service}
                />
                <span className={cn('min-w-0 text-body', k.checked ? 'text-fg' : 'text-fg-2')}>{k.line.service}</span>
                <span className="text-right text-body tabular-nums text-fg-2">{k.line.qty}</span>
                <span className="text-right text-body tabular-nums text-fg-2">{formatAmount(k.line.priceNet)}</span>
                <span className="text-right text-body tabular-nums text-muted-fg">{k.line.vatRate ? `${k.line.vatRate} %` : 'без'}</span>
                <span className="text-right text-body font-semibold tabular-nums text-fg">{formatMoney(lineGross(k.line))}</span>
                <span />
              </li>
            ))}

            {charges.map((c) => {
              const l = chargeLine(rent, c, 'p')
              const on = picked.has(c.id)
              return (
                <li key={c.id} className={cn(GRID, 'px-3 py-2')} data-testid="composer-charge" data-checked={on || undefined}>
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
                    aria-label={c.service}
                    data-testid="composer-charge-check"
                  />
                  <div className="min-w-0">
                    <p className={cn('text-body', on ? 'text-fg' : 'text-fg-2')}>{c.service}</p>
                    <p className="text-label text-muted-fg">
                      Джерело: нарахування «{c.article}», {c.createdAt}
                    </p>
                  </div>
                  <span className="text-right text-body tabular-nums text-fg-2">1</span>
                  <span className="text-right text-body tabular-nums text-fg-2">{formatAmount(Math.abs(l.priceNet))}</span>
                  <span className="text-right text-body tabular-nums text-muted-fg">{l.vatRate ? `${l.vatRate} %` : 'без'}</span>
                  <span className="text-right text-body font-semibold tabular-nums text-fg">{formatMoney(lineGross(l))}</span>
                  <span />
                </li>
              )
            })}

            {free.map((f, i) => {
              const a = ARTICLE_BY_ID.get(f.articleId)
              const l = freeLine(f)
              // Червоне поле — тільки коли поряд уже є що формувати: порожній бланк не «помилка».
              const noService = f.checked && !a && main.length + deposit.length > 0
              return (
                <li key={f.key} className={cn(GRID, 'items-start px-3 py-2')} data-testid="composer-free">
                  <Checkbox checked={f.checked} onCheckedChange={(v) => patchFree(f.key, { checked: v === true })} aria-label="Рядок у рахунку" className="mt-2" />
                  <div className="min-w-0">
                    <ServicePicker
                      value={f.articleId}
                      invalid={noService}
                      triggerRef={i === 0 ? firstFreeRef : undefined}
                      onSelect={(next) => patchFree(f.key, { articleId: next.id, service: next.service, vatable: next.vatable })}
                    />
                    {/* Підрядок є завжди: поява підказки не штовхає «Сформувати» (вимір зсуву). */}
                    <p className={cn('mt-1 truncate text-label', a?.deposit ? 'text-notice-fg' : 'text-muted-fg')}>
                      {!a
                        ? 'У рахунок піде повна назва послуги з довідника'
                        : a.deposit
                          ? 'Застава піде окремим рахунком без ПДВ'
                          : a.sale
                            ? 'Реалізація: під неї бухгалтерія проведе видаткову'
                            : `${a.label} · ${f.vatable && vatPayer ? 'з ПДВ' : 'без ПДВ'}`}
                    </p>
                  </div>
                  <input
                    value={f.qty}
                    inputMode="numeric"
                    onChange={(e) => patchFree(f.key, { qty: e.target.value })}
                    aria-label="Кількість"
                    className={NUM_INPUT}
                  />
                  <input
                    value={f.price}
                    inputMode="decimal"
                    placeholder="0"
                    onChange={(e) => patchFree(f.key, { price: e.target.value })}
                    aria-label="Ціна без ПДВ"
                    aria-invalid={(f.checked && !!a && num(f.price) <= 0 && f.price !== '') || undefined}
                    data-testid="composer-free-price"
                    className={NUM_INPUT}
                  />
                  {vatPayer && !a?.deposit ? (
                    <label className="flex h-8 items-center justify-end gap-1.5 text-body tabular-nums text-fg-2">
                      <Checkbox checked={f.vatable} onCheckedChange={(v) => patchFree(f.key, { vatable: v === true })} aria-label="ПДВ 20 %" />
                      20 %
                    </label>
                  ) : (
                    <span className="flex h-8 items-center justify-end text-body text-muted-fg">без</span>
                  )}
                  <span className="flex h-8 items-center justify-end text-body font-semibold tabular-nums text-fg">{l ? formatMoney(lineGross(l)) : '—'}</span>
                  <button
                    type="button"
                    onClick={() => setFree((xs) => xs.filter((x) => x.key !== f.key))}
                    aria-label="Видалити рядок"
                    className="grid size-8 place-items-center rounded-md text-muted-fg transition-colors hover:bg-danger-soft hover:text-danger-fg"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setFree((xs) => [...xs, blankFree()])}
              className="inline-flex items-center gap-1.5 text-body text-fg-2 transition-colors hover:text-fg"
              data-testid="composer-add-line"
            >
              <Plus className="size-3.5" aria-hidden />
              Додати послугу
            </button>
            {/* Підсумок як у бланку 1С: без ПДВ, ПДВ, до сплати. Місце тримається завжди — «Сформувати» не з'їжджає. */}
            <div className="flex items-baseline gap-x-3 tabular-nums">
              <span className="text-label text-muted-fg">без ПДВ {formatMoney(totalNet)}</span>
              <span className="text-label text-muted-fg">ПДВ {formatMoney(totalGross - totalNet)}</span>
              <span className="text-label text-muted-fg">до сплати</span>
              <span className="text-body font-semibold text-fg">{count ? formatMoney(totalGross) : '—'}</span>
            </div>
          </div>
        </div>

        {deposit.length > 0 && main.length > 0 && (
          <p className="mt-2 text-label text-muted-fg">
            Буде два рахунки: оренда і послуги {formatMoney(linesTotal(main))} з ПДВ, застава {formatMoney(linesTotal(deposit))} без ПДВ. Застава з орендою не сумується.
          </p>
        )}
        {/* Рядок стану завжди на місці: червоний текст з'являється, не зсуваючи кнопки. */}
        <p className={cn('mt-2 min-h-5 text-label', missingService || missingPrice ? 'text-danger-fg' : 'text-muted-fg')} data-testid="composer-invalid">
          {missingService ? 'У рядку без послуги виберіть послугу або зніміть галочку.' : missingPrice ? 'Вкажіть ціну в рядку з послугою.' : ''}
        </p>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
        <Button type="button" variant="secondary" onClick={() => onClose(false)}>
          Скасувати
        </Button>
        <Button type="submit" disabled={!canSubmit} data-testid="composer-submit" data-main-action="compose">
          {editing ? 'Зберегти зміни' : count > 1 ? 'Сформувати 2 рахунки' : 'Сформувати рахунок'}
        </Button>
      </footer>
    </form>
  )
}

/** Сітка — як «Склад рахунку» в CRM: галочка · послуга · к-сть · ціна · ПДВ · сума · дія. */
const GRID = 'grid grid-cols-[1rem_minmax(11rem,1fr)_4rem_6rem_3.75rem_6.5rem_2rem] items-center gap-x-3'

/** Числове поле рядка — клас `numInput` з CRM `InvoiceCompositionEditor`. */
const NUM_INPUT =
  'h-8 w-full rounded-md border border-border bg-card px-2 text-right text-body tabular-nums text-fg outline-none transition-colors hover:border-border-strong focus:border-fg aria-[invalid=true]:border-danger placeholder:text-subtle'

const isoToDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const dateToIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const linesNet = (lines: InvoiceLine[]) => Math.round(lines.reduce((s, l) => s + lineNet(l), 0) * 100) / 100
