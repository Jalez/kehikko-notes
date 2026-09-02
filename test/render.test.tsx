import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { Anchored } from '../notes/anchor.ts'
import { roomFor } from '../notes/room.ts'
import type { Note } from '../notes/shape.ts'
import { Compose } from '../src/view/compose.tsx'
import { NoteRow } from '../src/view/note.tsx'
import { NoProject, Nowhere } from '../src/view/screens.tsx'

/**
 * The words on screen, asserted against the real components.
 *
 * A fake renderer would let a component say something different from what it
 * says in a browser, and half the value here is that the sentences are the
 * thing being tested — a container that draws an adrift note without saying it is
 * adrift is the exact failure this module exists to prevent, and it is a
 * failure made entirely of text.
 */

afterEach(cleanup)

const actions = { reply: () => {}, resolve: () => {}, reanchor: () => {}, point: null, edit: () => {}, remove: () => {}, busy: false }

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
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
  test('a healthy anchor says nothing at all, because that is the default', () => {
    /*
     * The owner: "I don't understand why each note has to have an 'anchored'
     * badge, I don't understand the value of it." `exact` is the overwhelming
     * majority verdict, so the word was on nearly every row of nearly every
     * list — the default spelled out, carrying no information and quietening
     * the four badges that do.
     *
     * Asserted as "no badge on the row at all" rather than "no badge saying
     * anchored", because an empty badge would pass the weaker test and is the
     * same complaint one step quieter: a coloured rectangle beside every
     * healthy note.
     */
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(screen.queryByText('anchored')).toBe(null)
    expect(document.querySelectorAll('[data-slot="badge"]').length).toBe(0)
  })

  test('and the sentence under it is gone with it, rather than orphaned', () => {
    /* "Still points at the words it was written about" was the other half of
       saying nothing has happened. */
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(screen.queryByTestId('anchor-said')).toBe(null)
  })

  test('an anchor this app could not check keeps its word, which is not the same as fine', () => {
    /* The failure the paragraph above must not cause. Drawing nothing for
       `unverified` would tell a reader the one thing `anchor.ts` refuses to
       say: that a note it could not look at is a note that is fine. */
    render(<NoteRow one={anchored('unverified')} actions={actions} />)
    expect(screen.getByText('unchecked')).toBeDefined()
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

describe('a row is never longer than a row, and the rest is one press away', () => {
  /*
   * The owner, looking at one row with ninety words on it: "Notes should
   * perhaps have a word cap to keep things reasonably sized."
   *
   * The cap itself is `MOST` in `notes/room.ts`, where the number is argued
   * with and tested. What is asserted here is the half a person sees: that the
   * clamp is ON in a container with room to spare — which is where the
   * complaint was measured and where `bodyLines` used to be null — and that
   * the words come back on the press that was already on the row.
   */
  const long =
    'Revised order per supervisory feedback: enter through conversational AI first; avoid broad interactive exercises; ' +
    'keep practical context high-level. Citation style: biblatex, APA 7. Keys in references.bib. Voice calibrated to ' +
    'the bachelor thesis: American spelling, longer connected sentences, connectives and enumerations, authorial we.'

  test('the words are clamped even in a container that could draw them all', () => {
    render(<NoteRow one={anchored('exact', { body: long })} actions={actions} />)
    /* Asserted as "the clamp is on this element" rather than as the number:
       happy-dom drops `-webkit-line-clamp` when it serialises a style, so the
       number cannot be read back here. It is `MOST` and it is tested in
       `test/room.test.ts`, which is where the decision lives; that it reaches a
       real row unclipped by a browser is what `dev/sizes.mjs` measures. */
    expect(screen.getByTestId('body').getAttribute('style')).toContain('overflow: hidden')
  })

  test('and the whole of them comes back on the press that was already there', () => {
    render(<NoteRow one={anchored('exact', { body: long })} actions={actions} />)
    fireEvent.click(screen.getByTestId('body'))
    expect(screen.getByTestId('body').getAttribute('style')).toBeNull()
    /* And a way back to a row the size of the others, at every size. */
    expect(screen.getByText('less')).toBeDefined()
  })

  test('the press is one a keyboard can make, in a roomy container too', () => {
    const { container } = render(<NoteRow one={anchored('exact', { body: long })} actions={actions} />)
    const row = container.querySelector('[data-testid="note"]') as HTMLElement
    expect(row.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.getByTestId('body').getAttribute('style')).toBeNull()
  })
})

describe('what this app used to make of the same annotation', () => {
  /*
   * The line under the body that says this app re-read the annotation. It is on
   * seventeen of the fifty-two notes in the thesis this module is used on,
   * because a change to the reading re-keyed them, and it must not be deleted:
   * the replies under one were written against the old words.
   *
   * It used to print the first two hundred characters of them, which on those
   * notes is the beginning of the body it sits directly under, plus the rule
   * line the old reading left on the front. A marker and a press says the same
   * thing in six words.
   */
  const was = '============================================================\nChapter 1 — Introduction\nRevised order per supervisory feedback.'
  const reread = {
    source: { key: 'k', kind: 'comment' as const, present: true, seenAt: 'x', goneAt: null, withdrawn: null, reread: { at: '2026-08-31T09:54:22.061Z', was } },
  }

  test('is a marker with a date on it, and not the old words', () => {
    render(<NoteRow one={anchored('exact', reread)} actions={actions} />)
    const said = screen.getByTestId('reread').textContent ?? ''
    expect(said).toContain('2026-08-31')
    expect(said).not.toContain('Revised order')
    expect(said.length).toBeLessThan(50)
  })

  test('and the old words are one press behind it, because the replies answer them', () => {
    render(<NoteRow one={anchored('exact', reread)} actions={actions} />)
    expect(screen.queryByTestId('reread-was')).toBe(null)
    fireEvent.click(screen.getByTestId('reread').querySelector('button') as HTMLElement)
    expect(screen.getByTestId('reread-was').textContent).toContain('Revised order')
  })

  test('with the divider taken out of them, since a rule is not a sentence', () => {
    /* Sixty unbreakable characters are the min-content floor that once made a
       220-pixel container 1187 wide, and `was` is frozen text no re-read will
       ever clean. See `withoutRules`. */
    render(<NoteRow one={anchored('exact', reread)} actions={actions} />)
    fireEvent.click(screen.getByTestId('reread').querySelector('button') as HTMLElement)
    expect(screen.getByTestId('reread-was').textContent).not.toContain('====')
  })
})

describe('nothing long is ever put in a badge', () => {
  /*
   * The trap named in `badge.tsx`: shadcn's badge carries `whitespace-nowrap`,
   * and a quoted passage inside one sets a min-content floor far wider than the
   * container. So the quote is a blockquote and the path is a paragraph, and this
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
    const where = screen.getByText(/bridge\.tex/)
    expect(where.closest('[data-slot="badge"]')).toBe(null)
  })

  /*
   * The row prints the file's name, not its address. Every row on a list about
   * one document was repeating the same ninety-character absolute path, under a
   * heading that had just printed it too.
   */
  test('a row names the file rather than spelling out where it lives', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    const where = screen.getByText(/bridge\.tex/)
    expect(where.textContent).not.toContain('/w/thesis/chapters')
  })

  /* And the whole path is still there to be read, one hover away. */
  test('the whole path is kept as the title', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    const where = screen.getByText(/bridge\.tex/)
    expect(where.getAttribute('title')).toBe('/w/thesis/chapters/bridge.tex')
  })

  test('every badge on a row is a word this file chose and not a string from a note', () => {
    render(
      <NoteRow
        one={anchored('moved', {
          by: 'a name of considerable length indeed',
          /* A derived note as well, because its badge is the newest one and the
             one most tempting to fill with the annotation's own words. */
          source: {
            key: '/x/chapters/bridge.tex#todo:0badc0de',
            kind: 'todo',
            present: true,
            seenAt: '2026-01-01T00:00:00.000Z',
            goneAt: null,
          },
        })}
        actions={actions}
      />,
    )
    const badges = Array.from(document.querySelectorAll('[data-slot="badge"]'))
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect([
        'moved',
        'adrift',
        'unchecked',
        'whole page',
        'resolved',
        'over MCP',
        'in the source',
        'gone from source',
      ]).toContain(badge.textContent)
    }
  })
})

