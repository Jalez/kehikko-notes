import { describe, expect, test } from 'bun:test'

import type { AnchorState } from '../notes/anchor.ts'
import { showsQuote } from '../notes/quote.ts'

/**
 * The owner's rule, as a table: a row draws its quote only where pressing the
 * note cannot show the passage in the paper. See the essay in `notes/quote.ts`.
 */

describe('a quote is drawn only where a press cannot show the passage', () => {
  test('exact and moved, in a container that can point, leave it to the paper', () => {
    /* A moved note's words were FOUND again, and a press sends where they are
       now, so the paper can highlight them as surely as an exact one's. */
    expect(showsQuote('exact', true)).toBe(false)
    expect(showsQuote('moved', true)).toBe(false)
  })

  test('adrift keeps it: the passage is gone and the quote is the only record of it', () => {
    expect(showsQuote('adrift', true)).toBe(true)
  })

  test('unchecked keeps it: whatever a press lights up is a guess', () => {
    expect(showsQuote('unverified', true)).toBe(true)
  })

  test('whole page keeps it: a press lands on no range', () => {
    expect(showsQuote('unranged', true)).toBe(true)
  })

  test('nothing to press to keeps it, whatever the verdict', () => {
    const every: AnchorState[] = ['exact', 'moved', 'adrift', 'unverified', 'unranged']
    for (const state of every) expect(showsQuote(state, false)).toBe(true)
  })

  test('a verdict nobody here has heard of keeps it until somebody decides otherwise', () => {
    expect(showsQuote('something new', true)).toBe(true)
  })
})
