import { describe, expect, test } from 'bun:test'

import { annotationsIn } from '../notes/annotations.ts'
import { readable } from '../notes/readable.ts'

/**
 * A note body that reads as prose, and the much larger set of things this pass
 * must refuse to touch.
 *
 * The tests below are in two halves and the second half is the important one.
 * Getting `\emph{x}` to say `x` is four lines of code; the risk in this file is
 * a pass that keeps going — that strips a backslash out of somebody's
 * mathematics, or eats the argument of a command it has never heard of — and
 * every one of those failures reads as the note itself being wrong. So there
 * are more assertions here about what stays than about what changes.
 */

/**
 * The owner's own example, which is the reason this file exists.
 *
 * It is one sentence and carries both reported faults at once: two inline
 * commands shown as source, and an accent escape shown instead of the letter it
 * spells. It is quoted exactly as it stands in the thesis — `chapters/
 * 1_introduction.tex`, line 13 — rather than reduced to a smaller case, because
 * a test that passes on `\emph{x}` and fails on the sentence that was actually
 * on screen has proved nothing about the complaint.
 */
const OWNER =
  '\\missing{A provisional English abstract and keywords are now drafted in the front matter '
  + '(\\texttt{main.tex}); the Finnish \\emph{tiivistelm\\"a} still needs writing, and the abstract\'s '
  + 'findings should be revisited once the thematic results are final.}'

describe('the sentence the owner was shown', () => {
  test('reads as a person wrote it', () => {
    expect(annotationsIn(OWNER)[0]?.text).toBe(
      'A provisional English abstract and keywords are now drafted in the front matter '
      + '(main.tex); the Finnish tiivistelmä still needs writing, and the abstract\'s '
      + 'findings should be revisited once the thematic results are final.',
    )
  })

  test('the quote and the range are exactly what is in the file', () => {
    /* The whole re-anchoring mechanism rests on `quoted` being the file's own
       bytes. A tidied quote is one that no longer matches the document, which
       would report every note in the thesis as adrift forever — and `keep.ts`
       recognises a note whose BODY this app now reads differently by comparing
       precisely this field, so a pass that touched it would fork every note it
       improved. */
    const one = annotationsIn(OWNER)[0]
    expect(one?.source).toBe(OWNER)
    expect(one?.from).toBe(0)
    expect(one?.to).toBe(Buffer.byteLength(OWNER))
  })
})

describe('markup that is read rather than shown', () => {
  test('the style wrappers go and their words stay', () => {
    expect(readable('\\emph{one} \\textbf{two} \\texttt{three} \\underline{four}')).toBe('one two three four')
  })

  test('nested wrappers unwrap all the way down', () => {
    /* `\todo{cite \emph{\textbf{this}} here}` is ordinary in these files. */
    expect(readable('cite \\emph{\\textbf{this}} here')).toBe('cite this here')
  })

  test('a wrapper with a space before its brace is still a wrapper', () => {
    expect(readable('\\emph {formatted source}')).toBe('formatted source')
  })

  test('escaped specials become the character they print', () => {
    expect(readable('100\\% of \\$5 \\& \\#1 \\_x')).toBe('100% of $5 & #1 _x')
  })

  test('accent escapes become the letter they spell', () => {
    /* Both spellings of the argument, because authors write both. */
    expect(readable('tiivistelm\\"a')).toBe('tiivistelmä')
    expect(readable('tiivistelm\\"{a}')).toBe('tiivistelmä')
    expect(readable("Ph\\'{a}m \\v{S}koda \\c{c}a \\`a \\^o \\~n \\r{a}")).toBe('Phám Škoda ça à ô ñ å')
  })

  test('both spellings of a space become a space', () => {
    /* Found by running the pass over the thesis rather than by thinking about
       it: every tie in that document sits between a word and a
       cross-reference, and `RQ1~how students` on screen is the reported fault
       in a different spelling. */
    expect(readable('\\textbf{RQ1}~how students perceive Chapter~\\ref{ch:methods}')).toBe(
      'RQ1 how students perceive Chapter \\ref{ch:methods}',
    )
    expect(readable('e.g.\\ which parts')).toBe('e.g. which parts')
  })

  test('the dotless letters exist to be accented and are', () => {
    /* `\"\i` is how TeX spells `ï`: the dot comes off so the diaeresis can sit
       where it was. Unicode composes `ï` from a plain `i`, so the base this
       wants is the dotted letter. */
    expect(readable('na\\"\\ive')).toBe('naïve')
  })
})

describe('everything else is left exactly as the author wrote it', () => {
  test('a note whose body is mathematics is not turned into nonsense', () => {
    /* The failure this whole file is bounded against. A pass that helpfully
       removed backslashes would render this as `alpha le beta` — which is not
       ugly, it is a false report of what is in the document. */
    const math = 'the bound $\\alpha \\le \\beta$ holds, and \\[ \\frac{n}{2}~ \\] is the count'
    expect(readable(math)).toBe(math)
  })

  test('a wrapper inside mathematics is not unwrapped either', () => {
    /* Inside `$…$` this pass has no opinion at all, and `\textrm` there is part
       of an expression rather than styling on a sentence. */
    expect(readable('$x_{\\textrm{max}}$')).toBe('$x_{\\textrm{max}}$')
  })

  test('unterminated mathematics is copied rather than guessed at', () => {
    expect(readable('half an equation $\\alpha + ')).toBe('half an equation $\\alpha + ')
  })

  test('a command this pass does not know keeps its backslash and its argument', () => {
    expect(readable('as \\citep{lamport1978} shows')).toBe('as \\citep{lamport1978} shows')
    expect(readable('see \\autoref{fig:three-rungs}')).toBe('see \\autoref{fig:three-rungs}')
  })

  test('a command whose name merely starts with an accent’s name is not an accent', () => {
    /* `\v` is a caron and `\vspace` is not. The name is read as the whole run
       of letters for exactly this reason. */
    expect(readable('\\vspace{1em} after')).toBe('\\vspace{1em} after')
    expect(readable('\\cite{x} and \\r{a}')).toBe('\\cite{x} and å')
  })

  test('an accent with nothing to accent is left as it stands', () => {
    expect(readable('a trailing \\"')).toBe('a trailing \\"')
  })

  test('a line break stays a line break and is not read as an escape', () => {
    /* `\\%` is a break followed by a percent sign, not an escaped percent, and
       reading it the other way would delete a line break and print a `%`
       nobody typed. */
    expect(readable('one \\\\ two')).toBe('one \\\\ two')
  })

  test('a style command with no argument is not a wrapper', () => {
    expect(readable('{\\emph is a switch here}')).toBe('{\\emph is a switch here}')
  })
})

describe('what the pass must not disturb about identity', () => {
  test('a body that is only markup still says nothing', () => {
    /* `saysSomething` runs after this pass, so a construct that reads as
       punctuation once its escapes are resolved is dropped the same way an
       empty one is, rather than becoming a note that says `%`. */
    expect(annotationsIn('\\todo{\\%}')).toHaveLength(0)
  })

  test('comment runs get the same reading as macros do', () => {
    const source = ['% The Finnish \\emph{tiivistelm\\"a} is still missing.', 'A paragraph.'].join('\n')
    expect(annotationsIn(source)[0]?.text).toBe('The Finnish tiivistelmä is still missing.')
  })
})
