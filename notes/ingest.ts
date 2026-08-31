import { readAnnotations } from './annotations.ts'
import { change } from './keep.ts'
import { fingerprint } from './shape.ts'

/**
 * Reading the author's annotations out of a document, and where that happens.
 *
 * ## This module reads the file. Nobody hands it the annotations
 *
 * Paper has a complete LaTeX parser and could post its `comment` blocks and
 * `todo` segments here, and that was rejected: it would make one module's
 * parser this module's data source over a channel neither declares, so the
 * notes on a chapter would exist or not depending on whether somebody happened
 * to have another pane open. The long version is at the top of
 * `annotations.ts`.
 *
 * What this module already does is open files. `notes/source.ts` builds a
 * confined reader per project and `anchor.ts` uses it to check every note's
 * quote against what is on disk. Ingestion is the same act one step earlier —
 * open the file the reader is standing in, and look at it — through the same
 * reader, with the same roots, the same `realpath` fence and the same 4 MB cap.
 * No new way to reach the disk was added and none was needed.
 *
 * ## Why it runs on READ rather than on a button or a tool alone
 *
 * The ask is that the author's `\todo{}`s appear beside the paper. The three
 * places it could happen:
 *
 * - **An MCP tool only.** Then the pane is empty until an agent thinks to run
 *   something, and the ordinary case — a person opens a paper, opens notes,
 *   and expects to see the notes that are in the document — never happens at
 *   all. It also makes the notes on a chapter depend on whether an agent has
 *   visited it, which is a worse version of the dependency that ruled out
 *   Paper pushing them.
 * - **A button in the pane.** Better, and still asks a person to press
 *   something to be shown information the program already has. The press would
 *   never mean "no" — nobody opens a notes pane and declines to see the notes.
 * - **On read, when the scope names a file.** Which is this.
 *
 * A write on a read is worth being uncomfortable about, so it is bounded in two
 * ways. It only happens when the scope names a PATH — asking for everything in
 * a project reads no files, so no amount of browsing scans a tree. And it is
 * skipped when the file has not changed since the last read, so the common case
 * (a reader scrolling, the pane re-asking) touches nothing at all.
 *
 * The MCP tool exists as well, and is not redundant: an agent that has just
 * edited a chapter wants to say "read it again now" without waiting for
 * somebody to look at a pane, and it wants the count back.
 */

/**
 * What the last read of each file saw, so an unchanged file is not re-scanned.
 *
 * Keyed by path and holding the file's own length rather than an mtime. Length
 * because this reader hands back a string and never a `stat`, and because it is
 * the property that cannot be wrong: a `mtime` can go backwards when a file is
 * restored from a copy, and this program would then skip a file that had
 * genuinely changed. A same-length edit slips past, which is why the guard is
 * an OPTIMISATION and not a correctness claim — `change()` is idempotent, so
 * the worst a miss costs is one scan that changes nothing.
 *
 * In memory, per process, deliberately not persisted. It is a cache of work
 * already done, and a restarted process doing that work once more is correct.
 */
const readAlready = new Map<string, number>()

/** Forget what has been read. For tests, and for the tool that means "again". */
export function forgetReads(): void {
  readAlready.clear()
}

export interface Ingested {
  /** How many annotations were found in the file this time. */
  found: number
  /** The sentence `change()` produced, or null when nothing was read. */
  said: string | null
}

/**
 * Read one document's annotations into the store.
 *
 * `read` is the confined reader from `notes/source.ts`, so a path outside every
 * root comes back null and nothing happens — which is the same silence a note
 * on such a path already gets when its anchor cannot be verified.
 */
export function ingestSource(
  where: { projectPath: string | null; path: string },
  read: (path: string) => string | null,
  by: string,
  force = false,
): Ingested {
  const source = read(where.path)
  if (source === null) return { found: 0, said: null }

  if (!force && readAlready.get(where.path) === source.length) return { found: 0, said: null }

  const { kept, withdrawn } = readAnnotations(source)
  /* Ordinals are counted over EVERYTHING the scanner found, kept and withdrawn
     together, so that "the third identical one" means the same thing whether or
     not the file has a preamble — and so that excluding the preamble cannot
     silently renumber the notes in the body of a document. */
  const all = [...kept, ...withdrawn].sort((a, b) => a.from - b.from)
  const at = new Map(all.map((one, index) => [one, index]))
  const keyed = (one: (typeof all)[number]) => ({
    key: keyFor(where.path, one.kind, one.text, ordinal(all, at.get(one) ?? 0)),
    kind: one.kind,
    body: one.text,
    from: one.from,
    to: one.to,
    quoted: one.source,
  })
  /* `where.projectPath` does two different jobs and it is worth naming both,
     because they used to be one. It says which STORE to write into — the file
     under that project's `.kehikot` — and, through the reader the caller built
     from it, which directories a document may be opened from at all. Nothing is
     recorded on the note: the note's project is the file it ends up in. */
  const outcome = change(where.projectPath, {
    op: 'ingest',
    path: where.path,
    by,
    found: kept.map(keyed),
    withdrawn: withdrawn.map(keyed),
  })

  /* Remembered only on success. A read that could not be stored — a store file
     somebody has mangled — must be retried rather than assumed done. */
  if (outcome.ok) readAlready.set(where.path, source.length)
  return { found: kept.length, said: outcome.ok ? outcome.said : outcome.error }
}

/**
 * The stable identity of one annotation.
 *
 * The file, the construct, and a hash of the WORDS. Not the offset: a key made
 * of a byte position produces a second note every time anybody adds a paragraph
 * above it, which is exactly the duplication this exists to prevent and exactly
 * what the schema this descends from said about its own `source_key`.
 *
 * `fingerprint` is the store's own hash and normalises whitespace first, so an
 * author re-wrapping a comment run to a different line width does not fork the
 * note. That is the right sensitivity: re-wrapping is not a change of mind,
 * rewording is.
 *
 * ## The ordinal, which is the one positional thing here and is unavoidable
 *
 * Two identical `\todo{fix this}` in one chapter hash the same. Without
 * something to separate them the second would be recognised as the first, and
 * one of the author's notes would silently never appear — the exact failure
 * this module refuses everywhere else. So identical texts are numbered in
 * document order.
 *
 * It is positional only among annotations that are already indistinguishable,
 * which is the smallest possible amount of position to depend on. What it costs
 * is honest: delete the first of three identical notes and the remaining two
 * renumber, so they fork. Three identical annotations in one file is rare, and
 * a fork of two notes that say the same thing is a cost worth paying to
 * guarantee that no annotation is ever silently dropped.
 */
export function keyFor(path: string, kind: 'todo' | 'comment', text: string, nth: number): string {
  const base = `${path}#${kind}:${fingerprint(text)}`
  return nth === 0 ? base : `${base}:${nth}`
}

/** How many earlier annotations of the same kind said the same thing. */
function ordinal(all: { kind: string; text: string }[], index: number): number {
  const one = all[index]!
  let nth = 0
  for (let i = 0; i < index; i++) {
    const before = all[i]!
    if (before.kind === one.kind && fingerprint(before.text) === fingerprint(one.text)) nth++
  }
  return nth
}
