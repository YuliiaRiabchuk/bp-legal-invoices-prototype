import { daysIncl, dailyGross, depositLines, invoiceTotal, paidOf, rentLines, unbilledCharges, chargeLine } from './money'
import type { BankPayment, Invoice, InvoiceLine, MethodRow, MethodTarget, Rent } from '@/mock/types'

/**
 * Гроші як їх рахує прод (варіант 0, стара модель): «Рахунок оренди» +
 * «сім'я» доп. рахунків, «Рахунок застави» окремо. Підтвердження менеджера
 * рахуються як оплата (`mode: 'prod'`). Порт `payment/model/invoice-family.ts`
 * у межах, потрібних сценам; див. `reference/crm-legal-v0.md` §1.3, §4.
 */

const live = (rent: Rent) => rent.invoices.filter((i) => !i.cancelled)

/** Базовий рахунок оренди — перший рахунок оренди; решта «оренди» — доп. рахунки. */
export function baseInvoice(rent: Rent): Invoice | undefined {
  return live(rent).find((i) => i.kind === 'rent' || i.kind === 'period')
}

export function depositInvoice(rent: Rent): Invoice | undefined {
  return live(rent).find((i) => i.kind === 'deposit')
}

export function targetOf(rent: Rent, inv: Invoice): MethodTarget {
  if (inv.kind === 'deposit') return 'deposit'
  return baseInvoice(rent)?.id === inv.id ? 'rent' : 'topup'
}

export const TARGET_LABEL: Record<MethodTarget, string> = {
  rent: 'Оренда',
  deposit: 'Застава',
  topup: 'Дод. нарахування',
}

export function topupInvoices(rent: Rent): Invoice[] {
  return live(rent).filter((i) => i.kind !== 'deposit' && targetOf(rent, i) === 'topup')
}

/** Номінал «Рахунку оренди»: сформований документ або план за позиціями. */
export function rentNominal(rent: Rent): number {
  const base = baseInvoice(rent)
  if (base) return invoiceTotal(base)
  return Math.round(dailyGross(rent) * daysIncl(rent.issueAt, rent.returnAt))
}

export function depositNominal(rent: Rent): number {
  const inv = depositInvoice(rent)
  return inv ? invoiceTotal(inv) : rent.positions.reduce((s, p) => s + p.qty * p.deposit, 0)
}

export function unbilledGross(rent: Rent): number {
  return unbilledCharges(rent).reduce((s, c) => {
    const l = chargeLine(rent, c, 'u')
    return s + l.priceNet * (1 + l.vatRate / 100)
  }, 0)
}

/** Прод не знає банку: гроші існують, коли їх підтвердив менеджер. */
const countsProd = (p: BankPayment) => !!p.confirmedBy

export function paymentTarget(rent: Rent, p: BankPayment): MethodTarget {
  const inv = p.invoiceId ? rent.invoices.find((i) => i.id === p.invoiceId) : undefined
  return inv ? targetOf(rent, inv) : (p.target ?? 'rent')
}

/** Платежі, які бачить прод: підтверджені менеджером. */
export function prodPayments(rent: Rent): BankPayment[] {
  return rent.payments.filter(countsProd)
}

export function paidByTarget(rent: Rent, t: MethodTarget): number {
  return prodPayments(rent)
    .filter((p) => paymentTarget(rent, p) === t)
    .reduce((s, p) => s + p.amount, 0)
}

export function topupNominal(rent: Rent): number {
  return topupInvoices(rent).reduce((s, i) => s + invoiceTotal(i), 0) + unbilledGross(rent)
}

/**
 * Борг ЮЛ посчетно, переплата згорткою по сім'ї (N5). Застава окремо.
 */
export function prodMoney(rent: Rent) {
  const rentDue = rentNominal(rent)
  const depDue = depositNominal(rent)
  const topDue = topupNominal(rent)
  const rentPaid = paidByTarget(rent, 'rent')
  const depPaid = paidByTarget(rent, 'deposit')
  // Готівка ЮЛ у проді — ще один спосіб на «Дод. нарахування».
  const topPaid = paidByTarget(rent, 'topup') + rent.cashOrders.reduce((s, c) => s + c.amount, 0)
  const debtPerInvoice =
    Math.max(0, rentDue - rentPaid) +
    topupInvoices(rent).reduce((s, i) => s + Math.max(0, invoiceTotal(i) - paidOf(rent, i, 'prod')), 0) +
    unbilledGross(rent)
  const familyDue = rentDue + topDue
  const familyPaid = rentPaid + topPaid
  return {
    rentDue,
    depDue,
    topDue,
    rentPaid,
    depPaid,
    topPaid,
    /** Борг по сім'ї рахунків оренди, посчетно. */
    debt: Math.round(debtPerInvoice),
    /** Переплата згорткою. */
    over: Math.max(0, Math.round(familyPaid - familyDue)),
    rentLeft: Math.max(0, rentDue - rentPaid),
    depLeft: Math.max(0, depDue - depPaid),
    topLeft: Math.max(0, Math.round(topDue - topPaid)),
  }
}

/** Рядки складу рахунку для модалки «Склад рахунку». */
export function compositionFor(rent: Rent, row: MethodRow, seed: string): InvoiceLine[] {
  if (row.target === 'deposit') return depositLines(rent, seed)
  if (row.target === 'rent') return rentLines(rent, daysIncl(rent.issueAt, rent.returnAt), seed)
  return unbilledCharges(rent).map((c) => chargeLine(rent, c, seed))
}

/**
 * Сід рядків способів, як у проді: на «Оплаті» ЮЛ два чорнові «Банківський
 * переказ» (Оренда, Застава); сформований і не закритий рахунок лишається
 * своїм рядком «Очікує надходження».
 */
export function seedRows(rent: Rent): MethodRow[] {
  const rows: MethodRow[] = []
  let n = 0
  const add = (r: Omit<MethodRow, 'id'>) => rows.push({ id: `row-${++n}`, ...r })
  const hasBase = !!baseInvoice(rent)
  const hasDep = !!depositInvoice(rent)
  for (const inv of rent.invoices) {
    if (inv.cancelled) continue
    const left = invoiceTotal(inv) - paidOf(rent, inv, 'prod')
    if (left > 0) add({ method: 'bank', target: targetOf(rent, inv), amount: left, invoiceId: inv.id })
  }
  if (rent.status === 'PENDING_PAYMENT') {
    if (!hasBase) add({ method: 'bank', target: 'rent', amount: rentNominal(rent) })
    if (!hasDep) add({ method: 'bank', target: 'deposit', amount: depositNominal(rent) })
  }
  return rows
}
