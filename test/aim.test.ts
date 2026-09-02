import { describe, expect, test } from 'bun:test'

import { AIM, aimOf, aimOffer, briefOfPicked, inFrontOf, merged, whyEmpty, type Shown } from '../notes/aim.ts'

/**
 * Which documents are in front of the reader once the kehikko can say what
 * each container shows and which are picked out, as a table of canvases.
 *
 * The canvas is the one the ask describes: a paper pointing at a paragraph
 * and saying it shows the chapter, a references list showing another file, a
 * journeys container showing refs and no document, and this module showing
 * nothing anybody anchors a note to.
 */

const PARAGRAPH = { path: '/thesis/chapters/3_methods.tex', page: 3, from: 4120, to: 4180, quoted: '' }
const CHAPTER = { path: '/thesis/chapters/3_methods.tex', page: null, from: null, to: null, quoted: '' }
const INTRO = { path: '/thesis/chapters/1_introduction.tex', page: null, from: null, to: null, quoted: '' }

function canvas(picked: string[] = []): Shown[] {
  const is = (id: string) => picked.includes(id)
  return [
    { module: 'roadmap.paper', selected: is('roadmap.paper'), documents: [PARAGRAPH, CHAPTER] },
    { module: 'roadmap.references', selected: is('roadmap.references'), documents: [INTRO] },
    { module: 'roadmap.journeys', selected: is('roadmap.journeys'), documents: [] },
    { module: 'roadmap.notes', selected: is('roadmap.notes'), documents: [] },
  ]
}

describe('nothing picked out leaves the page following the reader', () => {
  test('nothing narrows, no documents are named, and there is no sentence', () => {
    const front = inFrontOf({ containers: canvas(), aim: 'follow' })
    expect(front.narrowed).toBe(false)
    expect(front.documents).toEqual([])
    expect(whyEmpty(front)).toBeNull()
  })

  test('an older host lists no containers, and no control is offered', () => {
    expect(inFrontOf({ containers: [], aim: 'follow' }).narrowed).toBe(false)
    expect(aimOffer([])).toEqual([])
  })
})

describe('some picked out means the documents those show', () => {
  test('one place per document, the narrowest — ticking the paper does not widen to the chapter', () => {
    const front = inFrontOf({ containers: canvas(['roadmap.paper']), aim: 'follow' })
    expect(front.narrowed).toBe(true)
    expect(front.documents).toEqual([PARAGRAPH])
    expect(briefOfPicked(front)).toBe('paper')
    expect(whyEmpty(front)).toBeNull()
  })

  test('two containers, two documents, in the canvas\'s order', () => {
    const front = inFrontOf({ containers: canvas(['roadmap.paper', 'roadmap.references']), aim: 'follow' })
    expect(front.documents).toEqual([PARAGRAPH, INTRO])
    expect(briefOfPicked(front)).toBe('paper and references · 2 documents')
  })

  test('a picked container showing no document is named, and an empty list says why', () => {
    const front = inFrontOf({ containers: canvas(['roadmap.journeys']), aim: 'follow' })
    expect(front.documents).toEqual([])
    expect(front.quiet).toEqual(['roadmap.journeys'])
    expect(whyEmpty(front)).toBe(
      'journeys is picked out and shows no document, so there is no place here for a note to be about.',
    )
    const two = inFrontOf({ containers: canvas(['roadmap.journeys', 'roadmap.notes']), aim: 'follow' })
    expect(whyEmpty(two)).toBe(
      'journeys and notes are picked out and show no document, so there is no place here for a note to be about.',
    )
  })

  test('the way out ignores the picks', () => {
    const front = inFrontOf({ containers: canvas(['roadmap.journeys']), aim: 'all' })
    expect(front.narrowed).toBe(false)
    expect(front.picked).toEqual(['roadmap.journeys'])
    expect(whyEmpty(front)).toBeNull()
  })
})

describe('the control in the header', () => {
  test('one group, following by default, with the count in the label', () => {
    const [group] = aimOffer(canvas(['roadmap.paper']))
    expect(group?.id).toBe(AIM)
    expect(group?.fallback).toBe('follow')
    expect(group?.options[0]?.label).toBe('follow what is picked out (1 of 4 picked out)')
    expect(aimOffer(canvas())[0]?.options[0]?.label).toBe('follow what is picked out (nothing picked out)')
  })

  test('the choice is read leniently, and anything unknown follows', () => {
    expect(aimOf({ [AIM]: 'all' })).toBe('all')
    expect(aimOf({ [AIM]: 'grain' })).toBe('follow')
    expect(aimOf({})).toBe('follow')
    expect(aimOf({ constructor: 'all' } as Record<string, string>)).toBe('follow')
  })
})

describe('several documents merged into one screen', () => {
  const look = (path: string, shown: string[], elsewhere: number, verified = true) => ({
    said: `Every note on ${path}.`,
    scope: { kind: 'document' as const, path },
    shown,
    adrift: [] as string[],
    elsewhere,
    withdrawn: [] as string[],
    verified,
    trouble: null as string | null,
  })

  test('rows are concatenated in document order, counts are added, and one unchecked document unchecks the whole', () => {
    const all = merged([look('/a.tex', ['a1', 'a2'], 1), look('/b.tex', ['b1'], 2, false)])
    expect(all?.shown).toEqual(['a1', 'a2', 'b1'])
    expect(all?.elsewhere).toBe(3)
    expect(all?.verified).toBe(false)
    expect(all?.scope).toEqual({ kind: 'document', path: '/a.tex' })
    expect(all?.said).toBe('Every note on /a.tex. Every note on /b.tex.')
  })

  test('nothing to merge is null rather than an empty screen pretending to be a document', () => {
    expect(merged([])).toBeNull()
  })
})
