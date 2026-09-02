import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import { KEHIKOT_DIR } from 'roadmap-module-protocol'

import { resolveAll } from '../notes/anchor.ts'
import { change, notesOf } from '../notes/keep.ts'
import { readerFor } from '../notes/source.ts'
import type { Note } from '../notes/shape.ts'
import { resolved, rootsOf } from '../notes/where.ts'

/**
 * Where a note says its document is.
 *
 * Two things are being tested and they pull in opposite directions, which is
 * why they are in one file. The first is that a note's path is stored relative
 * to the project, so that moving the project does not orphan every anchor in
 * it — the failure that cost fifty-nine hand-rewritten anchors the day before
 * this was written. The second is that relativising did not open a door:
 * `..`, an absolute-looking path and a symlink are exactly the shapes that go
 * wrong when a stored string is joined onto a root, and every refusal that
 * existed before this change has a test here saying it still refuses.
 *
 * Real directories on a real disk throughout, for the reason `store.test.ts`
 * uses them: half of what is under test is symlinks and `realpath`, and neither
 * of those has a meaning in a stub.
 */

const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-where-'))
const project = join(home, 'thesis')
const elsewhere = join(home, 'elsewhere')

/** The store file, as `store.ts` decides it. Read by hand, so the file is the assertion. */
function storeFile(root: string): string {
  return join(root, KEHIKOT_DIR, 'notes', 'notes.json')
}

function held(root: string): { notes: Note[] } {
  return JSON.parse(readFileSync(storeFile(root), 'utf8')) as { notes: Note[] }
}

/** A store put on disk by hand, which is the only way to test what a READ does to one. */
function seed(root: string, notes: Partial<Note>[]): void {
  mkdirSync(dirname(storeFile(root)), { recursive: true })
  const full = notes.map((one, at) => ({
    id: `n${at}`,
    path: '',
    page: null,
    from: 0,
    to: 10,
    quoted: 'some words',
    fingerprint: '00000000',
    body: 'a thing somebody thought',
    by: 'a test',
    viaMcp: false,
    at: '2026-01-01T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    replies: [],
    ...one,
  }))
  writeFileSync(storeFile(root), `${JSON.stringify({ version: 1, notes: full }, null, 2)}\n`)
}

const ADD = {
  op: 'add',
  page: null,
  from: null,
  to: null,
  quoted: '',
  body: 'a thing somebody thought',
  by: 'a test',
} as const

function fresh(): void {
  rmSync(project, { recursive: true, force: true })
  rmSync(elsewhere, { recursive: true, force: true })
  mkdirSync(join(project, 'chapters'), { recursive: true })
  mkdirSync(elsewhere, { recursive: true })
  writeFileSync(join(project, 'chapters', 'intro.tex'), 'A first paragraph about the bridge.\n')
  writeFileSync(join(elsewhere, 'secret.tex'), 'Something in another project entirely.\n')
}

beforeEach(fresh)

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('what is stored', () => {
  /* The change itself. The door is handed an absolute path, because that is
     what every door is handed and will go on being handed, and the file holds
     the note's place inside the project rather than its place on this machine. */
  test('an absolute path under the project is written relative to it', () => {
    const out = change(project, { ...ADD, path: join(project, 'chapters', 'intro.tex') })
    expect(out.ok).toBe(true)
    expect(held(project).notes[0]!.path).toBe('chapters/intro.tex')
  })

  /* And nothing above the store sees the change. Every caller in this program —
     the anchor check, the scope, the page, the doors — still gets an absolute
     path, spelled the way the host spells the project. */
  test('and read back absolute, in the project’s own spelling', () => {
    change(project, { ...ADD, path: join(project, 'chapters', 'intro.tex') })
    expect(notesOf(project).notes[0]!.path).toBe(join(project, 'chapters', 'intro.tex'))
  })

  /* A note about a document genuinely outside the project keeps the only path
     that can name it. The invariant this buys is readable off the file: a
     stored path beginning with `/` is one that is not inside this project. */
  test('a path outside the project stays absolute, because nothing else names it', () => {
    const out = change(project, { ...ADD, path: join(elsewhere, 'secret.tex') })
    expect(out.ok).toBe(true)
    expect(held(project).notes[0]!.path).toBe(join(elsewhere, 'secret.tex'))
  })
})

