import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

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
 * Nothing is written, nothing is cached, and no byte of any document ever
 * leaves this process. What crosses a door is a verdict — still there, moved
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
 * `.tex` chapter and far smaller than something worth reading into a pane. Past
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
export function readerFor(projectPath: string | null, env: Record<string, string | undefined> = process.env) {
  const roots = namedRoots(env)
  if (!roots.length && projectPath && isAbsolute(projectPath)) roots.push(projectPath)

  return (path: string): string | null => {
    if (!path || !isAbsolute(path)) return null
    if (!roots.length) return null
    const full = resolve(path)
    if (!roots.some((root) => inside(full, root))) return null
    try {
      const stat = statSync(full)
      if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null
      return readFileSync(full, 'utf8')
    } catch {
      return null
    }
  }
}

/** A reader that opens nothing, for the tests and for a store with no project on it. */
export const readsNothing = (): string | null => null
