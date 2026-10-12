import { describe, expect, test } from 'bun:test'

import { isSpace, mapSource, resolveAnchor, resolveAll, type Mapped } from '../notes/anchor.ts'
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

/**
 * The map as it was first written: one character at a time, asked of a regular
 * expression, into three growing arrays. Kept HERE, as the definition the fast
 * one is held to — the rewrite was for speed and must not have moved one offset.
 */
function mapSlowly(source: string): { text: string; startsAt: number[]; endsAt: number[] } {
  const bytesOf = (at: number): number => {
    const code = source.charCodeAt(at)
    if (code < 0x80) return 1
    if (code < 0x800) return 2
    if (code >= 0xd800 && code <= 0xdfff) return 2
    return 3
  }
  const out: string[] = []
  const startsAt: number[] = []
  const endsAt: number[] = []
  let byte = 0
  let pendingSpace = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string
    const width = bytesOf(i)
    if (/\s/.test(char)) {
      if (out.length && !pendingSpace) {
        pendingSpace = true
        out.push(' ')
        startsAt.push(byte)
        endsAt.push(byte + width)
      } else if (pendingSpace) {
        endsAt[endsAt.length - 1] = byte + width
      }
      byte += width
      continue
    }
    pendingSpace = false
    out.push(char)
    startsAt.push(byte)
    endsAt.push(byte + width)
    byte += width
  }
  if (out.length && out[out.length - 1] === ' ') {
    out.pop()
    startsAt.pop()
    endsAt.pop()
  }
  return { text: out.join(''), startsAt, endsAt }
}

describe('mapping a document quickly is mapping it the same', () => {
  test('whitespace is exactly what a regular expression calls whitespace, for every code unit there is', () => {
    const wrong: number[] = []
    for (let code = 0; code <= 0xffff; code++) {
      if (isSpace(code) !== /\s/.test(String.fromCharCode(code))) wrong.push(code)
    }
    expect(wrong).toEqual([])
  })

  test('the same text and the same offsets as the map it replaced, on anything a file can hold', () => {
    /* A seeded generator, so a failure is the same failure twice. */
    let seed = 0x2f6e2b1
    const next = (below: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % below
    }
    const pieces = ['a', 'Z', '{', '\\', ' ', '  ', '\n', '\r\n', '\t', '\u00a0', '\u2028', '\ufeff', 'é', 'ä', '€', '中', '😀', '\ud83d', '\ufffd', 'word', '%']
    const cases = ['', ' ', '\n\n', 'a', ' a ', 'a\n', '\n a\n\n b \n', '😀 😀', 'é\u00a0é']
    for (let n = 0; n < 400; n++) {
      let made = ''
      for (let i = next(60); i > 0; i--) made += pieces[next(pieces.length)]
      cases.push(made)
    }
    for (const source of cases) {
      const fast = mapSource(source)
      const slow = mapSlowly(source)
      expect(fast.text).toBe(slow.text)
      expect(Array.from(fast.startsAt)).toEqual(slow.startsAt)
      expect(Array.from(fast.endsAt)).toEqual(slow.endsAt)
      /* And the bytes are real ones: every kept character starts where UTF-8 puts it. */
      expect(fast.text.length).toBe(fast.startsAt.length)
    }
  })

  test('the offsets it reports are offsets into the UTF-8 file', () => {
    const source = 'Zoë wrote:\n  “the €5 fee” 😀\n'
    const bytes = Buffer.from(source, 'utf8')
    const mapped = mapSource(source)
    const at = mapped.text.indexOf('€5 fee')
    const from = mapped.startsAt[at] as number
    const to = mapped.endsAt[at + '€5 fee'.length - 1] as number
    expect(bytes.subarray(from, to).toString('utf8')).toBe('€5 fee')
  })

  test('a note deep in a long document is verified where it stands', () => {
    const filler = 'Lorem ipsum dolor sit amet, consectetur.\n'.repeat(5000)
    const long = `${filler}${SOURCE}${filler}`
    const shift = Buffer.byteLength(filler)
    const there = resolveAnchor(note({ from: FROM + shift, to: TO + shift }), long)
    expect(there.state).toBe('exact')
    const drifted = resolveAnchor(note({ from: FROM + shift - 41, to: TO + shift - 41 }), long)
    expect(drifted).toMatchObject({ state: 'moved', from: FROM + shift, to: TO + shift, drifted: 41 })
  })
})

describe('a document is mapped once, however many notes point into it', () => {
  test('twenty notes on one document and one on another: two maps, not twenty-one', () => {
    const mappedPaths: string[] = []
    const many = Array.from({ length: 20 }, (_, i) => note({ id: `n${i}` }))
    const out = resolveAll([...many, note({ id: 'other', path: '/other.tex' })], () => SOURCE, (path, source) => {
      mappedPaths.push(path)
      return mapSource(source)
    })
    expect(mappedPaths).toEqual(['/w/thesis/chapters/bridge.tex', '/other.tex'])
    expect(out.map((one) => one.anchor.state)).toEqual(Array(21).fill('exact'))
  })

  test('and says of each note exactly what resolving it alone says', () => {
    const edited = `A paragraph somebody added.\n\n${SOURCE}`
    const notes = [
      note({ id: 'moved' }),
      note({ id: 'gone', quoted: 'words that were never here' }),
      note({ id: 'page', from: null, to: null, quoted: '' }),
      note({ id: 'bare', quoted: '   ' }),
      note({ id: 'short', to: TO - 1 }),
      note({ id: 'unread', path: '/cannot/open.tex' }),
    ]
    const read = (path: string) => (path === '/cannot/open.tex' ? null : edited)
    const together = resolveAll(notes, read)
    expect(together.map((one) => one.anchor)).toEqual(notes.map((one) => resolveAnchor(one, read(one.path))))
    expect(together.map((one) => one.anchor.state)).toEqual(['moved', 'adrift', 'unranged', 'unverified', 'moved', 'unverified'])
  })

  test('a document with nothing on it but whole-page notes is never mapped at all', () => {
    let maps = 0
    resolveAll([note({ from: null, to: null, quoted: '' }), note({ id: 'b', quoted: '' })], () => SOURCE, (_path, source) => {
      maps++
      return mapSource(source)
    })
    expect(maps).toBe(0)
  })

  test('a map handed over is used as it stands', () => {
    const mapped: Mapped = mapSource(SOURCE)
    expect(resolveAnchor(note(), mapped)).toEqual(resolveAnchor(note(), SOURCE))
  })
})
