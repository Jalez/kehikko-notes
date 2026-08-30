import { describe, expect, test } from 'bun:test'

import type { Anchored } from '../notes/anchor.ts'
import { narrow, pathOf, saidOf, scopeOf } from '../notes/scope.ts'
import type { Note } from '../notes/shape.ts'

/**
 * The ladder, tested without a browser, a store or a `.tex` file.
 *
 * These are the tests the whole ask turns on: nothing selected but a page open
 * shows that page's notes, a passage selected shows that passage's, and neither
 * of them ever quietly loses a note that could not be placed.
 */

const PATH = '/w/thesis/chapters/bridge.tex'

function note(over: Partial<Note>): Note {
  return {
    id: 'n',
    project: 'thesis',
    projectPath: '/w/thesis',
    path: PATH,
    page: 3,
    from: 100,
    to: 140,
    quoted: 'a passage',
    fingerprint: 'x',
    body: 'a thought',
    by: 'the owner',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
    ...over,
  }
}

/** A note whose anchor holds exactly where it was stored. */
function held(over: Partial<Note>): Anchored {
  const one = note(over)
  return {
    note: one,
    anchor: { state: 'exact', from: one.from, to: one.to, drifted: 0, said: 'still there' },
  }
}

/** A note whose passage is gone. */
function gone(over: Partial<Note>): Anchored {
  return { note: note(over), anchor: { state: 'adrift', from: null, to: null, drifted: null, said: 'ADRIFT' } }
}

/** A note whose offsets rotted, resolved to where the words actually are. */
function shifted(over: Partial<Note>, to: { from: number; to: number }): Anchored {
  return {
    note: note(over),
    anchor: { state: 'moved', from: to.from, to: to.to, drifted: to.from - (note(over).from ?? 0), said: 'MOVED' },
  }
}

describe('which rung a passage puts the pane on', () => {
  test('nothing pointing is nowhere', () => {
    expect(scopeOf(null)).toEqual({ kind: 'nowhere' })
  })

  test('a document with no page and nothing selected is the document', () => {
    expect(scopeOf({ path: PATH, page: null, from: null, to: null, quoted: '' })).toEqual({
      kind: 'document',
      path: PATH,
    })
  })

  test('a page open with nothing selected is the page', () => {
    expect(scopeOf({ path: PATH, page: 7, from: null, to: null, quoted: '' })).toEqual({
      kind: 'page',
      path: PATH,
      page: 7,
    })
  })

  test('a selection is the passage, whether or not a page came with it', () => {
    expect(scopeOf({ path: PATH, page: 7, from: 10, to: 20, quoted: 'x' })).toEqual({
      kind: 'passage',
      path: PATH,
      page: 7,
      from: 10,
      to: 20,
    })
    expect(scopeOf({ path: PATH, page: null, from: 10, to: 20, quoted: 'x' }).kind).toBe('passage')
  })

  test('only the rungs about a document have a path', () => {
    expect(pathOf({ kind: 'nowhere' })).toBe(null)
    expect(pathOf({ kind: 'everything' })).toBe(null)
    expect(pathOf({ kind: 'page', path: PATH, page: 1 })).toBe(PATH)
  })
})

