import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import { fmtDate, fmtPeriod, invoiceTotal } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import { MANAGER } from '@/mock/orgs'
import { targetOf } from '@/domain/prod'
import type { Charge, Invoice, InvoiceLine, MethodRow, Rent, RentEvent, RentStatus } from '@/mock/types'

/**
 * Стан прототипу. Цінність у ПЕРЕХОДАХ: рахунок народився без номера, номер
 * прийшов з 1С за ~8 с, скасування лишило запис, платіжка змінила статус.
 *
 * Годинник теж у стані: кожна дія рухає його на 2 хвилини, тож підписи часу
 * відтворювані — прогін дає ті самі кадри будь-коли.
 */

interface State {
  rent: Rent
  minutes: number
  nextNumber: number
  nextPko: number
  seq: number
}

/** Скільки 1С «думає» над номером (§3: ~8 с). */
export const NUMBER_DELAY_MS = 8000

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export type Action =
  | {
      type: 'INVOICE_CREATE'
      kind: Invoice['kind']
      lines: InvoiceLine[]
      period?: Invoice['period']
    }
  | { type: 'INVOICE_EDIT'; id: string; lines: InvoiceLine[]; period?: Invoice['period'] }
  /**
   * Нові варіанти: рахунок зі складу, який зібрав менеджер. Вільні рядки
   * («як у 1С») народжують нарахування — рядок посилається на нього як
   * `from.chargeId = 'new:<key>'`. З `editId` — правка неоплаченого рахунку,
   * номер 1С лишається (B1).
   */
  | {
      type: 'INVOICE_COMPOSE'
      kind: Invoice['kind']
      lines: InvoiceLine[]
      period?: Invoice['period']
      newCharges?: { key: string; charge: Omit<Charge, 'id' | 'createdAt' | 'createdBy'> }[]
      editId?: string
    }
  /** Нові варіанти: перехід «Оформлення → Оплата» сам формує оренду і заставу (D1, пропозиція). */
  | { type: 'START_PAYMENT'; rentLines: InvoiceLine[]; depositLines: InvoiceLine[] }
  | { type: 'INVOICE_CANCEL'; id: string; comment?: string }
  | { type: 'NUMBERS_ARRIVE' }
  | { type: 'CHARGE_ADD'; charge: Omit<Charge, 'id' | 'createdAt' | 'createdBy'> }
  | { type: 'CHARGE_CANCEL'; id: string; reason?: string }
  /** Прод: менеджер підтверджує надходження за квитанцією. */
  | { type: 'PAYMENT_CONFIRM'; invoiceId: string; amount: number }
  /** Платіжне доручення прийшло з банку / 1С. */
  | { type: 'PAYMENT_ARRIVE'; invoiceId: string | null; amount: number; purpose?: string }
  | { type: 'CASH_ACCEPT'; amount: number; purpose: string; chargeId?: string }
  | { type: 'EXTEND'; to: string }
  | { type: 'SET_STATUS'; status: RentStatus }
  // ── Прод (варіант 0): рахунок живе в рядку способу ──
  | { type: 'ROW_ADD'; row: Omit<MethodRow, 'id'> }
  | { type: 'ROW_PATCH'; id: string; patch: Partial<MethodRow> }
  /** «Видалити спосіб»: рахунок рядка анулюється без автора і причини (N4). */
  | { type: 'ROW_REMOVE'; id: string }
  | { type: 'ROW_INVOICE'; id: string; lines: InvoiceLine[] }
  | { type: 'ROW_CONFIRM'; id: string }
  | { type: 'ROW_CASH'; id: string; purpose: string; chargeId?: string }

function stamp(s: State) {
  const [, m, d] = s.rent.today.split('-')
  return `${d}.${m}, ${hhmm(s.minutes)}`
}

function withEvent(rent: Rent, s: State, e: Omit<RentEvent, 'id' | 'at' | 'who'> & { who?: string }): Rent {
  return {
    ...rent,
    events: [...rent.events, { id: `e-${s.seq}`, at: stamp(s), who: e.who ?? MANAGER.name, ...e }],
  }
}

function tick(s: State): State {
  return { ...s, minutes: s.minutes + 2, seq: s.seq + 1 }
}

const KIND_WORD: Record<Invoice['kind'], string> = {
  rent: 'оренду',
  deposit: 'заставу',
  topup: 'доплату',
  extension: 'продовження',
  period: 'період',
  extra: 'додатковий',
}

