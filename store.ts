import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { KEHIKOT_DIR, moduleDir, moduleFile, withKehikotIgnored, within } from 'roadmap-module-protocol'

import { ID } from './manifest.ts'

/**
 * Where this app keeps what is its own — which is inside the project now, and
 * not beside this program.
 *
 * ## What moved, and the sentence that moved it
 *
 * There used to be a `data/` directory next to this app holding one
 * `notes.json` for every project at once, and a `NOTES_DATA` variable to move
 * it. The user's own sentence retired both:
 *
 * > "Each of the modules should hold their data inside the project itself,
 * > mostly as text files inside a kehikko-folder (or json) … That way
 * > everything is transparent etc and easily usable by others in the project."
 *
 * So: `<projectPath>/.kehikot/notes/notes.json`. The notes about a thesis live
 * in the thesis's own repository, next to the chapters they are anchored to,
 * where somebody can open them in an editor without this app running at all —
 * and `rm -r .kehikot/notes` is a sentence a person can say, which is most of
 * what the folder-per-module level buys.
 *
 * The folder names and the joins are `roadmap-module-protocol`'s, deliberately,
 * and not this file's. Four modules answering "where does my data live" for
 * themselves is four answers, and the disagreement has no symptom worth the
 * name: every module starts, every module saves, and a person finds their notes
 * in one folder and their checklists in another with nothing on any screen to
 * say why. That is the same class of failure as `roadmap.hello` against
 * `roadmap.Hello`, which is what that package exists for. The module's own
 * folder is derived from `ID` there too, rather than being a second spelling of
 * "notes" written down here.
 *
 * ## The path is the partition, so nothing is keyed by project any more
 *
 * The store this opens is already one project's. That REPLACES the per-project
 * partitioning `notes/keep.ts` used to do rather than sitting on top of it:
 * there is no `projectKey` any more, no filter over a pile of everybody's
 * notes, and no `project`/`projectPath` field on a note. A store that has never
 * heard of a project cannot show one project's notes under another's name — and
 * that is worth more than the filter was, because a filter is a rule that can be
 * forgotten at a new call site and a file's location cannot.
 *
 * What the documents are is unchanged and worth restating, because it is the
 * other half of this app's boundary: a `.tex` file belongs to whoever is
 * writing it, and this module reads one for exactly one purpose — to ask
 * whether a note's anchor still points at the words it was written about. It
 * never writes one, never caches one, and never returns its bytes to anybody.
 * See `notes/anchor.ts` and `notes/source.ts`. What is new is that this app now
 * writes ONE file into that repository, in a folder named after the host, which
 * `.gitignore` is told about the moment it is created.
 *
 * ## Null is a place a person can be, and never a guess
 *
 * `projectPath` is nullable on the wire — no project open, or a host older than
 * protocol 0.8, or a host with no filesystem to point at. This answers `null`
 * for it, every caller has to say so on screen, and no write happens at all.
 *
 * It does not fall back to `process.cwd()`, to this app's own folder, or to
 * anything else, and the file this one replaces is why. Its own comment
 * recorded the failure: `import.meta.dir` inside a bundled Vite config resolves
 * to a throwaway directory under `node_modules/.vite-temp/` — and to `undefined`
 * under Node — so the app would have started cleanly, found no `notes.json`,
 * reported an empty store, and written every new note somewhere Vite deletes.
 * "That is somebody's whole set of notes gone, with a page that looked fine."
 * A silently wrong location is worse than a loud absent one, and that is the
 * whole argument for a `null` a caller cannot ignore.
 *
 * ## The fence, which matters more now rather than less
 *
 * Until today this app read files it was pointed at and wrote only inside its
 * own directory. Now it WRITES into a path it was handed over the wire, which
 * is a different kind of trust. So the path is resolved with `realpathSync` and
 * every folder it lands in is checked to be under the project it claims to be
 * under — after resolution, because a `.kehikot` that is a symlink to somewhere
 * else is precisely the case a string comparison misses. Both levels are
 * checked and not only the innermost: a `.kehikot` pointing out of the project
 * takes `.kehikot/notes` with it. `within()` is the comparison and not the
 * check; its note in the protocol package says so at length.
 *
 * The file NAME is a constant below and never a string from a request. There is
 * no door here that takes one, and `moduleFile` throws rather than returning
 * null if anything ever tries.
 */

