/**
 * One annotation's words, as a person wrote them rather than as TeX spells them.
 *
 * ## What was on screen, and why it is two faults and not one
 *
 * The owner's example, in a 220-pixel column:
 *
 *   A provisional English abstract and keywords are now drafted in the front
 *   matter (\texttt{main.tex}); the Finnish \emph{tiivistelm\"a} still needs
 *   writing, and the abstract's findings should be revisited once the thematic
 *   results are final.
 *
 * `Annotation.text` was documented as "a comment run with its `%` markers
 * stripped, a `\todo{…}` with its wrapper gone", and that is exactly what it
 * was: the OUTER wrapper removed and nothing inside it touched. So two
 * different things leaked. `\texttt{…}` and `\emph{…}` are inline commands
 * shown as source — markup the author never meant anybody to read. And `\"a`
 * is an accent escape: it is not markup around a word, it IS a letter, and
 * showing it renders a Finnish word as something that is not a Finnish word.
 * The second is the worse of the two, because a reader who has never seen TeX
 * cannot tell it from a typo in the thesis.
 *
 * ## The decision the owner asked for: this is not shared with Paper
 *
 * Paper has a complete LaTeX parser — `latex/parse.ts`, forty-eight kilobytes
 * of it — and it already turns `\emph{x}` into a styled span and `\%` into a
 * percent sign. The workspace rule is that two systems should not do the same
 * thing, so the question was asked properly before this file was written, and
 * the answer is that it stays here. Three reasons, in the order they decide it:
 *
 * 1. **The protocol forbids the only arrangement that would actually share
 *    it.** Importing Paper's parser means one module's code is another
 *    module's dependency over a channel neither manifest declares — the same
 *    dependency the essay at the top of `annotations.ts` refuses at length, and
 *    it refuses it for the parse of the whole document, which is a far bigger
 *    prize than this. A rule that survives the big case and is dropped for the
 *    small one is not a rule.
 * 2. **It is a different job at a different scale.** Paper's parser produces
 *    blocks, segments, styles, and a byte range for every span, because a
 *    reader has to be able to select inside it and get an offset back. This
 *    produces a string. It has no offsets, no styles and no structure, and it
 *    is deliberately allowed to be wrong in ways Paper may not be: it may leave
 *    a construct it does not know alone, which for a document renderer would be
 *    markup on screen and here is just a short body that reads slightly oddly.
 * 3. **A third home is worse than two copies.** The only sharing that does not
 *    break rule 1 is a package both modules depend on — a real repository, a
 *    version, a release, and a protocol change every time one module wants a
 *    macro the other does not. For roughly a hundred lines with no state, that
 *    is more moving parts than the duplication it removes. If a third module
 *    ever needs the same pass, that is the moment to reconsider; two is not.
 *
 * What is shared instead is the TABLE, by being copied deliberately and said
 * out loud: the unwrapped commands below are exactly the keys of Paper's
 * `STYLE_CMDS`, and the character escapes are exactly its `CHAR_ESCAPES`. Where
 * the two disagree the symptom is a note body that reads a little differently
 * from the same words in the paper beside it — visible, and nothing like the
 * silent failure a hidden cross-module dependency produces.
 *
 * Paper does NOT do accents at all, incidentally, which this found: `\"a`
 * renders in the reading column as a bare `a`. That is Paper's to fix and is
 * reported rather than reached into from here.
 *
 * ## The bound: unrecognised means untouched
 *
 * Every rule here is a whitelist and the default is to copy the source through
 * unchanged. The failure being designed against is a note whose body is
 * mathematics — `$\alpha \le \beta$`, `\frac{n}{2}` — turned into nonsense by a
 * pass that helpfully deleted the backslashes. A note that still shows
 * `\citep{lamport1978}` is mildly ugly; a note that shows `alpha le beta` is a
 * lie about what the author wrote. So math is copied verbatim, delimiters and
 * all, and any command not in one of the three tables keeps its backslash and
 * its braces.
 *
 * ## The two spaces, which the corpus argued into the list
 *
 * `~` and `\ ` are both spaces — a tie that must not break, and an inter-word
 * space after a full stop that would otherwise be read as the end of a
 * sentence. Neither was in the reported fault and both were going to be left
 * alone as markup, until `dev/reads-as-prose.ts` was run over the thesis: every
 * one of the thirty-odd ties in it sits between a word and a cross-reference
 * (`Chapter~\ref{…}`, `\textbf{RQ1}~how students perceive`), and on screen that
 * read as `RQ1~how`, which is the owner's complaint again in a different
 * spelling. `e.g.\ which parts` was the same with a stray backslash.
 *
 * They are converted the way Paper converts them — unconditionally, a tilde to
 * a plain space — rather than by a cleverer rule that tries to spare `~/some/
 * path`. There is no such path in this corpus, and a heuristic that is right
 * more often than Paper is a heuristic that makes the note and the paper
 * disagree in a way neither can explain to a reader.
 *
 * ## What this does NOT do, on purpose
 *
 * `--` stays two hyphens and `\\` stays a double backslash. Both have a
 * defensible rendering, Paper renders neither, and both are the beginning of
 * the slope that ends in this file being a second document renderer — which is
 * the thing the essay above says it must not become.
 *
 * ## What changing this does to notes that already exist
 *
 * The stable key is a hash of this text, so every note whose body this pass
 * changes gets a new key. That is not a fork: `keep.ts` recognises a stored
 * note by its `quoted` — the exact slice of the file — precisely so that a
 * change in how this app READS a construct is told apart from an author
 * rewording one. The file did not change, `quoted` is byte-identical, the note
 * is adopted, and the change is recorded as a `reread` carrying what the body
 * used to say. That mechanism was built for the rule-stripping change and this
 * is the second thing to use it; the honest account of this commit is
 * "seven notes now read differently and each one says so", not a silent
 * rewrite.
 *
 * Nothing here touches `from`, `to` or `source`. Those describe where the
 * construct sits in the file and what is exactly there, and `anchor.ts`
 * re-finds the passage by them.
 */