function describe(inv: Invoice): string {
  const what = inv.period ? `${KIND_WORD[inv.kind]} ${fmtPeriod(inv.period)}` : KIND_WORD[inv.kind]
  return `${what}, ${formatMoney(invoiceTotal(inv))}`
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INVOICE_CREATE': {
      const s = tick(state)
      const invoice: Invoice = {
        id: `inv-n${s.seq}`,
        kind: action.kind,
        number: null,
        numberState: 'pending',
        date: s.rent.today,
        createdAt: stamp(s),
        createdBy: MANAGER.name,
        period: action.period,
        lines: action.lines,
        orgId: s.rent.orgId,
      }
      let rent: Rent = { ...s.rent, invoices: [...s.rent.invoices, invoice] }
      rent = withEvent(rent, s, { kind: 'invoice', text: `Сформовано рахунок на ${describe(invoice)}; № очікується від 1С` })
      return { ...s, rent }
    }

    case 'INVOICE_EDIT': {
      const s = tick(state)
      let rent: Rent = {
        ...s.rent,
        invoices: s.rent.invoices.map((i) =>
          i.id === action.id ? { ...i, lines: action.lines, period: action.period ?? i.period } : i,
        ),
      }
      const inv = rent.invoices.find((i) => i.id === action.id)!
      rent = withEvent(rent, s, { kind: 'invoice-edit', text: `Рахунок № ${inv.number ?? '—'} змінено: ${formatMoney(invoiceTotal(inv))}` })
      return { ...s, rent }
    }

    case 'INVOICE_COMPOSE': {
      let s = tick(state)
      // Вільні рядки спершу стають нарахуваннями: склад рахунку — це завжди
      // нарахування оренди, навіть якщо менеджер завів його прямо в бланку.
      const ids = new Map<string, string>()
      let rent = s.rent
      for (const { key, charge } of action.newCharges ?? []) {
        const id = `ch-n${s.seq}-${key}`
        ids.set(`new:${key}`, id)
        rent = { ...rent, charges: [...rent.charges, { id, createdAt: stamp(s), createdBy: MANAGER.name, ...charge }] }
        rent = withEvent(rent, s, { kind: 'charge', text: `Нарахування «${charge.article}» ${formatMoney(charge.net)} без ПДВ` })
        s = tick({ ...s, rent })
      }
      const lines = action.lines.map((l) =>
        l.from?.chargeId && ids.has(l.from.chargeId) ? { ...l, from: { ...l.from, chargeId: ids.get(l.from.chargeId)! } } : l,
      )
      if (action.editId) {
        rent = {
          ...rent,
          invoices: rent.invoices.map((i) =>
            i.id === action.editId ? { ...i, kind: action.kind, lines, period: action.period } : i,
          ),
        }
        const inv = rent.invoices.find((i) => i.id === action.editId)!
        rent = withEvent(rent, s, { kind: 'invoice-edit', text: `Рахунок № ${inv.number ?? '—'} змінено: ${formatMoney(invoiceTotal(inv))}; номер той самий` })
        return { ...s, rent }
      }
      const invoice: Invoice = {
        id: `inv-n${s.seq}`,
        kind: action.kind,
        number: null,
        numberState: 'pending',
        date: rent.today,
        createdAt: stamp(s),
        createdBy: MANAGER.name,
        period: action.period,
        lines,
        orgId: rent.orgId,
      }
      rent = { ...rent, invoices: [...rent.invoices, invoice] }
      rent = withEvent(rent, s, { kind: 'invoice', text: `Сформовано рахунок на ${describe(invoice)}; № очікується від 1С` })
      return { ...s, rent }
    }

    case 'START_PAYMENT': {
      const s = tick(state)
      const mk = (kind: Invoice['kind'], lines: InvoiceLine[], n: number, period?: Invoice['period']): Invoice => ({
        id: `inv-n${s.seq}-${n}`,
        kind,
        number: null,
        numberState: 'pending',
        date: s.rent.today,
        createdAt: stamp(s),
        createdBy: MANAGER.name,
        period,
        lines,
        orgId: s.rent.orgId,
        auto: true,
      })
      const pair = [
        mk('rent', action.rentLines, 1, { from: s.rent.issueAt, to: s.rent.returnAt }),
        mk('deposit', action.depositLines, 2),
      ]
      let rent: Rent = { ...s.rent, status: 'PENDING_PAYMENT', invoices: [...s.rent.invoices, ...pair] }
      rent = withEvent(rent, s, { kind: 'invoice', who: 'Система', text: `Перехід до оплати: сформовано рахунки на оренду і заставу; № очікується від 1С` })
      return { ...s, rent }
    }

    case 'INVOICE_CANCEL': {
      const s = tick(state)
      let rent: Rent = {
        ...s.rent,
        invoices: s.rent.invoices.map((i) =>
          i.id === action.id ? { ...i, cancelled: { by: MANAGER.name, at: stamp(s), comment: action.comment } } : i,
        ),
      }
      const inv = rent.invoices.find((i) => i.id === action.id)!
      rent = withEvent(rent, s, {
        kind: 'invoice-cancel',
        text: `Рахунок № ${inv.number ?? '—'} скасовано${action.comment ? `: ${action.comment}` : ''}`,
      })
      return { ...s, rent }
    }

    case 'NUMBERS_ARRIVE': {
      let n = state.nextNumber
      let p = state.nextPko
      const s = tick(state)
      const fresh: string[] = []
      let rent: Rent = {
        ...s.rent,
        invoices: s.rent.invoices.map((i) => {
          if (i.numberState !== 'pending') return i
          const number = String(n++)
          fresh.push(number)
          return { ...i, number, numberState: 'ok' }
        }),
        cashOrders: s.rent.cashOrders.map((c) => (c.number ? c : { ...c, number: `ПКО-${p++}` })),
      }
      if (fresh.length) {
        rent = withEvent(rent, s, { kind: 'number', who: '1С', text: `1С присвоїла № ${fresh.join(', ')}` })
      }
      return { ...s, nextNumber: n, nextPko: p, rent }
    }

    case 'CHARGE_ADD': {
      const s = tick(state)
      const charge: Charge = { id: `ch-n${s.seq}`, createdAt: stamp(s), createdBy: MANAGER.name, ...action.charge }
      let rent: Rent = { ...s.rent, charges: [...s.rent.charges, charge] }
      rent = withEvent(rent, s, { kind: 'charge', text: `${charge.kind === 'discount' ? 'Знижка' : 'Нарахування'} «${charge.article}» ${formatMoney(charge.net)} без ПДВ` })
      return { ...s, rent }
    }

    case 'CHARGE_CANCEL': {
      const s = tick(state)
      let rent: Rent = {
        ...s.rent,
        charges: s.rent.charges.map((c) =>
          c.id === action.id ? { ...c, cancelled: { by: MANAGER.name, at: stamp(s), reason: action.reason } } : c,
        ),
      }
      rent = withEvent(rent, s, { kind: 'charge-cancel', text: 'Нарахування скасовано' })
      return { ...s, rent }
    }

    case 'PAYMENT_CONFIRM': {
      const s = tick(state)
      const inv = s.rent.invoices.find((i) => i.id === action.invoiceId)
      let rent: Rent = {
        ...s.rent,
        payments: [
          ...s.rent.payments,
          {
            id: `pay-n${s.seq}`,
            number: '—',
            date: s.rent.today,
            amount: action.amount,
            invoiceId: action.invoiceId,
            purpose: `Оплата за рахунком № ${inv?.number ?? '—'}`,
            booked: false,
            confirmedBy: { name: MANAGER.name, at: stamp(s) },
          },
        ],
      }
      rent = withEvent(rent, s, { kind: 'payment', text: `Надходження підтверджено: ${formatMoney(action.amount)}` })
      return { ...s, rent }
    }

    case 'PAYMENT_ARRIVE': {
      const s = tick(state)
      const number = String(400 + s.seq)
      let rent: Rent = {
        ...s.rent,
        payments: [
          ...s.rent.payments,
          {
            id: `pay-n${s.seq}`,
            number,
            date: s.rent.today,
            amount: action.amount,
            invoiceId: action.invoiceId,
            purpose: action.purpose ?? 'Оплата за оренду обладнання',
            booked: true,
          },
        ],
      }
      rent = withEvent(rent, s, { kind: 'payment', who: 'Банк', text: `Платіжне доручення № ${number}: ${formatMoney(action.amount)}` })
      return { ...s, rent }
    }

    case 'CASH_ACCEPT': {
      const s = tick(state)
      let rent: Rent = {
        ...s.rent,
        cashOrders: [
          ...s.rent.cashOrders,
          {
            id: `pko-n${s.seq}`,
            number: null,
            amount: action.amount,
            at: stamp(s),
            by: MANAGER.name,
            fopId: s.rent.fopId,
            purpose: action.purpose,
            chargeId: action.chargeId,
          },
        ],
      }
      rent = withEvent(rent, s, { kind: 'cash', text: `Прийнято готівкою ${formatMoney(action.amount)}; ПКО на ФОП, № очікується від 1С` })
      return { ...s, rent }
    }

    case 'EXTEND': {
      const s = tick(state)
      let rent: Rent = { ...s.rent, returnAt: action.to }
      rent = withEvent(rent, s, { kind: 'extend', text: `Планове повернення: ${fmtDate(action.to)}` })
      return { ...s, rent }
    }

    case 'SET_STATUS':
      return { ...state, rent: { ...state.rent, status: action.status } }

    case 'ROW_ADD': {
      const s = tick(state)
      return { ...s, rent: { ...s.rent, methodRows: [...s.rent.methodRows, { id: `row-n${s.seq}`, ...action.row }] } }
    }

    case 'ROW_PATCH':
      return {
        ...state,
        rent: { ...state.rent, methodRows: state.rent.methodRows.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) },
      }

    case 'ROW_REMOVE': {
      const s = tick(state)
      const row = s.rent.methodRows.find((r) => r.id === action.id)
      let rent: Rent = { ...s.rent, methodRows: s.rent.methodRows.filter((r) => r.id !== action.id) }
      if (row?.invoiceId) {
        rent = {
          ...rent,
          invoices: rent.invoices.map((i) => (i.id === row.invoiceId ? { ...i, cancelled: { by: '', at: stamp(s) } } : i)),
        }
        const inv = rent.invoices.find((i) => i.id === row.invoiceId)
        rent = withEvent(rent, s, { kind: 'invoice-cancel', text: `Рахунок № ${inv?.number ?? '—'} анульовано разом зі способом` })
      }
      return { ...s, rent }
    }

    case 'ROW_INVOICE': {
      const row = state.rent.methodRows.find((r) => r.id === action.id)!
      if (row.invoiceId) {
        // «Редагувати рахунок»: переформовується тим самим номером (B1).
        return reducer(state, { type: 'INVOICE_EDIT', id: row.invoiceId, lines: action.lines })
      }
      const kind: Invoice['kind'] = row.target === 'deposit' ? 'deposit' : row.target === 'rent' ? 'rent' : 'topup'
      const period = row.target === 'rent' ? { from: state.rent.issueAt, to: state.rent.returnAt } : undefined
      const next = reducer(state, { type: 'INVOICE_CREATE', kind, lines: action.lines, period })
      const inv = next.rent.invoices.at(-1)!
      return {
        ...next,
        rent: { ...next.rent, methodRows: next.rent.methodRows.map((r) => (r.id === action.id ? { ...r, invoiceId: inv.id } : r)) },
      }
    }

    case 'ROW_CONFIRM': {
      const s = tick(state)
      const row = s.rent.methodRows.find((r) => r.id === action.id)!
      const inv = row.invoiceId ? s.rent.invoices.find((i) => i.id === row.invoiceId) : undefined
      let rent: Rent = {
        ...s.rent,
        methodRows: s.rent.methodRows.filter((r) => r.id !== action.id),
        payments: [
          ...s.rent.payments,
          {
            id: `pay-n${s.seq}`,
            number: '—',
            date: s.rent.today,
            amount: row.amount,
            invoiceId: inv?.id ?? null,
            target: inv ? targetOf(s.rent, inv) : row.target,
            purpose: inv ? `Оплата за рахунком № ${inv.number ?? '—'}` : 'Оплата за оренду',
            booked: false,
            confirmedBy: { name: MANAGER.name, at: stamp(s) },
          },
        ],
      }
      rent = withEvent(rent, s, { kind: 'payment', text: `Надходження підтверджено: ${formatMoney(row.amount)}` })
      return { ...s, rent }
    }

    case 'ROW_CASH': {
      const row = state.rent.methodRows.find((r) => r.id === action.id)!
      const next = reducer(state, { type: 'CASH_ACCEPT', amount: row.amount, purpose: action.purpose, chargeId: action.chargeId })
      return { ...next, rent: { ...next.rent, methodRows: next.rent.methodRows.filter((r) => r.id !== action.id) } }
    }
  }
}

