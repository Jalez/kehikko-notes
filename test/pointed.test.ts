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
  return { id: 'n1', at: keyOf(at()), was: null, ...over }
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
    expect(standing({ id: 'n1', at: keyOf(published), was: null }, back)).toBe(true)
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

    const second: Pointed<At> = { id: 'n2', at: keyOf(at({ from: 50, to: 60 })), was: showing }
    expect(shownAt(second, at({ from: 50, to: 60 }))).toEqual(list)
  })
})
