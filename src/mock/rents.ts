import { depositLines, rentLines, vatFor } from '@/domain/money'
import { seedRows } from '@/domain/prod'
import { MANAGER } from './orgs'
import type {
  BankPayment,
  Charge,
  Counterparty,
  Invoice,
  InvoiceLine,
  Position,
  Rent,
  RentStatus,
} from './types'

/**
 * Сцени §5 брифу як СТАН. `buildRent(id, variant)` збирає оренду так, ніби
 * менеджер щойно її відкрив: обрав сцену — екран уже в потрібній точці, далі
 * кліки руками.
 *
 * Сцена одна для всіх варіантів. Різниця тільки там, де її вимагає правило:
 * у нових варіантах два стартові рахунки створюються автоматично на вході в
 * «Оплату» (D1, пропозиція), у варіанті 0 — дією менеджера, як у проді.
 *
 * Усі реквізити, назви й номери — заглушки (§7).
 */

export type SceneId =
  | 'start'
  | 'delivery'
  | 'period'
  | 'extend'
  | 'extend-paid'
  | 'multipay'
  | 'five'
  | 'cancel'
  | 'no-number'
  | 'docs'
  | 'closed'
  | 'cash'

const CLIENT: Counterparty = {
  name: 'ТОВ «Будмонтаж-Приклад»',
  edrpou: '00000010',
  iban: 'UA00 300000 00000 0000000000010',
  address: 'м. Київ, вул. Прикладна, 1',
  director: 'Директоренко П. П.',
  phone: '+380 00 000 00 00',
  email: 'buh@example.com',
  activeRents: 2,
}

const VIBRO: Position = {
  id: 'p-vibro',
  name: 'Віброплита бензинова 90 кг',
  service: 'Послуги оренди віброплити бензинової 90 кг',
  qty: 1,
  pricePerDay: 650,
  deposit: 8000,
}

const GEN: Position = {
  id: 'p-gen',
  name: 'Генератор бензиновий 5,5 кВт',
  service: 'Послуги оренди генератора бензинового 5,5 кВт',
  qty: 1,
  pricePerDay: 900,
  deposit: 12000,
}

const SCAFF: Position = {
  id: 'p-scaff',
  name: 'Риштування рамне, комплект 30 м²',
  service: 'Послуги оренди риштування рамного, комплект 30 м²',
  qty: 1,
  pricePerDay: 1200,
  deposit: 15000,
}

const SCAFF_BIG: Position = {
  ...SCAFF,
  id: 'p-scaff-big',
  name: 'Риштування рамне, комплект 50 м²',
  service: 'Послуги оренди риштування рамного, комплект 50 м²',
  pricePerDay: 2000,
  deposit: 25000,
}

function base(over: Partial<Rent> & { positions: Position[]; today: string; issueAt: string; returnAt: string; status: RentStatus }): Rent {
  return {
    id: 'rent-1',
    code: 'ОР-24817',
    party: 'ul',
    counterparty: CLIENT,
    orgId: 'bp-ua',
    fopId: 'fop-1',
    manager: MANAGER,
    warehouse: 'Склад Київ-Північ',
    charges: [],
    invoices: [],
    payments: [],
    cashOrders: [],
    docs: [],
    events: [],
    methodRows: [],
    ...over,
  }
}

let seq = 0
const uid = (p: string) => `${p}-${++seq}`

function inv(
  rent: Rent,
  o: Omit<Invoice, 'id' | 'createdBy' | 'orgId' | 'numberState' | 'createdAt'> & {
    numberState?: Invoice['numberState']
    createdAt?: string
  },
): Invoice {
  return {
    id: uid('inv'),
    createdBy: MANAGER.name,
    orgId: rent.orgId,
    numberState: o.number ? 'ok' : 'pending',
    createdAt: `${o.date.slice(8, 10)}.${o.date.slice(5, 7)}, 10:05`,
    ...o,
  }
}

const rentInv = (rent: Rent, number: string, from: string, to: string, days: number, kind: Invoice['kind'] = 'rent') =>
  inv(rent, { kind, number, date: from < rent.today ? from : rent.today, period: { from, to }, lines: rentLines(rent, days, number) })

const depInv = (rent: Rent, number: string, date: string) =>
  inv(rent, { kind: 'deposit', number, date, lines: depositLines(rent, number) })

/**
 * Платіжка з банку. `prod: true` — у проді її ще й підтвердив менеджер
 * («Підтвердити надходження»): варіант 0 рахує саме підтвердження.
 */
function pay(number: string, date: string, amount: number, invoice: Invoice | null, purpose?: string): BankPayment {
  return {
    id: uid('pay'),
    number,
    date,
    amount,
    invoiceId: invoice?.id ?? null,
    purpose: purpose ?? (invoice ? `Оплата за рахунком № ${invoice.number}` : 'Оплата за оренду обладнання'),
    booked: true,
    confirmedBy: { name: MANAGER.name, at: `${date.slice(8, 10)}.${date.slice(5, 7)}, 11:40` },
  }
}

const gross = (_rent: Rent, i: Invoice) =>
  i.lines.reduce((s, l) => s + l.qty * (l.days ?? 1) * l.priceNet * (1 + l.vatRate / 100), 0)