/**
 * A line that is a horizontal rule rather than a sentence.
 *
 * ## Why this test is narrow, and what it costs when it is not
 *
 * The chapters of the thesis this was written against open with `%` rules sixty
 * characters wide. Stripped of their `%` those are a run of equals signs: not
 * empty, not an annotation, and not something anybody wrote about the paper —
 * a line somebody drew in a text editor to separate one part of a file from
 * another. On screen it is worse than noise, because sixty unbreakable
 * characters are a min-content floor, and that is the measurement that once
 * made a 220-pixel container 1187 pixels wide.
 *
 * Four or more of ONE punctuation character and nothing else. Anything looser
 * starts eating prose: `---` is an em dash somebody typed and `##` is a heading
 * in a comment written by somebody with Markdown in their fingers, and both are
 * things the author said.
 *
 * ## Why it lives here rather than in `annotations.ts`, where it was written
 *
 * It was a private helper there, applied line by line on the way into a comment
 * run, and that covered every note this app LIFTS. It does not cover the two
 * strings this app draws that it can no longer re-read: the body of a note it
 * has stopped lifting, and `Source.reread.was` — what a note used to say, which
 * is frozen because the replies under it were written against those words. Both
 * are pre-rule text, both are drawn, and one of them is drawn on a third of the
 * notes in the thesis.
 *
 * One home rather than two: `annotations.ts` calls this on the way in, the row
 * calls it on the way out, and there is no second spelling of "this is not a
 * sentence" to keep in step with the first.
 */
