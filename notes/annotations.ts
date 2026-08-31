/**
 * The author's own annotations, found in a `.tex` file.
 *
 * ## Why this module has a LaTeX scanner in it at all
 *
 * The obvious arrangement is the wrong one: Paper already has a complete LaTeX
 * parser, already produces a `comment` block and a `todo` segment for exactly
 * these things, and could post them here. It must not. That would make one
 * module's parser the other module's DATA SOURCE, over a channel neither
 * declares in its manifest — a dependency invisible to the host, invisible to a
 * person reading either manifest, and one that breaks silently the day Paper is
 * not on the canvas. Notes would then hold notes whose existence depends on
 * whether somebody happened to place another pane.
 *
 * The protocol's whole position is that modules meet through the host or not at
 * all, and what the host relays is a passage: a path, a place, and a quote. So
 * this module does what it already does with a path — it opens the file itself,
 * through the same confined reader that verifies every anchor — and reads it
 * with a scanner of its own.
 *
 * ## What that costs, said plainly
 *
 * Two scanners over one file format, which will drift. This one is much
 * smaller and does not have to agree with Paper's about anything a reader
 * sees: it finds two constructs, and where it disagrees with Paper the symptom
 * is a note that is or is not lifted, not a document that renders differently.
 * It is also independently testable against real `.tex` on disk, which a
 * cross-module dependency would not be.
 *
 * Nothing here touches a disk or imports `node:` anything — it takes a string —
 * so it stays importable from the page for the reason `shape.ts` does.
 */

/** Which construct an annotation came out of. */
export type AnnotationKind = 'todo' | 'comment'

export interface Annotation {
  kind: AnnotationKind
  /**
   * The words the author wrote, readable: a comment run with its `%` markers
   * stripped, a `\todo{…}` with its wrapper gone. This becomes the note's body
   * and is what the stable key is derived FROM.
   */
  text: string
  /** First byte of the construct in the file, wrapper included. */
  from: number
  /** One past the last, exclusive. */
  to: number
  /**
   * The exact source between `from` and `to`.
   *
   * The wrapper is deliberately included. This is what a note's `quoted` field
   * becomes, and `quoted` exists so that `anchor.ts` can find the passage again
   * after the file is edited above it — which it does by looking for the words
   * IN THE FILE. `\todo{fix the citation}` is in the file; `fix the citation`
   * on its own is very nearly, but a stripped version that happened to be
   * findable somewhere else in the document would re-anchor the note to a
   * sentence the author never annotated.
   */
  source: string
}

/**
 * The todonotes macros these documents actually use.
 *
 * The same five Paper knows about, and they are listed rather than matched by a
 * pattern because "a macro whose name ends in `note`" would sweep up
 * `\footnote` — which is part of the document, not an annotation on it.
 */
const TODO_MACROS = new Set(['todo', 'missing', 'alt', 'thought', 'attention'])

/** True when the `%` at `at` starts a comment rather than being an escaped `\%`. */
function isComment(source: string, at: number): boolean {
  if (source[at] !== '%') return false
  let backslashes = 0
  for (let i = at - 1; i >= 0 && source[i] === '\\'; i--) backslashes++
  /* An even number of backslashes leaves the `%` unescaped: `\\%` is a line
     break followed by a comment, `\%` is a printed percent sign. */
  return backslashes % 2 === 0
}

/**
 * An annotation worth keeping, as opposed to a decoration.
 *
 * These files open their sections with `% ==================` rules sixty
 * characters wide. Stripped of their `%` those are a run of equals signs, which
 * is not empty and is not an annotation either — it is a horizontal line
 * somebody drew in a text editor. Requiring one letter or digit is the cheapest
 * rule that keeps every real sentence and drops every rule, and it errs the
 * safe way: a false keep is a note somebody resolves once, a false drop is the
 * author's words silently not arriving.
 */
