import type { ComponentType } from 'react'
import type { StageKey } from '@/mock/types'
import { RentTabV0 } from './v0/RentTabV0'
import { RailV0 } from './v0/RailV0'
import { DocumentsV0 } from './v0/DocumentsV0'
import { InvoicesTabA } from './a/InvoicesTabA'
import { RailA, RentTabA } from './a/RentTabA'
import { RailC, RentTabC } from './c/RentTabC'
import { DocumentsTab } from './shared/DocumentsTab'
import { PaymentsRegistry } from './shared/PaymentsRegistry'

/**
 * Варіант = уся композиція картки: таби, вміст вкладки «Оренда» на кожному
 * етапі, рейл, інші вкладки. Шапка і степер спільні.
 */
export interface VariantUi {
  tabs: string[]
  RentTab: ComponentType<{ stage: StageKey }>
  Rail: ComponentType
  /** Інші вкладки варіанта; невідома вкладка — заглушка. */
  Tabs: Record<string, ComponentType>
  /** Дія в шапці оренди, доступна з будь-якої вкладки (продовження (а), варіант A). */
  HeaderAction?: ComponentType
}

/** Таби проду (`detail/tabs.ts:51-56`). «Хронологія» відкриває бокову панель. */
export const PROD_TABS = ['Оренда', 'Документи', 'Оренди клієнта', 'Реєстр платежів', 'Клієнт', 'Хронологія']

export const VARIANT_UI: Record<string, VariantUi> = {
  '0': { tabs: PROD_TABS, RentTab: RentTabV0, Rail: RailV0, Tabs: { Документи: DocumentsV0 } },
  A: {
    tabs: ['Оренда', 'Документи', 'Рахунки', 'Оренди клієнта', 'Реєстр платежів', 'Клієнт', 'Хронологія'],
    RentTab: RentTabA,
    Rail: RailA,
    Tabs: { Документи: DocumentsTab, Рахунки: InvoicesTabA, 'Реєстр платежів': PaymentsRegistry },
  },
  C: { tabs: PROD_TABS, RentTab: RentTabC, Rail: RailC, Tabs: { Документи: DocumentsTab, 'Реєстр платежів': PaymentsRegistry } },
}