interface StoreValue {
  rent: Rent
  dispatch: (a: Action) => void
  /** «Зараз» сцени для підписів: `30.10, 10:14`. */
  now: string
}

const StoreContext = createContext<StoreValue | null>(null)

function maxNumber(rent: Rent): number {
  const nums = rent.invoices.map((i) => Number(i.number)).filter((n) => Number.isFinite(n) && n > 0)
  return nums.length ? Math.max(...nums) : 1100
}

declare global {
  interface Window {
    __legal?: { rent: Rent; dispatch: (a: Action) => void }
  }
}

export function StoreProvider({ initial, children }: { initial: Rent; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    rent: initial,
    minutes: 10 * 60 + 12,
    nextNumber: maxNumber(initial) + 1,
    nextPko: 301,
    seq: 0,
  }))

  // 1С присвоює номер за ~8 с. «failed» — сцена 8, номер не прийде.
  const pending =
    state.rent.invoices.some((i) => i.numberState === 'pending') || state.rent.cashOrders.some((c) => !c.number)
  useEffect(() => {
    if (!pending) return
    const t = window.setTimeout(() => dispatch({ type: 'NUMBERS_ARRIVE' }), NUMBER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [pending, state.seq])

  // Прогін (`scripts/walk.mjs`) читає стан звідси і не чекає таймера 1С.
  useEffect(() => {
    window.__legal = { rent: state.rent, dispatch }
  }, [state.rent])

  const value = useMemo<StoreValue>(
    () => ({ rent: state.rent, dispatch, now: stamp(state) }),
    [state],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
