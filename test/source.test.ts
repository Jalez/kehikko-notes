import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAll } from '../notes/anchor.ts'
import type { Note } from '../notes/shape.ts'
import { boundSources, forgetSources, heldSources, namedRoots, readerFor, readsNothing } from '../notes/source.ts'

/**
 * Which files this app will open, and the much longer list of ones it will not.
 *
 * A note's `path` arrives from somewhere else: relayed by a host from a module
 * that was told it by a page. It is a string a stranger's program chose, and
 * the only reason this program opens anything at all is to check an anchor. So
 * every refusal below is a refusal to open something, and every one of them
 * answers `null`, which the anchor reads as "unchecked" rather than as an
 * error.
 */

const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-src-'))
const project = join(home, 'thesis')
const secrets = join(home, 'secrets')
mkdirSync(join(project, 'chapters'), { recursive: true })
mkdirSync(secrets, { recursive: true })

const CHAPTER = join(project, 'chapters', 'bridge.tex')
writeFileSync(CHAPTER, 'A module is one origin.\n')
writeFileSync(join(secrets, 'keys.txt'), 'not for you\n')

afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('the roots somebody named', () => {
  test('are colon-separated and absolute, and anything relative is dropped', () => {
    expect(namedRoots({ NOTES_ROOTS: `${project}:./nope:${secrets}` })).toEqual([project, secrets])
  })

  test('unset is no roots, which means nothing is opened and every anchor is unchecked', () => {
    expect(namedRoots({})).toEqual([])
    expect(readerFor(null, {})('/etc/hosts')).toBe(null)
  })
})

describe('a reader confined to one project', () => {
  const read = readerFor(project, {})

  test('opens a document inside it', () => {
    expect(read(CHAPTER)).toContain('A module is one origin')
  })

  test('refuses one outside it, however ordinary the path looks', () => {
    expect(read(join(secrets, 'keys.txt'))).toBe(null)
    expect(read('/etc/hosts')).toBe(null)
  })

  test('refuses a traversal, because the path is resolved before it is compared', () => {
    expect(read(join(project, 'chapters', '..', '..', 'secrets', 'keys.txt'))).toBe(null)
  })

  test('refuses a symlink that points out of the root, which a string check would have missed', () => {
    const escape = join(project, 'chapters', 'escape.tex')
    symlinkSync(join(secrets, 'keys.txt'), escape)
    expect(escape.startsWith(project)).toBe(true)
    expect(read(escape)).toBe(null)
  })

  test('refuses a relative path outright — a host that sent one meant something it could not have meant', () => {
    expect(read('chapters/bridge.tex')).toBe(null)
  })

  test('refuses a directory, which is not a document', () => {
    expect(read(join(project, 'chapters'))).toBe(null)
  })

  test('refuses a file that is not there, rather than throwing at whoever asked', () => {
    expect(read(join(project, 'chapters', 'never-written.tex'))).toBe(null)
  })
})

describe('a named root overrides the project’s own directory', () => {
  test('so somebody running this can point it at a papers directory elsewhere', () => {
    const read = readerFor(null, { NOTES_ROOTS: project })
    expect(read(CHAPTER)).toContain('A module is one origin')
    expect(read(join(secrets, 'keys.txt'))).toBe(null)
  })

  test('and the project path is NOT added on top of it, so a root is a root', () => {
    const read = readerFor(secrets, { NOTES_ROOTS: project })
    expect(read(join(secrets, 'keys.txt'))).toBe(null)
  })
})

describe('the reader that opens nothing', () => {
  test('is a real reader and answers null for everything', () => {
    expect(readsNothing()).toBe(null)
  })
})

/**
 * What is held between reads, and when it is let go.
 *
 * A read of the notes used to read and map every document again. It keeps them
 * now, so each claim below is one of the three things a cache can get wrong:
 * answering from a file that has changed, growing without end, and handing
 * somebody a document their own roots would have refused.
 */
