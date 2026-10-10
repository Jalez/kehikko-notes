import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { partsDeclaration, type EpicPart } from 'kehikot-module-protocol'

import { MANIFEST } from '../manifest.ts'
import type { Anchored } from '../notes/anchor.ts'
import { anchorOf, briefOfParts, focusOn, ledByParts } from '../notes/focus.ts'
import type { Note } from '../notes/shape.ts'
import { NoteRow } from '../src/view/note.tsx'

/**
 * The parts focus: which notes a ticked part leaves, how many it does not,
 * and that a note in somebody's hands stays. The rule is the protocol's and is
 * tested there; this is what anchors a note, the three groups counted once,
 * and the row saying when it is held.
 */

afterEach(cleanup)

const PAPER = '/w/proj/.kehikot/paper/thesis'

const one = (id: string, file: string): Anchored => ({
  note: {
    id,
    path: file.startsWith('/') ? file : `${PAPER}/${file}`,
    page: null,
    from: 10,
    to: 20,
    quoted: 'the words',
    fingerprint: 'x',
    body: `about ${id}`,
    by: 'the owner',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
  } as Note,
  anchor: { state: 'exact', from: 10, to: 20, drifted: null, said: 'holds' },
})

const LOOKED = {
  said: 'everything',
  shown: [one('intro-1', 'chapters/intro.tex'), one('methods-1', 'chapters/methods.tex'), one('main-1', 'main.tex'), one('code-1', '/w/proj/src/app.ts')],
  adrift: [one('methods-adrift', 'chapters/methods.tex'), one('intro-adrift', 'chapters/intro.tex')],
  withdrawn: [one('preamble-1', 'main.tex'), one('preamble-2', 'main.tex')],
}

const parts = (...picked: string[]): EpicPart[] => [
  { id: 'intro', heading: 'Introduction', refs: [], picked: picked.includes('intro'), files: ['chapters/intro.tex'] },
  { id: 'methods', heading: 'Methods', refs: [], picked: picked.includes('methods'), files: ['chapters/methods.tex'] },
]
const NOBODY: ReadonlySet<string> = new Set()
const ids = (list: Anchored[]) => list.map((each) => each.note.id)

describe('which notes the ticked parts leave', () => {
  test('a note is anchored to its file', () => {
    expect(anchorOf(LOOKED.shown[0]!)).toEqual({ file: `${PAPER}/chapters/intro.tex` })
  })

  test('nothing ticked: the answer itself, and nothing to say', () => {
    const out = focusOn(LOOKED, parts(), 'thesis', NOBODY, false)
    expect(out.looked).toBe(LOOKED)
    expect(out.sentence).toBe('')
  })

  test('one part: its file’s notes in every group; main.tex and a file outside the paper are counted outside', () => {
    const out = focusOn(LOOKED, parts('methods'), 'thesis', NOBODY, false)
    expect(ids(out.looked.shown)).toEqual(['methods-1'])
    expect(ids(out.looked.adrift)).toEqual(['methods-adrift'])
    expect(out.looked.withdrawn).toEqual([])
    expect(out.looked.said).toBe('everything')
    expect(out.sentence).toBe('4 notes outside the picked part (Methods).')
  })

  test('two parts', () => {
    const out = focusOn(LOOKED, parts('intro', 'methods'), 'thesis', NOBODY, false)
    expect(ids(out.looked.shown)).toEqual(['intro-1', 'methods-1'])
    expect(out.sentence).toBe('2 notes outside the 2 picked parts (Introduction, Methods).')
  })

  test('the preamble comments are counted only while they are drawn', () => {
    expect(focusOn(LOOKED, parts('methods'), 'thesis', NOBODY, true).sentence).toBe('6 notes outside the picked part (Methods).')
  })

  test('another epic’s parts own none of this paper’s files', () => {
    expect(focusOn(LOOKED, parts('methods'), 'another', NOBODY, false).looked.shown).toEqual([])
  })

  test('a note in somebody’s hands stays where it was, and is still counted outside', () => {
    const out = focusOn(LOOKED, parts('methods'), 'thesis', new Set(['intro-1', 'intro-adrift']), false)
    expect(ids(out.looked.shown)).toEqual(['intro-1', 'methods-1'])
    expect(ids(out.looked.adrift)).toEqual(['methods-adrift', 'intro-adrift'])
    expect(out.sentence).toBe('4 notes outside the picked part (Methods). 2 are still here because you have them open.')
    expect(focusOn(LOOKED, parts('methods'), 'thesis', new Set(['main-1']), false).sentence).toEndWith(
      '1 is still here because you have it open.',
    )
  })
})

describe('a row says when somebody is in the middle of it', () => {
  const actions = { reply: () => {}, resolve: () => {}, reanchor: () => {}, point: null, edit: () => {}, remove: () => {}, busy: false }

  test('replying holds it, cancelling lets it go, and so does the row leaving', () => {
    const said: [string, boolean][] = []
    const { unmount } = render(<NoteRow one={one('n1', 'chapters/intro.tex')} actions={{ ...actions, hold: (id, held) => said.push([id, held]) }} />)
    expect(said).toEqual([])
    fireEvent.click(screen.getByText('reply'))
    expect(said).toEqual([['n1', true]])
    fireEvent.click(screen.getByText('cancel'))
    expect(said).toEqual([['n1', true], ['n1', false]])
    fireEvent.click(screen.getByText('reply'))
    unmount()
    expect(said.at(-1)).toEqual(['n1', false])
  })
})

test('the manifest says it follows the parts', () => {
  expect(MANIFEST.reacts).toContain('parts')
  expect(partsDeclaration(MANIFEST)).toEqual([])
})

describe('when the ticked parts decide the list', () => {
  test('whenever a part is ticked and nobody narrowed on purpose some other way', () => {
    expect(ledByParts({ focused: true, narrowed: false, widen: null })).toBe(true)
    /* Nothing ticked: the reader's passage, as it always was. */
    expect(ledByParts({ focused: false, narrowed: false, widen: null })).toBe(false)
    /* A container picked out in its header, and a rung of this page's own ladder, are each a press. */
    expect(ledByParts({ focused: true, narrowed: true, widen: null })).toBe(false)
    expect(ledByParts({ focused: true, narrowed: false, widen: 'document' })).toBe(false)
    expect(ledByParts({ focused: true, narrowed: false, widen: 'everything' })).toBe(false)
  })

  test('the heading names the ticked parts, in the epic’s order', () => {
    expect(briefOfParts(parts('methods'))).toBe('Methods')
    expect(briefOfParts(parts('methods', 'intro'))).toBe('Introduction, Methods')
    expect(briefOfParts(parts())).toBe('')
  })
})