describe('the migration, which happens on read', () => {
  /* The case every store on disk today is in. Nothing has to be run, and the
     note resolves to the same file it always named. */
  test('an absolute path under the project resolves, and turns relative on the next write', () => {
    seed(project, [{ id: 'n1', path: join(project, 'chapters', 'intro.tex') }])
    expect(notesOf(project).notes[0]!.path).toBe(join(project, 'chapters', 'intro.tex'))

    const out = change(project, { op: 'resolve', id: 'n1', done: true, by: 'a test' })
    expect(out.ok).toBe(true)
    expect(held(project).notes[0]!.path).toBe('chapters/intro.tex')
    expect(held(project).notes[0]!.body).toBe('a thing somebody thought')
  })

  test('a relative path is joined onto the project', () => {
    seed(project, [{ path: 'chapters/intro.tex' }])
    expect(notesOf(project).notes[0]!.path).toBe(join(project, 'chapters', 'intro.tex'))
  })

  /*
   * The case there should be none of, and a store is a file people edit.
   *
   * It is left absolute, and the note keeps pointing at the file it was written
   * about. Forcing it relative would resolve it, later, against whatever
   * project opened the store — a note silently attached to a different file,
   * which is the one thing this module refuses above all others.
   */
  test('an absolute path outside the project is kept, and goes on naming its file', () => {
    seed(project, [{ id: 'n1', path: join(elsewhere, 'secret.tex') }])
    expect(notesOf(project).notes[0]!.path).toBe(join(elsewhere, 'secret.tex'))

    change(project, { op: 'resolve', id: 'n1', done: true, by: 'a test' })
    expect(held(project).notes[0]!.path).toBe(join(elsewhere, 'secret.tex'))
  })

  /*
   * The other case there should be none of. A relative path that climbs out of
   * the project is never joined onto it: what comes back is the string somebody
   * typed, which `notes/source.ts` will not open because it is not absolute. So
   * the note is shown, says what it says, and its anchor is unverified — the
   * state this app already has a word for.
   */
  test('a relative path that climbs out is handed back unresolved, never joined', () => {
    seed(project, [{ path: '../elsewhere/secret.tex' }])
    const notes = notesOf(project).notes
    expect(notes[0]!.path).toBe('../elsewhere/secret.tex')
    expect(resolveAll(notes, readerFor(project))[0]!.anchor.state).toBe('unverified')
  })

  /* Four shapes, four answers, and none of the answers is "the note is gone".
     Nothing in this program deletes a note, and a path a program disliked is
     not about to become the first exception. */
  test('nothing is dropped, whichever of the four shapes a stored path is in', () => {
    seed(project, [
      { path: 'chapters/intro.tex' },
      { path: join(project, 'chapters', 'intro.tex') },
      { path: join(elsewhere, 'secret.tex') },
      { path: '../elsewhere/secret.tex' },
    ])
    expect(notesOf(project).notes).toHaveLength(4)
  })

  /* A store whose file has been deleted underneath the notes still migrates.
     Where a note points must not depend on what happens to be on disk — a note
     about a chapter somebody removed is an ordinary thing to hold, and it is
     `unverified`, not un-storable. */
  test('a note about a file that is no longer there migrates like any other', () => {
    seed(project, [{ id: 'n1', path: join(project, 'chapters', 'deleted.tex') }])
    change(project, { op: 'resolve', id: 'n1', done: true, by: 'a test' })
    expect(held(project).notes[0]!.path).toBe('chapters/deleted.tex')
    expect(notesOf(project).notes[0]!.path).toBe(join(project, 'chapters', 'deleted.tex'))
    expect(resolveAll(notesOf(project).notes, readerFor(project))[0]!.anchor.state).toBe('unverified')
  })
})