/** This app's own file, inside its own folder. A constant, never an argument. */
export const FILE = 'notes'

/**
 * The one file, or a sentence about why there is not one.
 *
 * Three answers, and they are three because they mean three different things:
 *
 * - `{ path, trouble: null }` — here it is.
 * - `{ path: null, trouble: null }` — there is no project open. An ordinary
 *   state and not a fault; the page says so and nothing is written.
 * - `{ path: null, trouble }` — a project was named and this app will not write
 *   under it. The sentence is for a person, and it says what was refused.
 *
 * Collapsing the middle one into either of the others is the failure this shape
 * exists to prevent. As an error it tells somebody their canvas is broken when
 * it is merely somewhere else; as an empty store it invites a write that would
 * later flatten a real file the moment a project did arrive.
 *
 * Reading does not create anything. `makeDir()` is what creates, and it is
 * called on the write path only, so opening a pane against a project never
 * leaves a folder in somebody's repository they did not ask for.
 */
export function dataFile(projectPath: string | null | undefined): { path: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { path: null, trouble: null }
  if ('trouble' in root) return { path: null, trouble: root.trouble }

  /* Every level, outermost first. `.kehikot` and `.kehikot/notes` are two
     places a symlink can be put, and checking only the inner one would let a
     redirected `.kehikot` carry this app's whole folder out of the project.

     Only what exists can be resolved, and only what exists can escape: a folder
     that is not there yet cannot be a symlink to somewhere else. It becomes one
     the moment it is created, which is why `makeDir` checks again after it. */
  for (const dir of [join(root.path, KEHIKOT_DIR), moduleDir(root.path, ID)!]) {
    if (!existsSync(dir)) continue
    const escaped = escapes(root.path, dir)
    if (escaped) return { path: null, trouble: escaped }
  }
  const path = moduleFile(root.path, ID, FILE)
  if (path !== null && existsSync(path)) {
    const escaped = escapes(root.path, path)
    if (escaped) return { path: null, trouble: escaped }
  }
  return { path, trouble: null }
}

/**
 * Make the folder, and tell the project's `.gitignore` about it — once.
 *
 * Called before a write and not before a read, so that looking at a project
 * never changes it. A person who opens a notes pane against a repository and
 * writes nothing should find that repository exactly as they left it.
 */
export function makeDir(projectPath: string | null | undefined): { dir: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { dir: null, trouble: null }
  if ('trouble' in root) return { dir: null, trouble: root.trouble }

  const kehikot = join(root.path, KEHIKOT_DIR)
  const dir = moduleDir(root.path, ID)!
  /* Whether `.kehikot` itself is new, not this module's folder inside it. The
     `.gitignore` rule covers the whole folder — see `KEHIKOT_IGNORE` — so it is
     that folder's first appearance that is the moment to mention it. Asking
     about this module's own directory would mean the second module to write
     appending a second copy of a rule already in the file. */
  const fresh = !existsSync(kehikot)
  mkdirSync(dir, { recursive: true })
  /* After the mkdir as well as before it, and at both levels. `existsSync` said
     nothing was there and `mkdirSync` is happy to have followed a symlink
     somebody put there in between; the only honest moment to ask where a
     directory actually is, is once it is there. */
  for (const made of [kehikot, dir]) {
    const escaped = escapes(root.path, made)
    if (escaped) return { dir: null, trouble: escaped }
  }

  /* Only on the run that created it. A project that has removed the ignore rule
     has said something, and a program that re-added it on every save would be
     overruling them every few seconds. */
  if (fresh) ignore(root.path)
  return { dir, trouble: null }
}

