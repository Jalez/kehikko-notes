import { describe, expect, test } from 'bun:test'

import { fingerprint, normalise, projectKey } from '../notes/shape.ts'

/**
 * The two pure rules everything else is built on: which project a note belongs
 * to, and what "the same words" means.
 */

describe('which project a note belongs to', () => {
  test('the path wins, because a path is an identity and a name is a label', () => {
    expect(projectKey({ project: 'thesis', projectPath: '/w/thesis' })).toBe('path:/w/thesis')
  })

  test('two projects called the same thing in two places are two piles', () => {
    expect(projectKey({ project: 'thesis', projectPath: '/w/a' })).not.toBe(
      projectKey({ project: 'thesis', projectPath: '/w/b' }),
    )
  })

  test('the name is the fallback for a host with no filesystem, which is a real host', () => {
    expect(projectKey({ project: 'thesis', projectPath: null })).toBe('name:thesis')
  })

  test('a note nobody said a project about is its own pile and not merged into anybody’s', () => {
    expect(projectKey({})).toBe('')
    expect(projectKey({ project: '  ', projectPath: '  ' })).toBe('')
    expect(projectKey({})).not.toBe(projectKey({ project: 'thesis' }))
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