function charge(rent: Rent, o: Partial<Charge> & Pick<Charge, 'article' | 'service' | 'net'>): Charge {
  return {
    id: uid('ch'),
    kind: 'charge',
    vatable: true,
    createdAt: `${rent.today.slice(8, 10)}.${rent.today.slice(5, 7)}, 09:50`,
    createdBy: MANAGER.name,
    ...o,
  }
}

function lineOf(rent: Rent, c: Charge, seed: string): InvoiceLine {
  return {
    id: `${seed}-${c.id}`,
    service: c.service,
    qty: 1,
    days: null,
    priceNet: c.net,
    vatRate: vatFor(rent, c.vatable),
    from: { chargeId: c.id },
  }
}

/** Оренда з оплаченими стартовими рахунками: оренда і застава. */
function paidStart(rent: Rent, rentNo: string, depNo: string, days: number) {
  const r = rentInv(rent, rentNo, rent.issueAt, rent.returnAt, days)
  const d = depInv(rent, depNo, rent.issueAt)
  rent.invoices.push(r, d)
  rent.payments.push(pay(`2${rentNo.slice(-2)}`, rent.issueAt, gross(rent, r), r), pay(`2${depNo.slice(-2)}`, rent.issueAt, gross(rent, d), d))
  return { r, d }
}

export function buildRent(id: SceneId, variant: string): Rent {
  const rent = buildScene(id, variant)
  // Варіант 0 — прод: рахунок живе в рядку способу оплати.
  if (variant === '0') rent.methodRows = seedRows(rent)
  return rent
}