describe('a note lifted out of the .tex is not mistaken for one somebody typed', () => {
  const fromSource = (present: boolean) =>
    anchored('exact', {
      by: 'the author, in the source',
      source: {
        key: '/x/chapters/bridge.tex#todo:0badc0de',
        kind: 'todo',
        present,
        seenAt: '2026-01-01T00:00:00.000Z',
        goneAt: present ? null : '2026-02-01T00:00:00.000Z',
      },
    })

  test('it says so on the row, and says who wrote it and where', () => {
    /* Two claims about one sentence — the author's `\todo{}` and somebody's
       thought in the container — read identically unless the row says which is
       which, and a reader who cannot tell them apart believes both equally.
       That is the same argument `viaMcp` was added for. */
    render(<NoteRow one={fromSource(true)} actions={actions} />)
    expect(screen.getByText('in the source')).toBeDefined()
    expect(screen.getByText(/the author, in the source/)).toBeDefined()
  })

  test('an annotation the author removed says so and is still on the page', () => {
    /* Never deleted. The likeliest reason a `\todo{}` left a file is that
       somebody DID it, and the note is then the record of why the file
       changed. */
    render(<NoteRow one={fromSource(false)} actions={actions} />)
    expect(screen.getByText('gone from source')).toBeDefined()
    expect(screen.getByText('is this still true after the rewrite?')).toBeDefined()
  })

  test('a note nobody derived carries no provenance badge at all', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(screen.queryByText('in the source')).toBeNull()
    expect(screen.queryByText('gone from source')).toBeNull()
  })

  test('a note written before the field existed reads as one somebody typed', () => {
    /* The store is a JSON file with no migrations, so an old record simply has
       no `source` key. Absent and explicitly null must not come out as two
       different things. */
    const one = anchored('exact')
    delete (one.note as { source?: unknown }).source
    render(<NoteRow one={one} actions={actions} />)
    expect(screen.queryByText('in the source')).toBeNull()
  })
})

