/**
 * Прогін прототипу рахунків ЮЛ: 11 сцен §5 брифу × варіанти.
 *
 * Сцена — спільний сценарій («виписати рахунок на доставку»). ДРАЙВЕР
 * варіанта знає, куди в ньому клікати. Результат перевіряється за станом
 * стору (`window.__legal`), а не за картинкою.
 *
 * Виміри §6 брифу:
 *  - кліки від відкритої оренди «В оренді» до сформованого нового рахунку
 *    (сцени 2, 3, 4а);
 *  - кліки до відповіді «яка оплата до якого рахунку» (сцена 6): відповідь
 *    є, коли кожна проведена платіжка видна разом із номером свого рахунку
 *    (`[data-pay-invoice]`); `—` — варіант не дає відповіді;
 *  - максимальний вертикальний зсув головної дії між кліками, px:
 *    елементи `[data-main-action=<ключ>]`, координата вмісту (без прокрутки);
 *  - скільки поверхонь одночасно показують суму до сплати по рахунку
 *    (`[data-amount-due=<поверхня>]`, видимі; максимум за сцену).
 * Плюс: горизонтальний скрол на 1366×768.
 *
 * Запуск (при `npm run dev`):
 *   node scripts/walk.mjs [--variants 0,A] [--url …] [--shots] [--json out.json]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const BASE = argOf('--url', 'http://localhost:5173/bp-legal-invoices-prototype/')
// Chrome за платформою; інший шлях — `--chrome` або змінна CHROME_PATH.
const CHROME = argOf(
  '--chrome',
  process.env.CHROME_PATH ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : '/usr/bin/google-chrome'),
)
const SHOTS = process.argv.includes('--shots')
const JSON_OUT = argOf('--json', null)
const VARIANTS = argOf('--variants', '0').split(',')
const W = 1366
const H = 768
const OUT_DIR = 'shots'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
const fails = []
const ok = (name, cond, detail = '') => {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` (${detail})` : ''}`)
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: W, height: H } })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

/* ── Вимір стану ───────────────────────────────────────────────────── */

