import type { Org } from './types'

/**
 * Одержувачі. Реквізити — заглушки: репа публічна (§7 брифу).
 * Рахунки ЮЛ за замовчуванням від «Будпрокат Україна»; склади Одеси мають
 * свою організацію (B4).
 */
export const ORGS: Org[] = [
  {
    id: 'bp-ua',
    name: 'ТОВ «Будпрокат Україна»',
    edrpou: '00000001',
    iban: 'UA00 300000 00000 0000000000001',
    bank: 'АТ «Банк-заглушка»',
    vatPayer: true,
  },
  {
    id: 'bp-odesa',
    name: 'ПП «Будпрокат Одеса»',
    edrpou: '00000002',
    iban: 'UA00 300000 00000 0000000000002',
    bank: 'АТ «Банк-заглушка»',
    vatPayer: true,
  },
  {
    id: 'fop-1',
    name: 'ФОП Прикладенко О. О.',
    edrpou: '0000000003',
    iban: 'UA00 300000 00000 0000000000003',
    bank: 'АТ «Банк-заглушка»',
    vatPayer: false,
  },
]

export const ORG_BY_ID: Record<string, Org> = Object.fromEntries(ORGS.map((o) => [o.id, o]))

export const MANAGER = { id: 'm1', name: 'Менеджер Прикладна', initials: 'МП' }
export const ACCOUNTANT = 'Бухгалтер (1С)'