describe('the screens that are not a list of notes name why they are there', () => {
  test('no document open is explained rather than drawn as an empty list', () => {
    render(<Nowhere project="thesis" onEverything={() => {}} />)
    expect(document.body.textContent).toContain('No document is open')
    expect(document.body.textContent).toContain('nothing here is wrong')
    expect(screen.getByText('show every note in thesis')).toBeDefined()
  })

  /*
   * The screen that replaced `Unhosted`, and the assertion that matters most is
   * the ABSENCE of a button. There used to be one — "show every note" — reading
   * a pile of unattributed notes out of a file beside the program. Neither the
   * file nor the pile exists now, so a press could only show nothing or invent
   * a folder to read, and this screen is the fix for exactly that.
   */
  test('no project says which fact is missing, where notes live, and offers no press', () => {
    render(<NoProject unhosted={false} />)
    expect(document.body.textContent).toContain('has not said where its project is')
    expect(document.body.textContent).toContain('.kehikot/notes/notes.json')
    expect(document.body.textContent).toContain('will not guess')
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('unframed says the same thing, in the words of a page nobody is framing', () => {
    render(<NoProject unhosted />)
    expect(document.body.textContent).toContain('Nothing is framing this page')
    expect(document.body.textContent).toContain('nowhere to write')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('an adrift note is a note a person can still read, and a press that points at nothing', () => {
  /*
   * "the adrift note itself cant be displayed." A note whose passage is gone
   * has its words, its author and its date, and those three are what a person
   * needs to decide what to do about it. The date had never been drawn on any
   * row; the press pointed the canvas at a quote this app had just found
   * absent, and the panes narrowed to the picked-out paper emptied.
   */
  const pointed: string[] = []
  const points = { ...actions, point: (one: Anchored) => void pointed.push(one.note.id) }
  const adriftNote = () => anchored('adrift', { at: '2026-08-30T14:13:12.914Z', by: 'the author, in the source' })

  test('its words, its author and its date are on the row once it is opened', () => {
    render(<NoteRow one={adriftNote()} actions={points} room={roomFor({ width: 220, height: 340 })} />)
    expect(screen.getByText('is this still true after the rewrite?')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /is this still true/ }))
    expect(screen.getByTestId('byline').textContent).toContain('the author, in the source')
    expect(screen.getByTestId('byline').textContent).toContain('2026-08-30')
  })

  test('pressing it opens the row and does NOT point the canvas', () => {
    pointed.length = 0
    render(<NoteRow one={adriftNote()} actions={points} />)
    const row = screen.getByRole('button', { name: /is this still true/ })
    fireEvent.click(row)
    expect(row.getAttribute('data-open')).toBe('1')
    expect(pointed).toEqual([])
    expect(screen.queryByText('open in the paper')).toBeNull()
    expect(screen.queryByText('show in the paper')).toBeNull()
  })

  test('while a note that resolves still points, at the anchor it resolved to', () => {
    pointed.length = 0
    render(<NoteRow one={anchored('moved')} actions={points} />)
    fireEvent.click(screen.getByRole('button', { name: /is this still true/ }))
    expect(pointed).toEqual(['n1'])
    expect(screen.getByText('show in the paper')).toBeDefined()
  })

  test('the date is drawn on every row that draws its author, not only adrift ones', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(screen.getByTestId('byline').textContent).toBe('the owner · 2026-01-01')
  })
})

describe('the controls on a row: edit, resolve, remove', () => {
  /*
   * "I'd like to see an icon button in a button group shown for all notes when
   * you hover on them in the notes list." Every row has the group; what is IN
   * it depends on what may honestly be done to that note.
   */
  test('a typed note offers all three, by name, so a keyboard and a reader can find them', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    const group = screen.getByTestId('note-controls')
    expect(group).toBeDefined()
    expect(screen.getByRole('button', { name: 'edit this note' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'resolve this note' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'remove this note' })).toBeDefined()
  })

  test('a note lifted out of the source offers resolve alone: its words are in the .tex', () => {
    render(
      <NoteRow
        one={anchored('exact', {
          by: 'the author, in the source',
          source: { key: '/x#todo:1', kind: 'todo', present: true, seenAt: '2026-01-01T00:00:00.000Z', goneAt: null },
        })}
        actions={actions}
      />,
    )
    expect(screen.queryByRole('button', { name: 'edit this note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'remove this note' })).toBeNull()
    expect(screen.getByRole('button', { name: 'resolve this note' })).toBeDefined()
  })

  test('the group is faded until hover or focus, and never removed from the tab order', () => {
    /* `opacity-0` and not `hidden`: a control that is not laid out cannot be
       tabbed to, and a hover-only group would be unreachable without a
       pointer. The class list is asserted because it is the mechanism. */
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    const group = screen.getByTestId('note-controls')
    expect(group.className).toContain('opacity-0')
    expect(group.className).toContain('group-hover:opacity-100')
    expect(group.className).toContain('group-focus-within:opacity-100')
    const edit = screen.getByRole('button', { name: 'edit this note' })
    expect(edit.getAttribute('tabindex')).not.toBe('-1')
    expect((edit as HTMLButtonElement).disabled).toBe(false)
  })

  test('and is shown outright on an opened row, which is what a touch screen gets', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: /is this still true/ }))
    expect(screen.getByTestId('note-controls').className).not.toContain('opacity-0')
  })

  test('a press on a control does not also toggle the row', () => {
    render(<NoteRow one={anchored('exact')} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'resolve this note' }))
    expect(screen.getByRole('button', { name: /is this still true/ }).getAttribute('data-open')).toBe('0')
  })

  test('edit opens the words in a field, and saving writes the new words', () => {
    const edits: [string, string][] = []
    render(<NoteRow one={anchored('exact')} actions={{ ...actions, edit: (id, body) => void edits.push([id, body]) }} />)
    fireEvent.click(screen.getByRole('button', { name: 'edit this note' }))
    const field = screen.getByLabelText('Rewrite n1') as HTMLTextAreaElement
    expect(field.value).toBe('is this still true after the rewrite?')
    fireEvent.change(field, { target: { value: 'it is still true' } })
    fireEvent.click(screen.getByText('save'))
    expect(edits).toEqual([['n1', 'it is still true']])
    expect(screen.queryByTestId('rewrite')).toBeNull()
  })

  test('resolve resolves, and on a resolved note the same press reopens', () => {
    const calls: [string, boolean][] = []
    const resolve = (id: string, done: boolean) => void calls.push([id, done])
    render(<NoteRow one={anchored('exact')} actions={{ ...actions, resolve }} />)
    fireEvent.click(screen.getByRole('button', { name: 'resolve this note' }))
    cleanup()
    render(<NoteRow one={anchored('exact', { resolved: true, resolvedBy: 'the owner' })} actions={{ ...actions, resolve }} />)
    fireEvent.click(screen.getByRole('button', { name: 'reopen this note' }))
    expect(calls).toEqual([['n1', true], ['n1', false]])
  })

  test('remove takes two presses, and the second names what it will do', () => {
    /* `confirm()` returns false silently in the host's sandbox, so a guard
       has to be on screen. The first press arms; the button then says the
       act in words and a sentence under it says the cost, replies included. */
    const removed: string[] = []
    render(
      <NoteRow
        one={anchored('exact', { replies: [{ id: 'r1', body: 'yes', by: 'x', viaMcp: false, at: '2026-01-02T00:00:00.000Z' }] })}
        actions={{ ...actions, remove: (id) => void removed.push(id) }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'remove this note' }))
    expect(removed).toEqual([])
    const armed = screen.getByText('remove for good')
    expect(armed.getAttribute('data-armed')).toBe('1')
    expect(screen.getByRole('alert').textContent).toContain('the reply on it')
    expect(screen.getByRole('alert').textContent).toContain('for good')
    fireEvent.click(armed)
    expect(removed).toEqual(['n1'])
  })
})

