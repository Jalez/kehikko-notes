import { describe, expect, test } from 'bun:test'
import { footerItemsSchema, headerItemsSchema, LIMITS, type FooterItem } from 'kehikot-module-protocol'

import { countSaid, footerItems, footerPressed, headerItems, type FooterState } from '../src/wire/footer.ts'

/**
 * The rows the host draws: the header is how the module is set up (one run, "New note"), the
 * footer is what is going on now (the scope and the way back beside it, the count, the trouble).
 */

const base: FooterState = {
  scope: { said: 'bridge.tex p. 3', title: '/w/thesis/chapters/bridge.tex' },
  climbs: [{ id: 'document', said: 'all of bridge.tex' }],
  shown: 2,
  adrift: 0,
  elsewhere: 0,
  withdrawn: 0,
  withdrawnShown: false,
  verified: true,
  pointed: null,
  refused: null,
  busy: false,
}
const parsed = (state: Partial<FooterState>): FooterItem[] => footerItemsSchema.parse(footerItems({ ...base, ...state }))
const byId = (items: FooterItem[], id: string) => items.find((one) => one.id === id)

describe('the footer declared', () => {
  test('the scope first, with its path in the tooltip, and the way back beside it', () => {
    const items = parsed({})
    expect(items.map((one) => one.id)).toEqual(['scope', 'document', 'count'])
    expect(byId(items, 'scope')).toMatchObject({ kind: 'text', text: 'bridge.tex p. 3', tooltip: '/w/thesis/chapters/bridge.tex' })
    expect(byId(items, 'document')).toMatchObject({ kind: 'run', label: 'all of bridge.tex', agents: true })
  })

  test('the count at the end, and what is put aside in it only when there is some', () => {
    expect(byId(parsed({}), 'count')).toMatchObject({ kind: 'text', text: '2 notes', align: 'end', level: 'normal' })
    expect(countSaid({ shown: 1, adrift: 2, elsewhere: 3, withdrawn: 4, withdrawnShown: false })).toBe('1 note · 2 adrift · 3 outside · 4 preamble hidden')
    expect(countSaid({ shown: 0, adrift: 0, elsewhere: 0, withdrawn: 4, withdrawnShown: true })).toBe('0 notes')
  })

  test('adrift notes raise the count to warn, and say so in its tooltip', () => {
    const count = byId(parsed({ adrift: 1 }), 'count')
    expect(count).toMatchObject({ level: 'warn' })
    expect((count as { tooltip: string }).tooltip).toContain('1 note can no longer be placed in this document.')
  })

  test('a refused write is critical and comes first; it stands even with no list', () => {
    expect(parsed({ refused: 'a note needs a body' })[0]).toMatchObject({ id: 'refused', level: 'critical', text: 'a note needs a body' })
    expect(parsed({ refused: 'no such note', scope: null, shown: null }).map((one) => one.id)).toEqual(['refused'])
  })

  test('no list, no footer', () => {
    expect(parsed({ scope: null, shown: null })).toEqual([])
  })

  test('the note the canvas is pointed at, a saving line and unchecked documents are optional readouts', () => {
    const items = parsed({ pointed: 'A module is one origin', busy: true, verified: false })
    expect(byId(items, 'pointed')).toMatchObject({ text: 'On “A module is one origin”', optional: true })
    expect(byId(items, 'saving')).toMatchObject({ text: 'Saving…', optional: true })
    expect(byId(items, 'unchecked')).toMatchObject({ level: 'warn', optional: true })
    /* Unchecked says nothing over an empty list. */
    expect(byId(parsed({ verified: false, shown: 0 }), 'unchecked')).toBeUndefined()
  })

  test('long words are cut to the protocol’s limits', () => {
    const long = 'x'.repeat(400)
    const items = parsed({ refused: long, pointed: long, scope: { said: long, title: long } })
    for (const one of items) {
      if (one.kind === 'text') expect(one.text.length).toBeLessThanOrEqual(LIMITS.FOOTER_TEXT)
      if (one.tooltip) expect(one.tooltip.length).toBeLessThanOrEqual(LIMITS.FOOTER_TOOLTIP)
    }
  })
})

describe('a press in the footer', () => {
  test('takes a rung on offer, and says why not for one that is not', () => {
    expect(footerPressed('document', base)).toBe('document')
    expect(typeof footerPressed('follow', base)).toBe('string')
    expect(typeof footerPressed('count', base)).toBe('string')
  })
})

describe('the header declared', () => {
  test('one run, New note, refused in words when there is no passage or a note is being written', () => {
    const open = headerItemsSchema.parse(headerItems({ canWrite: true, composing: false, busy: false }))
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ kind: 'run', id: 'write', label: 'New note', disabled: null, state: 'idle' })
    const shut = headerItemsSchema.parse(headerItems({ canWrite: false, composing: false, busy: true }))
    expect(shut[0]).toMatchObject({ state: 'busy' })
    expect(typeof (shut[0] as { disabled: unknown }).disabled).toBe('string')
    expect(typeof (headerItemsSchema.parse(headerItems({ canWrite: true, composing: true, busy: false }))[0] as { disabled: unknown }).disabled).toBe('string')
  })

  test('a footer id never repeats a header one', () => {
    const header = new Set(headerItems({ canWrite: true, composing: false, busy: false }).map((one) => one.id))
    for (const one of parsed({ climbs: [{ id: 'document', said: 'a' }, { id: 'follow', said: 'b' }], pointed: 'p', busy: true, verified: false, refused: 'r' })) {
      expect(header.has(one.id)).toBe(false)
    }
  })
})
