/**
 * Реєстр варіантів. Варіант — уся композиція картки: де живе рахунок, як
 * збирається склад, як показано продовження (`docs/shape.md`).
 *
 * Варіант 0 — порт чинного проду ЮЛ (стара модель грошей) за кодом CRM. Він
 * антиреференс і база для вимірів, тому стоїть першим і не зникає.
 */
export interface VariantDef {
  code: string
  label: string
  /** Одне речення: що ця композиція робить інакше. */
  note: string
}

export const VARIANTS: VariantDef[] = [
  { code: '0', label: 'Чинний прод', note: 'рахунок у рядку «Банківський переказ», порт коду CRM; антиреференс і база вимірів' },
]

export type Role = 'manager' | 'head'

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Менеджер',
  head: 'Керівник',
}