describe('the ladder narrows, and says what it narrowed away', () => {
  const notes = [
    held({ id: 'page3-early', page: 3, from: 100, to: 140 }),
    held({ id: 'page3-late', page: 3, from: 400, to: 460 }),
    held({ id: 'page9', page: 9, from: 900, to: 940 }),
    held({ id: 'other-file', path: '/w/thesis/chapters/wire.tex', page: 3, from: 100, to: 140 }),
  ]

  test('nowhere shows nothing, and does not pretend the store is empty', () => {
    const out = narrow(notes, { kind: 'nowhere' })
    expect(out.shown).toHaveLength(0)
    expect(out.elsewhere).toBe(4)
  })

  test('a document shows every note on THAT document and no other', () => {
    const out = narrow(notes, { kind: 'document', path: PATH })
    expect(out.shown.map((one) => one.note.id)).toEqual(['page3-early', 'page3-late', 'page9'])
    expect(out.elsewhere).toBe(0)
  })

  test('a page shows that page, and counts the rest of the document', () => {
    const out = narrow(notes, { kind: 'page', path: PATH, page: 3 })
    expect(out.shown.map((one) => one.note.id)).toEqual(['page3-early', 'page3-late'])
    expect(out.elsewhere).toBe(1)
  })

  test('a passage shows what overlaps it, and counts the rest of the document', () => {
    const out = narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 120, to: 130 })
    expect(out.shown.map((one) => one.note.id)).toEqual(['page3-early'])
    expect(out.elsewhere).toBe(2)
  })

  test('touching is not overlapping — a note that ends where the selection starts is not on it', () => {
    const out = narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 140, to: 200 })
    expect(out.shown).toHaveLength(0)
  })

  test('notes come back in the order somebody reads them, not the order they were written', () => {
    const jumbled = [held({ id: 'b', from: 400, to: 460 }), held({ id: 'a', from: 100, to: 140 })]
    expect(narrow(jumbled, { kind: 'document', path: PATH }).shown.map((one) => one.note.id)).toEqual(['a', 'b'])
  })

  test('a note with no page recorded shows on every page rather than on none', () => {
    const pageless = [...notes, held({ id: 'no-page', page: null, from: 500, to: 520 })]
    expect(narrow(pageless, { kind: 'page', path: PATH, page: 9 }).shown.map((one) => one.note.id)).toContain('no-page')
  })
})

describe('a note that cannot be placed is never narrowed away', () => {
  const notes = [
    held({ id: 'anchored', page: 3, from: 100, to: 140 }),
    gone({ id: 'lost', page: 3, from: 100, to: 140 }),
  ]

  test('at document scope', () => {
    const out = narrow(notes, { kind: 'document', path: PATH })
    expect(out.adrift.map((one) => one.note.id)).toEqual(['lost'])
    expect(out.shown.map((one) => one.note.id)).toEqual(['anchored'])
  })

  test('at page scope, including a page it was not written on', () => {
    expect(narrow(notes, { kind: 'page', path: PATH, page: 9 }).adrift.map((one) => one.note.id)).toEqual(['lost'])
  })

  test('at passage scope, where a range test could not have included it', () => {
    const out = narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 900, to: 950 })
    expect(out.shown).toHaveLength(0)
    expect(out.adrift.map((one) => one.note.id)).toEqual(['lost'])
  })

  test('and is never counted as merely elsewhere, which would read as "widen and you will find it"', () => {
    const out = narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 900, to: 950 })
    expect(out.elsewhere).toBe(1)
    expect(out.adrift).toHaveLength(1)
  })

  test('a note about a whole page has no range and is placed the same way', () => {
    const unranged: Anchored = {
      note: note({ id: 'whole-page', from: null, to: null, quoted: '' }),
      anchor: { state: 'unranged', from: null, to: null, drifted: null, said: 'whole page' },
    }
    expect(narrow([unranged], { kind: 'passage', path: PATH, page: 3, from: 0, to: 10 }).adrift).toHaveLength(1)
  })
})

describe('a note whose offsets rotted is found where its words are now', () => {
  test('so an edit above the reader does not empty the pane', () => {
    /* Stored at 100–140; the document grew by 400 bytes above it, so the words
       are at 500–540. A range test against the STORED offsets would show
       nothing for a reader selecting the passage they are looking at. */
    const notes = [shifted({ id: 'drifted', from: 100, to: 140 }, { from: 500, to: 540 })]
    expect(narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 510, to: 520 }).shown).toHaveLength(1)
    expect(narrow(notes, { kind: 'passage', path: PATH, page: 3, from: 110, to: 120 }).shown).toHaveLength(0)
  })
})

describe('what the pane and the door both say about a scope', () => {
  test('one sentence per rung, so a reader and an agent describe the same list', () => {
    expect(saidOf({ kind: 'nowhere' })).toContain('No document is open')
    expect(saidOf({ kind: 'everything' })).toContain('Every note in this project')
    expect(saidOf({ kind: 'document', path: PATH })).toContain(PATH)
    expect(saidOf({ kind: 'page', path: PATH, page: 7 })).toContain('page 7')
    expect(saidOf({ kind: 'passage', path: PATH, page: 7, from: 10, to: 20 })).toContain('10–20')
  })
})
