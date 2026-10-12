import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

import { mapSource, type Mapped } from './anchor.ts'

/**
 * Opening a document, and the rules about which ones may be opened.
 *
 * ## Why this program reads other people's files at all
 *
 * It reads exactly one thing and for exactly one reason: to ask whether a
 * note's quoted words are still where the note says they are. That is the
 * question `notes/anchor.ts` exists to answer and it cannot be answered from
 * the store — the store holds what was true when the note was written, and the
 * whole problem is that somebody has been editing since.
 *
 * Nothing is written and no byte of any document ever leaves this process.
 * What it read is HELD, in memory, until the file changes — see `held` below
 * for why that had to stop being "nothing is cached", and for the bound on it.
 * What crosses a door is a verdict — still there, moved
 * this far, gone — and the note's OWN quote, which the note already held. That
 * boundary is deliberate: a program that answered "what is at bytes 400–460 of
 * that file" would be a file-reading service on loopback with a notes app
 * bolted to it, and every confinement rule below would be the only thing
 * between it and anything on this machine that found the port.
 *
 * ## The confinement, and why the roots are what they are
 *
 * A note's `path` arrives from somewhere else: relayed by a host from a module
 * that was told it by a page. It is a string a stranger's program chose. So it
 * is resolved, symlinks are followed, and the result has to sit inside a root:
 *
 * - `NOTES_ROOTS`, colon-separated, when somebody running this has said so.
 * - Otherwise the `projectPath` on the note itself — which is the host's own
 *   knowledge of where the reader's project is, and the one directory this app
 *   can be reasonably sure it was invited into.
 *
 * A path outside every root is not an error and does not throw. It is
 * `unverified`: this app has no opinion about that anchor, says so on the row,
 * and shows the note. Refusing to show the note would punish a reader for a
 * configuration they cannot see; claiming the anchor is fine would be the lie
 * this module exists to avoid.
 *
 * `realpathSync` rather than string comparison, because `/root/../etc/passwd`
 * resolves inside no root and a symlink at `/root/link -> /etc` defeats every
 * check that only looks at the text. Both halves are realpathed, so a root
 * that is itself a symlink still matches what is under it.
 *
 * ## The size bound
 *
 * A document is read whole in order to search it, so a bound is a bound on this
 * process's memory rather than hygiene. Four megabytes is far larger than any
 * `.tex` chapter and far smaller than something worth reading into a container. Past
 * it, the answer is `unverified` — which is true, and is the same word the
 * unreadable case already uses.
 */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024

/** The roots somebody running this has named, if any. */
export function namedRoots(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.NOTES_ROOTS
  if (!raw) return []
  return raw
    .split(':')
    .map((one) => one.trim())
    .filter((one) => one.length > 0 && isAbsolute(one))
}

/** Whether `path` is inside `root`, with symlinks followed on both sides. */
function inside(path: string, root: string): boolean {
  try {
    const real = realpathSync(path)
    const realRoot = realpathSync(root)
    return real === realRoot || real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)
  } catch {
    return false
  }
}

/**
 * The documents this process has already read, and each one mapped.
 *
 * ## Why anything is kept at all
 *
 * This file used to say "nothing is cached", and the cost of that was measured
 * on a real project: thirty-eight notes on three PDFs, the largest of them 1.16
 * million characters of text. Every read of the notes read every document again
 * and mapped it again — once per NOTE, which `notes/anchor.ts` has stopped doing
 * — and took 2.3 seconds on a server with one thread. Picking a part in the host
 * fires several reads; they queued, the manifest went unanswered past the host's
 * 2500 ms, and the host drew "It is not running" over a module that was merely
 * busy answering the same question five times.
 *
 * A document is a function of the file, and a mapped document is a function of
 * the document. So both are kept, and the question a read asks the disk is one
 * `stat`.
 *
 * ## What "the same file" means
 *
 * The path as resolved, its size, its inode, and BOTH its times. `mtime` alone
 * is not enough and `notes/ingest.ts` says why: it goes backwards when a file is
 * restored from a copy. `ctime` cannot be set and moves on every write, so a
 * same-size edit with a forged or coarse `mtime` is still seen. Anything
 * different is a different file: it is read again and what was held is dropped.
 *
 * ## The bound
 *
 * Counted in characters of text held, because that is what the memory is
 * proportional to — a held document costs its text plus eight bytes of offsets
 * per character once mapped, roughly ten bytes a character. Six million
 * characters is therefore about sixty megabytes at the very worst, and holds the
 * project above nearly three times over. The least recently used go first. One
 * document can never exceed it: `MAX_SOURCE_BYTES` is four megabytes, which is
 * at most four million characters.
 *
 * ## It is not a way around the fence
 *
 * Keyed by path and shared by every reader in the process — and reached only
 * AFTER a reader has put the path through its own roots, on every read. A
 * reader for another project is refused at `inside()` exactly as before and
 * never gets as far as asking what is held. In memory, per process, never
 * written: a restarted process reading each document once more is correct.
 */