describe('the note the canvas is pointed at', () => {
  /*
   * The mark is what makes the press readable. Before it, the only sign a press
   * had done anything was the list collapsing to one row -- which was also how
   * the reader lost the list. See `notes/pointed.ts`.
   */
  const points = { ...actions, point: () => {} }

  test('is marked', () => {
    const { container } = render(<NoteRow one={anchored('exact')} actions={points} pointed />)
    expect(container.querySelector('[data-pointed]')).not.toBeNull()
  })

  test('and every other row is not', () => {
    const { container } = render(<NoteRow one={anchored('exact')} actions={points} />)
    expect(container.querySelector('[data-pointed]')).toBeNull()
  })

  /* A row nothing can point at must not claim to be the pointed one. */
  test('an unframed row is never marked', () => {
    const { container } = render(<NoteRow one={anchored('exact')} actions={actions} />)
    expect(container.querySelector('[data-pointed]')).toBeNull()
  })
})

describe('in a container with no room, a row is a prefix of itself', () => {
  /*
   * The sizes are the ones a canvas hands out. What is asserted is that nothing
   * a compact row hides is LOST -- every one of these comes back on the press
   * that was already on the row, and the words themselves never go at all.
   */
  const small = roomFor({ width: 220, height: 300 })
  const points = { ...actions, point: () => {} }

  test('the words survive, which is the whole of what a note is', () => {
    render(<NoteRow one={anchored('exact')} actions={points} room={small} />)
    expect(screen.getByText('is this still true after the rewrite?')).toBeDefined()
  })

  test('and so does the verdict, because it is what a reader chooses by', () => {
    render(<NoteRow one={anchored('adrift')} actions={points} room={small} />)
    expect(screen.getByText('adrift')).toBeDefined()
  })

  test('the path, the author and the anchor’s sentence stand down', () => {
    render(<NoteRow one={anchored('moved')} actions={points} room={small} />)
    expect(screen.queryByText(/bridge\.tex/)).toBeNull()
    expect(screen.queryByText(/the owner/)).toBeNull()
    expect(screen.queryByTestId('anchor-said')).toBeNull()
    expect(screen.queryByText('reply')).toBeNull()
  })

  test('and the whole of it comes back on the press that was already there', () => {
    render(<NoteRow one={anchored('moved')} actions={points} room={small} />)
    fireEvent.click(screen.getByText('is this still true after the rewrite?'))
    expect(screen.getByText(/bridge\.tex/)).toBeDefined()
    expect(screen.getByTestId('anchor-said')).toBeDefined()
    expect(screen.getByText('reply')).toBeDefined()
    expect(screen.getByText('re-anchor')).toBeDefined()
    expect(screen.getByText('less')).toBeDefined()
  })

  /*
   * The row takes the tab stop over because the button that used to carry it is
   * one of the things a compact row does not draw. Without this, everything
   * behind the press would be reachable by pointer alone.
   */
  test('and the press is one a keyboard can make', () => {
    const { container } = render(<NoteRow one={anchored('exact')} actions={points} room={small} />)
    const row = container.querySelector('[data-testid="note"]') as HTMLElement
    expect(row.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.getByText(/bridge\.tex/)).toBeDefined()
  })

  /* An unframed page has nobody to point at anything, and still has rows that
     have to be openable -- so the press exists there too. */
  test('a row nothing can point at is still a row that opens', () => {
    const { container } = render(<NoteRow one={anchored('exact')} actions={actions} room={small} />)
    expect(container.querySelector('[data-testid="note"]')?.getAttribute('tabindex')).toBe('0')
  })

  /* A conversation is the one thing that must not vanish silently: a reader who
     cannot see that somebody answered reads the note as the last word on it. */
  test('replies that are not drawn are still counted', () => {
    const one = anchored('exact')
    one.note.replies = [
      { id: 'r1', by: 'a reader', body: 'it is not', at: '2026-01-02T00:00:00.000Z', viaMcp: false },
      { id: 'r2', by: 'another', body: 'nor was it', at: '2026-01-03T00:00:00.000Z', viaMcp: false },
    ]
    render(<NoteRow one={one} actions={points} room={small} />)
    expect(screen.getByTestId('replies-said').textContent).toBe('2 replies')
    expect(screen.queryByText('it is not')).toBeNull()
  })
})

