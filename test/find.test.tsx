import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { FIND_MARK_ATTRIBUTE, pageFind } from 'kehikot-module-protocol/client'

import type { Anchored } from '../notes/anchor.ts'
import type { Note } from '../notes/shape.ts'
import { NoteRow } from '../src/view/note.tsx'

/**
 * Find (protocol 2.69.0). A note's words are plain DOM, so the host's find bar is answered by the
 * protocol client's own search of the page with no code here. This holds that the search marks,
 * counts, moves and clears on the notes this page renders. Marked with `<mark>` here (the test
 * document has no `CSS.highlights`), which also proves the marks come back out of React's DOM
 * without a trace.
 */

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const actions = { reply: () => {}, resolve: () => {}, reanchor: () => {}, point: null, edit: () => {}, remove: () => {}, busy: false }

function anchored(id: string, body: string, quoted: string): Anchored {
  const note: Note = {
    id,
    path: '/w/thesis/chapters/bridge.tex',
    page: 3,
    from: 100,
    to: 140,
    quoted,
    fingerprint: 'x',
    body,
    by: 'the owner',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
  }
  return { note, anchor: { state: 'exact', from: 100, to: 140, drifted: null, said: '' } }
}

function notes() {
  return render(
    <div>
      <NoteRow one={anchored('n1', 'Is the origin rule still true after the rewrite?', 'A module is one origin or it is nothing.')} actions={actions} />
      <NoteRow one={anchored('n2', 'Say which origin, here.', 'Frames are sandboxed.')} actions={actions} />
    </div>,
  ).container
}

const options = { caseSensitive: false, wholeWord: true }
const marks = (root: Element) => [...root.querySelectorAll(`mark[${FIND_MARK_ATTRIBUTE}]`)]

describe('find in the notes', () => {
  test('marks and counts the matches in what the notes say and quote, and moves between them', () => {
    const root = notes()
    const expected = (root.textContent ?? '').match(/\borigin\b/gi)?.length ?? 0
    expect(expected).toBeGreaterThanOrEqual(3)
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    expect(search.run('origin', options, 'first')).toEqual({ total: expected, current: 1 })
    expect(marks(root)).toHaveLength(expected)
    expect(search.run('origin', options, 'next')).toEqual({ total: expected, current: 2 })
    expect(search.run('origin', options, 'prev')).toEqual({ total: expected, current: 1 })
    expect(search.run('origin', options, 'prev')).toEqual({ total: expected, current: expected })
    expect(root.querySelectorAll('[data-current]')).toHaveLength(1)
    search.close()
  })

  test('close clears every mark and leaves the notes as React drew them', () => {
    const root = notes()
    const before = root.innerHTML
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    search.run('origin', options, 'first')
    search.close()
    expect(marks(root)).toHaveLength(0)
    expect(root.innerHTML).toBe(before)
  })
})
