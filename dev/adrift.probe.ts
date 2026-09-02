/**
 * Does pressing an ADRIFT note poison the canvas — and does the canvas stay
 * poisoned for an anchored one too?
 *
 *     rm -rf /tmp/notes-adrift-project && mkdir -p /tmp/notes-adrift-project/.kehikot/notes
 *     cp -R <CS-DEGREE>/.kehikot/paper /tmp/notes-adrift-project/.kehikot/
 *     cp <CS-DEGREE>/.kehikot/notes/notes.json /tmp/notes-adrift-project/.kehikot/notes/
 *     ROADMAP_MODULES_DIR=/tmp/notes-scratch/registry PORT=7961 bunx vite      # in this worktree
 *     HOST_SRC=/Users/jaakkorajala/Projects/kehikko/src bun dev/adrift.probe.ts   # the host as it ships
 *     HOST_SRC=<host worktree>/src bun dev/adrift.probe.ts                       # the host with the fix
 *
 * ## What it plays, and what it does not fake
 *
 * The complaint: "Clicking on a note in note module thats adrift seems to
 * focus the system in a way that even the checklist no longer knows to keep on
 * showing itself to the current document shown in the paper, even if that
 * paper selected too. And also the adrift note itself cant be displayed."
 *
 * The thing under test is the HOST's composition of `context.containers` out
 * of who pointed — `containersOf` in `src/host/showing.ts` — so that function
 * is imported from the host's own source and run here, in the seat of the
 * host, on the exact `passage.set` this page sends when a row is pressed. The
 * stub host page below is only the wire: it frames `/app`, greets it, records
 * every request, and posts whatever context this script composes. Nothing
 * about the folding rule is re-implemented.
 *
 * Paper is picked out and has pointed at page 1 of `main.tex` — the state the
 * owner's kehikko was in. What is then read is:
 *
 *   - the Notes page's own DOM, which is the "adrift note itself cant be
 *     displayed" half: the list is a consumer of the same rule;
 *   - what the Checklist would make of the same containers, through its own
 *     `list/aim.ts` — pure, imported from that repository, not framed here,
 *     because its CSP names the real host's port and because the question is
 *     about the mechanism and not about the pair.
 *
 * Never run against the owner's live project. The store copy is written to
 * (the door ingests on read).
 */
import { chromium } from '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'

import { inFrontOf as checklistFront, whyEmpty as checklistWhy } from '/Users/jaakkorajala/Projects/kehikko-checklist/list/aim.ts'

const HOST_SRC = process.env.HOST_SRC ?? '/Users/jaakkorajala/Projects/kehikko/src'
const { containersOf } = (await import(`${HOST_SRC}/host/showing.ts`)) as typeof import('/Users/jaakkorajala/Projects/kehikko/src/host/showing.ts')

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7961'
const PROJECT = process.env.PROJECT ?? '/tmp/notes-adrift-project'
const MAIN = `${PROJECT}/.kehikot/paper/thesis/main.tex`

type Passage = { path: string; page: number | null; from: number | null; to: number | null; quoted: string }
const paperAt: Passage = { path: MAIN, page: 1, from: null, to: null, quoted: '' }

const placements = [
  { i: 'roadmap.checklist', x: 0, y: 0, selected: false },
  { i: 'roadmap.paper', x: 1, y: 0, selected: true },
  { i: 'roadmap.notes', x: 2, y: 0, selected: false },
]

const host = (width: number, height: number) => `<!doctype html>
<html><body style="margin:0;background:#888">
<div id="box" style="width:${width}px;height:${height}px;background:#fff;overflow:hidden">
<iframe id="frame" src="${ORIGIN}/app" width="${width}" height="${height}" style="border:0;display:block"
  sandbox="allow-scripts allow-same-origin"></iframe></div>
<script>
  window.__sent = []
  const frame = document.getElementById('frame')
  const FROM = ${JSON.stringify(new URL(ORIGIN).origin)}
  const base = () => ({
    epic: 'thesis', project: 'CS-DEGREE', projectPath: ${JSON.stringify(PROJECT)}, theme: 'light',
    passage: null, selection: [], filters: {}, containers: [], prompt: null, pinned: false,
  })
  /* What the canvas holds right now, replayed on every greeting — a real host
     greets with the live context, and Vite reloads the frame once after it
     has optimised dependencies, so a context posted once would be lost. */
  let current = base()
  /* Once per load of the frame: a client answers a greeting by announcing
     itself again, so greeting on every ready is a loop. */
  let greeted = false
  const greet = () => {
    if (greeted) return
    greeted = true
    frame.contentWindow.postMessage({ type: 'roadmap.hello', protocol: 2, session: 'adrift', state: null, context: current }, '*')
  }
  addEventListener('message', (event) => {
    if (event.origin !== FROM) return
    const message = event.data
    if (!message || typeof message.type !== 'string') return
    window.__sent.push(message)
    if (message.type === 'roadmap.ready') greet()
    if (message.type === 'roadmap.request') {
      frame.contentWindow.postMessage({ type: 'roadmap.response', id: message.id, ok: true, data: {} }, '*')
    }
  })
  window.__context = (over) => {
    current = Object.assign(base(), over || {})
    frame.contentWindow.postMessage(Object.assign({ type: 'roadmap.context', protocol: 2 }, current), '*')
  }
  frame.addEventListener('load', () => {
    greeted = false
    greet()
  })
</script>
</body></html>`

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
})

