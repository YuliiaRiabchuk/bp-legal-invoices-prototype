import { RentCard } from '@/features/rent/RentCard'
import { StoreProvider } from '@/state/store'
import { LabProvider, useLab } from '@/lab/lab-state'
import { LabWidget } from '@/lab/LabWidget'
import { buildRent, type SceneId } from '@/mock/rents'
import { Toaster } from '@/components/ui/toast'

/**
 * Одна адреса, один екран: картка оренди юрособи. Варіант, сцена і роль
 * живуть у query-рядку, тож роутер не потрібен.
 *
 * Стор перезбирається з нуля (`key`), коли міняється сцена або варіант:
 * варіанти порівнюються з однієї точки.
 */
export default function App() {
  return (
    <LabProvider>
      <Shell />
    </LabProvider>
  )
}

function Shell() {
  const { resetKey, sceneId, step, party } = useLab()
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-shell">
      <StoreProvider key={resetKey} initial={buildRent(sceneId as SceneId, step, party)}>
        <main className="min-h-0 flex-1">
          <RentCard />
        </main>
      </StoreProvider>
      <LabWidget />
      <Toaster />
    </div>
  )
}
