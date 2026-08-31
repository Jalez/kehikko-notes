import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'roadmap-module-protocol'

import { dataFile, makeDir } from '../store.ts'
import { change, notesOf, read } from '../notes/keep.ts'

/**
 * Where a note is written, and everywhere it must refuse to be written.
 *
 * Three things are being tested and only the first is ordinary. That a note
 * lands in `<project>/.kehikot/notes/notes.json` is the feature. The other two are the
 * failures this file exists to prevent: a store that GUESSES a folder when
 * nobody said which project, and a `.kehikot` that turns out to point somewhere
 * else entirely. Both would be silent — the app starts, the page draws, and the
 * notes are in a directory nobody will ever open — which is exactly why they
 * are asserted rather than reasoned about.
 */

const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-store-'))
const project = join(home, 'thesis')
const other = join(home, 'somewhere-else')
const outside = join(home, 'outside')

function fresh(): void {
  rmSync(project, { recursive: true, force: true })
  rmSync(other, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
  mkdirSync(project, { recursive: true })
  mkdirSync(other, { recursive: true })
  mkdirSync(outside, { recursive: true })
}

const NOTE = {
  op: 'add',
  path: join(home, 'thesis', 'main.tex'),
  page: null,
  from: null,
  to: null,
  quoted: '',
  body: 'a thing somebody thought',
  by: 'a test',
} as const

beforeEach(fresh)

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('where a note goes', () => {
  test('into the project it is about, in a folder named after the host', () => {
    const out = change(project, { ...NOTE })
    expect(out.ok).toBe(true)

    const file = join(project, KEHIKOT_DIR, 'notes', 'notes.json')
    expect(existsSync(file)).toBe(true)
    const held = JSON.parse(readFileSync(file, 'utf8')) as { notes: { body: string }[] }
    expect(held.notes).toHaveLength(1)
    expect(held.notes[0]!.body).toBe('a thing somebody thought')
  })

  /* The point of the whole change. Two projects are two files, so there is no
     filter anywhere that could be forgotten and no key that could collide. */
  test('two projects are two files, and neither can see the other', () => {
    change(project, { ...NOTE, body: 'about the thesis' })
    change(other, { ...NOTE, body: 'about something else' })

    expect(notesOf(project).notes.map((one) => one.body)).toEqual(['about the thesis'])
    expect(notesOf(other).notes.map((one) => one.body)).toEqual(['about something else'])
  })

  /* A note has no project field any more: the file it is in says which project
     it belongs to, and a second copy of that fact is the one that goes wrong
     when somebody copies the file. See `notes/shape.ts`. */
  test('records no project on the note itself', () => {
    change(project, { ...NOTE })
    const held = JSON.parse(readFileSync(join(project, KEHIKOT_DIR, 'notes', 'notes.json'), 'utf8')) as {
      notes: Record<string, unknown>[]
    }
    expect(held.notes[0]).not.toHaveProperty('project')
    expect(held.notes[0]).not.toHaveProperty('projectPath')
  })

  test('reading a project nobody has written about is empty, and creates nothing', () => {
    const answer = read(project)
    expect(answer.store.notes).toEqual([])
    expect(answer.trouble).toBeNull()
    expect(answer.nowhere).toBe(false)
    /* The important half: a read must not leave a folder in somebody's
       repository they did not ask for. */
    expect(existsSync(join(project, KEHIKOT_DIR))).toBe(false)
  })
})

describe('no project at all, which is a place a person can be', () => {
  test('reads as empty and NOWHERE, which are not the same fact', () => {
    for (const nothing of [null, undefined, '', '   ']) {
      const answer = read(nothing)
      expect(answer.store.notes).toEqual([])
      expect(answer.nowhere).toBe(true)
      /* Not trouble. Trouble means something was refused; this means nobody
         asked, and a container that drew it in red would be reporting a fault on a
         canvas where nothing is wrong. */
      expect(answer.trouble).toBeNull()
    }
  })

  test('refuses every write, in a sentence that says where notes live', () => {
    const out = change(null, { ...NOTE })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toContain('.kehikot/notes/notes.json')
    expect(out.error).toContain('will not guess')
  })

  /* The failure this whole file is arranged against: a fallback. Nothing may
     appear beside the program, in the working directory, or anywhere else. */
  test('writes nothing anywhere when there is no project', () => {
    change(null, { ...NOTE })
    expect(dataFile(null)).toEqual({ path: null, trouble: null })
    expect(makeDir(null)).toEqual({ dir: null, trouble: null })
    /* Not beside the program, not in the working directory, not in either of
       the projects that happen to exist. There is no folder this could have
       fallen back to, which is the whole design. */
    expect(existsSync(join(process.cwd(), KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(home, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(project, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(other, KEHIKOT_DIR))).toBe(false)
  })

  test('a path that is not a folder on this machine is trouble, and is not the same as nowhere', () => {
    const missing = read(join(home, 'no-such-project'))
    expect(missing.nowhere).toBe(false)
    expect(missing.trouble).toContain('there is no folder at')

    const relative = read('thesis')
    expect(relative.trouble).toContain('not an absolute path')

    const file = join(home, 'a-file')
    writeFileSync(file, 'not a directory')
    expect(read(file).trouble).toContain('is not a folder')
  })
})

describe('the fence, which is realpath and not string comparison', () => {
  /* The case a prefix test misses. `.kehikot` exists, so `mkdirSync` is happy
     and every string here looks right; only resolving it says that a note
     written through it lands in a directory belonging to somebody else. */
  test('refuses a .kehikot that is a symlink out of the project', () => {
    symlinkSync(outside, join(project, KEHIKOT_DIR))

    const where = dataFile(project)
    expect(where.path).toBeNull()
    expect(where.trouble).toContain('outside the project')

    const out = change(project, { ...NOTE })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toContain('outside the project')

    /* And nothing went through it. */
    expect(existsSync(join(outside, 'notes.json'))).toBe(false)
  })

  test('refuses a notes.json that is a symlink out of the project', () => {
    mkdirSync(join(project, KEHIKOT_DIR, 'notes'), { recursive: true })
    const elsewhere = join(outside, 'stolen.json')
    writeFileSync(elsewhere, '{"version":1,"notes":[]}\n')
    symlinkSync(elsewhere, join(project, KEHIKOT_DIR, 'notes', 'notes.json'))

    expect(dataFile(project).trouble).toContain('outside the project')
    const out = change(project, { ...NOTE })
    expect(out.ok).toBe(false)
    expect(readFileSync(elsewhere, 'utf8')).toBe('{"version":1,"notes":[]}\n')
  })

  /* The sibling whose name begins the same. A plain `startsWith` says this is
     inside the project; it is not, and one character is the whole escape. */
  test('is not fooled by a sibling directory whose name merely starts the same', () => {
    const nearly = `${project}-elsewhere`
    mkdirSync(nearly, { recursive: true })
    symlinkSync(nearly, join(project, KEHIKOT_DIR))
    expect(dataFile(project).trouble).toContain('outside the project')
    rmSync(nearly, { recursive: true, force: true })
  })
})

describe('the line the project’s .gitignore gains', () => {
  const ignoreFile = () => join(project, '.gitignore')

  test('is added when the folder is first made, and says what the folder is', () => {
    mkdirSync(join(project, '.git'))
    writeFileSync(ignoreFile(), 'node_modules\n')

    change(project, { ...NOTE })

    const after = readFileSync(ignoreFile(), 'utf8')
    expect(after.startsWith('node_modules\n')).toBe(true)
    expect(after).toContain('.kehikot/')
    expect(after).toContain('Remove these lines to')
  })

  /* Once. A second copy of the block would show up in the user's next diff as
     a change they did not make, in a file they own. */
  test('is not added twice, however many notes are written afterwards', () => {
    mkdirSync(join(project, '.git'))
    writeFileSync(ignoreFile(), 'node_modules\n')

    change(project, { ...NOTE })
    const once = readFileSync(ignoreFile(), 'utf8')
    change(project, { ...NOTE, body: 'a second note' })
    change(project, { ...NOTE, body: 'a third note' })

    expect(readFileSync(ignoreFile(), 'utf8')).toBe(once)
    expect(once.split('.kehikot/')).toHaveLength(2)
  })

  /* Somebody who took the rule out said something. Putting it back on the next
     save would be overruling them every few seconds. */
  test('is not put back after somebody removes it', () => {
    mkdirSync(join(project, '.git'))
    writeFileSync(ignoreFile(), 'node_modules\n')
    change(project, { ...NOTE })

    writeFileSync(ignoreFile(), 'node_modules\n')
    change(project, { ...NOTE, body: 'written after the rule was removed' })

    expect(readFileSync(ignoreFile(), 'utf8')).toBe('node_modules\n')
  })

  test('a project with no repository anywhere above it gets no .gitignore at all', () => {
    change(project, { ...NOTE })
    expect(existsSync(join(project, KEHIKOT_DIR, 'notes', 'notes.json'))).toBe(true)
    expect(existsSync(ignoreFile())).toBe(false)
    expect(existsSync(join(project, '.git'))).toBe(false)
  })

  test('a repository with no .gitignore gets one holding only this', () => {
    mkdirSync(join(project, '.git'))
    makeDir(project)
    expect(readFileSync(ignoreFile(), 'utf8')).toContain('.kehikot/')
  })

  /*
   * The case this whole rule was rewritten for. The thesis holding all 58 notes
   * is at `…/CS-DEGREE/05_drafts/thesis_latex`: no `.git` of its own, several
   * directories inside one. A check for `<project>/.git` alone reads that as
   * "not a repository", writes no rule, and puts `.kehikot/` into somebody's
   * `git status` — the exact pollution the user asked to avoid, in the one
   * project where it matters most.
   */
  test('finds the repository above the project, and writes the file AT the project', () => {
    const repo = join(home, 'a-repository')
    const deep = join(repo, '05_drafts', 'thesis_latex')
    mkdirSync(join(repo, '.git'), { recursive: true })
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(repo, '.gitignore'), 'build/\n')

    change(deep, { ...NOTE })

    /* At the project, because git honours a `.gitignore` in any directory and
       this folder is under this project rather than under every sibling of it.
       Appending five levels up would be a much larger edit to somebody's
       repository than the situation calls for. */
    expect(readFileSync(join(deep, '.gitignore'), 'utf8')).toContain('.kehikot/')
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('build/\n')

    rmSync(repo, { recursive: true, force: true })
  })

  /* In a worktree and in a submodule, `.git` is a FILE holding a pointer. A
     check that demanded a directory would read an ordinary checkout as "not a
     repository" and quietly stop ignoring anything. */
  test('a .git that is a file, as in a worktree, still counts as a repository', () => {
    writeFileSync(join(project, '.git'), 'gitdir: /somewhere/else/.git/worktrees/x\n')
    change(project, { ...NOTE })
    expect(readFileSync(ignoreFile(), 'utf8')).toContain('.kehikot/')
  })
})
