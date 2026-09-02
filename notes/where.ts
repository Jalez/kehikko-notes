import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { within } from 'roadmap-module-protocol'

/**
 * Where a note's document is, in the two spellings this program needs — and the
 * one boundary that converts between them.
 *
 * ## What was wrong, and what it cost
 *
 * A note's `path` was stored as an absolute path. Nothing anywhere argued for
 * it; it was simply the string the host handed over, written down as it
 * arrived. `notes/shape.ts` had already said the opposite about the store it
 * sits in:
 *
 * > the file is `<projectPath>/.kehikot/notes/notes.json` and the path is the
 * > partition — there is deliberately no project field
 *
 * The file is the project. Every note in it belongs to that project by
 * construction, which makes the absolute prefix a copy of a fact the file's own
 * location already carries — and the same rule `shape.ts` gives for the vanished
 * `project` field applies word for word: two sources for one fact, and the
 * second one is the one that is wrong the moment anything moves.
 *
 * "Moves" is not hypothetical here. When the paper this store is about was
 * moved into `.kehikot/paper/thesis/`, fifty-nine anchors named files that no
 * longer existed and were rewritten by hand, and the same project is about to
 * be moved again. A path relative to the project survives both moves without
 * anybody touching the store: the notes travel with the repository, because
 * they are inside it and they say where they are inside it.
 *
 * ## The absolute path that IS argued for, and is not this one
 *
 * `store.ts` refuses a `projectPath` that is not absolute, at length, and that
 * is correct and untouched. The project arrives from the host as the address of
 * a directory on this machine; a relative one would be resolved against
 * whatever folder this app was started in. That argument is about the ROOT. It
 * says nothing about a document underneath it, which is the thing that has a
 * root to be relative to.
 *
 * ## Two spellings, and where each one lives
 *
 * - **stored** — what is written into `notes.json`. Relative to the project
 *   root for every document inside the project, which is all of them in
 *   practice.
 * - **live** — what everything in this process uses: an absolute path, because
 *   `notes/source.ts` opens files with it and refuses anything that is not
 *   absolute, and because a scope arriving from the host is absolute too.
 *
 * The conversion happens at ONE boundary — `read()` and `write()` in
 * `notes/keep.ts` — so that no other file in this program has to know which
 * spelling it is holding. Anchors, scopes, narrowing, the page and the doors
 * all see absolute paths exactly as they did before. That is deliberate: a
 * change that made every caller aware of two spellings would be a change with
 * one new place to get it wrong per call site, which is the shape of failure
 * this codebase spends its length avoiding.
 *
 * ## An absolute path that is NOT under the project stays absolute
 *
 * There should be none. A store is also a plain JSON file in somebody's
 * repository, which is most of the point of it being there, so somebody will
 * edit one — and the two obvious wrong answers both had to be refused.
 *
 * Dropping the note is not an option and never is: nothing in this program
 * deletes a note, and a note silently vanishing because a program disliked its
 * path is the exact failure the whole module is arranged against. Forcing it to
 * be relative is worse than dropping it: `../../elsewhere/main.tex` written
 * into the store would resolve, later, against whatever root the store is
 * opened with, and point at a file the note was never about — a note attached
 * to the wrong sentence, which is this app's one unforgivable act.
 *
 * So it stays absolute, and the invariant is readable straight off the file: a
 * stored path beginning with `/` is one that is not inside this project. It
 * resolves to the file it always named. Whether that file may be OPENED is a
 * separate question with a separate answer that did not change —
 * `notes/source.ts` confines reads to `NOTES_ROOTS` or the project, and a
 * document outside them is `unverified` rather than an error. The note is
 * shown, its quote is shown, and this app says it has no opinion about the
 * anchor. That is the honest state and it already had a name.
 *
 * ## A relative path that climbs OUT is never made absolute
 *
 * `..` is the shape that goes wrong when a relative path is joined onto a root,
 * and it is the reason this file exists rather than a `join()` at each call
 * site. A stored `../../etc/passwd` is resolved, checked against the root, and
 * handed back UNRESOLVED when it escapes — so what reaches `notes/source.ts` is
 * a relative string, which that module already refuses to open. The note is
 * still shown and still says what it says; the anchor is `unverified`. Nothing
 * this file returns can name a file outside the project that the caller did not
 * already name absolutely.
 *
 * The fence is unchanged and this is not it. `notes/source.ts` resolves and
 * follows symlinks before comparing, because a `link -> /etc` inside the
 * project defeats every check that only reads text, and joining a relative path
 * onto a root produces exactly the absolute path that fence was already given.
 * This file adds a check in front of it; it replaces nothing.
 */

/**
 * The project root in the two spellings a comparison may need.
 *
 * `given` is the host's own — resolved for `.` and `..` but with symlinks left
 * alone — and it is the one paths are re-joined onto, so that the absolute path
 * this program hands back is spelled the way the host spells it. Anything else
 * would answer a question about `/tmp/thesis` with a path under `/private/tmp`,
 * and every string comparison between a stored note and a live scope would then
 * depend on which of the two spellings each side happened to arrive by.
 *
 * `real` is the same directory with symlinks followed, and it is only ever used
 * to RECOGNISE a path as being inside the project. A host that says
 * `/tmp/thesis` and a passage that says `/private/tmp/thesis/main.tex` are
 * talking about the same file, and a store that failed to notice would keep an
 * absolute path for a document that is plainly inside the project — the bug
 * this change exists to remove, surviving in the one case nobody would test.
 */
export interface Roots {
  given: string
  real: string
}

