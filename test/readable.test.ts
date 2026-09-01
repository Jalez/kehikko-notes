import { describe, expect, test } from 'bun:test'

import { annotationsIn } from '../notes/annotations.ts'
import { readable, withoutRules } from '../notes/readable.ts'

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
    /* `\"{\i}` is how TeX spells `ï`: the dot comes off so the diaeresis can
       sit where it was. Unicode composes `ï` from a plain `i`, so the base this
       wants is the dotted letter.

       Written with the braces, because `na\"\ive` is not that word — TeX reads
       a control word to the end of its letters, so the command there is `\ive`
       and not `\i`. This test asserted the wrong spelling until the guard
       below was added and it stopped passing, which is the useful way to find
       out. */
    expect(readable('na\\"{\\i}ve')).toBe('naïve')
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

describe('an accent with nothing to sit on', () => {
  /*
   * Three ways the accent branch used to consume input it had not understood,
   * all found by the module that does the same job in the paper — which was
   * handed this file as a reference and deliberately did not copy them.
   *
   * They share a shape and it is the worst one available: each produced a
   * plausible-looking word rather than a visible failure. A reader meeting a
   * misplaced circumflex reads it as a typo in their own thesis; a reader
   * meeting `\^{}` on screen knows something went unrendered. The second is the
   * failure this file is supposed to have.
   */

  test('a caret on nothing does not put a circumflex on the previous word', () => {
    /* `\^{}` is a real idiom — an accent with an empty group, used to get a
       standalone diacritic or as a placeholder. This returned the bare
       combining character for it, which is not a visible mistake: a floating
       U+0302 attaches to whatever glyph precedes it, so the mark landed on the
       last letter of the word before it. */
    expect(readable('word \\^{} after')).toBe('word \\^{} after')
    expect(readable('word \\^{}')).not.toContain('\u0302')
  })

  test('a braced argument that is not a letter is not a base', () => {
    /* The argument used to be run back through this same pass, so anything at
       all could come out of it and wear a diaeresis. Only a plain letter run,
       or a dotless letter, is something to accent — and what is left falls
       through to the ordinary paths, which is why the `\emph` inside still
       unwraps and the escape in front of it is shown as source. */
    expect(readable('\\"{\\emph{a}}')).toBe('\\"{a}')
    expect(readable('\\"{ab cd}')).toBe('äb cd')
  })

  test('a dotless letter is only dotless when no letter follows it', () => {
    /* `\i` was matched with `startsWith`, which is equally true of `\int` and
       `\imath` — so `\^\int` became `î` with a stray `nt` after it, which is a
       sentence about mathematics turned into a misspelling. */
    expect(readable('\\^\\int')).toBe('\\^\\int')
    expect(readable('\\"\\imath')).toBe('\\"\\imath')
    /* And the real dotless letter still works, which is what makes the rule
       above a distinction rather than a refusal. `\ive` is a command whose name
       is `ive`; `\i` at the end of a word, or in braces, is the letter. */
    expect(readable('na\\"{\\i}ve')).toBe('naïve')
    expect(readable('\\^\\i')).toBe('î')
  })

  test('the ordinary accents are untouched by all three guards', () => {
    expect(readable('\\^{a} \\"{o} \\c{c} \\v s')).toBe('â ö ç š')
  })
})

describe('the two modules agree about a tie, by assertion rather than by luck', () => {
  test('a tie is a space here and a space in the paper', () => {
    /*
     * `~` was added to this pass from corpus evidence — every tie in the thesis
     * sits between a word and a cross-reference — and nothing pinned it. The
     * paper module has since asserted the same string against its own parser,
     * so this is the other half of that pair: the two modules share these
     * tables by COPY and not by import, which means the only thing that can
     * keep them honest is each one asserting the same answer.
     */
    expect(readable('\\textbf{RQ1}~how')).toBe('RQ1 how')
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

describe('a divider is a line somebody drew in an editor, and never a sentence', () => {
  /*
   * `withoutRules` moved here from `annotations.ts`, where it only ever saw
   * text on the way IN. The two strings a row draws that can never be lifted
   * again — the body of a note this app has stopped lifting, and `reread.was`,
   * what a note used to say — are pre-rule text, and both carry sixty equals
   * signs on the first line. Sixty unbreakable characters are the min-content
   * floor that once made a 220-pixel container 1187 pixels wide.
   */
  const rule = '='.repeat(60)

  test('the rule goes and the sentences around it stay', () => {
    expect(withoutRules([rule, 'Chapter 1 — Introduction', 'Revised order.', rule].join('\n'))).toBe(
      'Chapter 1 — Introduction\nRevised order.',
    )
  })

  test('prose that merely looks like punctuation is left alone', () => {
    /* `---` is an em dash somebody typed and `##` is a heading written by
       somebody with Markdown in their fingers. Four or more of ONE character
       and nothing else is the whole test, and anything looser eats writing. */
    expect(withoutRules('--- and ## are things the author said')).toBe('--- and ## are things the author said')
    expect(withoutRules('###')).toBe('###')
  })

  test('and a body that was nothing but rules keeps them, rather than becoming empty', () => {
    /* Unreachable from `annotations.ts`, which asks `saysSomething` first. A
       stored body written under an older rule can be anything at all, and a row
       rendering an empty paragraph would be this pass deleting a note on
       screen. */
    expect(withoutRules(rule)).toBe(rule)
  })

  test('a note lifted today has been through it already', () => {
    const source = [`% ${rule}`, '% Chapter 1 — Introduction', `% ${rule}`, '% Revised order.'].join('\n')
    expect(annotationsIn(source)[0]?.text).toBe('Chapter 1 — Introduction\nRevised order.')
  })
})