async function measure() {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="card-scroll"]')
    const st = box ? box.scrollTop : 0
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      if (r.bottom < 0 || r.top > window.innerHeight) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
    }
    const mains = {}
    for (const el of document.querySelectorAll('[data-main-action]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      // Координата вмісту — тільки для того, що прокручується. Дія в шапці
      // оренди (поза областю прокрутки) стоїть на місці, хоч би як крутили.
      // Липке (шапка книги) міряється там, де воно стояло б без прилипання:
      // прокрутка вмісту не робить із нього ні «зсуву», ні виграшу.
      let top = r.top
      for (let n = el; n && n !== box; n = n.parentElement) {
        if (getComputedStyle(n).position !== 'sticky') continue
        // Липкі тут — перший рядок свого батька (шапка книги, рейл у сітці):
        // без прилипання вони стоять від верху батька.
        const pcs = getComputedStyle(n.parentElement)
        const natural = n.parentElement.getBoundingClientRect().top + parseFloat(pcs.borderTopWidth) + parseFloat(pcs.paddingTop)
        top = r.top - n.getBoundingClientRect().top + natural
        break
      }
      mains[el.getAttribute('data-main-action')] = Math.round(top + (box && box.contains(el) ? st : 0))
    }
    const due = [...document.querySelectorAll('[data-amount-due]')].filter(vis).map((e) => e.getAttribute('data-amount-due'))
    const links = [...document.querySelectorAll('[data-pay-invoice]')].filter(vis).map((e) => e.getAttribute('data-pay-invoice'))
    return {
      mains,
      due: [...new Set(due)],
      links: [...new Set(links)],
      hscroll: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
}

const legal = () => page.evaluate(() => window.__legal.rent)
const liveInvoices = async () => (await legal()).invoices.filter((i) => !i.cancelled)
const arrive = () => page.evaluate(() => window.__legal.dispatch({ type: 'NUMBERS_ARRIVE' }))

class Run {
  constructor(variant, scene) {
    this.variant = variant
    this.scene = scene
    this.clicks = 0
    this.states = []
    /** Чи кожна дія сцени була видна без прокрутки до кліку (1366×768). */
    this.offscreen = 0
  }
  async seen(el) {
    const inView = await el.evaluate((n) => {
      const r = n.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight
    })
    if (!inView) this.offscreen++
  }
  async snap() {
    await sleep(300)
    this.states.push(await measure())
  }
  async click(sel, { count = true } = {}) {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 5000 })
    await this.seen(el)
    await el.click()
    if (count) this.clicks++
    await this.snap()
  }
  async clickText(sel, text, { count = true } = {}) {
    const handle = await page.waitForFunction(
      (s, t) => [...document.querySelectorAll(s)].find((n) => n.textContent.replace(/\s+/g, ' ').includes(t) && n.getBoundingClientRect().width > 0),
      { timeout: 5000 },
      sel,
      text,
    )
    await handle.asElement().click()
    if (count) this.clicks++
    await this.snap()
  }
  async type(sel, value) {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 5000 })
    await el.click({ clickCount: 3 })
    this.clicks++
    await el.type(String(value))
    await this.snap()
  }
  async select(sel, value) {
    await page.waitForSelector(sel, { visible: true, timeout: 5000 })
    await page.select(sel, value)
    this.clicks++
    await this.snap()
  }
  /** Дата в `<input type=date>`: один клік і набір, як менеджер. */
  async date(sel, iso) {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 5000 })
    await el.click()
    this.clicks++
    await page.evaluate(
      (s, v) => {
        const i = document.querySelector(s)
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(i, v)
        i.dispatchEvent(new Event('input', { bubbles: true }))
      },
      sel,
      iso,
    )
    await this.snap()
  }
  metrics() {
    let mainShift = 0
    for (let i = 1; i < this.states.length; i++) {
      const a = this.states[i - 1].mains
      const b = this.states[i].mains
      for (const k of Object.keys(a)) if (k in b) mainShift = Math.max(mainShift, Math.abs(b[k] - a[k]))
    }
    const surfaces = Math.max(0, ...this.states.map((s) => s.due.length))
    const worst = this.states.find((s) => s.due.length === surfaces)?.due ?? []
    const hscroll = this.states.some((s) => s.hscroll)
    return { clicks: this.clicks, mainShift, surfaces, worst, hscroll, offscreen: this.offscreen }
  }
}