/**
 * Append the ignore rule to the project's `.gitignore`, if it has one.
 *
 * The user was asked whether some of this should be committed so that teammates
 * see it, and said no — "we are still developing this so we don't want to
 * pollute other people with our work" — so everything this app writes is
 * ignored, and the comment in the appended block is what says how to change
 * that later.
 *
 * The text and the idempotence are `withKehikotIgnored`'s: append-only, never a
 * rewrite, never a reorder. That is not tidiness. This is a file in the user's
 * own repository which shows up in their next diff under their name, and a
 * program that normalised it would be putting changes they did not make into
 * their commit.
 *
 * The rule covers the whole `.kehikot/` folder rather than this module's part
 * of it, so four modules writing into one project produce one line between them
 * rather than four — and a fifth module added next year needs no line at all.
 *
 * ## The repository is looked for ABOVE the project, and the file is written AT it
 *
 * Checking `<project>/.git` alone was the first version and it is wrong for the
 * project this whole change was made for. The thesis these notes belong to is at
 * `…/CS-DEGREE/05_drafts/thesis_latex`, which has no `.git` of its own and sits
 * several directories inside one. Under the narrower check it would have been
 * read as "not a repository", got no ignore rule, and put `.kehikot/` into
 * somebody's `git status` — the exact pollution the user asked to avoid, in the
 * one project that matters most here.
 *
 * So the search walks up. What it does NOT do is write at the repository root:
 * the `.gitignore` goes at the project root, because git honours one in any
 * directory and that is both the correct scope — this folder is under this
 * project, not under every sibling of it — and the smallest edit to somebody
 * else's repository. Appending to a `.gitignore` five levels up, covering work
 * that has nothing to do with this, is a much larger thing to do uninvited.
 *
 * A project with no `.git` anywhere above it gets nothing at all. There is no
 * repository for a rule to mean anything to, and creating one — or an ignore
 * file — would be this app deciding how somebody keeps their folder.
 *
 * Every failure here is swallowed on purpose. Not being able to write somebody's
 * `.gitignore` is not a reason to refuse to save their notes.
 */
function ignore(root: string): void {
  try {
    if (!inRepository(root)) return
    const path = join(root, '.gitignore')
    /* A repository with no `.gitignore` gets one holding only this block, which
       is answering a question the repository had not been asked yet rather than
       editing somebody's file. */
    const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
    const after = withKehikotIgnored(before)
    if (after !== before) writeFileSync(path, after)
  } catch {
    /* Deliberately silent. See above. */
  }
}

/**
 * Is this folder inside a git repository — here, or anywhere above it?
 *
 * `.git` is tested with `existsSync` rather than as a directory, because in a
 * worktree and in a submodule it is a FILE holding a pointer. A check that
 * demanded a directory would read a perfectly ordinary checkout as "not a
 * repository" and quietly stop ignoring anything.
 *
 * The walk stops at the filesystem root, and `dirname` reaching a fixed point is
 * what says so — a loop counter would be a second answer to "have we finished"
 * that can disagree with the first.
 */
function inRepository(root: string): boolean {
  let at = root
  for (;;) {
    if (existsSync(join(at, '.git'))) return true
    const up = dirname(at)
    if (up === at) return false
    at = up
  }
}

/** The project, resolved — or null for "no project", or a sentence for a refusal. */
function projectRoot(projectPath: string | null | undefined): { path: string } | { trouble: string } | null {
  if (typeof projectPath !== 'string') return null
  const raw = projectPath.trim()
  if (!raw) return null
  if (raw.length > 4096) return { trouble: 'that project path is longer than any path on this machine can be.' }
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return { trouble: 'that project path has a control character in it, and no real path does.' }
    }
  }
  if (!isAbsolute(raw)) {
    return {
      trouble:
        `"${raw}" is not an absolute path. A project is somewhere on this machine, and a relative path would be `
        + 'resolved against whatever directory this app happens to have been started in — which is a different '
        + 'folder from the one whoever sent it meant.',
    }
  }
  let resolved: string
  try {
    resolved = realpathSync(raw)
    if (!statSync(resolved).isDirectory()) {
      return { trouble: `"${raw}" is not a folder, so there is nowhere under it to keep anything.` }
    }
  } catch {
    return { trouble: `there is no folder at "${raw}" on this machine, so nothing can be read or written under it.` }
  }
  return { path: resolved }
}

/** The fence: a sentence if `child` is not really under `root`, null if it is. */
function escapes(root: string, child: string): string | null {
  let real: string
  try {
    real = realpathSync(child)
  } catch {
    return `${child} could not be resolved, so this app will not read or write through it.`
  }
  if (within(root, real)) return null
  return (
    `${child} resolves to ${real}, which is outside the project it claims to be inside. Nothing has been read or `
    + 'written: a folder that points somewhere else is how one project’s notes end up written into another’s, and it '
    + 'is refused rather than followed.'
  )
}
