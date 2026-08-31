/**
 * How much room there is, and what earns it.
 *
 * ## The container is not a page, and this module kept drawing one
 *
 * A canvas gives this module a box on a grid. Measured against the real store,
 * in the boxes people actually make: at 220x300 a single note was 712 pixels
 * tall and not one note in the list was fully on screen; at 320x200 the first
 * row was 474 pixels; at 460x360, none. Twenty notes came to six and a half
 * thousand pixels of document inside a three hundred pixel window. Everything
 * was drawn — the provenance badges, the file and byte range, the author, the
 * anchor's sentence, four buttons — and every one of those is worth having on a
 * page and worth two thirds of the frame in a box.
 *
 * So there is a decision here about what is drawn, it is a function of the size
 * of the frame, and it is a pure one in a file with a test rather than a pile
 * of conditionals inside JSX. The same reason `notes/scope.ts` and
 * `notes/pointed.ts` are files: it is a policy, it is worth arguing about, and
 * the alternative is a rule that can only be checked by driving a browser.
 *
 * ## Nothing is hidden, everything is one press away
 *
 * The rule this file obeys is that a small container shows LESS, never OTHER.
 * Every field a compact row drops is behind the press that was already there —
 * pressing a note points the canvas at it, and now also opens it — so nothing
 * becomes unreachable and no control moves to a place a person has to learn.
 * A row that showed a different set of facts at 300 pixels than at 900 would be
 * two designs to keep honest; a row that shows a PREFIX of the same facts is
 * one.
 *
 * ## Why this measures the frame rather than asking CSS
 *
 * Width alone is a container query — `@sm/container:` — and that is still how
 * padding is decided here, because CSS does it better and without a render.
 * Height is not: there is no `@container (height < 300px)` this module can use,
 * because its container is the frame's viewport and the frame's viewport is not
 * a container. So the frame is measured, and since the frame IS the container
 * (the canvas gives the iframe the whole box: `h-full w-full`), the width that
 * comes back is the same width the `@container` classes see. One measurement,
 * two axes, no viewport breakpoint anywhere.
 *
 * ## The numbers cannot oscillate, and that is a property of the host
 *
 * A layout that hides things when it is short, and asks its host for a height
 * based on what it drew, is one edit away from a loop: hide, shrink, grow,
 * show, hide. It cannot happen here, and not by luck — the canvas's `onHeight`
 * only ever GROWS a container, and only one whose owner turned growing on. A
 * module that draws less therefore never causes its own box to shrink, and the
 * measurement below is a fact about what a person dragged, not an echo of the
 * last thing this page rendered.
 */

/** The box, as the frame reports it. */
export interface Frame {
  width: number
  height: number
}

export interface Room {
  /**
   * Rows say what identifies them and nothing else, and open on a press.
   *
   * True when either axis is small, because either one is enough: a row needs
   * horizontal space for a line of prose to be a line rather than five words,
   * and vertical space for the eight things under the body to be worth their
   * eight lines.
   */
  compact: boolean
  /** How many lines of the note's own words, or null for all of them. */
  bodyLines: number | null
  /** How many lines of the quoted passage, or null for all of them. */
  quoteLines: number | null
  /** The badges past the verdict and `resolved`: over MCP, in the source. */
  provenance: boolean
  /** The file and byte range under the badges. */
  where: boolean
  /** Who wrote it, and who resolved it. */
  author: boolean
  /** The anchor's own sentence, under the quote. */
  said: boolean
  /** reply, resolve, re-anchor and the press that opens the paper, standing on every row. */
  actions: boolean
  /** The paragraphs that are about the LIST rather than about a note. */
  notices: boolean
  /**
   * Where a new note is written.
   *
   * `fill` is the whole frame: a form squeezed above the list costs a hundred
   * and fifty pixels of a three hundred pixel box, which is the list, and
   * leaves a textarea two lines tall to write a paragraph in. It is already
   * behind a press, so taking the frame is not a surprise — it is the press
   * doing what the press said.
   */
  compose: 'inline' | 'fill'
  /**
   * Whether a small scroll should bring the next note to the top.
   *
   * On only where it earns itself. In a box that shows two notes, stopping
   * half way through one is most of what you can see wasted, and snapping is
   * the fix the person asking for this described. In a tall container it is the
   * opposite: a reader moving through a long list feels a scroller that keeps
   * tugging at them, for no gain, because they can already see four notes
   * whatever it lands on.
   */
  snap: boolean
}

/**
 * Under this many pixels wide, prose is not prose.
 *
 * 300 rather than one of Tailwind's container sizes because it is about this
 * module's own content: at 220 the body of a real note ran twenty lines, and
 * the three badges on the row above it stacked into three. The `@sm/container`
 * breakpoint (384) still decides padding, which is what it is good at.
 */
const NARROW = 300

/**
 * Under this many pixels tall, a full row is most of the frame.
 *
 * Measured: a plain note with everything drawn is 130 to 250 pixels tall, so a
 * 400-pixel box holds two of them and a 360-pixel one holds fewer. Above this
 * there is room for three or four, which is a list.
 */
const SHORT = 400

/** Under this many pixels tall, a form above the list would BE the list. */
const NO_ROOM_FOR_A_FORM = 450

/** Above this, snapping is a tug with nothing to gain. */
const TALL_ENOUGH_TO_ROAM = 600

export function roomFor(frame: Frame): Room {
  const narrow = frame.width < NARROW
  const short = frame.height < SHORT
  const compact = narrow || short

  return {
    compact,
    /* Two lines in a box that holds three rows, three where it holds four.
       The whole body is one press away and the first two lines are what a
       reader chooses by. */
    bodyLines: compact ? (short && frame.height < 320 ? 2 : 3) : null,
    quoteLines: compact ? 2 : null,
    provenance: !compact,
    where: !compact,
    author: !compact,
    said: !compact,
    actions: !compact,
    notices: !compact,
    compose: narrow || frame.height < NO_ROOM_FOR_A_FORM ? 'fill' : 'inline',
    snap: frame.height < TALL_ENOUGH_TO_ROAM,
  }
}

/**
 * Everything drawn, which is what a component asked for no room at all should
 * assume.
 *
 * A default rather than an optional field, so that a row rendered by a test or
 * by a caller that has not measured anything says everything it knows rather
 * than silently hiding half of it.
 */
export const ROOMY: Room = roomFor({ width: 10_000, height: 10_000 })

/**
 * May this row carry a snap point?
 *
 * Only if the whole of it fits. A snap point on the start of a row taller than
 * the window is a scroller that pulls a reader back to the top of the note they
 * are trying to read the bottom of — the reason the scroller uses `proximity`
 * and not `mandatory`, one step further: proximity's range is the browser's to
 * choose, and near the start of a long note it chooses to snap.
 *
 * So a long note simply has no snap point, and scrolling through it is
 * ordinary scrolling. The next note along still has one, so the behaviour the
 * person asked for — a small scroll brings the next note fully into view —
 * survives the note that could not have it.
 */
export function snappable(row: number, view: number): boolean {
  if (row <= 0 || view <= 0) return false
  return row <= view
}
