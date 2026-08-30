import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where this app keeps what is its own.
 *
 * One file lives here — `notes.json`, holding every note anybody has written
 * against a place in a document, and every reply on one — and the directory is
 * beside the program rather than inside any host's data. That is the whole of
 * what "an app" means here: somebody can copy this directory to another
 * machine, run it, and have their notes, with nothing else installed and
 * nothing else running.
 *
 * The documents the notes are ABOUT are not here and never will be. A `.tex`
 * file belongs to whoever is writing it, in a repository with its own history,
 * and the worst thing this app could do is become a second place where one
 * lives. This module reads a source file for exactly one purpose — to ask
 * whether a note's anchor still points at the words it was written about — and
 * it never writes one, never caches one, and never returns its bytes to
 * anybody. See `notes/anchor.ts`.
 *
 * `NOTES_DATA` moves it, and it is deliberately NOT `ROADMAP_DATA`. That
 * variable belongs to a different program: honouring it would make this app's
 * store follow a host that may not be running, may not exist, and certainly did
 * not agree to hold anything of ours. One store, one owner, one name.
 *
 * Resolved at call time and not at import, so a test — or a deployment that
 * sets the variable in a wrapper — does not depend on which module happened to
 * be loaded first. `mkdirSync` is on this path rather than at startup because
 * every reader tolerates an absent file and none of them tolerates an absent
 * directory; making it here means the first write cannot fail on something the
 * program could simply have done.
 *
 * ## Why the fallback is the working directory and not `import.meta.dir`
 *
 * `import.meta.dir` is the direct way to say "beside the program" and it cannot
 * be used, because the doors are middleware inside Vite's config and Vite
 * BUNDLES its config: `vite.config.ts` and everything it imports are compiled
 * into a throwaway file under `node_modules/.vite-temp/`. So `import.meta.dir`
 * in that bundle names a temporary directory — and under Node it is `undefined`
 * outright, since it is a Bun extension. Had it merely been the wrong string
 * this app would have started cleanly, found no `notes.json`, reported an empty
 * store, and written every new note into a directory Vite deletes. That is
 * somebody's whole set of notes gone, with a page that looked fine.
 *
 * So the fallback is `process.cwd()` and `run.sh` is what makes it exact: it
 * does `cd "$(dirname "$0")"` before starting anything and then sets
 * `NOTES_DATA` explicitly, so the store is beside the program however the
 * script was invoked and whatever a bundler does to the module graph.
 */
export function dataDir(): string {
  const dir = process.env.NOTES_DATA ?? join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}
