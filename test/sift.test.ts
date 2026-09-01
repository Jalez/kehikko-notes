import { describe, expect, test } from 'bun:test'

import { LIMITS, filtersSchema } from 'roadmap-module-protocol'

import { offer, preambleShown, resolvedShown } from '../notes/sift.ts'

/**
 * What this container hands the host to draw, and what it makes of the answer.
 *
 * The point of asserting the offer against the protocol's own schema rather
 * than against a shape written out here: the bounds are the host's (four
 * groups, twelve options, forty-eight characters of label), and a module that
 * checked its own copy of them would find out it had outgrown one when a
 * control silently failed to appear in somebody else's container.
 */

describe('what the page offers to be narrowed by', () => {
  test('is a legal offer, by the protocol’s own reading of it', () => {
    expect(filtersSchema.safeParse({ type: 'roadmap.filters', groups: offer(3) }).success).toBe(true)
  })

  test('and stays legal when the count is a large one', () => {
    /* The label carries the count, so its length is data rather than a
       constant. Fifty-one is every note in the thesis this was measured
       against; the cap is 48 characters and the words are short for that
       reason. */
    const label = offer(51).find((group) => group.id === 'preamble')?.label ?? ''
    expect(label.length).toBeLessThanOrEqual(LIMITS.FILTER_LABEL)
    expect(label).toContain('51')
  })

  test('resolved notes are always an axis, because every document can have one', () => {
    expect(offer(0).map((group) => group.id)).toEqual(['resolved'])
  })

  test('preamble comments are an axis only where there are some', () => {
    /*
     * Most chapters have none — they are `%` comments from before
     * `\begin{document}`, which only `main.tex` has at all. A control offering
     * to reveal nothing is a press that does nothing, and the offer replaces
     * the last one whole precisely so a group can go away again.
     */
    expect(offer(3).map((group) => group.id)).toEqual(['resolved', 'preamble'])
    expect(offer(3).find((group) => group.id === 'preamble')?.label).toBe('3 preamble comments')
    expect(offer(1).find((group) => group.id === 'preamble')?.label).toBe('1 preamble comment')
  })

  test('every group can be put back to its resting state without knowing what that means', () => {
    /* `fallback` has to name one of the group's own options, which is what
       lets a host offer one press that clears everything. */
    for (const group of offer(3)) {
      expect(group.options.some((option) => option.id === group.fallback)).toBe(true)
    }
  })
})

describe('and what it makes of the answer', () => {
  test('the resting state is the narrow list, on a container nobody has pressed', () => {
    expect(resolvedShown({})).toBe(false)
    expect(preambleShown({})).toBe(false)
  })

  test('a press is honoured', () => {
    expect(resolvedShown({ resolved: 'with' })).toBe(true)
    expect(preambleShown({ preamble: 'shown' })).toBe(true)
  })

  test('and an option this version has never heard of is not', () => {
    /*
     * A host remembers a choice per container and sends it in the greeting,
     * before this module has said what it offers — so the first choice a page
     * receives can name an option from a version of itself that no longer
     * exists. Trusting it would narrow the list by a value nobody can see,
     * choose or clear.
     */
    expect(resolvedShown({ resolved: 'everything-ever' })).toBe(false)
    expect(preambleShown({ preamble: 'with' })).toBe(false)
  })
})
