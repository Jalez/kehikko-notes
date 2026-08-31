/*
 * What this page does at the sizes a canvas actually gives it, measured.
 *
 * ## What it establishes
 *
 * Three numbers per size, and every one of them was an argument before it was a
 * measurement:
 *
 *   - `fully`: how many notes are entirely on screen at rest. This was ZERO at
 *     220x300, 320x200 and 460x360 before the compact row existed -- twenty
 *     notes on one chapter came to 6501 pixels of document inside a 300-pixel
 *     window, and the first row alone was 712 of them. It is now 3, 2 and 3.
 *   - `cut`: how many pixels of the top row are above the fold after a small
 *     scroll (70px, about one flick of a trackpad). It was 4 -- the worst
 *     possible number, because a row cut by four pixels looks deliberate. It is
 *     now 0 wherever snapping is on, and deliberately unchanged at 900x700
 *     where snapping is off and a reader can already see four notes.
 *   - `headTop`: where the heading is after that scroll. It was -62, which is
 *     to say the scope and the way back out of a narrowed list had left the
 *     frame. It is now 8 or 12 at every size, because the heading is no longer
 *     inside the scroller.
 *
 * It also prints what the module ASKED its host for, which the harness reports
 * and then ignores -- a container whose owner has not turned growing on is the
 * case this page has to be good at.
 *
 * ## Running it
 *
 *   PLAYWRIGHT=/path/to/playwright/index.mjs CHROME=/path/to/chrome-headless-shell \
 *     node dev/sizes.mjs
 *
 * Playwright is not a dependency of this module and must not become one: it is
 * a hundred megabytes of browser for a program that ships none. Point it at
 * whatever copy is already on the machine. `./run.sh` must be up first, and the
 * project named in `dev/harness.html` must exist on this machine -- the harness
 * reads a real store, because a probe against invented notes measures a layout
 * nobody will ever see.
 */

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')
const CHROME = process.env.CHROME
const PORT = process.env.PORT ?? '7940'

/* The corners of what the person who asked for this described: "often 220-500px
   wide and sometimes only 150-300px tall", and one container big enough that
   none of the small-container behaviour should be on at all. */
const SIZES = [
  [220, 300],
  [320, 200],
  [460, 360],
  [900, 700],
]

/*
 * Read inside the framed page, as source, because every number here is about
 * ITS layout and none of them can be reached from outside the frame. It is a
 * string rather than a function for the same reason: what crosses is source,
 * and a closure over anything in this file would arrive as `undefined`.
 */
const MEASURE = `() => {
  const el = document.querySelector('[data-scroller]') ?? document.scrollingElement
  const own = el !== document.scrollingElement
  const view = own ? el.clientHeight : innerHeight
  const top = own ? el.getBoundingClientRect().top : 0
  const rows = [...document.querySelectorAll('[data-testid="note"]')].map((row) => {
    const box = row.getBoundingClientRect()
    return { top: Math.round(box.top), h: Math.round(box.height) }
  })
  const first = rows.find((row) => row.top + row.h > top + 1)
  const head = document.querySelector('[data-testid="scope"]')?.getBoundingClientRect()
  return {
    view: Math.round(view),
    scrolled: Math.round(el.scrollTop),
    content: Math.round(el.scrollHeight),
    rows: rows.length,
    heights: rows.slice(0, 3).map((row) => row.h),
    fully: rows.filter((row) => row.top >= top - 1 && row.top + row.h <= top + view + 1).length,
    cut: first ? Math.round(top - first.top) : null,
    headTop: head ? Math.round(head.top) : null,
    /* Nothing may ever be wider than the frame. See the essay in \`index.css\`. */
    widest: document.documentElement.scrollWidth,
  }
}`

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

for (const [w, h] of SIZES) {
  await page.goto(`http://127.0.0.1:${PORT}/dev/harness.html?w=${w}&h=${h}`, { waitUntil: 'load' })
  const frame = await (await page.$('#frame')).contentFrame()
  await frame.waitForSelector('[data-testid="note"], [data-testid="empty"]', { timeout: 10_000 })
  await page.waitForTimeout(400)

  const rest = await frame.evaluate(`(${MEASURE})()`)
  /* One flick of a trackpad, and then a wait long enough for a smooth scroll
     AND for a snap to settle after it. A measurement taken while the scroller
     is still moving is a measurement of nothing. */
  const after = await frame.evaluate(`(async () => {
    const el = document.querySelector('[data-scroller]') ?? document.scrollingElement
    el.scrollBy({ top: 70, behavior: 'smooth' })
    await new Promise((done) => setTimeout(done, 900))
    return (${MEASURE})()
  })()`)

  const asked = await page.evaluate(() => document.body.dataset.asked ?? '-')
  console.log(`${w}x${h}`, JSON.stringify({ asked, rest, after }))
}

await browser.close()