interface Held {
  size: number
  ino: number
  mtimeMs: number
  ctimeMs: number
  text: string
  mapped: Mapped | null
}

export const MAX_HELD_CHARS = 6_000_000
export const MAX_HELD_FILES = 64

/* Insertion order is recency: a hit is deleted and set again. */
const held = new Map<string, Held>()
let heldChars = 0
let limits = { chars: MAX_HELD_CHARS, files: MAX_HELD_FILES }

function drop(key: string): void {
  const one = held.get(key)
  if (!one) return
  heldChars -= one.text.length
  held.delete(key)
}

function keep(key: string, one: Held): void {
  drop(key)
  held.set(key, one)
  heldChars += one.text.length
  /* Oldest first, and never the one just put in: a read must be able to answer
     from what it read even when that alone is the whole budget. */
  for (const oldest of held.keys()) {
    if (heldChars <= limits.chars && held.size <= limits.files) break
    if (oldest === key) break
    drop(oldest)
  }
}

/** Forget every document held. For tests, and for nothing else: a changed file is noticed without it. */
export function forgetSources(): void {
  held.clear()
  heldChars = 0
}

/** What is held, for the tests that hold the bound to its word. `paths` is oldest first. */
export function heldSources(): { files: number; chars: number; mapped: number; paths: string[] } {
  let mapped = 0
  for (const one of held.values()) if (one.mapped) mapped++
  return { files: held.size, chars: heldChars, mapped, paths: [...held.keys()] }
}

/** Set the bound, and get back a function that puts the old one back. For tests. */
export function boundSources(to: { chars?: number; files?: number }): () => void {
  const before = limits
  limits = { chars: to.chars ?? before.chars, files: to.files ?? before.files }
  return () => {
    limits = before
  }
}

/**
 * A reader: a path to its text, or null — and the same text mapped, kept.
 *
 * `map` is what `resolveAll` in `notes/anchor.ts` is handed, and it takes the
 * text as well as the path so that it can only ever answer about the text the
 * caller is actually holding: if the file changed between the read and the map,
 * what is held is no longer that text, and the text in hand is mapped afresh
 * rather than a newer document's offsets being reported against it.
 */
export interface Reader {
  (path: string): string | null
  map: (path: string, source: string) => Mapped
}

/**
 * A reader for the documents one project's notes point into.
 *
 * Returns `null` for every path it may not or cannot open, which
 * `resolveAnchor` reads as `unverified` — see the essay there for why that is
 * an answer rather than a failure.
 *
 * Built per project rather than being one global function, because the default
 * root is the project's own directory and a reader shared across projects would
 * be one that could open another project's files on the strength of this one's
 * invitation.
 */
export function readerFor(projectPath: string | null, env: Record<string, string | undefined> = process.env): Reader {
  const roots = namedRoots(env)
  if (!roots.length && projectPath && isAbsolute(projectPath)) roots.push(projectPath)

  const read = (path: string): string | null => {
    if (!path || !isAbsolute(path)) return null
    if (!roots.length) return null
    const full = resolve(path)
    if (!roots.some((root) => inside(full, root))) {
      /* A file that is not there fails the fence too — `realpath` has nothing to
         resolve — and whatever was held of it is of no further use to anybody. */
      if (held.has(full) && !existsSync(full)) drop(full)
      return null
    }
    try {
      const stat = statSync(full)
      if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) {
        drop(full)
        return null
      }
      const had = held.get(full)
      if (
        had
        && had.size === stat.size
        && had.ino === stat.ino
        && had.mtimeMs === stat.mtimeMs
        && had.ctimeMs === stat.ctimeMs
      ) {
        /* Touched, so that what is being read is the last thing to go. */
        held.delete(full)
        held.set(full, had)
        return had.text
      }
      const text = readFileSync(full, 'utf8')
      keep(full, { size: stat.size, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, text, mapped: null })
      return text
    } catch {
      drop(full)
      return null
    }
  }

  const map = (path: string, source: string): Mapped => {
    const had = held.get(resolve(path))
    if (!had || had.text !== source) return mapSource(source)
    had.mapped ??= mapSource(source)
    return had.mapped
  }

  return Object.assign(read, { map })
}

/** A reader that opens nothing, for the tests and for a store with no project on it. */
export const readsNothing = (): string | null => null