describe('the fences, which are the same fences', () => {
  /* Refused at the door rather than tolerated, because at the door there is
     still somebody to tell. `../..` names nowhere: the only root it could be
     joined to is the project it has just left. */
  test('a relative path that climbs out is refused when a note is written', () => {
    const out = change(project, { ...ADD, path: '../elsewhere/secret.tex' })
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.error).toContain('climbs out of the project')
    expect(existsSync(storeFile(project))).toBe(false)
  })

  /* The resolution itself, in isolation: there is no input to it that produces
     an absolute path outside the project. */
  test('resolving a stored path can never point outside the project', () => {
    const roots = rootsOf(project)
    for (const escape of ['../../etc/passwd', '..', 'chapters/../../elsewhere/secret.tex', './../x.tex']) {
      const out = resolved(roots, escape)
      expect(isAbsolute(out) && !out.startsWith(`${project}/`)).toBe(false)
    }
  })

  /* And the reader still refuses what it always refused. A relative string is
     not an absolute path, and that check has not moved. */
  test('the reader still opens nothing that is not an absolute path', () => {
    expect(readerFor(project)('../elsewhere/secret.tex')).toBeNull()
    expect(readerFor(project)('chapters/intro.tex')).toBeNull()
  })

  /* The symlink case, which is why the fence realpaths rather than compares
     strings. A relative stored path resolves to an absolute one INSIDE the
     project by every string test, and points out of it once followed. */
  test('a symlink out of the project is still followed before the fence decides', () => {
    symlinkSync(elsewhere, join(project, 'away'))
    const out = change(project, { ...ADD, path: join(project, 'away', 'secret.tex'), from: 0, to: 10, quoted: 'Something' })
    expect(out.ok).toBe(true)
    /* Stored relative, because by every string test it is inside the project. */
    expect(held(project).notes[0]!.path).toBe('away/secret.tex')
    /* And unreadable, because the fence resolves before it compares. */
    expect(readerFor(project)(join(project, 'away', 'secret.tex'))).toBeNull()
    expect(resolveAll(notesOf(project).notes, readerFor(project))[0]!.anchor.state).toBe('unverified')
  })

  /* An absolute path outside the project is taken — callers send them and
     `NOTES_ROOTS` exists for exactly that — and is still not opened by a reader
     that was only invited into the project. */
  test('an absolute path outside the project is stored and still not read', () => {
    change(project, { ...ADD, path: join(elsewhere, 'secret.tex'), from: 0, to: 10, quoted: 'Something' })
    expect(readerFor(project)(join(elsewhere, 'secret.tex'))).toBeNull()
    expect(resolveAll(notesOf(project).notes, readerFor(project))[0]!.anchor.state).toBe('unverified')
  })

  /* The project path's own absoluteness, which is the one argued for in
     `store.ts` and is untouched by any of this. */
  test('a project path that is not absolute is still refused outright', () => {
    const out = change('thesis', { ...ADD, path: 'chapters/intro.tex' })
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.error).toContain('not an absolute path')
  })

  /* And a `.kehikot` pointing out of the project still takes nothing with it. */
  test('a .kehikot that resolves outside the project is still refused', () => {
    symlinkSync(elsewhere, join(project, KEHIKOT_DIR))
    const out = change(project, { ...ADD, path: join(project, 'chapters', 'intro.tex') })
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.error).toContain('outside the project it claims to be inside')
  })
})

/**
 * The store this change was made for: sixty-two real notes, every one of them
 * stored with an absolute path, most of them pointing into
 * `.kehikot/paper/thesis/`.
 *
 * A COPY, always — the real file is somebody's work and nothing here writes
 * near it. The copy is placed in a temporary project and its paths are
 * re-rooted onto that project, still absolute, so the fixture is the situation
 * the real store is in rather than a paraphrase of it.
 *
 * Skipped rather than failed where the store is not on the machine, because
 * this is the one test in the suite that depends on a file outside the
 * repository, and a suite that goes red on a colleague's laptop is a suite
 * nobody trusts.
 */
const REAL = '/Users/jaakkorajala/Claude/Projects/CS-DEGREE/05_drafts/thesis_latex'
const REAL_STORE = join(REAL, KEHIKOT_DIR, 'notes', 'notes.json')
const haveReal = existsSync(REAL_STORE)

