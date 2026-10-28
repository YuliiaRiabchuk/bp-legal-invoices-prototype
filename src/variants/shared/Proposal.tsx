import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Позначка «пропозиція»: чого немає в проді (§6 брифу). Пунктирна рамка, а
 * не бейдж — це примітка до кадру, а не стан у продукті, і її не можна
 * сплутати зі статусом рахунку. Та сама графіка, що в bp-payment-intake.
 *
 * `note` — що саме нове: показується в підказці, щоб рев'юер не гадав.
 */
export function Proposal({ note, className }: { note?: string; className?: string }) {
  const tag = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm border border-dashed border-border-strong px-1 text-mono font-medium uppercase leading-4 tracking-[0.04em] text-muted-fg',
        className,
      )}
      data-proposal=""
    >
      пропозиція
    </span>
  )
  if (!note) return tag
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Без зупинки Tab: це примітка до кадру, а не дія. Текст підказки дублює `title`. */}
        <span className="inline-flex rounded-sm" title={note}>
          {tag}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[18rem]">
        {note}
      </TooltipContent>
    </Tooltip>
  )
}