function buildScene(id: SceneId, variant: string): Rent {
  seq = 0
  const auto = variant !== '0'
  switch (id) {
    case 'start': {
      const rent = base({
        status: 'PENDING_PAYMENT',
        positions: [VIBRO, GEN],
        today: '2026-10-28',
        issueAt: '2026-10-28',
        returnAt: '2026-11-06',
      })
      if (auto) {
        // D1, пропозиція: два рахунки створено на вході в «Оплату», номер ще в дорозі.
        rent.invoices.push(
          inv(rent, { kind: 'rent', number: null, date: rent.today, period: { from: rent.issueAt, to: rent.returnAt }, lines: rentLines(rent, 10, 'n1') }),
          inv(rent, { kind: 'deposit', number: null, date: rent.today, lines: depositLines(rent, 'n2') }),
        )
      }
      return rent
    }

    case 'delivery': {
      const rent = base({
        status: 'ACTIVE',
        positions: [VIBRO, GEN],
        today: '2026-10-30',
        issueAt: '2026-10-25',
        returnAt: '2026-11-03',
      })
      paidStart(rent, '1101', '1102', 10)
      return rent
    }

    case 'period': {
      const rent = base({
        status: 'ACTIVE',
        positions: [SCAFF],
        today: '2026-10-30',
        issueAt: '2026-09-01',
        returnAt: '2026-10-31',
      })
      const periods: [string, string, string, number][] = [
        ['1031', '2026-09-01', '2026-09-15', 15],
        ['1058', '2026-09-16', '2026-09-30', 15],
        ['1084', '2026-10-01', '2026-10-15', 15],
        ['1120', '2026-10-16', '2026-10-31', 16],
      ]
      const d = depInv(rent, '1032', '2026-09-01')
      rent.invoices.push(d)
      rent.payments.push(pay('132', '2026-09-01', gross(rent, d), d))
      for (const [no, from, to, days] of periods) {
        const r = { ...rentInv(rent, no, from, to, days, 'period'), date: addIsoDays(from, -1) }
        rent.invoices.push(r)
        rent.payments.push(pay(`1${no.slice(-2)}`, from, gross(rent, r), r))
      }
      return rent
    }

    case 'extend':
    case 'extend-paid': {
      const rent = base({
        status: 'EXPIRING_SOON',
        positions: [GEN],
        today: '2026-10-29',
        issueAt: '2026-10-20',
        returnAt: '2026-10-29',
      })
      paidStart(rent, '1110', '1111', 10)
      if (id === 'extend-paid') {
        // 4б: клієнт оплатив 20 000 без нового рахунку — лягає на баланс.
        // У проді гроші без рахунку бачить тільки підтвердження менеджера.
        rent.payments.push({ ...pay('287', '2026-10-29', 20000, null, 'Оплата за продовження оренди генератора'), target: 'rent' })
      }
      return rent
    }

    case 'multipay': {
      const rent = base({
        status: 'ACTIVE',
        positions: [SCAFF_BIG],
        today: '2026-10-30',
        issueAt: '2026-10-11',
        returnAt: '2026-10-30',
      })
      const r = rentInv(rent, '1163', '2026-10-11', '2026-10-30', 20)
      const d = depInv(rent, '1164', '2026-10-11')
      rent.invoices.push(r, d)
      rent.payments.push(
        pay('290', '2026-10-11', gross(rent, d), d),
        pay('311', '2026-10-27', 30000, r),
        pay('318', '2026-10-28', 17500, r),
      )
      return rent
    }

    case 'five': {
      const rent = base({
        status: 'ACTIVE',
        positions: [VIBRO, GEN],
        today: '2026-10-31',
        issueAt: '2026-10-21',
        returnAt: '2026-11-06',
      })
      const { r } = paidStart(rent, '1101', '1102', 10)
      void r
      const delivery = charge(rent, { article: 'Доставка', service: 'Послуги доставки обладнання', net: 1000, createdAt: '30.10, 09:50' })
      const fine = charge(rent, { article: 'Штрафні санкції', service: 'Штраф за забруднення обладнання', net: 500, vatable: false, createdAt: '30.10, 16:10' })
      rent.charges.push(delivery, fine)
      const iDel = inv(rent, { kind: 'topup', number: '1140', date: '2026-10-30', lines: [lineOf(rent, delivery, '1140')] })
      const iExt = inv(rent, {
        kind: 'extension',
        number: '1141',
        date: '2026-10-30',
        period: { from: '2026-10-31', to: '2026-11-06' },
        lines: rentLines(rent, 7, '1141'),
      })
      const iFine = inv(rent, { kind: 'topup', number: '1142', date: '2026-10-30', lines: [lineOf(rent, fine, '1142')] })
      rent.invoices.push(iDel, iExt, iFine)
      rent.payments.push(pay('315', '2026-10-31', 10000, iExt), pay('316', '2026-10-31', 500, iFine))
      return rent
    }

    case 'cancel': {
      const rent = base({
        status: 'ACTIVE',
        positions: [VIBRO, GEN],
        today: '2026-10-30',
        issueAt: '2026-10-25',
        returnAt: '2026-11-03',
      })
      paidStart(rent, '1101', '1102', 10)
      const delivery = charge(rent, { article: 'Доставка', service: 'Послуги доставки обладнання', net: 1000 })
      rent.charges.push(delivery)
      rent.invoices.push(inv(rent, { kind: 'topup', number: '1140', date: rent.today, lines: [lineOf(rent, delivery, '1140')] }))
      return rent
    }

    case 'no-number': {
      const rent = base({
        status: 'PENDING_PAYMENT',
        positions: [VIBRO, GEN],
        today: '2026-10-28',
        issueAt: '2026-10-28',
        returnAt: '2026-11-06',
      })
      const r = inv(rent, { kind: 'rent', number: null, numberState: 'failed', date: rent.today, period: { from: rent.issueAt, to: rent.returnAt }, lines: rentLines(rent, 10, 'f1'), createdAt: '28.10, 09:12' })
      rent.invoices.push(r)
      if (auto) {
        rent.invoices.push(inv(rent, { kind: 'deposit', number: null, numberState: 'failed', date: rent.today, lines: depositLines(rent, 'f2'), createdAt: '28.10, 09:12' }))
      }
      return rent
    }

    case 'docs': {
      const rent = base({
        status: 'ACTIVE',
        positions: [VIBRO, GEN],
        today: '2026-10-31',
        issueAt: '2026-10-16',
        returnAt: '2026-11-04',
      })
      const { r } = paidStart(rent, '1101', '1102', 20)
      const sale: Invoice = inv(rent, {
        kind: 'extra',
        number: '1150',
        date: '2026-10-22',
        lines: [
          { id: 's1', service: 'Диск алмазний відрізний 230 мм', qty: 2, days: null, priceNet: 450, vatRate: 20, sale: true },
        ],
      })
      rent.invoices.push(sale)
      rent.payments.push(pay('305', '2026-10-23', gross(rent, sale), sale))
      rent.docs.push(
        { id: 'avr-77', kind: 'avr', number: 'АВР-77', date: '2026-10-31', invoiceId: r.id, amount: gross(rent, r) / 2 },
        { id: 'vn-45', kind: 'waybill', number: 'ВН-45', date: '2026-10-23', invoiceId: sale.id, amount: gross(rent, sale) },
      )
      return rent
    }

    case 'closed': {
      const rent = base({
        status: 'CLOSED',
        positions: [VIBRO],
        today: '2026-11-20',
        issueAt: '2026-10-01',
        returnAt: '2026-10-10',
      })
      const d = depInv(rent, '1101', rent.issueAt)
      const r = rentInv(rent, '1102', rent.issueAt, rent.returnAt, 10)
      rent.invoices.push(d, r)
      rent.payments.push(pay('201', '2026-10-01', gross(rent, d), d), pay('202', '2026-10-01', gross(rent, r), r))
      rent.docs.push({ id: 'avr-12', kind: 'avr', number: 'АВР-12', date: '2026-10-15', invoiceId: r.id, amount: gross(rent, r) })
      return rent
    }

    case 'cash': {
      const rent = base({
        status: 'ACTIVE',
        positions: [VIBRO, GEN],
        today: '2026-10-30',
        issueAt: '2026-10-21',
        returnAt: '2026-10-30',
      })
      paidStart(rent, '1101', '1102', 10)
      rent.charges.push(charge(rent, { article: 'Чистка обладнання', service: 'Послуги чистки обладнання', net: 600, vatable: false }))
      return rent
    }
  }
}

function addIsoDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