describe('a document read once is held until its file changes', () => {
  const held = join(project, 'chapters', 'held.tex')
  const WORDS = 'The host decides, and says so.'

  const noteOn = (path: string, quoted: string, from: number): Note => ({
    id: `n-${from}`,
    path,
    page: null,
    from,
    to: from + quoted.length,
    quoted,
    fingerprint: 'x',
    body: 'b',
    by: 'the owner',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
  })

  test('the same text and the SAME map come back on the next read, from any reader allowed to open it', () => {
    forgetSources()
    writeFileSync(held, `${WORDS}\n`)
    const read = readerFor(project, {})
    const text = read(held)!
    const mapped = read.map(held, text)
    expect(mapped.text).toBe(WORDS)
    expect(heldSources()).toMatchObject({ files: 1, chars: text.length, mapped: 1 })

    /* A new reader, as every request builds one. */
    const again = readerFor(project, {})
    expect(again.map(held, again(held)!)).toBe(mapped)
    expect(heldSources().files).toBe(1)
  })

  test('a whole read of the notes maps each document once, and the read after it maps nothing', () => {
    forgetSources()
    writeFileSync(held, `${WORDS}\n`)
    const notes = [noteOn(held, 'The host decides', 0), noteOn(held, 'says so.', 22), noteOn(CHAPTER, 'A module', 0)]
    const first = readerFor(project, {})
    const one = resolveAll(notes, first, first.map)
    expect(one.map((n) => n.anchor.state)).toEqual(['exact', 'exact', 'exact'])
    expect(heldSources()).toMatchObject({ files: 2, mapped: 2 })
    const maps = [first.map(held, first(held)!), first.map(CHAPTER, first(CHAPTER)!)]

    const second = readerFor(project, {})
    expect(resolveAll(notes, second, second.map)).toEqual(one)
    expect([second.map(held, second(held)!), second.map(CHAPTER, second(CHAPTER)!)]).toEqual(maps)
    expect(second.map(held, second(held)!)).toBe(maps[0]!)
  })

  test('an edit is seen on the very next read, and the anchors say what the file says now', () => {
    forgetSources()
    writeFileSync(held, `${WORDS}\n`)
    const read = readerFor(project, {})
    const notes = [noteOn(held, 'The host decides', 0)]
    expect(resolveAll(notes, read, read.map)[0]!.anchor.state).toBe('exact')
    const before = read.map(held, read(held)!)

    writeFileSync(held, `A line added above.\n${WORDS}\n`)
    const after = resolveAll(notes, read, read.map)[0]!.anchor
    expect(after).toMatchObject({ state: 'moved', drifted: 20 })
    expect(read.map(held, read(held)!)).not.toBe(before)
    expect(heldSources().files).toBe(1)
  })

  test('an edit of the SAME LENGTH with the clock put back is still seen', () => {
    forgetSources()
    const then = new Date('2026-01-01T00:00:00.000Z')
    writeFileSync(held, 'The host decides.\n')
    utimesSync(held, then, then)
    const stamp = statSync(held)
    const read = readerFor(project, {})
    expect(read(held)).toBe('The host decides.\n')

    writeFileSync(held, 'The host refuses.\n')
    /* Same size, and `mtime` forced back to what it was: only `ctime` moved. */
    utimesSync(held, then, then)
    expect(statSync(held).size).toBe(stamp.size)
    expect(statSync(held).mtimeMs).toBe(stamp.mtimeMs)
    expect(read(held)).toBe('The host refuses.\n')
  })

  test('the map is for the text in hand: a file that changed between the read and the map is not answered from memory', () => {
    forgetSources()
    writeFileSync(held, 'first words\n')
    const read = readerFor(project, {})
    const first = read(held)!
    writeFileSync(held, 'second words, longer\n')
    expect(read(held)).toBe('second words, longer\n')
    /* Still holding the text read before the edit. */
    expect(read.map(held, first).text).toBe('first words')
  })

  test('a file that goes away, or stops being a document, is let go of', () => {
    forgetSources()
    writeFileSync(held, 'here\n')
    const read = readerFor(project, {})
    expect(read(held)).toBe('here\n')
    rmSync(held)
    expect(read(held)).toBe(null)
    expect(heldSources().files).toBe(0)
  })

  test('what is held is bounded: the least recently read goes first, and the one just read always stays', () => {
    forgetSources()
    const restore = boundSources({ chars: 250, files: 64 })
    try {
      const read = readerFor(project, {})
      const file = (name: string) => join(project, 'chapters', `${name}.tex`)
      for (const name of ['one', 'two', 'three']) writeFileSync(file(name), `${name} `.padEnd(100, 'x'))
      read(file('one'))
      read(file('two'))
      expect(heldSources()).toMatchObject({ files: 2, chars: 200 })
      /* `one` is read again, so `two` is now the oldest. */
      read(file('one'))
      read(file('three'))
      expect(heldSources()).toMatchObject({ files: 2, chars: 200, paths: [file('one'), file('three')] })

      /* One document larger than the whole budget is still answered, alone. */
      writeFileSync(file('huge'), 'y'.repeat(400))
      expect(read(file('huge'))).toHaveLength(400)
      expect(heldSources()).toMatchObject({ files: 1, chars: 400 })
    } finally {
      restore()
    }
  })

  test('and by how many files, whatever their size', () => {
    forgetSources()
    const restore = boundSources({ files: 3 })
    try {
      const read = readerFor(project, {})
      for (let i = 0; i < 6; i++) {
        const path = join(project, 'chapters', `small-${i}.tex`)
        writeFileSync(path, `${i}`)
        read(path)
      }
      expect(heldSources().files).toBe(3)
      expect(heldSources().paths.map((one) => one.slice(-11))).toEqual(['small-3.tex', 'small-4.tex', 'small-5.tex'])
    } finally {
      restore()
    }
  })

  test('holding a document is not an invitation: a reader whose roots refuse it gets nothing', () => {
    forgetSources()
    const key = join(secrets, 'keys.txt')
    const allowed = readerFor(secrets, {})
    expect(allowed(key)).toBe('not for you\n')
    expect(heldSources().files).toBe(1)
    /* Held, and still refused to a reader confined elsewhere. */
    expect(readerFor(project, {})(key)).toBe(null)
    expect(readerFor(null, {})(key)).toBe(null)
  })
})