for (const size of [
  { name: '220x340', width: 220, height: 340 },
  { name: '460x420', width: 460, height: 420 },
]) {
  const context = await browser.newContext({ viewport: { width: size.width + 40, height: size.height + 40 } })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => console.log(`  PAGEERROR ${error.message}`))
  await page.route('http://localhost:4181/notes-adrift', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: host(size.width, size.height) }))
  await page.goto('http://localhost:4181/notes-adrift', { waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('#frame')

  /* The host's seat: who pointed last, at what, and what every row therefore says. */
  let passage: Passage | null = paperAt
  let pointedBy: string | null = 'roadmap.paper'
  /* The shape the host with the fix takes: each pointer's last pointing. The
     host as it ships ignores this argument and reads `pointedBy`. */
  const pointings: Record<string, Passage> = { 'roadmap.paper': paperAt }
  const compose = () =>
    containersOf({ placements, said: {}, passage, pointedBy, pointed: pointings, selection: [], selectedBy: null } as never)
  const tell = async () => {
    const containers = compose()
    await page.evaluate((o) => (window as unknown as { __context: (o: unknown) => void }).__context(o), { passage, containers })
    await page.waitForTimeout(600)
    return containers
  }
  const seen = () => page.evaluate(() => (window as unknown as { __sent: { type: string; method?: string; params?: { passage?: Passage } }[] }).__sent)

  const read = async () => {
    const scope = await frame.locator('[data-testid="scope"]').evaluateAll((n) => n.map((e) => e.textContent?.trim()))
    const empty = await frame.locator('[data-testid="narrowed-empty"], [data-testid="empty"]').evaluateAll((n) => n.map((e) => e.textContent?.trim()))
    const rows = await frame.locator('[data-testid="note"]').evaluateAll((n) => n.map((e) => `${e.getAttribute('data-note-id')}:${e.getAttribute('data-anchor')}${e.getAttribute('data-pointed') ? ':pointed' : ''}${e.getAttribute('data-open') === '1' ? ':open' : ''}`))
    const adrift = await frame.locator('[data-testid="adrift-group"] p').first().evaluateAll((n) => n.map((e) => e.textContent?.trim()))
    return { scope, empty, rows, adrift }
  }
  const say = (name: string, r: Awaited<ReturnType<typeof read>>, containers: ReturnType<typeof compose>) => {
    console.log(`  ${name}`)
    console.log(`    host says: ${containers.map((c) => `${c.module.split('.').pop()}${c.selected ? '*' : ''}=[${c.showing.documents.map((d) => `${d.path.split('/').pop()} p${d.page ?? '-'} ${d.from ?? '-'}–${d.to ?? '-'}`).join('; ')}]`).join('  ')}`)
    console.log(`    notes scope: ${r.scope.join(' | ') || '(none)'}   rows: ${r.rows.length} ${r.rows.join(' ')}`)
    if (r.adrift.length) console.log(`    notes adrift group: ${r.adrift.join(' | ')}`)
    if (r.empty.length) console.log(`    notes says: ${r.empty.join(' | ')}`)
    const front = checklistFront({
      passage,
      selection: [],
      containers: containers.map((c) => ({ module: c.module, selected: c.selected, refs: c.showing.refs, documents: c.showing.documents })),
      aim: 'follow',
    })
    console.log(`    checklist would show: ${front.documents.length ? front.documents.map((d) => d.path.split('/').pop()).join(', ') : '(no document)'}${front.paper ? '' : ' — paper: false'}`)
    const why = checklistWhy(front)
    if (front.documents.length === 0 && why) console.log(`    checklist says: ${why}`)
  }
  const snap = (name: string) => page.screenshot({ path: `/tmp/notes-adrift-${size.name}-${name}.png`, clip: { x: 0, y: 0, width: size.width, height: size.height } })

  console.log(`\n== ${size.name} (host: ${HOST_SRC}) ==`)
  let containers = await tell()
  try {
    await frame.locator('[data-testid="note"], [data-testid="narrowed-empty"], [data-testid="empty"]').first().waitFor({ timeout: 15_000 })
  } catch {
    console.log(`  the list never appeared. sent: ${JSON.stringify((await seen()).map((m) => m.type + (m.method ? ':' + m.method : '')))}`)
    console.log(`  frame says: ${JSON.stringify(await frame.locator('body').innerText().catch(() => '(unreadable)'))}`)
    await snap('never-appeared')
    await context.close()
    continue
  }
  await page.waitForTimeout(800)
  say('0 paper picked, pointing at page 1 of main.tex', await read(), containers)
  await snap('0-paper-picked')

  const press = async (name: string, selector: string) => {
    const before = (await seen()).length
    const row = frame.locator(selector).first()
    const id = await row.getAttribute('data-note-id')
    await row.click()
    /* The press goes out as `passage.set`; the host's seat answers it by
       composing a new context, which is the bit under test. */
    let request: { params?: { passage?: Passage } } | undefined
    for (let n = 0; n < 20 && !request; n += 1) {
      await page.waitForTimeout(100)
      request = (await seen()).slice(before).find((m) => m.type === 'roadmap.request' && m.method === 'passage.set')
    }
    if (!request) {
      console.log(`  ${name}: pressed ${id}; NO passage.set went out`)
      const r = await read()
      say(`${name} (pressed ${id}, nothing pointed)`, r, containers)
      return
    }
    passage = request.params?.passage ?? null
    pointedBy = passage ? 'roadmap.notes' : null
    if (passage) pointings['roadmap.notes'] = passage
    console.log(`  ${name}: pressed ${id}; passage.set → ${JSON.stringify({ ...passage, quoted: (passage?.quoted ?? '').slice(0, 30) + '…' })}`)
    containers = await tell()
    say(`${name}, after the host folded it in`, await read(), containers)
  }

  await press('1 an ADRIFT note', '[data-testid="note"][data-anchor="adrift"]')
  await snap('1-adrift-pressed')

  /* Back where we started: Paper points again (the reader turned a page). */
  passage = { ...paperAt, page: 2 }
  pointedBy = 'roadmap.paper'
  pointings['roadmap.paper'] = passage
  containers = await tell()
  say('2 paper points again (page 2)', await read(), containers)

  await press('3 an ANCHORED note', '[data-testid="note"][data-anchor="exact"]')
  await snap('3-anchored-pressed')

  /* The hover group: point at a closed row and read what appears. */
  passage = { ...paperAt, page: 3 }
  pointedBy = 'roadmap.paper'
  pointings['roadmap.paper'] = passage
  containers = await tell()
  const second = frame.locator('[data-testid="note"]').nth(1)
  await second.scrollIntoViewIfNeeded({ timeout: 5000 })
  await second.hover({ timeout: 5000 })
  await page.waitForTimeout(300)
  const controls = second.locator('[data-testid="note-controls"] button')
  const names = await controls.evaluateAll((n) => n.map((b) => `${b.getAttribute('aria-label') ?? b.textContent?.trim()}@${Math.round(getComputedStyle(b.parentElement as Element).opacity * 100)}%`))
  console.log(`  4 hovering the second row: controls ${names.join(', ')}`)
  const box = await second.locator('[data-testid="note-controls"]').boundingBox({ timeout: 3000 })
  console.log(`    group box: x=${box?.x} w=${box?.width} (frame is ${size.width} wide) → ${box && box.x + box.width <= size.width ? 'inside' : 'OVERFLOWS'}`)
  await snap('4-hover')
  /* Keyboard: Tab from the row lands on the first control. */
  await second.focus({ timeout: 3000 })
  await page.keyboard.press('Tab')
  await page.waitForTimeout(200)
  const focused = await frame.locator('body').evaluate((body) => {
    const e = body.ownerDocument.activeElement
    return e && e !== body ? (e.getAttribute('aria-label') ?? e.textContent?.trim()?.slice(0, 40) ?? e.tagName) : '(nothing)'
  })
  console.log(`    Tab from the row focuses: ${focused}`)

  /* Arm the removal on a typed note if there is one; on this store every note is derived, so say so. */
  const typedRows = await frame.locator('[data-testid="note"]').evaluateAll((n) => n.filter((e) => e.querySelector('[aria-label="remove this note"]')).length)
  console.log(`    rows offering edit/remove (typed notes): ${typedRows} of ${await frame.locator('[data-testid="note"]').count()} — the rest are lifted from the .tex and offer resolve only`)

  /* The third empty state: paper picked out and pointing at a document that is not there. */
  passage = { path: `${PROJECT}/.kehikot/paper/thesis/chapters/7_nowhere.tex`, page: 1, from: null, to: null, quoted: '' }
  pointings['roadmap.paper'] = passage
  containers = await tell()
  const r5 = await read()
  say('5 paper picked, pointing at a document that does not exist', r5, containers)
  await snap('5-unopenable')

  await context.close()
}

await browser.close()
