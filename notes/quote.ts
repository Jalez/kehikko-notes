import type { AnchorState } from './anchor.ts'

/**
 * Whether a note's row draws the words it was written about.
 *
 * ## The paper already shows them, on a press
 *
 * Every typed note used to draw its stored quote under the badge, on every row,
 * at every size. That was right when a row was the only place the passage could
 * be seen. It is not any more: pressing a row points the paper at the passage,
 * and the paper highlights it — in the document, in context, with the sentences
 * either side. A quote on a healthy row is the same words a second time, one
 * press before the reader would have seen them properly, and on a column of
 * twenty notes it is twenty paragraphs of italics standing between a reader and
 * what somebody SAID, which is what they came to the list to read.
 *
 * The owner's rule, which is this function: draw the quote only where pressing
 * the note cannot show the passage in the paper. It is the same test this
 * module already applied to the `anchored` badge — a thing on every healthy row
 * is the default spelled out — and it keeps the quote exactly where it is the
 * only record there is.
 *
 * ## State by state
 *
 * - `exact`: the words are where they always were and a press highlights them.
 *   Not drawn.
 * - `moved`: the offsets rotted, but the words were FOUND again, and a press
 *   points at where they are now — `point` sends the anchor's range, not the
 *   note's. The paper can highlight them. Not drawn. (The badge and its
 *   sentence still say it moved; that is the part a reader cannot get from
 *   the paper.)
 * - `adrift`: the passage is gone, a press points at nothing — `canPoint` in
 *   `NoteRow` and `point` in `app.tsx` both refuse — and the quote is the only
 *   record of what the note was about. Drawn, always. See the essay at the top
 *   of `src/view/note.tsx`.
 * - `unverified`: this app could not read the document, or the note was stored
 *   with no words to check. A press sends the recorded bytes, but nobody here
 *   knows what now sits at them, so whatever the paper lights up is a guess.
 *   The quote is the one thing on screen that is not. Drawn.
 * - `unranged`: written about a whole page or document with nothing selected.
 *   A press opens the document and lands on no range, so there is nothing the
 *   paper can highlight. Drawn — and usually empty, in which case the row has
 *   nothing to draw anyway.
 * - Anything this file has never heard of is drawn: the cost of a quote too
 *   many is a line of italics, and the cost of one too few is a note about
 *   words nobody can find.
 *
 * And none of the above applies where there is nobody to press to: `points` is
 * false on a page nothing is framing (`actions.point` is null outside a host),
 * and there the row is the only place the passage can be seen at all. Drawn,
 * whatever the verdict.
 *
 * ## Only the drawing
 *
 * This decides whether a `<blockquote>` appears and nothing else. The quote is
 * still stored, still sent with every press, still what `anchor.ts` checks the
 * file against, and `room.ts` still budgets `quoteLines` for a row that draws
 * one. A note is not changed by how its row is drawn.
 */
export function showsQuote(state: AnchorState | string, points: boolean): boolean {
  if (!points) return true
  return !SHOWN_IN_THE_PAPER.has(state)
}

/**
 * The verdicts a press can land on a range the paper will highlight. A set of
 * the two that can, rather than of the three that cannot, so that a verdict
 * added later keeps its quote until somebody decides otherwise here.
 */
const SHOWN_IN_THE_PAPER: ReadonlySet<string> = new Set<AnchorState>(['exact', 'moved'])
