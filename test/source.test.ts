import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { namedRoots, readerFor, readsNothing } from '../notes/source.ts'

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
