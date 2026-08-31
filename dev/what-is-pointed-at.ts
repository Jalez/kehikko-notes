/**
 * The exact bytes this container asks another module to highlight.
 *
 * ## The question this was written to settle
 *
 * The complaint was "the notes module is too unable to highlight the exact part
 * of the text the note is based on", and it has two readings that live in two
 * different repositories. Either this module publishes an imprecise range — in
 * which case no amount of care in the reader can draw the right span — or the
 * range is right and the module drawing it is drawing something else.
 *
 * A press publishes `one.anchor.from` / `one.anchor.to`: the VERIFIED offsets,
 * not the note's own. So the honest test of this half is not "are the stored
 * numbers right" but "do the bytes between the numbers this container would send
 * contain exactly the words the note is about". That is a question about a
 * file and a store and nothing else, so it is answered here rather than in a
 * browser.
 *
 * It prints one line per note and a verdict. `off by 0` on every ranged note
 * means this module is sending the right bytes and the imprecision, if it is
 * real, is in the module that draws them. Anything else is this module's to fix
 * and would say so with the exact drift.
 *
 *   bun dev/what-is-pointed-at.ts [project-path]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveAnchor } from '../notes/anchor.ts'
import { normalise, type Note } from '../notes/shape.ts'

const PROJECT = process.argv[2] ?? '/Users/jaakkorajala/Claude/Projects/CS-DEGREE/05_drafts/thesis_latex'

const store = JSON.parse(readFileSync(join(PROJECT, '.kehikot', 'notes', 'notes.json'), 'utf8')) as { notes: Note[] }

/** The file's bytes, so a byte range can be sliced the way the consumer will slice it. */
const bytesOf = new Map<string, Buffer>()
function fileFor(path: string): Buffer | null {
  if (!bytesOf.has(path)) {
    try {
      bytesOf.set(path, readFileSync(path))
    } catch {
      return null
    }
  }
  return bytesOf.get(path) ?? null
}

let ranged = 0
let wrong = 0
const verdicts: Record<string, number> = {}

for (const note of store.notes) {
  const bytes = fileFor(note.path)
  if (!bytes) continue
  const anchor = resolveAnchor(note, bytes.toString('utf8'))
  verdicts[anchor.state] = (verdicts[anchor.state] ?? 0) + 1
  if (anchor.from === null || anchor.to === null) continue
  ranged++

  /* Sliced as BYTES, which is what the protocol says the numbers are and what
     a consumer opening the file would do. A range measured in characters and
     applied to bytes is the failure worth ruling out first on a document with
     `tiivistelmä` in it, and it would show up here as a slice that starts a
     letter or two into the passage. */
  const said = bytes.subarray(anchor.from, anchor.to).toString('utf8')
  const want = normalise(note.quoted)
  const got = normalise(said)
  if (got === want) continue
  wrong++
  console.log(`--- ${note.path.split('/').slice(-1)[0]} ${anchor.state} ${anchor.from}–${anchor.to}`)
  console.log(`  the note is about: ${want.slice(0, 140)}`)
  console.log(`  those bytes hold:  ${got.slice(0, 140)}`)
}

console.log(`\n${store.notes.length} notes, ${ranged} with a range published, ${wrong} whose bytes are not the note's words.`)
console.log(Object.entries(verdicts).map(([state, n]) => `${state}: ${n}`).join(', '))
