import type { SceneId } from '@/mock/rents'
import type { Party, StageKey } from '@/mock/types'

/**
 * Одинадцять сцен §5 брифу як стан, а не як опис (дані — `buildRent`).
 * Сцена 4 має два стани: 4а — клієнт просить ще 7 діб, 4б — клієнт уже
 * оплатив 20 000, система показує, до якої дати вистачить.
 *
 * Сцена живе НАД варіантами: той самий стан для 0, A, B, C, D.
 */
export interface Scene {
  id: SceneId
  n: string
  title: string
  party: Party
  stage: StageKey
  /** Що ця сцена має довести. */
  proves: string
}

export const SCENES: Scene[] = [
  { id: 'start', n: '1', title: 'Старт', party: 'ul', stage: 'payment', proves: 'ТОВ, два рахунки: оренда з ПДВ і застава без ПДВ; № очікується, потім приходить; друк і PDF' },
  { id: 'delivery', n: '2', title: 'Доставка після видачі', party: 'ul', stage: 'active', proves: 'доставка 1 000: новий рахунок, старі не змінились; менеджер обирає склад' },
  { id: 'period', n: '3', title: 'Новий період', party: 'ul', stage: 'active', proves: 'риштування з 01.09, сьогодні 30.10: рахунок на 01–15.11 на основі попереднього' },
  { id: 'extend', n: '4а', title: 'Продовження', party: 'ul', stage: 'active', proves: 'клієнт просить ще 7 діб: рахунок на 7 діб' },
  { id: 'extend-paid', n: '4б', title: 'Продовження: оплачено', party: 'ul', stage: 'active', proves: 'клієнт оплатив 20 000: до якої дати вистачить' },
  { id: 'multipay', n: '5', title: 'Кілька оплат', party: 'ul', stage: 'active', proves: 'рахунок 48 000, платіжки 30 000 і 17 500: недоплата 500' },
  { id: 'five', n: '6', title: "П'ять рахунків", party: 'ul', stage: 'active', proves: 'наступного дня: що виставлено, оплачено, чекаємо; яка оплата до якого рахунку' },
  { id: 'cancel', n: '7', title: 'Скасування', party: 'ul', stage: 'active', proves: 'неоплачений рахунок на доставку скасовано того ж дня; лишається видимим' },
  { id: 'no-number', n: '8', title: '1С не відповіла', party: 'ul', stage: 'payment', proves: 'номер не прийшов: стан помилки, друк недоступний' },
  { id: 'docs', n: '9', title: 'Документи під рахунком', party: 'ul', stage: 'active', proves: 'оплачений рахунок, під ним АВР з 1С; реалізація — з видатковою' },
  { id: 'closed', n: '10', title: 'Рахунок як документ', party: 'ul', stage: 'closing', proves: 'закрита оренда: рахунок № 1102 на перегляд і друк, стан не змінюється' },
  { id: 'cash', n: '11', title: 'Готівка від ЮЛ', party: 'ul', stage: 'active', proves: 'чистка 600 готівкою: ПКО на ФОП, рахунки не змінюються' },
]

export const SCENE_BY_ID = new Map<string, Scene>(SCENES.map((s) => [s.id, s]))

export const STAGE_LABELS: { key: StageKey; label: string }[] = [
  { key: 'draft', label: 'Оформлення' },
  { key: 'payment', label: 'Оплата' },
  { key: 'handover', label: 'Видача' },
  { key: 'active', label: 'В роботі' },
  { key: 'closing', label: 'Закриття' },
]
