import { describe, expect, test } from 'bun:test'

import { mapSource, resolveAnchor, resolveAll } from '../notes/anchor.ts'
import type { Note } from '../notes/shape.ts'

/**
 * The decision this module exists to make, tested without a disk.
 *
 * `resolveAnchor` is handed the text, so every case below is an edit somebody
 * could make to a `.tex` file, written out in full. That is the point of the
 * function taking text rather than a path: the interesting failures here are
 * about what an edit does to an offset, and none of them need a filesystem to
 * demonstrate.
 */

const SOURCE = [
  '\\chapter{The bridge}',
  '',
  'A module is one origin or it is nothing. The protocol refuses a manifest',
  'whose entry points anywhere but the origin that served it.',
  '',
  'Every field is a thing somebody else\'s program chose.',
  '',
].join('\n')

/** Where "A module is one origin" actually sits in the source above. */
const FROM = SOURCE.indexOf('A module is one origin')
const TO = FROM + 'A module is one origin or it is nothing.'.length

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    path: '/w/thesis/chapters/bridge.tex',
    page: 3,
    from: FROM,
    to: TO,
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

describe('normalising the source keeps a byte offset for every character', () => {
  test('a run of whitespace becomes one space, remembered at its first byte', () => {
    const mapped = mapSource('a\n\n  b')
    expect(mapped.text).toBe('a b')
    expect(mapped.startsAt[0]).toBe(0)
    expect(mapped.startsAt[1]).toBe(1)
    expect(mapped.startsAt[2]).toBe(5)
  })

  test('trailing whitespace is dropped, so a file ending in a newline compares equal', () => {
    expect(mapSource('hello\n').text).toBe('hello')
    expect(mapSource('  hello  ').text).toBe('hello')
  })

  test('a multi-byte character counts as its own width, so offsets stay bytes', () => {
    /* "é" is two bytes in UTF-8; the character after it must start at byte 2. */
    const mapped = mapSource('éx')
    expect(mapped.startsAt[0]).toBe(0)
    expect(mapped.startsAt[1]).toBe(2)
  })
})

describe('an anchor that still holds', () => {
  test('says so, and reports the offsets it was given', () => {
    const anchor = resolveAnchor(note(), SOURCE)
    expect(anchor.state).toBe('exact')
    expect(anchor.from).toBe(FROM)
    expect(anchor.to).toBe(TO)
    expect(anchor.drifted).toBe(0)
  })

  test('a passage broken across lines in the source still matches its rendered quote', () => {
    /* The reader selected two rendered lines; the file has a newline in the
       middle of them. Demanding byte equality here would call every multi-line
       selection adrift the instant it was written. */
    const quoted = 'The protocol refuses a manifest whose entry points anywhere'
    const from = SOURCE.indexOf('The protocol refuses')
    const to = SOURCE.indexOf('but the origin that served')
    expect(resolveAnchor(note({ quoted, from, to }), SOURCE).state).toBe('exact')
  })
})

describe('an anchor whose document was edited above it', () => {
  const edited = `\\section{Added later}\n\nA paragraph nobody had written yet.\n\n${SOURCE}`

  test('is MOVED, not adrift and not silently fine', () => {
    const anchor = resolveAnchor(note(), edited)
    expect(anchor.state).toBe('moved')
    expect(anchor.from).toBeGreaterThan(FROM)
    expect(anchor.drifted).toBe((anchor.from as number) - FROM)
    expect(anchor.said).toContain('MOVED')
  })

  test('reports where the words ARE, so anything scoping by range finds them', () => {
    const anchor = resolveAnchor(note(), edited)
    const at = edited.slice(anchor.from as number, anchor.to as number)
    expect(at).toBe('A module is one origin or it is nothing.')
  })

  test('nothing is written back — the note keeps the offsets it was stored with', () => {
    const one = note()
    resolveAnchor(one, edited)
    expect(one.from).toBe(FROM)
    expect(one.to).toBe(TO)
  })

  test('a repeated phrase re-anchors to the nearest place, not the first', () => {
    /* The same sentence twice: once shifted a little by an edit above it, and
       once again in an appendix a long way down. A note that jumped to the
       appendix would be the confidently-wrong answer this file exists to
       refuse, so the nearer one wins and the rule is stated rather than left to
       whichever `indexOf` happened to find first. */
    const twice = `${edited}\n\n\\appendix\n\nA module is one origin or it is nothing.\n`
    const anchor = resolveAnchor(note(), twice)
    expect(anchor.state).toBe('moved')
    const appendix = twice.lastIndexOf('A module is one origin')
    expect(anchor.from).toBeLessThan(appendix)
    expect(anchor.from).toBe(edited.indexOf('A module is one origin'))
  })
})

