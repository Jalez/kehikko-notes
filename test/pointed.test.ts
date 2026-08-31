import { describe, expect, test } from 'bun:test'

import { keyOf, shownAt, standing, type At, type Pointed } from '../notes/pointed.ts'

/**
 * Pressing a note must not cost the reader the list they pressed it from.
 *
 * Every case here is one of the two things this policy has to tell apart: an
 * arriving passage that is the echo of this container's own press, and an
 * arriving passage that is a person moving through a document.
 */

function at(over: Partial<At> = {}): At {
  return { path: 'main.tex', page: null, from: 10, to: 20, ...over }
}

function pressed(over: Partial<Pointed<At>> = {}): Pointed<At> {
  return { id: 'n1', at: keyOf(at()), since: null, was: null, ...over }
}

describe('where the canvas is standing', () => {
  test('a passage this container published is its own press coming back', () => {
    expect(standing(pressed(), at())).toBe(true)
  })

  test('a different range is somebody moving', () => {
    expect(standing(pressed(), at({ from: 400, to: 420 }))).toBe(false)
  })

  test('a different file is somebody moving', () => {
    expect(standing(pressed(), at({ path: 'other.tex' }))).toBe(false)
  })

  test('nothing pointing is not standing anywhere', () => {
    expect(standing(pressed(), null)).toBe(false)
  })

  test('no press means the reader is simply being followed', () => {
    expect(standing(null, at())).toBe(false)
  })

  /* The quote is left out of the key on purpose: it is truncated on the way out
     and may be re-read on the way back, and two spellings of one place must not
     read as two places -- that would collapse the list exactly as before. */
  test('the same place with a differently spelled quote still matches', () => {
    const published = { ...at(), quoted: 'the whole sentence as it was sent' }
    const back = { ...at(), quoted: 'the whole sentence as it wa' }
    expect(standing({ id: 'n1', at: keyOf(published), since: null, was: null }, back)).toBe(true)
  })

  /*
   * The gap between asking and being answered, which every test above skipped
   * over by handing `standing` a passage that had already arrived.
   *
   * A press is a state change and a message. The state change lands on the next
   * render; the message cannot come back before it. So there is always at least
   * one render where this container is holding a press and the host is still
   * saying the passage the press was made from — and reading that as "somebody
   * moved" threw every press away before a reader could see it. Measured in a
   * browser: the second note of twenty, pressed, left one note in the list.
   */
  test('the passage a press was made from is still standing, until the echo arrives', () => {
    const from = at({ from: 0, to: 999 })
    const press = pressed({ at: keyOf(at()), since: keyOf(from) })
    expect(standing(press, from)).toBe(true)
    expect(standing(press, at())).toBe(true)
  })

  test('and a third place is the reader moving, press or no press', () => {
    const press = pressed({ at: keyOf(at()), since: keyOf(at({ from: 0, to: 999 })) })
    expect(standing(press, at({ from: 700, to: 710 }))).toBe(false)
  })

  /* A press made where nothing was pointing has no passage to have come from,
     and `null` must not match a passage that simply has no range. */
  test('a press from nowhere is not standing on every passage', () => {
    expect(standing(pressed({ since: null }), at({ path: 'other.tex' }))).toBe(false)
  })

  /* A page-scoped note and a range on that page are different places, and a key
     that ran them together would hold a list the reader had left. */
  test('a page is not the same place as a range', () => {
    const page = at({ page: 3, from: null, to: null })
    const range = at({ page: 3, from: 0, to: 5 })
    expect(keyOf(page)).not.toBe(keyOf(range))
  })
})

describe('what the list shows', () => {
  test('the held scope while the canvas stands where this container put it', () => {
    const held = at({ from: 0, to: 999 })
    expect(shownAt(pressed({ was: held }), at())).toEqual(held)
  })

  /* A press made from the widened view holds the widened view. `null` here is
     an answer, not an absence: it is "this list was not scoped by a passage". */
  test('a press from the widened list keeps it widened', () => {
    expect(shownAt(pressed({ was: null }), at())).toBeNull()
  })

  test('the reader moving on their own is followed again', () => {
    const moved = at({ from: 700, to: 710 })
    expect(shownAt(pressed({ was: at({ from: 0, to: 999 }) }), moved)).toEqual(moved)
  })

  test('with no press at all the list is the passage', () => {
    expect(shownAt(null, at())).toEqual(at())
  })

  test('and with nothing pointing it is nothing', () => {
    expect(shownAt(null, null)).toBeNull()
  })

  /* Pressing a second note from a held list holds the SAME list -- the caller
     records what the list is showing, not the passage the last press published,
     and this is the case that would drift if it recorded the wrong one. */
  test('a second press from a held list holds the same list', () => {
    const list = at({ from: 0, to: 999 })
    const first = pressed({ id: 'n1', at: keyOf(at()), was: list })
    const showing = shownAt(first, at())

    const second: Pointed<At> = { id: 'n2', at: keyOf(at({ from: 50, to: 60 })), since: keyOf(at()), was: showing }
    expect(shownAt(second, at({ from: 50, to: 60 }))).toEqual(list)
  })
})
