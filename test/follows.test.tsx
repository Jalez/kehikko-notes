import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { TICKET, answer as door } from '../doors.ts'
import { App } from '../src/app.tsx'

/**
 * The whole page against the real doors, walked through the ticks a person makes in the host's
 * bar: no part, one, another, two, none again — with the passage the canvas holds saying what it
 * really says while that happens, which is the one page the paper's caret is on and, once somebody
 * else has walked the paper to a passage, nothing new at all.
 *
 * Found in a real project: the list asked its store for the passage and narrowed THAT to the
 * parts, so a ticked part showed one page's notes under `0 notes outside`, two ticked parts showed
 * one of them, and a paper that had gone quiet left the list on the old chapter — or empty —
 * whatever was ticked.
 */

const realFetch = globalThis.fetch
const EPIC = 'thesis'
const PAPER = `.kehikot/paper/${EPIC}`
const TEXT = {
  'chapters/3_methods.tex': 'The methods chapter measured satisfaction first and confidence second.',
  'chapters/4_results.tex': 'The results chapter reported that satisfaction was above neutral.',
  'main.tex': '\\include{chapters/3_methods}\n\\include{chapters/4_results}\nWritten in main itself.\n',
}
const WRITTEN = {
  methods: ['is first the right word here?', 'second to what, exactly?'],
  results: ['above neutral by how much?'],
  main: ['this line belongs in a chapter'],
}
let dir = ''

beforeEach(() => {
  resetServerStanding()
  mailbox.forget?.()
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'notes-follows-')))
  mkdirSync(join(dir, PAPER, 'chapters'), { recursive: true })
  for (const [name, text] of Object.entries(TEXT)) writeFileSync(join(dir, PAPER, name), text)
  const add = (body: string, name: keyof typeof TEXT, quoted: string, page: number) => {
    const from = TEXT[name].indexOf(quoted)
    const said = door('POST', '/mcp', new URLSearchParams(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'add_note', arguments: { projectPath: dir, path: file(name), page, from, to: from + quoted.length, quoted, body } },
    }, null)
    if (JSON.stringify(said?.body).includes('"isError":true')) throw new Error(JSON.stringify(said?.body))
  }
  add(WRITTEN.methods[0]!, 'chapters/3_methods.tex', 'measured satisfaction first', 19)
  add(WRITTEN.methods[1]!, 'chapters/3_methods.tex', 'confidence second', 20)
  add(WRITTEN.results[0]!, 'chapters/4_results.tex', 'satisfaction was above neutral', 30)
  add(WRITTEN.main[0]!, 'main.tex', 'Written in main itself.', 1)
  const island = document.createElement('script')
  island.id = 'ticket'
  island.type = 'application/json'
  island.textContent = JSON.stringify(TICKET)
  document.body.appendChild(island)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const at = new URL(String(url), 'http://127.0.0.1')
    const ticket = (init.headers as Record<string, string> | undefined)?.['x-module-ticket'] ?? null
    const said = door((init.method ?? 'GET').toUpperCase(), at.pathname, at.searchParams, init.body ? JSON.parse(String(init.body)) : null, ticket)
    return new Response(JSON.stringify(said?.body ?? null), { status: said?.status ?? 404 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  document.getElementById('ticket')?.remove()
  document.documentElement.className = ''
  window.sessionStorage.clear()
  rmSync(dir, { recursive: true, force: true })
})

