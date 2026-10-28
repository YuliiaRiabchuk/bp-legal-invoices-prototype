import type { ComponentType } from 'react'
import type { StageKey } from '@/mock/types'
import { RentTabV0 } from './v0/RentTabV0'
import { RailV0 } from './v0/RailV0'
import { DocumentsV0 } from './v0/DocumentsV0'
import { InvoicesTabA } from './a/InvoicesTabA'
import { RailA, RentTabA } from './a/RentTabA'
import { RailB } from './b/RailB'
import { RentTabB } from './b/RentTabB'
import { RentTabC } from './c/RentTabC'
import { StripC } from './c/StripC'
import { RentTabD } from './d/RentTabD'
import { DocumentsTree } from './shared/DocumentsTree'
import { ExtendAction } from './shared/ExtendAction'
import { SummaryRail } from './shared/SummaryRail'

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
  /** Рейл ширший за прод (24rem): у ньому живуть рахунки. */
  wideRail?: boolean
  /** Дія в шапці оренди, доступна з будь-якої вкладки (продовження (а)). */
  HeaderAction?: ComponentType
  /** Смуга над кроком і рейлом на вкладці «Оренда» (стрічка C). */
  Above?: ComponentType
}

/** Таби проду (`detail/tabs.ts:51-56`). «Хронологія» відкриває бокову панель. */
export const PROD_TABS = ['Оренда', 'Документи', 'Оренди клієнта', 'Реєстр платежів', 'Клієнт', 'Хронологія']

export const VARIANT_UI: Record<string, VariantUi> = {
  '0': { tabs: PROD_TABS, RentTab: RentTabV0, Rail: RailV0, Tabs: { Документи: DocumentsV0 } },
  A: {
    tabs: ['Оренда', 'Документи', 'Рахунки', 'Оренди клієнта', 'Реєстр платежів', 'Клієнт', 'Хронологія'],
    RentTab: RentTabA,
    Rail: RailA,
    Tabs: { Документи: DocumentsTree, Рахунки: InvoicesTabA },
    HeaderAction: ExtendAction,
  },
  B: { tabs: PROD_TABS, RentTab: RentTabB, Rail: RailB, Tabs: { Документи: DocumentsTree }, wideRail: true },
  C: { tabs: PROD_TABS, RentTab: RentTabC, Rail: SummaryRail, Tabs: { Документи: DocumentsTree }, Above: StripC },
  D: { tabs: PROD_TABS, RentTab: RentTabD, Rail: SummaryRail, Tabs: { Документи: DocumentsTree }, HeaderAction: ExtendAction },
}
