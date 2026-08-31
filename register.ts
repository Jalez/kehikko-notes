#!/usr/bin/env bun
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { originFor, registerAt } from 'roadmap-module-protocol/serve'

import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * Tell a host on this machine where this app answers.
 *
 *   bun run register            # or: PORT=7941 bun run register
 *
 * A separate program from `run.sh` on purpose. Registration writes into
 * somebody's home directory and says "frame this", which is a decision a person
 * makes once; a start script that did it quietly would be making that decision
 * on their behalf every time they pressed start.
 *
 * ## That argument stands, and the plugin does not contradict it
 *
 * `serves()` in `vite.config.ts` now writes this same file every time the server
 * starts, which reads like exactly what the paragraph above forbids. It is not,
 * and the difference is worth being precise about, because collapsing the two
 * loses something whichever way round you collapse them.
 *
 * ADOPTION is the decision a person makes once, and this program is it. Running
 * this is how an app that was not on somebody's canvas gets onto it, and
 * deleting the file is how it comes off. Nothing else in this repository does
 * that, and nothing else should.
 *
 * The ADDRESS is not a decision anybody made. Nobody chose 7940; they chose to
 * be framed, and 7940 is a fact about where this process happened to bind — a
 * fact that changes between one start and the next when something else has the
 * port. A registration still naming the old number is one the host sweeps to
 * find nothing: it reports this app as not running while it is running one port
 * over, and offers a Start button that would put a second writer on the same
 * `notes.json`. Rewriting the address keeps the decision the person made TRUE.
 * It does not make one.
 *
 * ## Which leaves this the short program it should always have been
 *
 * The registry directory, the rule that the FILENAME carries the id, the shape
 * of the document, and the argument for each of them now live in
 * `roadmap-module-protocol/serve`. They were copied into fourteen repositories,
 * this one included, with a note in each saying the copy was deliberate so the
 * directory could stand alone — and fourteen copies of one path is fourteen
 * chances to disagree by a character. Writing to the wrong directory is the
 * worst failure a module can have, because the host finds nothing and finds it
 * silently, which is the one failure that most deserves a single copy.
 *
 * What the package cannot know is which directory this checkout is in, so `dir`
 * is still taken from this file's own location rather than from `process.cwd()`:
 * `bun run register` works from anywhere, and a checkout moved or cloned
 * elsewhere registers itself correctly by being run.
 *
 * `registerAt` MERGES rather than overwrites, which matters to the one module
 * that keeps a flag beside its url — not this one, today, but the reason this
 * file no longer hand-builds the JSON it writes.
 */
const port = Number(process.env.PORT ?? PREFERRED_PORT)
const written = registerAt({
  id: ID,
  origin: originFor(port),
  dir: dirname(fileURLToPath(import.meta.url)),
})

console.log(`registered: ${written.file} -> ${written.url} (${written.dir})`)
if (written.was) console.log(`  (was ${written.was.url} in ${written.was.dir})`)
console.log('Start the app with ./run.sh, then reload the host; it sweeps the directory on every read.')
console.log(`If ${port} is taken, ./run.sh moves to the next free port and rewrites this file to match.`)
