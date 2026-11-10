import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'kehikot-module-protocol'
import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { drawnOf } from '../notes/drawn.ts'
import { App } from '../src/app.tsx'

/**
 * Protocol 2.70.0: the host keeps its cover up until the page says it is drawn (`ready()`), and the
 * page is mounted through `mountPage`, inside the protocol's `ReportErrors`.
 */

const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  mailbox.forget?.()
  resetServerStanding()
  globalThis.fetch = realFetch
})

const LOOKED = { ok: true, said: '', scope: { kind: 'passage' }, shown: [], adrift: [], elsewhere: 0, withdrawn: [], verified: true, opened: true, trouble: null }
const at = { cover: null, asks: [{}], looked: null, refused: null, emptied: null }

describe('when the page is drawn', () => {
  test('not while waiting to be greeted, nor while the first read is out', () => {
    expect(drawnOf({ ...at, cover: 'waiting' })).toBe(false)
    expect(drawnOf(at)).toBe(false)
  })

  test('the notes, a refusal, the picks emptying it, nobody pointing, or a sentence of the cover', () => {
    expect(drawnOf({ ...at, looked: LOOKED })).toBe(true)
    expect(drawnOf({ ...at, refused: 'no' })).toBe(true)
    expect(drawnOf({ ...at, emptied: 'The picked containers show no document.' })).toBe(true)
    expect(drawnOf({ ...at, asks: null })).toBe(true)
    expect(drawnOf({ ...at, cover: 'no-project' })).toBe(true)
    expect(drawnOf({ ...at, cover: 'down' })).toBe(true)
  })
})

describe('ready() on the page', () => {
  test('said once, when the notes are read and drawn, though the host keeps the page hidden until then', async () => {
    let release = () => {}
    const read = new Promise<void>((done) => (release = done))
    globalThis.fetch = (async (url: string) => {
      if (String(url).startsWith('/healthz')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
      await read
      return new Response(JSON.stringify(LOOKED), { status: 200 })
    }) as unknown as typeof fetch
    const said: Record<string, unknown>[] = []
    const source = { postMessage: (message: Record<string, unknown>) => void said.push(message) }
    const post = (data: unknown) => {
      const event = new MessageEvent('message', { data, origin: 'http://localhost:7777' })
      Object.defineProperty(event, 'source', { value: source })
      window.dispatchEvent(event)
    }
    render(<App />)
    post({
      type: MESSAGE.HELLO,
      protocol: PROTOCOL,
      session: 'drawn-1',
      state: null,
      context: {
        epic: null,
        theme: 'dark',
        project: 'thesis',
        projectPath: '/w/thesis',
        passage: { path: '/w/thesis/chapters/bridge.tex', page: 3, section: null, from: 100, to: 140, quoted: 'A module is one origin.' },
      },
    })
    post({ type: MESSAGE.VISIBLE, visible: false })
    await waitFor(() => expect(said.some((m) => m.type === MESSAGE.READY)).toBe(true))
    expect(said.find((m) => m.type === MESSAGE.READY)).toMatchObject({ hold: true })
    await new Promise((done) => setTimeout(done, 30))
    expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(0)
    release()
    await waitFor(() => expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(1))
    await new Promise((done) => setTimeout(done, 30))
    expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(1)
  })
})

describe('mounting the page', () => {
  test('the entry mounts through mountPage, after the client', async () => {
    const entry = await Bun.file(new URL('../src/main.tsx', import.meta.url)).text()
    const client = entry.indexOf("import 'kehikot-module-protocol/client'")
    expect(client).toBeGreaterThan(-1)
    expect(entry.indexOf("from 'kehikot-module-protocol/client/mount'")).toBeGreaterThan(client)
    expect(entry).toContain("mountPage('root', <App />)")
    expect(entry).not.toContain('createRoot')
  })
})