function saysSomething(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

/**
 * A line that is a horizontal rule rather than a sentence.
 *
 * ## Why `saysSomething` was not enough, and the pane that proved it
 *
 * That test is over a WHOLE comment run, so it drops a run that is nothing but
 * a rule and keeps a run that is a rule, four sentences, and another rule —
 * which is how every chapter of the thesis this was first run against opens.
 * The note that came out carried sixty equals signs on its first line, and a
 * sixty-character unbreakable string is exactly the min-content floor that made
 * a 220-pixel pane 1187 pixels wide in an earlier measurement. It read as noise
 * as well: a rule is a thing the author drew in an editor to separate one part
 * of a file from another, and it says nothing about the paper.
 *
 * So rules are dropped LINE BY LINE and the sentences between them are kept.
 * The test is deliberately narrow — four or more of one punctuation character
 * and nothing else — because anything looser starts eating prose: `---` is an
 * em dash somebody typed and `##` is a heading in a comment written by
 * somebody with Markdown in their fingers, and both are things the author said.
 *
 * The `from`/`to` of the annotation are NOT changed by this, and neither is
 * `source`. Those describe where the construct sits in the file and what is
 * exactly there, which is what `anchor.ts` re-finds the passage by. Only the
 * readable `text` — the note's body — has the rules taken out of it.
 */
function isRule(line: string): boolean {
  return /^([=\-_*~#+.])\1{3,}$/.test(line.trim())
}

/** `\begin{document}`, which is where a `.tex` file stops being a build and starts being a paper. */
const DOCUMENT_BEGINS = '\\begin{document}'

/**
 * Where the document proper starts, in UTF-16 units, or 0 when it never does.
 *
 * A chapter file has no `\begin{document}` at all — it is `\include`d into one —
 * so 0 is the right answer for it and the rule below then excludes nothing.
 */
export function bodyBegins(source: string): number {
  const at = source.indexOf(DOCUMENT_BEGINS)
  return at === -1 ? 0 : at + DOCUMENT_BEGINS.length
}

/**
 * Every annotation in one `.tex` file, in document order.
 *
 * Comment runs first because they are found by scanning lines, then macros by
 * scanning for backslashes; the result is sorted by position so that "the third
 * identical one" means the same thing on every read — see `keyFor` in
 * `ingest.ts`, which needs a stable ordinal and nothing else positional.
 */
export function annotationsIn(source: string): Annotation[] {
  return readAnnotations(source).kept
}

/**
 * What one file holds, split into what is lifted and what is deliberately not.
 *
 * ## The preamble is not annotation, and the two modules had disagreed about it
 *
 * Everything before `\begin{document}` is the build: which class the file
 * stands in for, which fonts are loaded, how `\listoftodos` was made to survive
 * sentence-length notes, and — in the thesis this was first run against — the
 * four `\newcommand`s that DEFINE `\missing`, `\alt`, `\thought` and
 * `\attention` in terms of `\todo`. Every one of those was arriving here as an
 * annotation. The first was a five-line build header lifted as a note about
 * bytes 0–515 of `main.tex`; the last four were macro bodies whose entire text
 * is `\textbf{MISSING:} #1`, which is a definition rather than a thing anybody
 * wrote about the argument.
 *
 * Paper had already decided this and said so in `reader/pages.ts`: `preamble`
 * is folded into one block and never drawn, with a test asserting that
 * `tauthesis` and `graphicspath` never reach a shown block. A module lifting
 * what the module beside it hides is two programs disagreeing about what the
 * document IS, in front of the same reader.
 *
 * So the preamble is not read as annotation. What that loses is named rather
 * than dropped quietly: the build header and the `\l@todo` workaround are real
 * explanations and worth having — in the `.tex`, where the person who has to
 * change the build will be, which is where they already are. They are not
 * annotations about the prose, and mixing them in with the ones that are is
 * exactly the complaint this answers.
 *
 * ## And the ones that go are handed back rather than forgotten
 *
 * `withdrawn` is the second half and it exists because this program's rules
 * changed underneath a store that already held notes. A note lifted out of the
 * preamble last week is still in the store; ingestion never deletes; so the
 * store has to be told which of its notes this app no longer reads as
 * annotation, by the same reading that decided it. See `ingest()` in `keep.ts`.
 */
export function readAnnotations(source: string): { kept: Annotation[]; withdrawn: Annotation[] } {
  const found = [...commentRuns(source), ...todoMacros(source)].sort((a, b) => a.from - b.from)
  const bytes = byteOffsets(source)
  /* Positions converted at the boundary, once, so that everything above this
     line can go on working in the units JavaScript actually indexes strings in.
     See `byteOffsets`. The `source` slice is taken with the ORIGINAL indices,
     because it is a slice of this same string. */
  const body = bodyBegins(source)
  const kept: Annotation[] = []
  const withdrawn: Annotation[] = []
  for (const one of found) {
    const placed = { ...one, from: bytes[one.from]!, to: bytes[one.to]! }
    ;(one.from < body ? withdrawn : kept).push(placed)
  }
  return { kept, withdrawn }
}

/**
 * A byte offset for every position in the string, plus one past the end.
 *
 * ## Why this exists, and the two-byte bug that found it
 *
 * The protocol says a passage's `from` and `to` are BYTES — "because the
 * consumer that opens the file reads bytes and a character count would need the
 * encoding to be agreed on as well" — and `anchor.ts` in this very module works
 * in bytes throughout, mapping every UTF-16 code unit to its UTF-8 offset so a
 * match in a tidied string can be reported against the real file.
 *
 * JavaScript indexes strings in UTF-16 code units, so a scanner that hands back
 * `match.index` is handing back a different number on any file containing a
 * character outside ASCII. On the thesis this module was first run against —
 * whose comment runs are full of em dashes and curly apostrophes — every
 * derived note came back MOVED, with `anchor.ts` politely reporting that the
 * range was "2 bytes" the wrong length. Nothing was broken and everything was
 * slightly wrong, which is the kind that survives being written: the quote
 * still found the passage, so the notes were in the right place and merely
 * accused themselves of drift forever.
 *
 * A whole array rather than a function that counts from the start each time,
 * because this is called once per annotation per read of a file and the
 * quadratic version is measurable on a thirty-kilobyte chapter.
 */
function byteOffsets(source: string): number[] {
  const out = new Array<number>(source.length + 1)
  let byte = 0
  for (let i = 0; i < source.length; i++) {
    out[i] = byte
    const code = source.charCodeAt(i)
    /* The same arithmetic `anchor.ts` uses, deliberately: a surrogate pair is
       four bytes across two units, two each, which keeps the running total
       right without either half claiming the other's. */
    byte += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdfff ? 2 : 3
  }
  out[source.length] = byte
  return out
}

/**
 * Runs of whole comment lines, collapsed into one annotation each.
 *
 * Collapsed for the same reason Paper collapses them: an author writing four
 * lines of reasoning above a section wrote one thought, and four notes saying a
 * quarter of it each would be four things to resolve and none of them readable
 * on its own.
 *
 * Only lines whose first non-blank character is `%`. A `%` after prose on the
 * same line is the author commenting OUT part of a sentence, or a note about
 * the markup rather than about the argument, and lifting the tail of a line
 * into a note beside the paper would produce fragments with no subject.
 */
function commentRuns(source: string): Annotation[] {
  const out: Annotation[] = []
  const lines = source.split('\n')

  let at = 0
  let runFrom = -1
  let runTo = -1
  const held: string[] = []

  const flush = () => {
    if (runFrom < 0) return
    /* The rules taken out and the sentences between them kept — see `isRule`.
       Done on the way into the text and never to `from`, `to` or `source`,
       which go on describing the construct exactly as it sits in the file. */
    const text = held
      .filter((line) => !isRule(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (saysSomething(text)) {
      out.push({ kind: 'comment', text, from: runFrom, to: runTo, source: source.slice(runFrom, runTo) })
    }
    runFrom = -1
    held.length = 0
  }

  for (const line of lines) {
    const indent = line.length - line.trimStart().length
    const start = at + indent
    if (line.trim() && isComment(source, start)) {
      if (runFrom < 0) runFrom = start
      runTo = at + line.length
      held.push(line.trimStart().replace(/^%+\s?/, ''))
    } else {
      flush()
    }
    /* `+ 1` for the newline `split` removed. On the last line this walks one
       past the end, which is only ever used as the start of a line that does
       not exist. */
    at += line.length + 1
  }
  flush()
  return out
}

/**
 * `\todo{…}` and its four siblings, with balanced braces.
 *
 * Balanced rather than "up to the next `}`", because these notes contain other
 * macros — `\todo{cite \gh{131} here}` is ordinary — and stopping at the first
 * closing brace would take half the note and leave the rest as prose in the
 * paper. An unbalanced brace at the end of the file ends the annotation at the
 * end of the file rather than dropping it: the author's words are there, and
 * the range being generous is visible while their absence would not be.
 */
function todoMacros(source: string): Annotation[] {
  const out: Annotation[] = []
  const pattern = /\\([a-zA-Z]+)\s*(\[[^\]]*\])?\s*\{/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1] ?? ''
    if (!TODO_MACROS.has(name)) continue
    /* An escaped `\\todo` is a printed backslash followed by the word, not a
       macro. Same rule as the `%` above and the same one-character mistake. */
    let backslashes = 0
    for (let i = match.index - 1; i >= 0 && source[i] === '\\'; i--) backslashes++
    if (backslashes % 2 === 1) continue

    const open = match.index + match[0].length - 1
    const close = matching(source, open)
    const to = close === -1 ? source.length : close + 1
    const text = source.slice(open + 1, close === -1 ? source.length : close).trim()
    if (!saysSomething(text)) continue
    out.push({ kind: 'todo', text, from: match.index, to, source: source.slice(match.index, to) })
    /* Resume after the whole macro, so a `\todo{}` nested inside another is not
       lifted twice. */
    pattern.lastIndex = to
  }
  return out
}

/** The index of the `}` closing the `{` at `open`, or -1. */
function matching(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}
