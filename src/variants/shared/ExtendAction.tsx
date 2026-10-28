import { useRef, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/components/ui/toast'
import { addDays, daysIncl, fmtDate, fmtDay, rentLines } from '@/domain/money'
import { linesTotal, rentBilledUntil } from '@/domain/invoicing'
import { formatMoney } from '@/lib/money'
import { days as daysWord } from '@/lib/plural'
import { useStore } from '@/state/store'
import { Proposal } from './Proposal'

/**
 * «Продовжити оренду» — продовження (а), варіанти A і D (контроль, F7).
 *
 * Кнопка в шапці оренди, доступна з будь-якої вкладки й етапу. Нове
 * повернення одразу виписує рахунок на додані доби і зсуває планове
 * повернення. У проді продовження ЮЛ пише рядок у накопичувач доп. рахунку
 * і власного рахунку не має (N1) — тут рахунок окремий, з періодом.
 */
export function ExtendAction() {
  const { rent, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  // Нові доби — після останньої дати, яку вже покриває рахунок або план.
  const billed = rentBilledUntil(rent)
  const after = billed && billed > rent.returnAt ? billed : rent.returnAt
  const from = addDays(after, 1)
  const [to, setTo] = useState(from)
  const n = to >= from ? daysIncl(from, to) : 0
  const lines = rentLines(rent, n, 'ext')
  if (rent.status === 'CLOSED' || rent.status === 'DRAFT') return null
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setTo(from)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="extend-open" data-main-action="extend">
          <CalendarPlus aria-hidden />
          Продовжити оренду
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-3"
        data-testid="extend-form"
        // Фокус — на дату, а не на першу позначку «пропозиція»: інакше її підказка закриває поле.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          dateRef.current?.focus()
        }}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-fg">
          Продовжити оренду
          <Proposal note="Продовження юрособи одразу виписує окремий рахунок на нові доби з періодом; у проді воно пише рядок у доп. рахунок." />
        </p>
        <p className="mt-0.5 text-label text-muted-fg">Повернення за планом {fmtDate(rent.returnAt)}</p>
        <label className="mt-2.5 flex flex-wrap items-center gap-2 text-label text-muted-fg">
          нове повернення
          <Input
            ref={dateRef}
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-8 w-[10rem]"
            data-testid="extend-date"
          />
          <span className="tabular-nums text-fg-2">{n > 0 ? `+${daysWord(n)}` : ''}</span>
        </label>
        <p className="mt-2 text-label text-fg-2">
          {n > 0 ? (
            <>
              Рахунок на {fmtDay(from)}–{fmtDay(to)}: <span className="font-medium tabular-nums text-fg">{formatMoney(linesTotal(lines))}</span> з ПДВ
            </>
          ) : (
            'Оберіть дату після планового повернення.'
          )}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Скасувати
          </Button>
          <Button
            size="sm"
            disabled={n <= 0}
            data-testid="extend-submit"
            onClick={() => {
              dispatch({ type: 'INVOICE_COMPOSE', kind: 'extension', lines, period: { from, to } })
              dispatch({ type: 'EXTEND', to })
              setOpen(false)
              toast(`Рахунок на ${daysWord(n)} сформовано`, `Повернення перенесено на ${fmtDate(to)}; № очікується від 1С.`)
            }}
          >
            Продовжити й виставити рахунок
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
