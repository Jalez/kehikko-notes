/**
 * What this app's inline pass does to every annotation in a real thesis.
 *
 * ## Why a probe and not another unit test
 *
 * `test/readable.test.ts` asserts the cases somebody thought of. This prints
 * every case the author actually wrote — sixty-odd annotations across eight
 * chapters of a Finnish master's thesis, full of accents, escaped percent
 * signs, citations and one comment run that is mostly a font incantation. The
 * question it answers is not "does the sentence in the bug report work now" but
 * "did this pass quietly damage any of the other sixty", and that is a question
 * only a real corpus can be asked.
 *
 * It writes nothing. It reads the `.tex` files, runs the scanner, and prints
 * every body the pass CHANGED with both spellings, so a person can read down
 * the right-hand column and see whether any of them got worse. A run that
 * prints "changed: 0" over a document with `\emph` in it has measured nothing
 * and must not be read as a pass.
 *
 *   bun dev/reads-as-prose.ts [path-to-a-tex-directory]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { annotationsIn } from '../notes/annotations.ts'
import { readable } from '../notes/readable.ts'

const ROOT = process.argv[2] ?? '/Users/jaakkorajala/Claude/Projects/CS-DEGREE/05_drafts/thesis_latex'

/** Every `.tex` under a directory, one level of nesting deep, which is how these papers are laid out. */
function texIn(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name.startsWith('.')) continue
    if (statSync(path).isDirectory()) out.push(...texIn(path))
    else if (name.endsWith('.tex')) out.push(path)
  }
  return out
}

let total = 0
let changed = 0

for (const path of texIn(ROOT)) {
  const source = readFileSync(path, 'utf8')
  for (const one of annotationsIn(source)) {
    total++
    /* The pass is re-run against the raw construct so the two spellings can be
       put side by side. `annotationsIn` has already applied it once. */
    const raw = one.kind === 'todo' ? one.source.replace(/^\\[a-zA-Z]+\s*(\[[^\]]*\])?\s*\{/, '').replace(/\}$/, '') : null
    const before = raw ?? one.source.replace(/^\s*%+\s?/gm, '')
    if (readable(before).trim() === before.trim()) continue
    changed++
    console.log(`--- ${path.slice(ROOT.length + 1)} (${one.kind}, bytes ${one.from}–${one.to})`)
    console.log(`  was: ${before.trim().replace(/\n/g, ' ⏎ ').slice(0, 300)}`)
    console.log(`  now: ${one.text.replace(/\n/g, ' ⏎ ').slice(0, 300)}`)
  }
}

console.log(`\n${total} annotations, ${changed} of them now read differently.`)