describe('an anchor whose passage is gone', () => {
  const rewritten = SOURCE.replace('A module is one origin or it is nothing.', 'A module has exactly one origin.')

  test('is ADRIFT, and refuses to point anywhere at all', () => {
    const anchor = resolveAnchor(note(), rewritten)
    expect(anchor.state).toBe('adrift')
    expect(anchor.from).toBe(null)
    expect(anchor.to).toBe(null)
    expect(anchor.said).toContain('ADRIFT')
  })

  test('a near-miss is not a match — case and punctuation are not folded', () => {
    const shouted = SOURCE.replace('A module is one origin', 'A MODULE IS ONE ORIGIN')
    expect(resolveAnchor(note(), shouted).state).toBe('adrift')
  })
})

describe('an anchor this app could not check', () => {
  test('is UNVERIFIED when the document could not be read, and does not claim health', () => {
    const anchor = resolveAnchor(note(), null)
    expect(anchor.state).toBe('unverified')
    /* It keeps the stored offsets, because they are the best thing available —
       but says plainly that it is showing the note's own words. */
    expect(anchor.from).toBe(FROM)
    expect(anchor.said).toContain('could not read')
  })

  test('is UNVERIFIED when the note was stored with no words to check', () => {
    expect(resolveAnchor(note({ quoted: '' }), SOURCE).state).toBe('unverified')
  })
})

describe('a note written with nothing selected', () => {
  test('is UNRANGED — it is about a page and has no range that could drift', () => {
    const anchor = resolveAnchor(note({ from: null, to: null, quoted: '' }), SOURCE)
    expect(anchor.state).toBe('unranged')
    expect(anchor.from).toBe(null)
    expect(anchor.said).toContain('page 3')
  })

  test('and says the page is a weak anchor rather than pretending otherwise', () => {
    expect(resolveAnchor(note({ from: null, to: null }), SOURCE).said).toContain('weak anchor')
  })
})

describe('resolving many notes', () => {
  test('reads each document once, however many notes point into it', () => {
    const opened: string[] = []
    resolveAll([note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c', path: '/other.tex' })], (path) => {
      opened.push(path)
      return SOURCE
    })
    expect(opened).toEqual(['/w/thesis/chapters/bridge.tex', '/other.tex'])
  })
})

describe('a note whose range is the wrong LENGTH rather than in the wrong place', () => {
  test('is not described as having moved zero bytes, which reads as a bug in this program', () => {
    /* Found by a probe: a note recorded one byte short of its own passage came
       back "MOVED — the words are still there, 0 bytes earlier", which is a
       sentence nobody can act on. The two ends are reported separately now. */
    const anchor = resolveAnchor(note({ to: TO - 1 }), SOURCE)
    expect(anchor.state).toBe('moved')
    expect(anchor.drifted).toBe(0)
    expect(anchor.said).not.toContain('0 bytes')
    expect(anchor.said).toContain('wrong LENGTH')
    expect(anchor.said).toContain('1 byte later')
    expect(anchor.to).toBe(TO)
  })
})
