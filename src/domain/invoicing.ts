import { addDays, daysIncl, fmtDay, invoiceTotal, lineGross, paidOf, rentLines, unbilledCharges, vatFor } from './money'
import type { Charge, Invoice, InvoiceKind, InvoiceLine, Rent } from '@/mock/types'

/**
 * Виписування рахунків у нових варіантах (A–D). Варіант 0 цим не
 * користується: у проді рахунок живе в рядку способу оплати.
 *
 * Усе тут — правила з `docs/shape.md` §3 і відповіді `docs/questions.md`.
 * Де правила немає, а варіанту воно потрібне, функція підписана
 * «пропозиція» і міняється однією константою.
 */

const live = (rent: Rent) => rent.invoices.filter((i) => !i.cancelled)

/** Статті 1С для вільного рядка рахунку (D3: склад — будь-що). Заглушки. */
export interface Article {
  id: string
  label: string
  service: string
  /** ПДВ за замовчуванням; штрафні санкції — без ПДВ (§3). */
  vatable: boolean
  /** Застава — окремий рахунок без ПДВ, ніколи не сумується з орендою. */
  deposit?: boolean
  /** Реалізація: під неї видаткова, не АВР (F10). */
  sale?: boolean
}

export const ARTICLES: Article[] = [
  { id: 'delivery', label: 'Доставка', service: 'Послуги доставки обладнання', vatable: true },
  { id: 'cleaning', label: 'Чистка обладнання', service: 'Послуги чистки обладнання', vatable: true },
  { id: 'fine', label: 'Штрафні санкції', service: 'Штраф за пошкодження обладнання', vatable: false },
  { id: 'extra', label: 'Додаткові витрати', service: 'Додаткові послуги', vatable: true },
  { id: 'sale', label: 'Реалізація: витратні матеріали', service: 'Диск алмазний відрізний 230 мм', vatable: true, sale: true },
  { id: 'deposit', label: 'Гарантійний платіж', service: 'Гарантійний платіж за оренду обладнання', vatable: false, deposit: true },
]

export const ARTICLE_BY_ID = new Map(ARTICLES.map((a) => [a.id, a]))

/** Нарахування, які ще можна виставити: не в рахунку, не оплачені готівкою (F5), не скасовані. */
export function openCharges(rent: Rent): Charge[] {
  const cashPaid = new Set(rent.cashOrders.map((c) => c.chargeId).filter(Boolean))
  return unbilledCharges(rent).filter((c) => !cashPaid.has(c.id))
}

const isRentInvoice = (i: Invoice) => i.kind !== 'deposit' && !!i.period && i.lines.some((l) => l.days != null)

/** Останній чинний рахунок оренди — база для «на основі попереднього». */
export function lastRentInvoice(rent: Rent): Invoice | undefined {
  return live(rent)
    .filter(isRentInvoice)
    .sort((a, b) => (a.period!.to < b.period!.to ? -1 : 1))
    .at(-1)
}

/** Остання дата, яку покриває чинний рахунок оренди. */
export function rentBilledUntil(rent: Rent): string | null {
  return lastRentInvoice(rent)?.period?.to ?? null
}

/**
 * Межа наступного періоду за ритмом 15/30 (пропозиція): з 1-го по 15-те,
 * з 16-го по останній день місяця. Так бухгалтер закриває АВР (R:961).
 */