function isRule(line: string): boolean {
  return /^([=\-_*~#+.])\1{3,}$/.test(line.trim())
}

/**
 * The same words with the divider lines taken out.
 *
 * Line by line, and the sentences between two rules are kept — a run that is a
 * rule, four sentences and another rule is how every chapter of the thesis
 * opens, so dropping the whole run would drop the note.
 *
 * Falls back to the text it was given when the rules were all there was. That
 * is not a case `annotations.ts` can reach — it asks `saysSomething` before it
 * keeps anything — but a stored body written under an older rule can be
 * anything at all, and a row that renders an empty paragraph where a note used
 * to be would be this pass deleting somebody's note on screen.
 */
export function withoutRules(text: string): string {
  const kept = text
    .split('\n')
    .filter((line) => !isRule(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  return kept.trim() ? kept : text
}

/**
 * Inline commands whose braced argument is the text and whose name is styling.
 *
 * Exactly the keys of Paper's `STYLE_CMDS`, copied rather than imported for the
 * reason in the essay above. They differ in what they mean — Paper keeps the
 * style and drops the wrapper, this drops both — because a note body is a
 * paragraph of plain text in a narrow column and has nowhere to put a typeface.
 */
const UNWRAP = new Set(['emph', 'textit', 'textsl', 'textbf', 'textsc', 'texttt', 'textrm', 'underline'])

/**
 * Single-token escapes: two characters of source, one character on screen.
 *
 * Exactly Paper's `CHAR_ESCAPES`. `\%` matters most of the five, because a
 * comment run is introduced by `%` and an author writing about a percentage
 * inside one has to escape it — so this is the escape most likely to be in the
 * text this module lifts.
 */
const ESCAPED: Record<string, string> = {
  '%': '%',
  '&': '&',
  _: '_',
  $: '$',
  '#': '#',
  '{': '{',
  '}': '}',
}

/**
 * The control space, `\ `, which is a space and not an escaped anything.
 *
 * Paper spells it `SYMBOL_CMDS[' ']` and gives it the same rendering. It is
 * kept out of `ESCAPED` so that table can go on being exactly Paper's
 * `CHAR_ESCAPES`, which is a claim worth being able to check by eye. The other
 * space, a bare `~`, is not a command at all and is handled in the scan.
 */
const CONTROL_SPACE = ' '

/**
 * Accent escapes, as combining marks.
 *
 * ## Why marks and `normalize`, rather than a table of finished letters
 *
 * The obvious spelling is a map from `\"a` to `ä`, and it needs an entry for
 * every letter every accent can sit on: `\"a \"e \"i \"o \"u \"y \"A …` is
 * seven rows for one accent before anybody writes a Czech name. This thesis
 * already has one comment run explaining that its bibliography needs s-caron
 * and c-acute, so the long tail is not hypothetical here.
 *
 * A combining mark plus `String.prototype.normalize('NFC')` is the whole table
 * in fifteen rows, and it is the Unicode standard's own answer to exactly this
 * question rather than this file's. Where no precomposed character exists the
 * result stays decomposed — which is still the right letter, renders correctly,
 * and is a far better answer than the escape.
 *
 * The keys are of two kinds and the parser below has to tell them apart. A
 * non-letter accent binds tight: `\"a` is a complete construct because `"` can
 * never be part of a command name. A letter-named one cannot — `\v` is a caron
 * and `\vspace` is not — so those are only read as accents when the name stands
 * alone and something follows it to accent.
 */
const MARKS: Record<string, string> = {
  '"': '̈',
  "'": '́',
  '`': '̀',
  '^': '̂',
  '~': '̃',
  '=': '̄',
  '.': '̇',
  u: '̆',
  v: '̌',
  H: '̋',
  r: '̊',
  c: '̧',
  k: '̨',
  d: '̣',
  b: '̱',
}

/**
 * The dotless letters, which exist only to be accented.
 *
 * `\"\i` is how TeX spells `ï` — the dot is removed so the diaeresis has
 * somewhere to sit. Unicode's `ï` is composed from a plain `i`, so the base
 * this pass wants is the dotted letter and not `ı`. Outside an accent's
 * argument these are left alone, because there `\i` is a letter this pass has
 * no reason to touch and the rule is that unrecognised means untouched.
 */
const DOTLESS: Record<string, string> = { i: 'i', j: 'j' }

/** Math, copied through untouched: opening delimiter to the matching close. */
const MATH: { open: string; close: string }[] = [
  { open: '$$', close: '$$' },
  { open: '\\[', close: '\\]' },
  { open: '\\(', close: '\\)' },
  { open: '$', close: '$' },
]

/** The `}` matching the `{` at `open`, or -1. Escaped braces do not count. */
function matching(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
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

/** A command name: a run of letters, or the single character of a control symbol. */
function nameAt(text: string, at: number): string {
  const letters = /^[a-zA-Z]+/.exec(text.slice(at))
  if (letters) return letters[0]
  return text[at] ?? ''
}

/**
 * One letter with a mark on it, composed if Unicode has a composition for it.
 *
 * The mark goes after the FIRST character rather than after the argument,
 * because `\"{oo}` — which nobody writes on purpose but which a truncated
 * source can produce — should accent the letter it names and leave the rest
 * alone, not hang a diaeresis off the end of a word.
 *
 * `base` is never empty, and the caller is what guarantees it: the scan below
 * only reaches this once it has a letter to accent, and emits the escape as
 * source when it has not. That guarantee used to be missing and the bug it let
 * through is the reason this paragraph exists — `\^{}` is a real idiom, a caret
 * on nothing, and this returned the bare combining character for it. A floating
 * U+0302 is not a visible mistake: it attaches to whatever glyph happens to
 * precede it, so the circumflex landed on the last letter of the previous word
 * and read as a typo in the author's own thesis.
 */
function accented(base: string, mark: string): string {
  return (base[0] + mark + base.slice(1)).normalize('NFC')
}

/**
 * The words an annotation says, with its inline markup read rather than shown.
 *
 * Pure, and a string in and a string out, for the same reason the rest of this
 * module is: it is the part that can be wrong in a way a reader notices, so it
 * is the part that has to be testable without a disk or a browser.
 */
export function readable(text: string): string {
  let out = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i] as string

    /* Math first, and before the backslash rules, because `\(` is a math
       delimiter and would otherwise be read as an escape of `(`. Everything
       between the delimiters is copied byte for byte — see the essay on why a
       helpful pass over mathematics is worse than no pass at all. */
    const math = MATH.find((each) => text.startsWith(each.open, i))
    if (math) {
      const close = text.indexOf(math.close, i + math.open.length)
      /* Unterminated: the rest of the string is math as far as anybody can
         tell, and copying it verbatim is the answer that cannot be wrong. */
      const end = close === -1 ? text.length : close + math.close.length
      out += text.slice(i, end)
      i = end
      continue
    }

    /* A tie. Outside mathematics — which was answered above — this is a space
       that must not break, and on screen it is a space. */
    if (ch === '~') {
      out += ' '
      i++
      continue
    }

    if (ch !== '\\') {
      out += ch
      i++
      continue
    }

    const name = nameAt(text, i + 1)
    if (!name) {
      /* A backslash at the very end of the string. It is what the author
         typed. */
      out += ch
      i++
      continue
    }
    let after = i + 1 + name.length

    /* `\\` is a line break and stays as it is — see "what this does NOT do".
       It is caught here rather than falling through so that the `\` it holds
       cannot be read as the start of another escape. */
    if (name === '\\') {
      out += '\\\\'
      i = after
      continue
    }

    if (name === CONTROL_SPACE) {
      out += ' '
      i = after
      continue
    }

    const escape = ESCAPED[name]
    if (escape !== undefined && name.length === 1) {
      out += escape
      i = after
      continue
    }

    const mark = MARKS[name]
    if (mark !== undefined) {
      /* A letter-named accent is allowed the space that separates it from its
         argument, because TeX eats it: `\c{c}` and `\c c` are both cedillas. A
         control symbol is not — `\" a` is a diaeresis on a space, and guessing
         otherwise would be this pass being cleverer about the author's source
         than the compiler that produced their PDF. `\vspace` never reaches here
         at all, because its name is read as the whole run of letters. */
      let at = after
      if (/^[a-zA-Z]$/.test(name)) while (text[at] === ' ') at++

      /*
       * What there is to put the mark on, and the three ways to have nothing.
       *
       * ## The rule this obeys, which it did not
       *
       * A pass that does not recognise a construct must leave it alone. That is
       * the rule the rest of this file keeps and it slipped in exactly this
       * branch, three times, all in the same direction: consuming input it had
       * not understood.
       *
       * - A braced argument used to be run back through `readable`, so
       *   `\"{\emph{a}}` hung a diaeresis on whatever that returned. Only a
       *   plain letter run, or a dotless letter, is a base.
       * - An empty group used to reach `accented('')`, which returned the bare
       *   mark — see the essay there.
       * - `\i` was matched with `startsWith`, which is also true of `\int` and
       *   `\imath`, so `\^\int` became `î` followed by a stray `nt`. A dotless
       *   letter is only dotless when no letter follows it.
       *
       * Every one of them read as a typo in the author's writing rather than as
       * something this app had failed to render, which is the worse of the two
       * failures: a visible `\^{}` tells a person something went unrendered,
       * and a diacritic on the wrong letter tells them nothing at all.
       */
      let base = ''
      let upto = at
      if (text[at] === '{') {
        const close = matching(text, at)
        const inner = close === -1 ? '' : text.slice(at + 1, close)
        const dotless = inner.startsWith('\\') ? DOTLESS[inner.slice(1)] : undefined
        if (dotless !== undefined) base = dotless
        else if (/^[^\\{}]+$/.test(inner)) base = inner
        if (base) upto = close + 1
      } else if (text[at] === '\\' && DOTLESS[text[at + 1] ?? ''] !== undefined && !/[a-zA-Z]/.test(text[at + 2] ?? '')) {
        base = DOTLESS[text[at + 1] as string] as string
        upto = at + 2
      } else if (/^[a-zA-Z]$/.test(text[at] ?? '')) {
        base = text[at] as string
        upto = at + 1
      }

      if (base) {
        out += accented(base, mark)
        i = upto
        continue
      }

      /* Nothing to accent. The escape is left exactly as written, which is the
         rule everywhere else in this file, and the brace group after it — if
         there is one — is read as ordinary text on the next turn of the scan
         rather than being swallowed with it. */
      out += text.slice(i, after)
      i = after
      continue
    }

    if (UNWRAP.has(name)) {
      /* `\emph {x}` with a space is legal TeX and is written by people who
         format their source. */
      while (text[after] === ' ') after++
      if (text[after] === '{') {
        const close = matching(text, after)
        if (close !== -1) {
          out += readable(text.slice(after + 1, close))
          i = close + 1
          continue
        }
      }
      /* A style command with no argument is not a wrapper — `{\bfseries x}` is
         spelled that way and this is its cousin. Left alone. */
    }

    /* Unrecognised. The backslash and the name go through exactly as written,
       and the scan resumes after the name so that a brace group belonging to a
       command this pass does not know is read as ordinary text rather than
       swallowed. */
    out += text.slice(i, i + 1 + name.length)
    i = i + 1 + name.length
  }

  return out
}