const parts = (...picked: string[]) => [
  { id: 'methods', heading: 'Methods', refs: [], picked: picked.includes('methods'), files: ['chapters/3_methods.tex'] },
  { id: 'results', heading: 'Results', refs: [], picked: picked.includes('results'), files: ['chapters/4_results.tex'] },
]
const file = (name: string) => `${dir}/${PAPER}/${name}`
/** Where a paper says its caret is: a file and the page it printed on. */
const page = (name: string, n: number) => ({ path: file(name), page: n, section: null, from: null, to: null, quoted: '' })
const whole = (name: string) => ({ path: file(name), page: null, section: null, from: null, to: null, quoted: '' })
/** A canvas with a paper on it, the passage it last held, what the paper says it shows, and these parts ticked. */
const canvas = (passage: ReturnType<typeof page> | null, picked: string[], shown: string[] = [], selected = false) => ({
  project: 'thesis',
  projectPath: dir,
  epic: EPIC,
  theme: 'dark',
  parts: parts(...picked),
  passage,
  containers: [
    { module: 'kehikot.paper', selected, showing: { refs: [], documents: [...(passage ? [passage] : []), ...shown.map(whole)] } },
    { module: 'kehikot.notes', selected: false, showing: { refs: [], documents: [] } },
  ],
})
const say = async (type: 'kehikot.hello' | 'kehikot.context', context: Record<string, unknown>) => {
  await act(async () => {
    window.postMessage(type === 'kehikot.hello' ? { type, protocol: 2, session: 's', state: null, context } : { type, protocol: 2, ...context }, '*')
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}
/** Which files' notes are drawn, as rows. */
const drawn = () => {
  const text = [...document.querySelectorAll('[data-testid="note"]')].map((row) => row.textContent ?? '').join('\n')
  const count = (bodies: string[]) => bodies.filter((one) => text.includes(one)).length
  return { methods: count(WRITTEN.methods), results: count(WRITTEN.results), main: count(WRITTEN.main) }
}
const heading = () => document.querySelector('[data-testid="scope"]')?.textContent ?? null
const outside = () => document.querySelector('[data-testid="focus"]')?.textContent ?? null

describe('the notes follow the ticked parts, whatever passage the canvas last held', () => {
  test('no part, one, another, two, none: each tick is that part’s notes, and the count is the rest of the project', async () => {
    render(<App />)
    /* Nothing ticked, the paper's caret on a page: that page's notes, as it always was. */
    await say('kehikot.hello', canvas(page('chapters/3_methods.tex', 19), []))
    await waitFor(() => expect(drawn()).toEqual({ methods: 1, results: 0, main: 0 }))
    expect(heading()).toBe('3_methods.tex · page 19')
    expect(outside()).toBeNull()

    /* A part ticked: the whole part, not the page the caret happens to be on. */
    await say('kehikot.context', canvas(page('chapters/3_methods.tex', 19), ['methods']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0, main: 0 }))
    expect(heading()).toBe('Methods')
    expect(outside()).toBe('2 notes outside the picked part (Methods).')
    /* No ladder out from a passage the list is not standing on. */
    expect(document.querySelector('[data-testid="widen"]')).toBeNull()

    /* The tick moves and the passage has not: a paper somebody else walked to a passage says
       nothing new until a person touches it. */
    await say('kehikot.context', canvas(page('chapters/3_methods.tex', 19), ['results']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1, main: 0 }))
    expect(heading()).toBe('Results')
    expect(outside()).toBe('3 notes outside the picked part (Results).')

    /* Two parts, and the passage names the one file the caret is in. */
    await say('kehikot.context', canvas(page('chapters/4_results.tex', 30), ['methods', 'results']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 1, main: 0 }))
    expect(heading()).toBe('Methods, Results')
    expect(outside()).toBe('1 note outside the 2 picked parts (Methods, Results).')

    /* Nothing ticked again: back to following the passage, down to its page. */
    await say('kehikot.context', canvas(page('chapters/4_results.tex', 30), []))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1, main: 0 }))
    expect(heading()).toBe('4_results.tex · page 30')
    expect(outside()).toBeNull()
  })

  test('a ticked part with no passage on the canvas at all: the part’s notes, not "nothing open"', async () => {
    render(<App />)
    await say('kehikot.hello', canvas(null, ['results']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1, main: 0 }))
    expect(heading()).toBe('Results')
  })

  test('a stale passage in a file no ticked part owns does not empty the list', async () => {
    render(<App />)
    await say('kehikot.hello', canvas(page('main.tex', 1), ['methods']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0, main: 0 }))
    expect(outside()).toBe('2 notes outside the picked part (Methods).')
  })

  test('a container somebody picked out still narrows, beside the ticks', async () => {
    render(<App />)
    /* The paper is picked out and says it shows the results chapter only. */
    await say('kehikot.hello', canvas(page('chapters/4_results.tex', 30), ['methods', 'results'], [], true))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1, main: 0 }))
    expect(document.querySelector('[data-testid="scope"]')?.getAttribute('data-narrowed')).toBe('true')
  })

  test('with nothing ticked, what the paper says it shows does not widen the list past the reader’s page', async () => {
    render(<App />)
    /* The paper now says every file it shows. Nothing is picked out, so this list still follows
       the passage: `notes/aim.ts` says why that is not a union. */
    await say('kehikot.hello', canvas(page('chapters/3_methods.tex', 20), [], ['main.tex', 'chapters/3_methods.tex', 'chapters/4_results.tex']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 1, results: 0, main: 0 }))
    expect(heading()).toBe('3_methods.tex · page 20')
  })

  test('a reply half written is still in its box after the tick that puts its note aside', async () => {
    render(<App />)
    await say('kehikot.hello', canvas(page('chapters/3_methods.tex', 19), ['methods']))
    await waitFor(() => expect(drawn().methods).toBe(2))
    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="note"]')].find((one) => one.textContent?.includes(WRITTEN.methods[0]!))!
    fireEvent.click([...row.querySelectorAll('button')].find((one) => one.textContent === 'reply')!)
    const box = row.querySelector('textarea')!
    fireEvent.change(box, { target: { value: 'half a rep' } })

    await say('kehikot.context', canvas(page('chapters/3_methods.tex', 19), ['results']))
    await waitFor(() => expect(drawn().results).toBe(1))
    /* The note it is on stays, and says why; the other methods note has gone with the tick. */
    expect(drawn().methods).toBe(1)
    expect((document.querySelector('[data-testid="note"] textarea') as HTMLTextAreaElement).value).toBe('half a rep')
    expect(outside()).toBe('3 notes outside the picked part (Results). 1 is still here because you have it open.')
  })

  test('and after a reload under that tick the words are shown as kept, then back in their box when the part is ticked again', async () => {
    render(<App />)
    await say('kehikot.hello', canvas(page('chapters/3_methods.tex', 19), ['methods']))
    await waitFor(() => expect(drawn().methods).toBe(2))
    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="note"]')].find((one) => one.textContent?.includes(WRITTEN.methods[0]!))!
    fireEvent.click([...row.querySelectorAll('button')].find((one) => one.textContent === 'reply')!)
    fireEvent.change(row.querySelector('textarea')!, { target: { value: 'half a rep' } })

    /* The page reloads with another part ticked: the note is not drawn, and its words are not lost
       behind that — the store's answer holds every note now, so "on screen" is what is DRAWN. */
    cleanup()
    render(<App />)
    await say('kehikot.hello', canvas(page('chapters/3_methods.tex', 19), ['results']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1, main: 0 }))
    expect(document.querySelector('[data-testid="kept-words"]')?.textContent).toContain('half a rep')

    await say('kehikot.context', canvas(page('chapters/3_methods.tex', 19), ['methods']))
    await waitFor(() => expect(drawn().methods).toBe(2))
    await waitFor(() => expect(document.querySelector('[data-testid="kept-words"]')).toBeNull())
    expect((document.querySelector('[data-testid="note"] textarea') as HTMLTextAreaElement | null)?.value).toBe('half a rep')
  })
})