export function rhythmEnd(from: string): string {
  const [y, m, d] = from.split('-').map(Number)
  if (d <= 15) return `${y}-${String(m).padStart(2, '0')}-15`
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

/** За скільки днів до кінця виставленого періоду рейл підказує наступний (пропозиція). */
export const NEXT_PERIOD_HINT_DAYS = 3

/**
 * Підказка «наступний період»: з дня після останнього рахунку оренди до межі
 * ритму. Показується, коли до кінця виставленого лишається менше
 * `NEXT_PERIOD_HINT_DAYS` діб.
 */
export function nextPeriod(rent: Rent): { from: string; to: string; due: boolean } {
  const until = rentBilledUntil(rent)
  const from = until ? addDays(until, 1) : rent.issueAt
  const left = until ? daysIncl(rent.today, until) - 1 : 0
  // Хвіст до межі коротший за тиждень (з 31.10 по 31.10) — береться наступна межа.
  let to = rhythmEnd(from)
  if (daysIncl(from, to) < MIN_PERIOD_DAYS) to = rhythmEnd(addDays(to, 1))
  return { from, to, due: rent.status !== 'CLOSED' && left < NEXT_PERIOD_HINT_DAYS }
}

/** Найкоротший період, який пропонує підказка (пропозиція). */
export const MIN_PERIOD_DAYS = 7

/**
 * Чи можна зараз виписати рахунок вручну. До переходу в «Оплату» — ні:
 * оренду і заставу сформує сам перехід (D1), і ручний рахунок на ті ж доби
 * дав би два рахунки за одну оренду.
 */
export function invoiceBlocked(rent: Rent): string | null {
  if (rent.status === 'DRAFT') return 'Перші рахунки — оренда і застава — сформуються самі на переході до оплати.'
  return null
}

/**
 * Підсумки окремо: оренда з послугами (з ПДВ) і застава (без ПДВ). Обліково
 * вони ніколи не сумуються (§3).
 */
export function totalsSplit(rent: Rent) {
  const sum = (deposit: boolean) => {
    const inv = rent.invoices.filter((i) => !i.cancelled && (i.kind === 'deposit') === deposit)
    const issued = inv.reduce((s, i) => s + invoiceTotal(i), 0)
    const paid = inv.reduce((s, i) => s + Math.min(paidOf(rent, i), invoiceTotal(i)), 0)
    return { issued: Math.round(issued * 100) / 100, paid: Math.round(paid * 100) / 100, count: inv.length }
  }
  return { main: sum(false), deposit: sum(true) }
}

/**
 * Рядки нового періоду «на основі попереднього» (F6): усі рядки
 * попереднього рахунку оренди, доби перераховано на новий період. Немає
 * попереднього — рядки з позицій оренди.
 */
export function periodLines(rent: Rent, days: number, seed: string): InvoiceLine[] {
  const prev = lastRentInvoice(rent)
  if (!prev) return rentLines(rent, days, seed)
  return prev.lines.map((l, i) => ({
    ...l,
    id: `${seed}-${i}`,
    days: l.days != null ? days : null,
    // Разовий рядок попереднього рахунку — нова послуга, не те саме нарахування.
    from: l.from?.positionId ? l.from : undefined,
  }))
}

/** Вид рахунку за складом. Застава окремо (§3). */
export function kindFor(rent: Rent, lines: InvoiceLine[], period?: Invoice['period']): InvoiceKind {
  if (lines.length && lines.every((l) => l.from?.deposit)) return 'deposit'
  if (period && lines.some((l) => l.days != null)) return lastRentInvoice(rent) ? 'period' : 'rent'
  if (lines.length && lines.every((l) => l.sale)) return 'extra'
  return 'topup'
}

/** Підпис рахунку в рейлі: що це, без номера. */
export function invoiceTitle(rent: Rent, inv: Invoice): string {
  if (inv.kind === 'deposit') return 'Застава'
  if (inv.period && inv.lines.some((l) => l.days != null)) return `Оренда ${fmtDay(inv.period.from)}–${fmtDay(inv.period.to)}`
  if (inv.lines.length && inv.lines.every((l) => l.sale)) return 'Реалізація'
  const first = inv.lines[0]
  const article = first?.from?.chargeId ? rent.charges.find((c) => c.id === first.from!.chargeId)?.article : undefined
  const head = article ?? first?.service ?? 'Рахунок'
  return inv.lines.length > 1 ? `${head} і ще ${inv.lines.length - 1}` : head
}

/** Сума рядка нарахування з ПДВ за ставкою організації. */
export function chargeGross(rent: Rent, c: Charge): number {
  const net = c.kind === 'discount' ? -c.net : c.net
  return Math.round(net * (1 + vatFor(rent, c.vatable) / 100) * 100) / 100
}

/** Де зараз нарахування: у рахунку, оплачене готівкою, скасоване або ще ні. */
export function chargePlace(rent: Rent, c: Charge):
  | { kind: 'cancelled' }
  | { kind: 'invoice'; invoice: Invoice }
  | { kind: 'cash'; number: string | null }
  | { kind: 'open' } {
  if (c.cancelled) return { kind: 'cancelled' }
  const inv = live(rent).find((i) => i.lines.some((l) => l.from?.chargeId === c.id))
  if (inv) return { kind: 'invoice', invoice: inv }
  const pko = rent.cashOrders.find((o) => o.chargeId === c.id)
  if (pko) return { kind: 'cash', number: pko.number }
  return { kind: 'open' }
}

/** Скільки разом у чернетці рахунку (не сума до сплати: рахунку ще немає). */
export function linesTotal(lines: InvoiceLine[]): number {
  return Math.round(lines.reduce((s, l) => s + lineGross(l), 0) * 100) / 100
}

/** Сортування стосу: свіжі зверху. */
export function byFreshness(a: Invoice, b: Invoice): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return (b.number ?? '9999').localeCompare(a.number ?? '9999') || (a.id < b.id ? 1 : -1)
}

