import { useEffect, useRef } from 'react'
import { useCard } from '@/features/rent/card-context'
import type { Invoice, Rent } from '@/mock/types'

/**
 * Перші два рахунки (D1, пропозиція) відкривають друкарські форми, щойно 1С
 * присвоїть номери: менеджер одразу друкує й зберігає PDF для Viber.
 */
export function useAutoPrint(rent: Rent) {
  const { openPrint } = useCard()
  const tracked = useRef(new Set<string>())
  useEffect(() => {
    for (const i of rent.invoices) if (i.auto && i.numberState === 'pending') tracked.current.add(i.id)
    if (tracked.current.size === 0) return
    const list = [...tracked.current].map((id) => rent.invoices.find((i) => i.id === id)).filter(Boolean) as Invoice[]
    if (list.some((i) => i.numberState === 'pending')) return
    tracked.current = new Set()
    const ready = list.filter((i) => i.numberState === 'ok').sort((a, b) => Number(a.kind === 'deposit') - Number(b.kind === 'deposit'))
    if (ready.length) openPrint(ready[0], ready)
  }, [rent.invoices, openPrint])
}

/** Хук як компонент: картка ставить його всередину свого контексту, і він живе на будь-якій вкладці. */
export function AutoPrint({ rent }: { rent: Rent }) {
  useAutoPrint(rent)
  return null
}
