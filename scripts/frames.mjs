/**
 * Кадри для README і для бізнесу: 1366×768, віджет «Кадри» захований
 * (`lab=off` — те саме, що Ctrl+.). Один кадр на варіант плюс сцени, де
 * варіанти розходяться найбільше.
 *
 * Запуск (при `npm run dev`):
 *   node scripts/frames.mjs [--url …] [--chrome …]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const BASE = argOf('--url', 'http://localhost:5173/bp-legal-invoices-prototype/')
const CHROME = argOf(
  '--chrome',
  process.env.CHROME_PATH ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : '/usr/bin/google-chrome'),
)
const OUT = 'shots/readme'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** [файл, варіант, сцена, дія перед кадром] */
const FRAMES = [
  ['0-five', '0', 'five', async (p) => p.click('[data-testid="tab-Оренда"]')],
  ['a-registry', 'A', 'five', async (p) => p.click('[data-testid="tab-Рахунки"]')],
  ['b-rail', 'B', 'five'],
  ['c-strip', 'C', 'period'],
  ['d-book', 'D', 'five'],
  ['b-period-composer', 'B', 'period', async (p) => p.click('[data-testid="next-period"]')],
  ['d-period-composer', 'D', 'period', async (p) => p.click('[data-testid="book-next-period"]')],
  ['b-covered', 'B', 'extend-paid'],
  ['c-covered', 'C', 'extend-paid'],
  ['a-extend', 'A', 'extend', async (p) => p.click('[data-testid="extend-open"]')],
  ['d-ten', 'D', 'edge-ten'],
  ['c-ten', 'C', 'edge-ten'],
  ['b-no-number', 'B', 'no-number'],
  ['print', 'B', 'closed', async (p) => p.click('[data-testid="invoice-card"][data-number="1102"] [data-testid="invoice-print"]')],
]

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1366, height: 768 } })
const page = await browser.newPage()
for (const [name, v, scene, act] of FRAMES) {
  await page.goto(`${BASE}?${new URLSearchParams({ v, scene, lab: 'off' })}`, { waitUntil: 'networkidle0' })
  await sleep(300)
  if (act) {
    await act(page)
    await sleep(400)
  }
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`${OUT}/${name}.png`)
}
await browser.close()
