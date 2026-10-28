import { invoiceState, type InvoiceState } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import type { Invoice, Rent } from '@/mock/types'

export type StatusTone = 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger'

/**
 * Статус рахунку словами (C6: повний перелік затверджено, нові — пропозиція).
 * Колір — стан грошей: чекаємо — синій, недоплата — бурштин, оплачено —
 * зелений, помилка 1С — червоний. Переплата не тривога: гроші на балансі.
 */
export function statusView(rent: Rent, inv: Invoice): { state: InvoiceState; label: string; tone: StatusTone } {
  const state = invoiceState(rent, inv)
  switch (state.kind) {
    case 'cancelled':
      return { state, label: 'Скасовано', tone: 'outline' }
    case 'number-pending':
      return { state, label: '№ очікується', tone: 'default' }
    case 'number-failed':
      return { state, label: 'Номер не прийшов', tone: 'danger' }
    case 'unpaid':
      return { state, label: 'Очікує надходження', tone: 'accent' }
    case 'partial':
      return { state, label: `Недоплата ${formatMoney(state.left)}`, tone: 'warning' }
    case 'paid':
      return { state, label: 'Оплачено', tone: 'success' }
    case 'overpaid':
      return { state, label: `Переплата ${formatMoney(state.over)}`, tone: 'default' }
  }
}