/**
 * The project's roots, or null when there is no project to be relative to.
 *
 * Null for the same three reasons `store.ts` answers null: nothing said which
 * project, it is not an absolute path, or there is no such directory. Every
 * function here passes a path through untouched when the roots are null, so a
 * store with no project behaves exactly as it did before this file existed.
 * That matters for the tests and for the doors: `asked()` canonicalises a path
 * before it has opened anything, and it must not invent a root to do it.
 */
export function rootsOf(projectPath: string | null | undefined): Roots | null {
  if (typeof projectPath !== 'string') return null
  const raw = projectPath.trim()
  if (!raw || !isAbsolute(raw)) return null
  const given = resolve(raw)
  let real = given
  try {
    real = realpathSync(given)
  } catch {
    /* No such directory. `given` is still a usable prefix for the string half
       of the comparison, and `store.ts` is the one that refuses the write. */
  }
  return { given, real }
}

/**
 * A path as it goes into the file.
 *
 * Relative to the project when it is inside it, by either spelling of the root;
 * absolute when it is not, for the reasons in the essay above. Nothing here
 * touches the disk unless the two roots differ, so a note about a file that has
 * been deleted is relativised exactly like one about a file that is still there
 * — a store must not depend on what is currently on disk to say where its notes
 * point.
 */
export function stored(roots: Roots | null, path: string): string {
  if (!path || roots === null) return path

  /* Already relative. Folded against the project so that `chapters/../main.tex`
     and `main.tex` are one path — and handed back UNTOUCHED when the folding
     climbs out of the project, because the one thing this function must never
     do is turn `../../elsewhere.tex` into a tidy-looking name inside the
     project. `resolve('/', '../x')` is `/x`, so folding against anything but
     the real root would do exactly that. */
  if (!isAbsolute(path)) return under(roots.given, resolve(roots.given, path)) ?? path

  const full = resolve(path)
  const asGiven = under(roots.given, full)
  if (asGiven !== null) return asGiven

  /* The host's spelling did not match. Before concluding that a document is
     outside the project, follow the symlinks — `/tmp` is `/private/tmp` on this
     machine and on plenty of others, and two spellings of one directory must
     not become two kinds of note. */
  if (roots.real !== roots.given) {
    const asReal = under(roots.real, realish(full))
    if (asReal !== null) return asReal
  }
  return full
}

/**
 * A stored path as everything in this process uses it: absolute, under the
 * project, spelled the way the host spells it.
 *
 * An already-absolute stored path is handed back as it stands — that is the
 * migration's read half for a note written before this change, and the answer
 * for a note about a document genuinely outside the project. A relative one is
 * joined onto the root, and refused if it climbs out.
 */
export function resolved(roots: Roots | null, path: string): string {
  if (!path || roots === null) return path
  if (isAbsolute(path)) return path
  const full = resolve(roots.given, path)
  return within(roots.given, full) ? full : path
}

/**
 * Any spelling of a path, in the one this program uses.
 *
 * The round trip, and it is idempotent. Called on a path arriving at a door so
 * that a scope, an ingestion and a stored note are compared in one spelling —
 * `ingest()` in `notes/keep.ts` decides which notes a read of a document is
 * about by comparing `note.path` against the path it was given, and two
 * spellings of one file there would mark every note on that document as gone
 * from a source it never left.
 */
export function live(projectPath: string | null | undefined, path: string): string {
  const roots = rootsOf(projectPath)
  return resolved(roots, stored(roots, path))
}

/**
 * Whether a RELATIVE path climbs out of the project.
 *
 * For the one door that refuses rather than tolerates, and it is deliberately
 * narrower than "outside the project". An absolute path outside the project is
 * a legitimate thing to send — `NOTES_ROOTS` exists precisely so that somebody
 * can point this app at documents that are not in the project directory — and
 * refusing one would break callers this change promised not to break. A
 * RELATIVE path that climbs out is a different animal: it is meaningless
 * without a root, and the only root it could mean is the one it just escaped.
 *
 * Refused on the way IN, where somebody can still be told. A note already in
 * the store with such a path is somebody's hand edit, and that is kept, shown
 * and left unverified rather than refused — different situations, different
 * answers, and the difference is whether anybody is still listening.
 */
export function climbs(roots: Roots | null, path: string): boolean {
  if (!path || roots === null || isAbsolute(path)) return false
  return !within(roots.given, resolve(roots.given, path))
}

/** `child` written relative to `root`, or null when it is not inside it. */
function under(root: string, child: string): string | null {
  if (!within(root, child)) return null
  const rel = relative(root, child)
  /* The project directory itself is not a document. `relative` gives '' for it,
     and an empty path is not something this store can hold, so it stays
     absolute and whoever wrote it can see what they wrote. */
  return rel === '' ? null : rel
}

/**
 * A path with symlinks followed as far as anything exists.
 *
 * `realpathSync` throws on a path whose last segments are not there, and a note
 * about a file somebody has since deleted is an ordinary thing to hold. So the
 * existing ancestor is resolved and the rest is joined back on — enough to
 * recognise `/tmp/thesis/gone.tex` as being inside `/private/tmp/thesis`, which
 * is all this is for.
 */
function realish(path: string): string {
  const tail: string[] = []
  let at = path
  for (;;) {
    if (existsSync(at)) {
      try {
        return join(realpathSync(at), ...tail.reverse())
      } catch {
        return path
      }
    }
    const up = dirname(at)
    if (up === at) return path
    tail.push(at.slice(up.length + 1))
    at = up
  }
}