/** The real notes, re-rooted onto a fresh copy of the project they are about. */
function mirror(root: string): Note[] {
  const original = (JSON.parse(readFileSync(REAL_STORE, 'utf8')) as { notes: Note[] }).notes
  const rerooted = original.map((one) => {
    if (!one.path.startsWith(`${REAL}/`)) return one
    const rel = one.path.slice(REAL.length + 1)
    const to = join(root, rel)
    if (!existsSync(to) && existsSync(one.path)) {
      mkdirSync(dirname(to), { recursive: true })
      cpSync(one.path, to)
    }
    return { ...one, path: to }
  })
  mkdirSync(dirname(storeFile(root)), { recursive: true })
  writeFileSync(storeFile(root), `${JSON.stringify({ version: 1, notes: rerooted }, null, 2)}\n`)
  return original
}

/** The fields a migration is not allowed to touch, per note. */
function skeleton(notes: Note[]): Record<string, unknown>[] {
  return notes
    .map((one) => ({ id: one.id, from: one.from, to: one.to, quoted: one.quoted, body: one.body }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

describe.skipIf(!haveReal)('the real store, on a copy', () => {
  test('every one of the sixty-two survives the round trip, and its path still names its file', () => {
    const root = mkdtempSync(join(home, 'real-'))
    const original = mirror(root)
    expect(original.length).toBe(62)

    /* Read: absolute paths, unchanged, every one of them naming a file that is
       there. Nothing has been written yet — reading a project does not change it. */
    const first = notesOf(root).notes
    expect(skeleton(first)).toEqual(skeleton(original))
    for (const one of first) expect(existsSync(one.path)).toBe(true)

    /* One write, which is what migrates the file. Resolved and reopened, so the
       store ends where it began on everything except the paths. */
    const id = first[0]!.id
    expect(change(root, { op: 'resolve', id, done: true, by: 'a test' }).ok).toBe(true)
    expect(change(root, { op: 'resolve', id, done: false, by: 'a test' }).ok).toBe(true)

    const after = held(root).notes
    expect(after).toHaveLength(62)
    expect(after.every((one) => !isAbsolute(one.path))).toBe(true)
    expect(skeleton(after)).toEqual(skeleton(original))

    /* And read back: the same absolute paths as before the migration, still
       naming files that are there. */
    const again = notesOf(root).notes
    expect(again.map((one) => one.path).sort()).toEqual(first.map((one) => one.path).sort())
    /* The same file, and not merely a file. Each note's path is turned back
       into the real one it came from and the bytes are compared, because
       "resolves to something that exists" would pass for a migration that
       pointed every note at the same wrong chapter. */
    for (const one of again) {
      expect(existsSync(one.path)).toBe(true)
      expect(readFileSync(one.path, 'utf8')).toBe(readFileSync(join(REAL, one.path.slice(root.length + 1)), 'utf8'))
    }
  })

  /*
   * The whole justification for the work.
   *
   * The project moves — which is what is about to happen to the real one — and
   * nothing rewrites anything. The bytes of the store are compared before and
   * after, because "every note still resolves" is only interesting if it is
   * true of the file as it stands rather than of a file something quietly
   * repaired.
   */
  test('and after the project moves, every note resolves with nothing rewritten', () => {
    const root = mkdtempSync(join(home, 'move-from-'))
    const original = mirror(root)
    const id = original[0]!.id
    change(root, { op: 'resolve', id, done: true, by: 'a test' })
    change(root, { op: 'resolve', id, done: false, by: 'a test' })

    const moved = join(home, 'somewhere', 'quite', 'else')
    mkdirSync(dirname(moved), { recursive: true })
    renameSync(root, moved)

    const before = readFileSync(storeFile(moved), 'utf8')
    const notes = notesOf(moved).notes
    expect(notes).toHaveLength(62)
    expect(skeleton(notes)).toEqual(skeleton(original))
    for (const one of notes) {
      expect(one.path.startsWith(`${moved}/`)).toBe(true)
      expect(existsSync(one.path)).toBe(true)
    }
    expect(readFileSync(storeFile(moved), 'utf8')).toBe(before)

    /* The anchors are the point of the notes, and they are checked against the
       files at their new home. Not one of them is adrift for having moved. */
    process.env.NOTES_ROOTS = moved
    const anchors = resolveAll(notes, readerFor(moved))
    process.env.NOTES_ROOTS = ''
    expect(anchors.every((one) => one.anchor.state !== 'unverified')).toBe(true)
  })
})
