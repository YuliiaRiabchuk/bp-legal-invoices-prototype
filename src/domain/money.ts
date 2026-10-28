import type { Charge, Invoice, InvoiceLine, Org, Position, Rent } from '@/mock/types'
import { ORG_BY_ID } from '@/mock/orgs'

/**
 * Гроші рахунків. Один розрахунок на всі варіанти: варіанти відрізняються
 * тим, ДЕ показують суму, а не тим, як її рахують (вимір «поверхні з сумою»).
 *
 * ПДВ живе на рядку (§3). Ціни каталогу без ПДВ, суми рахунку з ПДВ.
 * Застава ніколи не сумується з орендою.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

// ── Дати ────────────────────────────────────────────────────────────────

/** ISO `YYYY-MM-DD` → Date у полудень UTC (без стрибків часового поясу). */
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, n: number): string {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

/** Скільки діб від `from` до `to` включно. */
export function daysIncl(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1
}

/** `30.10.2026`. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** `30.10` — для періодів у межах року. */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

export function fmtPeriod(p: { from: string; to: string }): string {
  return `${fmtDay(p.from)}–${fmtDate(p.to)}`
}

// ── Рядки й рахунки ─────────────────────────────────────────────────────

export function orgOf(rent: Rent): Org {
  return ORG_BY_ID[rent.orgId]
}

/** Ставка рядка: 0 у неплатника ПДВ, інакше 20 або 0 за статтею. */
export function vatFor(rent: Rent, vatable: boolean): number {
  return orgOf(rent).vatPayer && vatable ? 20 : 0
}

export function lineNet(l: InvoiceLine): number {
  return round2(l.qty * (l.days ?? 1) * l.priceNet)
}

export function lineVat(l: InvoiceLine): number {
  return round2((lineNet(l) * l.vatRate) / 100)
}

export function lineGross(l: InvoiceLine): number {
  return round2(lineNet(l) + lineVat(l))
}

export function invoiceNet(inv: Invoice): number {
  return round2(inv.lines.reduce((s, l) => s + lineNet(l), 0))
}

export function invoiceVat(inv: Invoice): number {
  return round2(inv.lines.reduce((s, l) => s + lineVat(l), 0))
}

export function invoiceTotal(inv: Invoice): number {
  return round2(invoiceNet(inv) + invoiceVat(inv))
}

/** Рахунок без жодного рядка з ПДВ друкується з позначкою «без ПДВ». */
export function isVatFree(inv: Invoice): boolean {
  return inv.lines.every((l) => l.vatRate === 0)
}

/** Ставка за добу з ПДВ — для «вистачить до». */
export function dailyGross(rent: Rent): number {
  const rate = vatFor(rent, true)
  return round2(rent.positions.reduce((s, p) => s + p.qty * p.pricePerDay * (1 + rate / 100), 0))
}

export function rentLines(rent: Rent, days: number, idSeed: string): InvoiceLine[] {
  return rent.positions.map((p, i) => ({
    id: `${idSeed}-r${i}`,
    service: p.service,
    qty: p.qty,
    days,
    priceNet: p.pricePerDay,
    vatRate: vatFor(rent, true),
    from: { positionId: p.id },
  }))
}

export function depositLines(rent: Rent, idSeed: string): InvoiceLine[] {
  const total = rent.positions.reduce((s, p: Position) => s + p.qty * p.deposit, 0)
  return [
    {
      id: `${idSeed}-d`,
      service: 'Гарантійний платіж за оренду обладнання',
      qty: 1,
      days: null,
      priceNet: total,
      vatRate: 0,
      from: { deposit: true },
    },
  ]
}

export function chargeLine(rent: Rent, c: Charge, idSeed: string): InvoiceLine {
  return {
    id: `${idSeed}-c-${c.id}`,
    service: c.service,
    qty: 1,
    days: null,
    priceNet: c.kind === 'discount' ? -c.net : c.net,
    vatRate: vatFor(rent, c.vatable),
    from: { chargeId: c.id },
  }
}

// ── Оплати ──────────────────────────────────────────────────────────────

/**
 * Скільки зараховано на рахунок. `mode`:
 *  - `booked` — тільки платіжні доручення з банку / 1С (нові варіанти, D7);
 *  - `prod` — як у проді: підтвердження менеджера теж рахуються.
 */
export type PayMode = 'booked' | 'prod'

const counts = (p: Rent['payments'][number], mode: PayMode) =>
  p.booked || (mode === 'prod' && !!p.confirmedBy)

export function paymentsOf(rent: Rent, inv: Invoice, mode: PayMode = 'booked') {
  return rent.payments.filter((p) => p.invoiceId === inv.id && counts(p, mode))
}

export function paidOf(rent: Rent, inv: Invoice, mode: PayMode = 'booked'): number {
  return round2(paymentsOf(rent, inv, mode).reduce((s, p) => s + p.amount, 0))
}

export type InvoiceState =
  | { kind: 'cancelled' }
  | { kind: 'number-pending' }
  | { kind: 'number-failed' }
  | { kind: 'unpaid'; total: number }
  | { kind: 'partial'; paid: number; total: number; left: number }
  | { kind: 'paid'; total: number }
  | { kind: 'overpaid'; total: number; over: number }

export function invoiceState(rent: Rent, inv: Invoice, mode: PayMode = 'booked'): InvoiceState {
  if (inv.cancelled) return { kind: 'cancelled' }
  const total = invoiceTotal(inv)
  const paid = paidOf(rent, inv, mode)
  if (paid > 0) {
    if (paid < total) return { kind: 'partial', paid, total, left: round2(total - paid) }
    if (paid > total) return { kind: 'overpaid', total, over: round2(paid - total) }
    return { kind: 'paid', total }
  }
  if (inv.numberState === 'pending') return { kind: 'number-pending' }
  if (inv.numberState === 'failed') return { kind: 'number-failed' }
  return { kind: 'unpaid', total }
}

/** Неоплачений рахунок редагується (B1); після першої оплати — ні. */
export function isEditable(rent: Rent, inv: Invoice): boolean {
  return !inv.cancelled && paidOf(rent, inv, 'prod') === 0
}

/** Скасування доступне в день створення (B7). */
export function isCancellable(rent: Rent, inv: Invoice): boolean {
  return isEditable(rent, inv) && inv.date === rent.today
}

/** Друк і збереження — тільки з номером 1С. */
export const canPrint = (inv: Invoice) => inv.numberState === 'ok' && !!inv.number

/** Переплата і нерозпізнані платіжки — «на балансі» (F4, G4). */
export function onBalance(rent: Rent, mode: PayMode = 'booked'): number {
  const loose = rent.payments
    .filter((p) => p.invoiceId == null && counts(p, mode))
    .reduce((s, p) => s + p.amount, 0)
  const over = rent.invoices.reduce((s, inv) => {
    const st = invoiceState(rent, inv, mode)
    return s + (st.kind === 'overpaid' ? st.over : 0)
  }, 0)
  return round2(loose + over)
}

const live = (rent: Rent) => rent.invoices.filter((i) => !i.cancelled)

/** Нарахування, яких ще немає в жодному чинному рахунку. */
export function unbilledCharges(rent: Rent): Charge[] {
  const billed = new Set(
    live(rent).flatMap((i) => i.lines.map((l) => l.from?.chargeId).filter(Boolean) as string[]),
  )
  return rent.charges.filter((c) => !c.cancelled && !billed.has(c.id))
}

/** Остання дата, яку покриває чинний рахунок оренди. */
export function billedUntil(rent: Rent): string | null {
  const ends = live(rent)
    .map((i) => i.period?.to)
    .filter(Boolean) as string[]
  return ends.length ? ends.sort().at(-1)! : null
}

export function totals(rent: Rent, mode: PayMode = 'booked') {
  const inv = live(rent)
  const issued = round2(inv.reduce((s, i) => s + invoiceTotal(i), 0))
  const paid = round2(inv.reduce((s, i) => s + Math.min(paidOf(rent, i, mode), invoiceTotal(i)), 0))
  return { issued, paid, left: round2(issued - paid), balance: onBalance(rent, mode) }
}

/**
 * «Грошей вистачить до» (G2, пропозиція): проведені гроші по рахунках оренди
 * з ПДВ плюс баланс, мінус нарахування, поділені на ставку за добу з ПДВ.
 * Застава окремо. Підтвердження менеджера не рахуються (D6).
 */
export function coveredUntil(rent: Rent): { date: string; days: number; money: number } {
  const isRentInv = (i: Invoice) => i.kind !== 'deposit'
  const money =
    live(rent)
      .filter(isRentInv)
      .reduce((s, i) => {
        const rentPart = i.lines.filter((l) => !l.from?.chargeId && !l.from?.deposit)
        const share = invoiceTotal(i) ? rentPart.reduce((a, l) => a + lineGross(l), 0) / invoiceTotal(i) : 0
        return s + Math.min(paidOf(rent, i), invoiceTotal(i)) * share
      }, 0) + onBalance(rent)
  const rate = dailyGross(rent)
  const days = rate > 0 ? Math.floor(money / rate) : 0
  return { date: addDays(rent.issueAt, days - 1), days, money: round2(money) }
}

/** Ім'я файлу PDF (D10, G3). */
export function pdfName(inv: Invoice): string {
  return `Рахунок № ${inv.number ?? '—'} від ${fmtDate(inv.date)}.pdf`
}