async function open(variant, scene) {
  const q = new URLSearchParams({ v: variant, scene, lab: 'off' })
  await page.goto(`${BASE}?${q}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-testid="card-scroll"]')
  await sleep(300)
  const run = new Run(variant, scene)
  await run.snap()
  return run
}

async function shot(name) {
  if (!SHOTS) return
  mkdirSync(OUT_DIR, { recursive: true })
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
}

/* ── Драйвери варіантів ────────────────────────────────────────────── */

/**
 * Драйвер — де клікати у своєму варіанті. Кожен метод повертає `false`,
 * якщо варіант цю дію не підтримує (тоді вимір — «—»).
 */
const DRIVERS = {
  '0': {
    /** Сформувати рахунок у рядку способу з потрібним «Покриває». */
    async formInRow(run, target) {
      await run.click(`[data-testid="method-row"][data-target="${target}"] [data-testid="row-chevron"]`)
      await run.click(`[data-testid="method-row"][data-target="${target}"] [data-testid="row-form-invoice"]`)
      await run.click('[data-testid="composition-submit"]')
    },
    async start(run) {
      await this.formInRow(run, 'rent')
      await this.formInRow(run, 'deposit')
      return true
    },
    async delivery(run) {
      await run.click('[data-testid="rail-add-charge"]')
      await run.select('[data-testid="charge-article"]', 'Доставка')
      await run.type('[data-testid="charge-net"]', 1000)
      await run.click('[data-testid="charge-submit-pay"]')
      await this.formInRow(run, 'topup')
      return true
    },
    async extendTo(run, iso) {
      await run.click('[data-testid="v0-extend"]')
      await run.date('[data-testid="v0-return-date"]', iso)
      await run.click('[data-testid="v0-extend-submit"]')
      await this.formInRow(run, 'topup')
      return true
    },
    async period(run) {
      return this.extendTo(run, '2026-11-15')
    },
    async extend(run) {
      return this.extendTo(run, '2026-11-05')
    },
    /** Продовження (б): «вистачить до» прод не показує. */
    async coveredUntil() {
      return false
    },
    async cancel(run) {
      await run.click('[data-testid="method-row"][data-target="topup"] [aria-label="Видалити спосіб"]')
      await run.click('[data-testid="remove-method-confirm"]')
      return true
    },
    async noNumber(run) {
      await run.click('[data-testid="method-row"][data-target="rent"] [data-testid="row-chevron"]')
      return true
    },
    /** Сцена 6: номер рахунку біля платежу прод не показує. Найкраще, що є, — «Оплата». */
    async answerFive(run) {
      await run.clickText('button', 'Оплата')
      return false
    },
    async closedPrint(run) {
      await run.click('[data-testid="tab-Документи"]')
      await run.click('[data-testid="doc-row"][data-number="1102"] [data-testid="doc-print"]')
      return true
    },
    async cash(run) {
      await run.click('[data-testid="add-method"]')
      await run.click('[data-testid="method-radio-cash"]')
      await run.click('[data-testid="method-done"]')
      await run.click('[data-testid="method-row"][data-method="cash"] [data-testid="row-confirm"]')
      return true
    },
  },
  /**
   * Варіант B — рахунки в рейлі. Усе робиться з рейлу на тому етапі, де
   * менеджер стоїть: «+ Рахунок» розгортає бланк тут же.
   */
  B: {
    /** Сцена 1: два рахунки створено на вході в «Оплату» (D1), кліків немає. */
    async start() {
      return true
    },
    /** Сцена 2: доставки ще немає в нарахуваннях — вільний рядок бланка, як «+» у 1С. */
    async delivery(run) {
      await run.click('[data-testid="rail-b-add-invoice"]')
      await run.select('[data-testid="composer-free-article"]', 'delivery')
      await run.type('[data-testid="composer-free-price"]', 1000)
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    /** Сцена 3: підказка «наступний період», межа за ритмом 15/30 уже стоїть. */
    async period(run) {
      await run.click('[data-testid="next-period"]')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    /** Сцена 4а: кнопки продовження немає — рахунок на новий період «по» +7 діб. */
    async extend(run) {
      await run.click('[data-testid="next-period"]')
      await run.date('[data-testid="composer-period-to"]', '2026-11-05')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    /** Сцена 4б: «грошей вистачить до» у блоці «Оренда» рейлу, без кліків. */
    async coveredUntil() {
      return !!(await page.$('[data-testid="covered-until"]'))
    },
    async cancel(run) {
      await run.click('[data-testid="invoice-card"][data-number="1140"] [data-testid="invoice-menu"]')
      await run.click('[data-testid="invoice-cancel"]')
      await run.click('[data-testid="cancel-submit"]')
      return true
    },
    async noNumber() {
      return true
    },
    /** Сцена 6: стос рахунків — кожна платіжка під своїм рахунком, 0 кліків. */
    async answerFive() {
      return true
    },
    async closedPrint(run) {
      await run.click('[data-testid="invoice-card"][data-number="1102"] [data-testid="invoice-print"]')
      return true
    },
    async cash(run) {
      await run.click('[data-testid="open-charge-cash"]')
      await run.click('[data-testid="cash-submit"]')
      return true
    },
  },
  /**
   * Варіант A — реєстр рахунків. Рахунки у вкладці «Рахунки»; продовження
   * (а) — кнопка в шапці оренди, доступна з будь-якої вкладки.
   */
  A: {
    async start() {
      return true
    },
    async delivery(run) {
      await run.click('[data-testid="tab-Рахунки"]')
      await run.click('[data-testid="registry-new"]')
      await run.select('[data-testid="composer-free-article"]', 'delivery')
      await run.type('[data-testid="composer-free-price"]', 1000)
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    /** Сцена 3: підказка «Не виставлено з 01.11» над реєстром. */
    async period(run) {
      await run.click('[data-testid="tab-Рахунки"]')
      await run.click('[data-testid="registry-next-period-hint"]')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    async extend(run) {
      await run.click('[data-testid="extend-open"]')
      await run.date('[data-testid="extend-date"]', '2026-11-05')
      await run.click('[data-testid="extend-submit"]')
      return true
    },
    /** Продовження (а): «вистачить до» не його вісь — сцена 4б не застосовна. */
    async coveredUntil() {
      return null
    },
    async cancel(run) {
      await run.click('[data-testid="tab-Рахунки"]')
      await run.click('[data-testid="registry-row"][data-number="1140"] [data-testid="invoice-menu"]')
      await run.click('[data-testid="invoice-cancel"]')
      await run.click('[data-testid="cancel-submit"]')
      return true
    },
    async noNumber() {
      return true
    },
    /** Сцена 6: реєстр — окрема вкладка, один клік. */
    async answerFive(run) {
      await run.click('[data-testid="tab-Рахунки"]')
      return true
    },
    async showDocs(run) {
      await run.click('[data-testid="tab-Рахунки"]')
    },
    async closedPrint(run) {
      await run.click('[data-testid="tab-Рахунки"]')
      await run.click('[data-testid="registry-row"][data-number="1102"] [data-testid="invoice-print"]')
      return true
    },
    async cash(run) {
      await run.click('[data-testid="open-charge-cash"]')
      await run.click('[data-testid="cash-submit"]')
      return true
    },
  },

  /** Варіант C — стрічка періодів над кроком; продовження (б). */
  C: {
    async start() {
      return true
    },
    async delivery(run) {
      await run.click('[data-testid="strip-new"]')
      await run.select('[data-testid="composer-free-article"]', 'delivery')
      await run.type('[data-testid="composer-free-price"]', 1000)
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    /** Сцена 3: прогалина «не виставлено» → межа 15/30 уже стоїть. */
    async period(run) {
      await run.click('[data-testid="strip-gap-invoice"]')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    async extend(run) {
      await run.click('[data-testid="strip-gap-invoice"]')
      await run.date('[data-testid="composer-period-to"]', '2026-11-05')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    async coveredUntil() {
      return !!(await page.$('[data-testid="covered-until"]'))
    },
    async cancel(run) {
      await run.click('[data-testid="strip-point"][data-number="1140"]')
      await run.click('[data-testid="strip-selected"] [data-testid="invoice-menu"]')
      await run.click('[data-testid="invoice-cancel"]')
      await run.click('[data-testid="cancel-submit"]')
      return true
    },
    async noNumber() {
      return true
    },
    /** Сцена 6: мітки на стрічці несуть номери платіжок. */
    async answerFive() {
      return true
    },
    /** Сцена 9: АВР — у деталях рахунку оренди, клік по відрізку. */
    async showDocs(run) {
      await run.click('[data-testid="strip-segment"][data-number="1101"]')
    },
    async closedPrint(run) {
      await run.click('[data-testid="strip"] [data-number="1102"]')
      await run.click('[data-testid="strip-selected"] [data-testid="invoice-print"]')
      return true
    },
    async cash(run) {
      await run.click('[data-testid="open-charge-cash"]')
      await run.click('[data-testid="cash-submit"]')
      return true
    },
  },

  /** Варіант D — книга «Рахунки і оплати» на кроці; продовження (а). */
  D: {
    async start() {
      return true
    },
    async delivery(run) {
      await run.click('[data-testid="book-new"]')
      await run.select('[data-testid="composer-free-article"]', 'delivery')
      await run.type('[data-testid="composer-free-price"]', 1000)
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    async period(run) {
      await run.click('[data-testid="book-next-period"]')
      await run.click('[data-testid="composer-submit"]')
      return true
    },
    async extend(run) {
      await run.click('[data-testid="extend-open"]')
      await run.date('[data-testid="extend-date"]', '2026-11-05')
      await run.click('[data-testid="extend-submit"]')
      return true
    },
    /** Продовження (а): сцена 4б не застосовна. */
    async coveredUntil() {
      return null
    },
    async cancel(run) {
      await run.click('[data-testid="book-entry"][data-number="1140"] [data-testid="invoice-menu"]')
      await run.click('[data-testid="invoice-cancel"]')
      await run.click('[data-testid="cancel-submit"]')
      return true
    },
    async noNumber() {
      return true
    },
    async answerFive() {
      return true
    },
    async closedPrint(run) {
      await run.click('[data-testid="book-entry"][data-number="1102"] [data-testid="invoice-print"]')
      return true
    },
    async cash(run) {
      await run.click('[data-testid="open-charge-cash"]')
      await run.click('[data-testid="cash-submit"]')
      return true
    },
  },
}

/* ── Сцени ─────────────────────────────────────────────────────────── */

const results = []

async function scene(variant, id, label, fn) {
  const run = await open(variant, id)
  console.log(`\n[${variant}] ${label}`)
  let out = {}
  try {
    out = (await fn(run, DRIVERS[variant])) ?? {}
  } catch (e) {
    ok(`${label}: прогін`, false, e.message.split('\n')[0])
  }
  await shot(`v${variant}-${id}`)
  const m = run.metrics()
  results.push({ variant, scene: id, label, ...m, ...out })
  return run
}

for (const v of VARIANTS) {
  await scene(v, 'start', '1 Старт', async (run, d) => {
    await d.start(run)
    let inv = await liveInvoices()
    ok('два рахунки: оренда і застава', inv.length === 2 && inv.some((i) => i.kind === 'deposit'), `${inv.length}`)
    ok('номер очікується', inv.every((i) => i.numberState === 'pending'))
    await arrive()
    await sleep(300)
    inv = await liveInvoices()
    ok('номер прийшов', inv.every((i) => i.number), inv.map((i) => i.number).join(','))
    const dep = inv.find((i) => i.kind === 'deposit')
    ok('застава без ПДВ', dep.lines.every((l) => l.vatRate === 0))
    return { invoiceClicks: run.clicks }
  })

  for (const [id, label, key] of [
    ['delivery', '2 Доставка після видачі', 'delivery'],
    ['period', '3 Новий період', 'period'],
    ['extend', '4а Продовження', 'extend'],
  ]) {
    await scene(v, id, label, async (run, d) => {
      const before = await liveInvoices()
      const done = await d[key](run)
      const after = await liveInvoices()
      const fresh = after.filter((i) => !before.some((b) => b.id === i.id))
      ok('новий рахунок сформовано', done && fresh.length === 1, `${fresh.length}`)
      ok('старі рахунки не змінились', before.every((b) => JSON.stringify(after.find((a) => a.id === b.id)?.lines) === JSON.stringify(b.lines)))
      return { invoiceClicks: done ? run.clicks : null }
    })
  }

  await scene(v, 'extend-paid', '4б Продовження: оплачено', async (run, d) => {
    const shown = await d.coveredUntil(run)
    // `null` — варіант з продовженням (а): «вистачить до» не його вісь (§4 брифу).
    if (shown === null) console.log('  n/a  показує «вистачить до»  (продовження (а))')
    else ok('показує «вистачить до»', shown, shown ? '' : 'варіант не показує')
    return { covered: shown }
  })

  await scene(v, 'multipay', '5 Кілька оплат', async () => {
    const r = await legal()
    const inv = r.invoices.find((i) => i.number === '1163')
    const paid = r.payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0)
    ok('недоплата 500 у стані', 48000 - paid === 500)
  })

  await scene(v, 'five', "6 П'ять рахунків", async (run, d) => {
    const answered = await d.answerFive(run)
    const r = await legal()
    const need = r.payments.filter((p) => p.invoiceId).map((p) => r.invoices.find((i) => i.id === p.invoiceId).number)
    const seen = run.states.at(-1).links
    const full = answered && need.every((n) => seen.includes(n))
    ok('видно, яка оплата до якого рахунку', full, full ? '' : 'немає зв’язку платіжка → № рахунку')
    return { answerClicks: full ? run.clicks : null }
  })

  await scene(v, 'cancel', '7 Скасування', async (run, d) => {
    await d.cancel(run)
    const r = await legal()
    const inv = r.invoices.find((i) => i.number === '1140')
    ok('рахунок скасовано, запис лишився', !!inv?.cancelled)
    ok('є «ким»', !!inv?.cancelled?.by, inv?.cancelled?.by ? '' : 'автора немає')
  })

  await scene(v, 'no-number', '8 1С не відповіла', async (run, d) => {
    await d.noNumber(run)
    const disabled = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b) => /Друк|PDF|Завантажити/.test(b.textContent)).every((b) => b.disabled),
    )
    ok('друк недоступний', disabled)
    const named = await page.evaluate(() => /не присвоїла|не прийшов/i.test(document.body.innerText))
    ok('стан помилки названо', named, named ? '' : 'окремого стану немає')
  })

  await scene(v, 'docs', '9 Документи під рахунком', async (run, d) => {
    // Де АВР не на першому екрані, драйвер відкриває місце рахунку.
    if (d.showDocs) await d.showDocs(run)
    const shown = await page.evaluate(() => /АВР/.test(document.body.innerText))
    ok('АВР видно під рахунком', shown, shown ? '' : 'АВР немає ніде')
  })

  await scene(v, 'closed', '10 Рахунок як документ', async (run, d) => {
    const status = (await legal()).status
    await d.closedPrint(run)
    const opened = await page.$('[data-testid="invoice-document"]')
    ok('рахунок 1102 відкрито на перегляд', !!opened)
    ok('стан оренди не змінився', (await legal()).status === status)
    return { printClicks: run.clicks }
  })

  await scene(v, 'cash', '11 Готівка від ЮЛ', async (run, d) => {
    const before = JSON.stringify((await legal()).invoices)
    await d.cash(run)
    const r = await legal()
    ok('ПКО виписано', r.cashOrders.length === 1)
    ok('рахунки не змінились', JSON.stringify(r.invoices) === before)
    return { cashClicks: run.clicks }
  })
}

/* ── Підсумок ──────────────────────────────────────────────────────── */

console.log('\n── Виміри ──')
const pick = (v, s) => results.find((r) => r.variant === v && r.scene === s) ?? {}
for (const v of VARIANTS) {
  const row = {
    'кліки сц.2': pick(v, 'delivery').invoiceClicks ?? '—',
    'кліки сц.3': pick(v, 'period').invoiceClicks ?? '—',
    'кліки сц.4а': pick(v, 'extend').invoiceClicks ?? '—',
    'кліки сц.6': pick(v, 'five').answerClicks ?? '—',
    'зсув, px': Math.max(...results.filter((r) => r.variant === v).map((r) => r.mainShift)),
    'поверхні суми': Math.max(...results.filter((r) => r.variant === v).map((r) => r.surfaces)),
    'дій за згином': results.filter((r) => r.variant === v).reduce((s, r) => s + r.offscreen, 0),
    'гориз. скрол': results.some((r) => r.variant === v && r.hscroll) ? 'так' : 'ні',
  }
  console.log(`варіант ${v}:`, JSON.stringify(row))
}
for (const r of results) console.log(`  ${r.variant} ${r.label}: кліки ${r.clicks}, за згином ${r.offscreen}, зсув ${r.mainShift}, поверхні ${r.surfaces} [${r.worst.join(', ')}]`)

console.log(`\n${pass} ok, ${fails.length} fail`)
for (const f of fails) console.log(' -', f)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ results, fails }, null, 2))
await browser.close()
