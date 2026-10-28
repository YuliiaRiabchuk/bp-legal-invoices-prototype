import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { vatFor } from '@/domain/money'
import { formatMoney } from '@/lib/money'
import type { Charge, Rent } from '@/mock/types'
import { useStore } from '@/state/store'

/** Статті витрат з 1С (заглушки). */
export const ARTICLES: { article: string; service: string; vatable: boolean }[] = [
  { article: 'Доставка', service: 'Послуги доставки обладнання', vatable: true },
  { article: 'Чистка обладнання', service: 'Послуги чистки обладнання', vatable: true },
  { article: 'Штрафні санкції', service: 'Штраф за пошкодження обладнання', vatable: false },
  { article: 'Додаткові витрати', service: 'Додаткові послуги', vatable: true },
]

/**
 * Порт таблиці «Нарахування та знижки» (`payment/SurchargesSection.tsx`):
 * Найменування · Без ПДВ · ПДВ · Сума · Статус. Статус нарахування ЮЛ —
 * «Залишок обліковується за рахунком загалом».
 */
export function ChargesTableV0({ rent }: { rent: Rent }) {
  const charges = rent.charges
  if (charges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-4" data-testid="charges-empty">
        <p className="text-body font-medium text-fg">Додаткових нарахувань поки немає</p>
        <p className="text-label text-muted-fg">Доставка, послуги та інші витрати за орендою з'являться тут.</p>
      </div>
    )
  }
  return (
    <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-body tabular-nums" data-testid="charges-table">
      <thead>
        <tr className="border-b border-border bg-muted/50 text-left text-label text-muted-fg">
          <th className="px-3 py-1.5 font-medium">Найменування</th>
          <th className="px-3 py-1.5 text-right font-medium">Без ПДВ</th>
          <th className="px-3 py-1.5 text-right font-medium">ПДВ</th>
          <th className="px-3 py-1.5 text-right font-medium">Сума</th>
          <th className="px-3 py-1.5 font-medium">Статус</th>
        </tr>
      </thead>
      <tbody>
        {charges.map((c) => {
          const rate = vatFor(rent, c.vatable)
          const vat = Math.round(c.net * rate) / 100
          return (
            <tr key={c.id} className={c.cancelled ? 'text-subtle line-through' : 'border-b border-border last:border-0'}>
              <td className="px-3 py-2">{c.article}</td>
              <td className="px-3 py-2 text-right">{formatMoney(c.net)}</td>
              <td className="px-3 py-2 text-right">{vat ? formatMoney(vat) : '—'}</td>
              <td className="px-3 py-2 text-right">{formatMoney(c.net + vat)}</td>
              <td className="px-3 py-2 text-label text-muted-fg">Залишок обліковується за рахунком загалом</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Порт форми нарахування (`components/SurchargeForm.tsx`) у межах сцен:
 * стаття (обов'язкова), сума без ПДВ, «Враховувати ПДВ», дві кнопки.
 */
export function ChargeFormV0({
  rent,
  kind,
  onDone,
  onCancel,
}: {
  rent: Rent
  kind: Charge['kind']
  onDone: (goPay: boolean) => void
  onCancel: () => void
}) {
  const { dispatch } = useStore()
  const [article, setArticle] = useState<string>('')
  const [net, setNet] = useState('')
  const [vatable, setVatable] = useState(true)
  const a = ARTICLES.find((x) => x.article === article)
  const amount = Number(net.replace(/\s/g, '').replace(',', '.')) || 0
  const rate = vatFor(rent, vatable && (a?.vatable ?? true))
  const ok = !!a && amount > 0

  const submit = (goPay: boolean) => {
    if (!a || !ok) return
    dispatch({
      type: 'CHARGE_ADD',
      charge: { kind, article: a.article, service: a.service, net: amount, vatable: vatable && a.vatable },
    })
    onDone(goPay)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="charge-form">
      <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
        <span className="text-label text-muted-fg">Що додаємо</span>
        <div className="flex gap-1">
          {['Дод. нарахування', 'Знижка', 'Витратні матеріали'].map((x, i) => (
            <span
              key={x}
              className={
                (kind === 'discount' ? i === 1 : i === 0)
                  ? 'rounded-sm border border-fg bg-fg px-2 py-0.5 text-label text-primary-fg'
                  : 'rounded-sm border border-border px-2 py-0.5 text-label text-fg-2'
              }
            >
              {x}
            </span>
          ))}
        </div>
        <label htmlFor="charge-article" className="text-label text-muted-fg">
          Стаття витрат
        </label>
        <div>
          <select
            id="charge-article"
            data-testid="charge-article"
            value={article}
            onChange={(e) => {
              setArticle(e.target.value)
              const x = ARTICLES.find((y) => y.article === e.target.value)
              if (x) setVatable(x.vatable)
            }}
            className="h-control w-full rounded-md border border-border bg-card px-2 text-body"
          >
            <option value="">Оберіть статтю</option>
            {ARTICLES.map((x) => (
              <option key={x.article} value={x.article}>
                {x.article}
              </option>
            ))}
          </select>
          {!a && <p className="mt-1 text-label text-muted-fg">Без статті витрат запис не буде проведено в 1С.</p>}
        </div>
        <span className="text-label text-muted-fg">Обладнання</span>
        <span className="text-body text-fg-2">Уся оренда</span>
        <label htmlFor="charge-net" className="text-label text-muted-fg">
          Сума без ПДВ
        </label>
        <Input id="charge-net" data-testid="charge-net" inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} className="w-40" />
        <span />
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={vatable} onChange={(e) => setVatable(e.target.checked)} />
          Враховувати ПДВ
          <span className="text-label text-muted-fg">
            {a && !a.vatable ? 'Вибрана стаття не оподатковується ПДВ' : `Ставка ${rate}% — ПДВ ${formatMoney((amount * rate) / 100)}`}
          </span>
        </label>
        <span className="text-label text-muted-fg">Разом до нарахування</span>
        <span className="text-body font-semibold tabular-nums">{formatMoney(amount * (1 + rate / 100))}</span>
      </div>
      <p className="mt-3 text-label text-muted-fg">Розрахунок за поточним рахунком. При виборі отримувача оплати ПДВ може змінитися.</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Скасувати
        </Button>
        <Button variant="secondary" disabled={!ok} onClick={() => submit(false)}>
          Додати нарахування
        </Button>
        <Button disabled={!ok} onClick={() => submit(true)} data-testid="charge-submit-pay">
          <Plus aria-hidden />
          Додати й перейти до оплати
        </Button>
      </div>
    </div>
  )
}
