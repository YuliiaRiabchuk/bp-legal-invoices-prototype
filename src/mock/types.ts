/**
 * Модель рахунків юрособи на оренді. Не модель бекенду: рівно те, що малюють
 * картка оренди, рейл і «Документи». Правила — §3 брифу з поправками
 * `docs/questions.md`.
 *
 * Головна сутність — **рахунок на оплату** (документ). Обліковий рахунок
 * оренди («Оренда» / «Застава») — це баланс, він тут лише виводиться з
 * рахунків і платежів.
 */

export type Party = 'fl' | 'ul'

export type StageKey = 'draft' | 'payment' | 'handover' | 'active' | 'closing'

/** Організація-одержувач безготівки (компанія) або ФОП для готівки. */
export interface Org {
  id: string
  name: string
  edrpou: string
  iban: string
  bank: string
  /** Платник ПДВ: ставка 20 % на рядках, що оподатковуються. */
  vatPayer: boolean
}

export interface Counterparty {
  name: string
  edrpou: string
  iban: string
  address: string
  /** `null` — ПІБ директора не заповнено (попередження, не гейт). */
  director: string | null
  phone: string
  email: string
  activeRents: number
}

export interface Position {
  id: string
  /** Номенклатура: «Віброплита бензинова 90 кг». */
  name: string
  /** Послуга 1С: `послуги оренди <номенклатура>`, повна назва. */
  service: string
  qty: number
  /** Ціна за добу без ПДВ (ціни каталогу без ПДВ). */
  pricePerDay: number
  /** Застава за одиницю, без ПДВ. */
  deposit: number
}

/** Стаття нарахування з 1С. Штрафні санкції за замовчуванням без ПДВ. */
export interface Charge {
  id: string
  kind: 'charge' | 'discount'
  article: string
  /** Послуга, якою нарахування йде в рахунок. */
  service: string
  /** Сума без ПДВ, завжди додатна; знак дає `kind`. */
  net: number
  vatable: boolean
  createdAt: string
  createdBy: string
  comment?: string
  cancelled?: { by: string; at: string; reason?: string }
}

export interface InvoiceLine {
  id: string
  service: string
  /** Кількість одиниць. */
  qty: number
  /** Діб у рядку оренди; `null` — разова послуга або реалізація. */
  days: number | null
  /** Ціна без ПДВ за одиницю (за добу для оренди). */
  priceNet: number
  /** 0 або 20. */
  vatRate: number
  /** Що породило рядок: позиція, нарахування або застава. */
  from?: { positionId?: string; chargeId?: string; deposit?: true }
  /** Реалізація (витратні, поштучна видача) — під неї видаткова, не АВР. */
  sale?: boolean
}

export type InvoiceKind = 'rent' | 'deposit' | 'topup' | 'extension' | 'period' | 'extra'

export type NumberState = 'pending' | 'ok' | 'failed'

export interface Invoice {
  id: string
  kind: InvoiceKind
  /** Номер присвоює 1С. `null`, поки не прийшов. */
  number: string | null
  numberState: NumberState
  /** Дата документа, ISO `YYYY-MM-DD`. */
  date: string
  createdAt: string
  createdBy: string
  /** Період оренди, який покриває рахунок. */
  period?: { from: string; to: string }
  lines: InvoiceLine[]
  orgId: string
  cancelled?: { by: string; at: string; comment?: string }
  /** Створений системою на переході «Оформлення → Оплата» (D1, пропозиція). */
  auto?: true
}

/**
 * Платіжне доручення клієнта. Приходить з банку / 1С і змінює статус
 * рахунку. У проді (варіант 0) надходження підтверджує менеджер вручну —
 * тоді `confirmedBy` заповнений, а `booked` ні.
 */
export interface BankPayment {
  id: string
  number: string
  date: string
  amount: number
  /** `null` — не розпізнано, лягає на баланс. */
  invoiceId: string | null
  purpose: string
  /** Провів бухгалтер / прийшло з банку. */
  booked: boolean
  confirmedBy?: { name: string; at: string }
  /** Прод: що покриває платіж, коли рахунку немає (рахунок необов'язковий, BP-1507). */
  target?: MethodTarget
}

/** Прод (варіант 0): що покриває рядок способу — колонка «Покриває». */
export type MethodTarget = 'rent' | 'deposit' | 'topup'

/**
 * Прод (варіант 0): рядок таблиці «Прийом коштів». Рахунок живе всередині
 * рядка — саме цю зв'язку бриф §2 називає болем.
 */
export interface MethodRow {
  id: string
  method: 'bank' | 'cash'
  target: MethodTarget
  /** 0 — сума ще не введена. */
  amount: number
  /** Каса готівки; для переказу — розрахунковий рахунок одержувача. */
  cashbox?: string
  invoiceId?: string
}

/** ПКО: готівка від ЮЛ на ФОП. Рахунків не змінює. */
export interface CashOrder {
  id: string
  number: string | null
  amount: number
  at: string
  by: string
  fopId: string
  purpose: string
  chargeId?: string
}

/** Документ, що прийшов з 1С під рахунок: АВР (послуги) або видаткова (реалізація). */
export interface Doc1c {
  id: string
  kind: 'avr' | 'waybill'
  number: string
  date: string
  invoiceId: string
  amount: number
}

export type EventKind =
  | 'invoice'
  | 'invoice-edit'
  | 'invoice-cancel'
  | 'number'
  | 'number-failed'
  | 'payment'
  | 'charge'
  | 'charge-cancel'
  | 'cash'
  | 'extend'
  | 'doc1c'
  | 'stage'

/** Запис хронології. Скасування — теж запис, нічого не видаляється. */
export interface RentEvent {
  id: string
  at: string
  who: string
  kind: EventKind
  text: string
}

export type RentStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PENDING_HANDOVER'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'OVERDUE'
  | 'AWAITING_CLOSURE'
  | 'CLOSED'

export interface Rent {
  id: string
  code: string
  party: Party
  status: RentStatus
  counterparty: Counterparty
  /** Одержувач безготівки на оренду (один). */
  orgId: string
  /** ФОП для готівки. */
  fopId: string
  manager: { id: string; name: string; initials: string }
  warehouse: string
  /** «Сьогодні» сцени, ISO. */
  today: string
  issueAt: string
  /** Планове повернення, ISO. */
  returnAt: string
  positions: Position[]
  charges: Charge[]
  invoices: Invoice[]
  payments: BankPayment[]
  cashOrders: CashOrder[]
  docs: Doc1c[]
  events: RentEvent[]
  /** Прод (варіант 0): рядки способів оплати. Нові варіанти їх не мають. */
  methodRows: MethodRow[]
}

export type RentStageKey = StageKey