describe('writing one in a container a form would fill', () => {
  const filling = roomFor({ width: 220, height: 300 })
  const roomy = roomFor({ width: 900, height: 700 })
  const props = {
    quoted: 'A module is one origin or it is nothing.',
    passage: true,
    said: 'bridge.tex',
    busy: false,
    draft: '',
    onDraft: () => {},
    onSubmit: () => {},
    onCancel: () => {},
  }

  test('takes the whole frame, over the list and the heading with it', () => {
    render(<Compose room={filling} {...props} />)
    expect(screen.getByTestId('compose-fill')).toBeDefined()
    expect(screen.getByTestId('compose').getAttribute('data-shape')).toBe('fill')
  })

  test('and says what it will be attached to, since the heading is behind it', () => {
    render(<Compose room={filling} {...props} />)
    expect(document.body.textContent).toContain('a note on bridge.tex')
  })

  test('the passage is still shown, because nobody should attach a thought to words they cannot see', () => {
    render(<Compose room={filling} {...props} />)
    expect(screen.getByText('A module is one origin or it is nothing.')).toBeDefined()
  })

  test('and in a container with room it is a strip above the list, as it always was', () => {
    render(<Compose room={roomy} {...props} />)
    expect(screen.queryByTestId('compose-fill')).toBeNull()
    expect(screen.getByTestId('compose').getAttribute('data-shape')).toBe('inline')
  })
})
