import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readAnnotations } from '../notes/annotations.ts'

/**
 * What counts as an annotation, and what happens to the notes that were lifted
 * before the answer changed.
 *
 * ## Where these three rules came from
 *
 * One screenshot. A note in the container printed the same comment twice — once with
 * its `%` markers and its rule lines, once without — and the comment was
 * `main.tex` bytes 0–515, which is a build header saying which university
 * template the file stands in for and how to compile it locally. Three separate
 * things were wrong with that one row and each is fixed on its own:
 *
 *   - a derived note showing its quote AND its body, which for a derived note
 *     are the same words twice (that one is in `view/note.tsx`);
 *   - sixty equals signs surviving into a note's text, which is a line somebody
 *     drew in an editor and also the widest unbreakable string a 220-pixel container
 *     ever met;
 *   - the preamble being read as annotation at all, when the module drawing the
 *     same file beside it folds that region away and never shows it.
 *
 * ## And the store already held ten of them
 *
 * Which is the half that needs care rather than a rule. Ingestion never
 * deletes — that is the promise the whole module is arranged around — so a rule
 * change cannot simply stop producing these notes and leave the old ones
 * sitting in the list claiming to be annotations about a paper. The last two
 * tests here are the reconciliation: what a re-read does to a note that was
 * lifted under rules this app no longer applies.
 */

const home = mkdtempSync(join(tmpdir(), 'kehikko-notes-rules-'))
const project = join(home, 'thesis')
mkdirSync(project, { recursive: true })
const MAIN = join(project, 'main.tex')

const SOURCE = [
  '% ============================================================================',
  '% main.tex — SELF-CONTAINED build for local preview (tectonic).',
  '% This is NOT the official template; it stands in for tauthesis.cls.',
  '% ============================================================================',
  '\\documentclass{report}',
  '',
  '% ---------------------------------------------------------------------------',
  '% Make \\listoftodos survive full-sentence notes.',
  '% ---------------------------------------------------------------------------',
  '\\newcommand{\\missing}[1]{\\todo[inline]{\\textbf{MISSING:} #1}}',
  '',
  '\\begin{document}',
  '',
  '% ============================================================================',
  '% Chapter 1 — Introduction',
  '% Revised order per supervisory feedback.',
  '% ============================================================================',
  '',
  'A paragraph. \\todo{cite Lamport here}',
  '',
  '\\end{document}',
  '',
].join('\n')


process.env.NOTES_ROOTS = home

const { change, read } = await import('../notes/keep.ts')
const { fingerprint } = await import('../notes/shape.ts')
const { forgetReads, ingestSource } = await import('../notes/ingest.ts')
const { readerFor } = await import('../notes/source.ts')

const OF = { projectPath: project, path: MAIN }

function reread() {
  forgetReads()
  return ingestSource(OF, readerFor(project), 'the author, in the source', true)
}

/** One annotation the scanner finds, by kind, from whichever pile it lands in. */
function annotation(where: 'kept' | 'withdrawn', kind: 'todo' | 'comment') {
  const one = readAnnotations(SOURCE)[where].find((each) => each.kind === kind)
  if (!one) throw new Error(`no ${kind} in ${where}`)
  return one
}

beforeEach(() => {
  writeFileSync(MAIN, SOURCE)
  /* The store is inside the project now: `<project>/.kehikot/notes/`. */
  rmSync(join(project, '.kehikot'), { recursive: true, force: true })
  forgetReads()
})

afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('a rule line is a drawing and not a sentence', () => {
  test('the rules go and the sentences between them stay', () => {
    const { kept } = readAnnotations(SOURCE)
    const comment = kept.find((one) => one.kind === 'comment')
    expect(comment?.text).toBe('Chapter 1 — Introduction\nRevised order per supervisory feedback.')
  })

  test('nothing that survives carries one', () => {
    /* The measured reason as well as the readable one: a sixty-character run of
       one character is unbreakable, and an unbreakable string in a 220-pixel
       container is a min-content floor the container cannot get under. */
    for (const one of [...readAnnotations(SOURCE).kept, ...readAnnotations(SOURCE).withdrawn]) {
      expect(one.text).not.toMatch(/^[=\-_*~#+.]{4,}$/m)
    }
  })

  test('the range and the quote are untouched by it', () => {
    /* `quoted` is the slice of the file `anchor.ts` re-finds the passage by. A
       tidied quote is one that no longer matches the document, which would
       report every note here as adrift forever. */
    const { withdrawn } = readAnnotations(SOURCE)
    const header = withdrawn[0]
    expect(header?.from).toBe(0)
    expect(header?.source).toContain('====')
    expect(header?.text).not.toContain('====')
    expect(header?.text).toContain('SELF-CONTAINED build')
  })

  test('three dashes in prose are an em dash and not a rule', () => {
    /* The test is deliberately narrow. Anything looser eats the author's words,
       and a note that lost half a sentence is worse than one with a line in it. */
    const { kept } = readAnnotations('% before --- after\n% and ## a heading\n')
    expect(kept[0]?.text).toBe('before --- after\nand ## a heading')
  })
})

describe('the preamble is the build and not the paper', () => {
  test('nothing before \\begin{document} is lifted, macro definitions least of all', () => {
    const { kept, withdrawn } = readAnnotations(SOURCE)
    expect(kept).toHaveLength(2)
    expect(withdrawn).toHaveLength(3)
    /* The third is the `\todo` INSIDE `\newcommand{\missing}`, whose whole text
       is `\textbf{MISSING:} #1`. That is a definition of the note command, not
       a note; lifting it put four of them in the container. */
    expect(withdrawn.some((one) => one.kind === 'todo' && one.text.includes('#1'))).toBe(true)
  })

  test('a chapter has no \\begin{document}, so the rule excludes nothing in it', () => {
    /* Every chapter of every paper here is `\include`d rather than compiled. A
       rule that emptied those files would take the annotations this module
       exists for. */
    const chapter = '% A note about the argument.\n\\section{Two}\n\\todo{cite Fischer}\n'
    const { kept, withdrawn } = readAnnotations(chapter)
    expect(withdrawn).toHaveLength(0)
    expect(kept).toHaveLength(2)
  })

  test('what Paper hides, this no longer lifts', () => {
    /* `reader/pages.ts` folds `preamble` into one block and never draws it, with
       a test asserting `tauthesis` never reaches a shown block. Two modules
       disagreeing about what a document IS, in front of one reader, was the
       reason this changed. */
    for (const one of readAnnotations(SOURCE).kept) expect(one.text).not.toContain('tauthesis')
  })
})

describe('the notes lifted under the old rules', () => {
  /**
   * A note as the previous release would have written it: the whole comment
   * run as its body, rule lines and all, keyed off those words.
   *
   * Planted through `change()` rather than by running an older build, because
   * what is being tested is what the CURRENT ingestion does when it meets one —
   * and that is decided entirely by what is on the record.
   */
  function plantOldStyle(
    one: { kind: 'todo' | 'comment'; from: number; to: number; source: string },
    body: string,
    key: string,
  ) {
    const outcome = change(project, {
      op: 'ingest',
      path: MAIN,
      by: 'the author, in the source',
      found: [{ key, kind: one.kind, body, from: one.from, to: one.to, quoted: one.source }],
    })
    expect(outcome.ok).toBe(true)
  }

  test('a preamble note is withdrawn, not deleted and not left in the list', () => {
    plantOldStyle(annotation('withdrawn', 'comment'), 'old body with rules', 'stale-key')
    expect(read(project).store.notes).toHaveLength(1)

    const done = reread()
    expect(done.said).toContain('withdrawn as part of the file')

    const notes = read(project).store.notes
    /* Nothing added: the withdrawn annotation did not arrive as a second note
       beside the one it is. Nothing removed either. */
    expect(notes.filter((one) => one.source?.withdrawn)).toHaveLength(1)
    const [withdrawn] = notes.filter((one) => one.source?.withdrawn)
    expect(withdrawn?.source?.present).toBe(false)
    expect(withdrawn?.source?.withdrawn).toContain('\\begin{document}')
    /* And it still holds everything it held. */
    expect(withdrawn?.body).toBe('old body with rules')
  })

  test('a note whose TEXT this app now reads differently is the same note, and says so', () => {
    const wasBody = '============\nChapter 1 — Introduction\nRevised order per supervisory feedback.\n============'
    plantOldStyle(annotation('kept', 'comment'), wasBody, `${MAIN}#comment:${fingerprint(wasBody)}`)
    const before = read(project).store.notes[0]!.id

    const done = reread()
    expect(done.said).toContain('re-read from the source')

    const notes = read(project).store.notes
    /* One note, not two. The words in the file did not change; only this app's
       reading of them did, and forking there would be the program announcing
       its own bug fix by duplicating somebody's notes. */
    const comments = notes.filter((one) => one.source?.kind === 'comment')
    expect(comments).toHaveLength(1)
    expect(comments[0]?.id).toBe(before)
    expect(comments[0]?.body).toBe('Chapter 1 — Introduction\nRevised order per supervisory feedback.')
    /* And what it used to say is kept, because the replies underneath a note
       were written against the words that were on it. */
    expect(comments[0]?.source?.reread?.was).toBe(wasBody)
  })

  test('an author REWORDING an annotation still forks, which is the case this must not eat', () => {
    /* The dangerous neighbour of the test above. `\todo{cite Lamport here}` and
       `\todo{cite Fischer here}` are the same length at the same offsets, so a
       rule that adopted by POSITION would silently replace the body and leave a
       reply saying "no, this is Fischer" attached to a note that now says
       Fischer. The adoption compares the source slice instead, which changes
       when the author writes something else. */
    const real = annotation('kept', 'todo')
    plantOldStyle(
      { ...real, source: real.source.replace('Lamport', 'Fischer') },
      'cite Fischer here',
      'stale-todo',
    )
    reread()
    const todos = read(project).store.notes.filter((one) => one.source?.kind === 'todo')
    expect(todos).toHaveLength(2)
    expect(todos.map((one) => one.body).sort()).toEqual(['cite Fischer here', 'cite Lamport here'])
    expect(todos.find((one) => one.body === 'cite Fischer here')?.source?.present).toBe(false)
  })

  test('reading again changes nothing at all', () => {
    reread()
    const first = read(project).store.notes.length
    const again = reread()
    expect(again.said).toMatch(/0 new, 0 re-anchored, 0 no longer in the source\./)
    expect(read(project).store.notes).toHaveLength(first)
  })
})
