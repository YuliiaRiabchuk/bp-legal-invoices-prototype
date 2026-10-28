import { createContext, useContext } from 'react'
import type { Invoice } from '@/mock/types'

/**
 * Дії рівня картки, спільні для всіх варіантів: таби, друкарська форма,
 * хронологія, «доручення» (вхід з рейлу на крок з уже розкритою формою).
 */
export interface CardActions {
  tab: string
  setTab: (tab: string) => void
  /**
   * Перегляд і друк рахунку. `set` — кілька рахунків, які відкрились разом
   * (оренда і застава на старті): у діалозі між ними перемикаються.
   */
  openPrint: (invoice: Invoice, set?: Invoice[]) => void
  openChronology: () => void
  /** Доручення з рейлу: яку форму розкрити на кроці. `null` — немає. */
  errand: 'charge' | 'discount' | null
  setErrand: (e: 'charge' | 'discount' | null) => void
  /**
   * Нові варіанти: «виписати рахунок» з іншого місця картки (нарахування в
   * кроці → бланк у реєстрі чи на стрічці). Місце рахунку забирає доручення
   * і скидає його.
   */
  invoiceErrand: InvoiceErrand | null
  setInvoiceErrand: (e: InvoiceErrand | null) => void
}

export interface InvoiceErrand {
  via: 'button' | 'period' | 'charge'
  chargeId?: string
}

export const CardContext = createContext<CardActions | null>(null)

export function useCard(): CardActions {
  const ctx = useContext(CardContext)
  if (!ctx) throw new Error('useCard must be used inside RentCard')
  return ctx
}
