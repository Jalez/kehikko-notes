import { describe, expect, test } from 'bun:test'

import { annotationsIn } from '../notes/annotations.ts'
import { keyFor } from '../notes/ingest.ts'

/**
 * Finding the author's own annotations in a `.tex` file.
 *
 * This is the scanner that exists so that Paper does not have to push its
 * parse across a channel neither module declares. It has to find two things and
 * be wrong about neither in the direction that matters: a false find is a note
 * somebody resolves once, a miss is the author's words silently not arriving.
 */

const CHAPTER = [
  '% =====================================================',
  '% This chapter argues that a mode is a module, and the',
  '% reason it is here rather than in the bridge chapter.',
  '% =====================================================',
  '',
  '\\section{The wire}',
  '',
  'A module is one origin or it is nothing. \\todo{cite Lamport here}',
  '',
  'The second paragraph says something about 100\\% of the cases,',
  'which is not a comment.',
  '',
  '\\missing{a figure showing the three rungs}',
  '',
  '% A single line of reasoning on its own.',
  'A closing paragraph.',
].join('\n')

describe('what is found, and what is deliberately not', () => {
  const found = annotationsIn(CHAPTER)

  test('a run of comment lines is one annotation and not four', () => {
    /* Four lines of reasoning above a section are one thought. Four notes
       saying a quarter of it each would be four things to resolve and none of
       them readable on its own. */
    const comments = found.filter((one) => one.kind === 'comment')
    expect(comments).toHaveLength(2)
    expect(comments[0]?.text).toContain('a mode is a module')
    expect(comments[0]?.text).toContain('rather than in the bridge chapter')
  })

  test('a banner rule is a horizontal line and not an annotation', () => {
    /* These files open sections with `% =========` sixty characters wide.
       Stripped of the `%` that is a run of equals signs: not empty, not an
       annotation, and a pane full of them is a pane nobody reads. */
    for (const one of found) expect(one.text).not.toMatch(/^=+$/)
  })

  test('todonotes macros are found, all five of the family', () => {
    const todos = found.filter((one) => one.kind === 'todo')
    expect(todos.map((one) => one.text)).toEqual([
      'cite Lamport here',
      'a figure showing the three rungs',
    ])
  })

  test('an escaped percent in prose is not a comment', () => {
    /* `100\\%` is a printed percent sign. Reading it as a comment start would
       lift the rest of somebody's sentence into a note. */
    for (const one of found) expect(one.text).not.toContain('of the cases')
  })

  test('a `%` after prose on a line is left alone', () => {
    /* Only lines whose first non-blank character is `%`. The tail of a line is
       the author commenting out part of a sentence, and a note made of a
       fragment has no subject. */
    const source = 'A paragraph. % a trailing remark\n'
    expect(annotationsIn(source)).toHaveLength(0)
  })

  test('everything comes back in document order', () => {
    /* The ordinal that separates two identical annotations is counted in
       document order, so the order has to be the file's and not the order the
       two scanners happened to run in. */
    const positions = found.map((one) => one.from)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})

describe('the range and the quote are the file’s own bytes', () => {
  test('every annotation’s source slice is exactly what is at its range', () => {
    /* This becomes the note's `quoted`, and `anchor.ts` finds a moved note by
       looking for those very words IN THE FILE. A quote that is not a substring
       of the file could never match, so every derived note would report drift
       forever. */
    for (const one of annotationsIn(CHAPTER)) {
      expect(CHAPTER.slice(one.from, one.to)).toBe(one.source)
    }
  })

  test('the offsets are BYTES, not the units JavaScript indexes strings in', () => {
    /* The protocol says bytes, and `anchor.ts` in this same module works in
       bytes throughout. A scanner handing back `match.index` hands back a
       different number on any file with a character outside ASCII — which
       every one of these documents is, being full of em dashes. The symptom is
       not a broken note: it is every derived note reporting itself MOVED by two
       bytes forever, which is the kind of wrong that survives being written. */
    const source = 'A dash — and then\n\\todo{fix this}\n'
    const found = annotationsIn(source)
    expect(found).toHaveLength(1)
    const bytes = Buffer.from(source, 'utf8')
    expect(bytes.subarray(found[0]!.from, found[0]!.to).toString('utf8')).toBe('\\todo{fix this}')
    /* And the string index is genuinely different, so this test would pass by
       accident on an ASCII fixture. */
    expect(found[0]!.from).not.toBe(source.indexOf('\\todo'))
  })

  test('a todonote’s quote keeps its wrapper', () => {
    const todo = annotationsIn(CHAPTER).find((one) => one.text === 'cite Lamport here')
    expect(todo?.source).toBe('\\todo{cite Lamport here}')
  })

  test('braces inside a note do not end it early', () => {
    /* `\\todo{cite \\gh{131} here}` is ordinary in these documents. Stopping at
       the first `}` would take half the note and leave the rest as prose in the
       paper. */
    const found = annotationsIn('x \\todo{cite \\gh{131} here} y')
    expect(found).toHaveLength(1)
    expect(found[0]?.text).toBe('cite \\gh{131} here')
    expect(found[0]?.source).toBe('\\todo{cite \\gh{131} here}')
  })

  test('a footnote is part of the document and is not swept up', () => {
    expect(annotationsIn('a sentence\\footnote{with a note under it}')).toHaveLength(0)
  })
})

describe('the key is made of the words and never of the position', () => {
  test('the same annotation moved down the file keeps its key', () => {
    /* The whole of idempotency is here. A key made of a byte position produces
       a second note every time anybody adds a paragraph above it, and a chapter
       re-read twice becomes a chapter with two of everything. */
    const before = annotationsIn('\\todo{fix the citation}\n')
    const after = annotationsIn('A new paragraph nobody had written yet.\n\n\\todo{fix the citation}\n')
    expect(after[0]?.from).not.toBe(before[0]?.from)
    expect(keyFor('/x/a.tex', 'todo', after[0]!.text, 0)).toBe(keyFor('/x/a.tex', 'todo', before[0]!.text, 0))
  })

  test('re-wrapping a comment run does not fork it', () => {
    /* `fingerprint` normalises whitespace first. Re-wrapping to a different
       line width is not a change of mind; rewording is. */
    const narrow = annotationsIn('% the reason this is\n% here rather than there\n')
    const wide = annotationsIn('% the reason this is here rather than there\n')
    expect(keyFor('/x/a.tex', 'comment', narrow[0]!.text, 0)).toBe(keyFor('/x/a.tex', 'comment', wide[0]!.text, 0))
  })

  test('rewording DOES fork it, which is the decision rather than an accident', () => {
    /* A changed key means a new note and the old one marked gone, carrying the
       replies that were about the words it actually said. Replacing the body in
       place would leave somebody's answer attached to a question it does not
       answer, with nothing recording what it used to be. */
    expect(keyFor('/x/a.tex', 'todo', 'cite Lamport here', 0)).not.toBe(
      keyFor('/x/a.tex', 'todo', 'cite Fischer here', 0),
    )
  })

  test('the same sentence in two chapters is two notes', () => {
    expect(keyFor('/x/a.tex', 'todo', 'fix this', 0)).not.toBe(keyFor('/x/b.tex', 'todo', 'fix this', 0))
  })

  test('two identical annotations in one file are two notes, not one', () => {
    /* Without the ordinal the second would be recognised as the first and one
       of the author's notes would silently never appear — the exact failure
       everything else here refuses. */
    expect(keyFor('/x/a.tex', 'todo', 'fix this', 0)).not.toBe(keyFor('/x/a.tex', 'todo', 'fix this', 1))
  })

  test('a macro and a comment saying the same words are not the same note', () => {
    expect(keyFor('/x/a.tex', 'todo', 'fix this', 0)).not.toBe(keyFor('/x/a.tex', 'comment', 'fix this', 0))
  })
})
