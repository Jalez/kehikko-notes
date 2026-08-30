import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import type { Anchored } from '../notes/anchor.ts'
import type { Note } from '../notes/shape.ts'
import { NoteRow } from '../src/view/note.tsx'
import { Nowhere, Unhosted } from '../src/view/screens.tsx'

/**
 * The words on screen, asserted against the real components.
 *
 * A fake renderer would let a component say something different from what it
 * says in a browser, and half the value here is that the sentences are the
 * thing being tested — a pane that draws an adrift note without saying it is
 * adrift is the exact failure this module exists to prevent, and it is a
 * failure made entirely of text.
 */

afterEach(cleanup)

const actions = { reply: () => {}, resolve: () => {}, reanchor: () => {}, busy: false }

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    project: 'thesis',
    projectPath: '/w/thesis',
    path: '/w/thesis/chapters/bridge.tex',
    page: 3,
    from: 100,
    to: 140,
    quoted: 'A module is one origin or it is nothing.',
    fingerprint: 'x',
    body: 'is this still true after the rewrite?',
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

function anchored(state: Anchored['anchor']['state'], over: Partial<Note> = {}): Anchored {
  const one = note(over)
  const placed = state === 'exact' || state === 'moved' || state === 'unverified'
  return {
    note: one,
    anchor: {
      state,
      from: placed ? one.from : null,
      to: placed ? one.to : null,
      drifted: state === 'moved' ? 400 : null,
      said: `the sentence for ${state}`,
    },
  }
}

describe('a note says what has become of its anchor, in a word', () => {
  test('anchored', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(screen.getByText('anchored')).toBeDefined()
  })

  test('moved, with the sentence explaining it', () => {
    render(<NoteRow one={anchored('moved')} actions={actions} />)
    expect(screen.getByText('moved')).toBeDefined()
    expect(screen.getByTestId('anchor-said').textContent).toContain('moved')
  })

  test('adrift, and the quote is still drawn — it is the most interesting note on the page', () => {
    render(<NoteRow one={anchored('adrift')} actions={actions} />)
    expect(screen.getByText('adrift')).toBeDefined()
    expect(screen.getByText('A module is one origin or it is nothing.')).toBeDefined()
  })

  test('unchecked, which is not the same as fine', () => {
    render(<NoteRow one={anchored('unverified')} actions={actions} />)
    expect(screen.getByText('unchecked')).toBeDefined()
  })

  test('whole page, for a note written with nothing selected', () => {
    render(<NoteRow one={anchored('unranged', { from: null, to: null, quoted: '' })} actions={actions} />)
    expect(screen.getByText('whole page')).toBeDefined()
  })
})

describe('re-anchoring is offered only where it can honestly be done', () => {
  test('on a moved note, whose words this app found somewhere else', () => {
    render(<NoteRow one={anchored('moved')} actions={actions} />)
    expect(screen.queryByText('re-anchor')).not.toBe(null)
  })

  test('and not on an adrift one, where there is no new place to point at', () => {
    render(<NoteRow one={anchored('adrift')} actions={actions} />)
    expect(screen.queryByText('re-anchor')).toBe(null)
  })

  test('and not on one this app never checked', () => {
    render(<NoteRow one={anchored('unverified')} actions={actions} />)
    expect(screen.queryByText('re-anchor')).toBe(null)
  })
})

describe('nothing long is ever put in a badge', () => {
  /*
   * The trap named in `badge.tsx`: shadcn's badge carries `whitespace-nowrap`,
   * and a quoted passage inside one sets a min-content floor far wider than the
   * pane. So the quote is a blockquote and the path is a paragraph, and this
   * asserts the RESULT rather than the technique.
   */
  test('a quoted passage is not inside anything that refuses to wrap', () => {
    const long = 'A module is one origin or it is nothing, and every field below is a thing somebody else chose.'
    render(<NoteRow one={anchored('exact', { quoted: long })} actions={actions} />)
    const quote = screen.getByText(long)
    expect(quote.closest('[data-slot="badge"]')).toBe(null)
    expect(quote.tagName.toLowerCase()).toBe('blockquote')
  })

  test('a document path is not inside one either', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    const where = screen.getByText(/chapters\/bridge\.tex/)
    expect(where.closest('[data-slot="badge"]')).toBe(null)
  })

  test('every badge on a row is a word this file chose and not a string from a note', () => {
    render(<NoteRow one={anchored('moved', { by: 'a name of considerable length indeed' })} actions={actions} />)
    const badges = Array.from(document.querySelectorAll('[data-slot="badge"]'))
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect(['anchored', 'moved', 'adrift', 'unchecked', 'whole page', 'resolved', 'over MCP']).toContain(
        badge.textContent,
      )
    }
  })
})

describe('the screens that are not a list of notes name why they are there', () => {
  test('no document open is explained rather than drawn as an empty list', () => {
    render(<Nowhere project="thesis" onEverything={() => {}} />)
    expect(document.body.textContent).toContain('No document is open')
    expect(document.body.textContent).toContain('nothing here is wrong')
    expect(screen.getByText('show every note in thesis')).toBeDefined()
  })

  test('unframed says which facts it is missing and which it can still answer', () => {
    render(<Unhosted onEverything={() => {}} />)
    expect(document.body.textContent).toContain('Nothing is framing this page')
    expect(screen.getByText('show every note')).toBeDefined()
  })
})
