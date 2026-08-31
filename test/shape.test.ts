import { describe, expect, test } from 'bun:test'

import { fingerprint, normalise, sourceOf, type Note } from '../notes/shape.ts'

/**
 * The pure rules everything else is built on: what a note carries about itself,
 * and what "the same words" means.
 *
 * There used to be a `projectKey` here and four tests about which pile a note
 * belonged to. Both went with the partition: a note lives in
 * `<project>/.kehikot/notes/notes.json`, so the file it is in says which project it
 * is and there is no key left to compute. Where that is asserted now is
 * `test/store.test.ts`, against the filesystem — which is the thing actually
 * making the claim.
 */

describe('what a note carries about itself', () => {
  /* Asserted rather than assumed, because this is the one thing that would
     quietly come back. Somebody adds a project field "for provenance", the
     store has two sources for one fact again, and the copy inside the file is
     the one that is wrong the moment anybody moves it. */
  test('says nothing about which project it is in, because the file it is in does', () => {
    const one: Note = {
      id: 'n1',
      path: '/w/thesis/chapters/bridge.tex',
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
    }
    expect(Object.keys(one)).not.toContain('project')
    expect(Object.keys(one)).not.toContain('projectPath')
  })

  /* An old record's silence and an explicit null must not come out as two
     different things anywhere, which is why nothing reads `.source` directly. */
  test('a note written before provenance existed reads as one somebody typed', () => {
    expect(sourceOf({ source: undefined })).toBeNull()
    expect(sourceOf({ source: null })).toBeNull()
  })
})

describe('what counts as the same words', () => {
  test('whitespace is collapsed, so a selection spanning a line break still matches its source', () => {
    expect(normalise('A module\n  is one\torigin.')).toBe('A module is one origin.')
    expect(normalise('  padded  ')).toBe('padded')
  })

  test('case is NOT folded, because two sentences differing by case are two sentences', () => {
    expect(normalise('The Host Decides')).not.toBe(normalise('the host decides'))
  })

  test('punctuation is NOT stripped, for the same reason', () => {
    expect(normalise('it is nothing.')).not.toBe(normalise('it is nothing'))
  })
})

describe('the fingerprint', () => {
  test('is the same for the same words however they were wrapped', () => {
    expect(fingerprint('A module\nis one origin.')).toBe(fingerprint('A module is one origin.'))
  })

  test('differs for different words, which is all it is ever asked to do', () => {
    expect(fingerprint('one origin')).not.toBe(fingerprint('two origins'))
  })

  test('is stable rather than random, so a store read twice groups the same way', () => {
    expect(fingerprint('anything at all')).toBe(fingerprint('anything at all'))
  })
})
