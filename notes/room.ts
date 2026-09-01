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
 *
 * The same rule now covers a row that is too long rather than a container that
 * is too small: `MOST` caps how many lines of anybody's words a row shows at
 * ANY size, and the rest of them is behind that same press. A cap that cut a
 * note off with no way to read the end of it would be this file failing its own
 * rule in a new place.
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
  /**
   * How many lines of the note's own words, before anybody presses it.
   *
   * The smaller of two numbers: what the FRAME holds, and `MOST`, which is the
   * length past which a row stops being a row. Never null and never "all of
   * them" — see `MOST` for the cap the owner asked for and why the frame alone
   * could not be it.
   */
  bodyLines: number
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

/**
 * One line of a note's body, in pixels.
 *
 * `text-sm` is 0.875rem on a 1.25rem line, and 1.25rem is 20 pixels at every
 * root size this page is drawn at. Measured rather than derived, on all four
 * probe sizes, and it came back 20 on every one of them.
 */
const LINE = 20

/**
 * Everything in a compact row that is not the body, in pixels.
 *
 * The badge line, the row's own padding and the gap above the body. Measured
 * the same way, and it came back as the same number at every size this module
 * is drawn in — 79 minus 40 at 220x300 and at 320x200, 99 minus 60 at 460x360,
 * 59 minus 20 for a one-line note — which is why it can be a constant rather
 * than something the layout has to report back.
 *
 * It is the WORST case rather than the common one, and deliberately so since
 * `view/note.tsx` stopped drawing a badge on a healthy anchor. A row with no
 * badge on it is 19 pixels of chrome, not 39, so an ordinary row now comes out
 * twenty pixels short of the window — 239 in a 264-pixel frame — and a row that
 * DOES carry a badge still fits. Being wrong in the other direction is what
 * costs something: a row a few pixels taller than the window loses its snap
 * point to `snappable`, and one flick stops being one note. Twenty pixels of
 * air on the common row is the cheaper mistake, and it is the one that is only
 * ever made in a container too small to have any other kind.
 *
 * A row with a QUOTE on it is taller than this, because a note somebody typed
 * carries the passage as well as the words about it. That case is not modelled
 * here and deliberately: this module is a function of the frame and knows
 * nothing about any particular note. What it costs is that such a row can be a
 * little taller than the window, at which point `snappable` takes its snap
 * point away and it scrolls like an ordinary long note, which is the behaviour
 * that already exists for a note longer than the frame.
 */
const ROW_CHROME = 39

/**
 * The heading and the page's own padding, above the scroller, in pixels.
 *
 * The frame is not the list: the scope, the widen ladder and the press that
 * writes a note sit outside the scroller on purpose — they are the way back,
 * and the previous work moved them out so they could not scroll away. Measured
 * at 36 pixels on the narrow sizes and 40 at 460 wide, where the padding steps
 * up at the `@sm/container` breakpoint. The larger of the two is used, because
 * being wrong in this direction leaves a row slightly shorter than the window
 * and being wrong in the other leaves it slightly taller — and a row taller
 * than the window is one that loses its snap point.
 */
const CROWN = 40

/**
 * Never fewer than this many lines, whatever the arithmetic says.
 *
 * A 150-pixel container is a real thing somebody can drag, and one line of a
 * sentence is not a note. Below the point where two lines fit, the row is
 * taller than the window and the reader scrolls — which is honest, and better
 * than a row that says nothing.
 */
const FEWEST = 2

/**
 * How many lines of one note's body this frame can hold.
 *
 * ## The complaint, and what the old rule was actually optimising
 *
 * "When there's not enough space in notes — instead of trying to squeeze as
 * many notes visible at once, it should focus on showing one note fully."
 *
 * The rule this replaces was `short && height < 320 ? 2 : 3`, and those numbers
 * were chosen to fit three rows into a 300-pixel box. They did: `dev/sizes.mjs`
 * reported three notes fully on screen at 220x300, and that was recorded as the
 * win of the responsive pass. It was the wrong thing to count. Every one of
 * those three rows was two lines of a note that wanted twenty, so the probe now
 * counts `whole` as well — on screen AND not truncated — and the same layout
 * measured `fully: 3, whole: 0`. Three notes were visible and none of them was
 * readable.
 *
 * So the frame decides, instead of a constant deciding for it: one row is one
 * frameful, and the notes shorter than that — which in the thesis this was
 * measured against is most of them, wanting 6, 3 and 7 lines against the first
 * one's 20 — are simply drawn whole.
 *
 * ## Why this is a better answer than not clamping at all
 *
 * Dropping the clamp in a short container was tried first and measured worse.
 * At 220x300 the first note became a 439-pixel row in a 264-pixel window, so
 * nothing was whole, and — the part that is easy to miss — `snappable` takes
 * the snap point off any row taller than the window, so a flick landed
 * seventy pixels into a note instead of at the top of one. The probe printed
 * `whole: 0, cut: 70`: a partial row again, which is the thing being fixed.
 *
 * Fitting the frame keeps the row at or just under the window, which is exactly
 * the condition `snappable` asks for. One flick is one note. The rest of a note
 * too long for any window is where it always was, one press away, and that
 * press is the one already on the row.
 *
 * ## What this number is NOT allowed to decide any more
 *
 * It is now the smaller half of `bodyLines` rather than the whole of it. On its
 * own it says a 900-pixel-tall column may spend forty-one lines on one note,
 * which is one note filling a list — see `MOST`, which is the other half.
 */
