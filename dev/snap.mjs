/*
 * Does one flick land one note, and can a reader still read a long one?
 *
 * ## The two halves of "focus on showing one note fully"
 *
 * `notes/room.ts` now clamps a note's body to what the frame holds, so an
 * unopened row is one frameful. That made a harder snap possible and it also
 * made one necessary: `proximity` snaps when a snap point is NEAR and the
 * browser decides what near means, so with 79-pixel rows a seventy-pixel flick
 * snapped, and with frame-sized rows the same flick landed seventy pixels into
 * a note and stayed there — a partial row again, which is the complaint.
 *
 * `mandatory` fixes that and breaks something else, which is why the original
 * essay in `index.css` chose against it. This file measures both, because the
 * arrangement in the end uses each of them and the rule that picks between them
 * is a measurement `App` takes of every row.
 *
 *   flick   — a seventy-pixel nudge from rest. `cut` must be 0 and `scrolled`
 *             must equal the first row's height: one flick, one whole note.
 *   trapped — open the first row, which makes it far taller than the window and
 *             takes its snap point away, then scroll to its middle. `restedAt`
 *             must equal `aim`. Under `mandatory` it does not: measured at
 *             220x300 the scroller was thrown from 354 to 708, so the middle of
 *             a long note was unreachable.
 *
 * ## What it printed
 *
 * At 220x300, against the thesis, one row per column:
 *
 *                          proximity     mandatory     as it ships
 *   flick lands at          70 (cut 70)   259 (cut 0)   239 (cut 0)
 *   rests in a long note    354           708           354
 *
 * The first two columns were taken while a healthy anchor still drew an
 * `anchored` badge, which is a line the row no longer spends — so a row is 239
 * pixels now where it was 259, and the flick lands on the same note either way.
 * A row height that is not the number the flick rests at is the failure; the
 * number itself is whatever the type is that day.
 *
 * The third column is neither of the first two: `App` marks every row taller
 * than the window — it already had to, since such a row must carry no snap
 * point — and loosens the scroller back to `proximity` while any row is in that
 * state.
 *
 *   CHROME=/path/to/chrome-headless-shell node dev/snap.mjs
 *
 * `./run.sh` must be up, and the project named in `dev/harness.html` must exist
 * on this machine. Playwright is not a dependency of this module and must not
 * become one — point `PLAYWRIGHT` at whatever copy is already here.
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT ?? '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'
)
const PORT = process.env.PORT ?? '7940'

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

for (const [w, h] of [[220, 300], [320, 200]]) {
  await page.goto(`http://127.0.0.1:${PORT}/dev/harness.html?w=${w}&h=${h}`, { waitUntil: 'load' })
  const frame = await (await page.$('#frame')).contentFrame()
  await frame.waitForSelector('[data-testid="note"]', { timeout: 10_000 })
  await page.waitForTimeout(400)

  /* One flick of a trackpad, and a wait long enough for the smooth scroll AND
     for a snap to settle after it. A reading taken while the scroller is still
     moving is a reading of nothing. */
  const flick = await frame.evaluate(`(async () => {
    const el = document.querySelector('[data-scroller]')
    el.scrollBy({ top: 70, behavior: 'smooth' })
    await new Promise((d) => setTimeout(d, 900))
    const rows = [...document.querySelectorAll('[data-testid="note"]')]
    const top = el.getBoundingClientRect().top
    const first = rows.find((r) => r.getBoundingClientRect().bottom > top + 1)
    return {
      snap: el.getAttribute('data-snap'),
      scrolled: Math.round(el.scrollTop),
      cut: Math.round(top - first.getBoundingClientRect().top),
      rowH: Math.round(rows[0].getBoundingClientRect().height),
    }
  })()`)

  const trapped = await frame.evaluate(`(async () => {
    const el = document.querySelector('[data-scroller]')
    el.scrollTo({ top: 0 })
    await new Promise((d) => setTimeout(d, 200))
    /* A press opens the row in a compact container, which is the one gesture
       that makes a row taller than the frame on purpose. */
    const row = document.querySelector('[data-testid="note"]')
    row.click()
    await new Promise((d) => setTimeout(d, 500))
    const openedRow = Math.round(row.getBoundingClientRect().height)
    const aim = Math.round(openedRow / 2)
    el.scrollTo({ top: aim })
    await new Promise((d) => setTimeout(d, 900))
    return {
      snap: el.getAttribute('data-snap'),
      openedRow,
      tall: row.dataset.tall ?? null,
      aim,
      restedAt: Math.round(el.scrollTop),
    }
  })()`)

  console.log(`${w}x${h}`, JSON.stringify({ flick, trapped }))
}

await browser.close()