export function linesInFrame(height: number): number {
  const forTheBody = height - CROWN - ROW_CHROME
  return Math.max(FEWEST, Math.floor(forTheBody / LINE))
}

/**
 * The most lines of one note's words any row shows before it is pressed.
 *
 * ## The complaint
 *
 * The owner, looking at one row that had ninety words on it: "Notes should
 * perhaps have a word cap to keep things reasonably sized."
 *
 * A cap in WORDS was the obvious reading and it is the wrong unit. Ninety words
 * is twenty lines in a 220-pixel column and four in a 900-pixel one, so a
 * word count would cut a row that was already short and leave a page-long one
 * alone; what a person is looking at is how much of the FRAME a note takes, and
 * that is lines. It would also have been a second limit competing with the one
 * this file already has, and two clamps whose disagreements only show up in a
 * browser is how a row ends up truncated twice.
 *
 * So the cap is lines, it is the same `line-clamp` mechanism `linesInFrame`
 * already drives, and it applies at EVERY size — including the tall roomy
 * container, which is where `bodyLines` used to be `null` and where the row in
 * the complaint was measured.
 *
 * ## Six, and where the number comes from
 *
 * Measured, against the twenty notes on one chapter of the thesis this module
 * is used on. The body of the longest of them wants 20 lines at 220 wide, 12 at
 * 320, 9 at 460, 6 at 700 and 4 at 900; the median note wants 7, 4, 3, 2 and 2.
 *
 * Six is therefore the number that leaves the ordinary note alone at every
 * width a canvas hands out and clips the outlier at every one of them. Eight
 * was tried on paper and fails the case the complaint came from: the ninety-word
 * note is six lines at 900 wide, so a cap of eight would have changed nothing
 * at the size the owner was looking at.
 *
 * It costs 159 pixels a row at 220x300 against a 264-pixel window, which is
 * still one row to a screen and still under `snappable`'s condition — so the
 * "one flick is one note" the essay above argues for survives the cap.
 *
 * ## Nothing is lost, and it is the press that was already there
 *
 * A capped row is a PREFIX of the full one, exactly as a compact row is, and
 * the press that opens a compact row now opens any row. That is the rule at the
 * top of this file — a small container shows LESS, never OTHER — extended to a
 * long note, which is the same failure in the other axis.
 */
const MOST = 6

/** Above this, snapping is a tug with nothing to gain. */
const TALL_ENOUGH_TO_ROAM = 600

export function roomFor(frame: Frame): Room {
  const narrow = frame.width < NARROW
  const short = frame.height < SHORT
  const compact = narrow || short

  return {
    compact,
    /* The smaller of the cap and what the frame will hold, and no longer a
       function of `compact` at all: a note ninety words long is too long a row
       in a tall wide container as well, which is where the complaint came
       from. See `MOST` and `linesInFrame`. */
    bodyLines: Math.min(MOST, linesInFrame(frame.height)),
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
 *
 * Everything EXCEPT the body cap, which applies here too: `MOST` is not a
 * concession to a small frame, it is what a row is, and a caller that measured
 * nothing is the last caller that should be printing ninety words in one row.
 */
export const ROOMY: Room = roomFor({ width: 10_000, height: 10_000 })

/**
 * May this row carry a snap point?
 *
 * Only if the whole of it fits. A snap point on the start of a row taller than
 * the window is a scroller that pulls a reader back to the top of the note they
 * are trying to read the bottom of.
 *
 * So a long note simply has no snap point, and scrolling through it is
 * ordinary scrolling. The next note along still has one, so the behaviour the
 * person asked for — a small scroll brings the next note fully into view —
 * survives the note that could not have it.
 *
 * ## This answer now decides two things, and the second is the snap TYPE
 *
 * `bodyLines` clamps a note to what the frame holds, so a row that is taller
 * than the window is no longer the ordinary case — it is an opened one, or one
 * carrying a quote. That changed what the scroller can promise. `proximity`
 * snaps when a snap point is NEAR and the browser decides what near means:
 * with 79-pixel rows a seventy-pixel flick snapped, and with frame-sized rows
 * the same flick landed seventy pixels into a note and stayed there, which is
 * the partial row the whole change is against. Under `mandatory` it rests at
 * the next note's top exactly.
 *
 * `mandatory` cannot be on while a row is taller than the window, and that was
 * measured rather than assumed: with it on, opening the first note of the
 * thesis makes a 708-pixel row in a 264-pixel frame, and a scroll aimed at 354
 * — its middle — was thrown to 708. So `App` asks this question of every row,
 * and a single `false` loosens the whole scroller back to `proximity`. See the
 * rules in `index.css`.
 */
export function snappable(row: number, view: number): boolean {
  if (row <= 0 || view <= 0) return false
  return row <= view
}
