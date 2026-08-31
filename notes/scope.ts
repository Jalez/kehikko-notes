import type { Anchored } from './anchor.ts'
import { sourceOf } from './shape.ts'

/**
 * How much of the store one screen is about, and the ladder that decides it.
 *
 * ## The sentence this file implements
 *
 * > "Notes should show notes in a way that ensures specificity based on what is
 * > selected. For instance if nothing is selected but paper module shows a page,
 * > it should show all notes related to that page vs if only a part of the page
 * > is selected."
 *
 * So the container narrows as the reader narrows. That is one idea with four rungs
 * on it, and the rungs are the protocol's `passage` field read at its four
 * depths: no document, a document, a page of it, a range in that page.
 *
 * ## Narrowing hides things, and hiding things is the dangerous half
 *
 * The obvious build is a filter, and a filter is exactly wrong here. A reader
 * who selects a sentence and sees two notes has no way to tell "there are two
 * notes on this sentence" from "there are eleven notes on this page and nine of
 * them are behind a filter nobody mentioned". The second is the same lie as an
 * anchor silently pointing at the wrong sentence, one level up.
 *
 * So narrowing always says what it excluded, and two kinds of note are never
 * excluded at all:
 *
 * - A note whose anchor is ADRIFT has no place in the document any more. It
 *   cannot be included by a range test and it must not be dropped by one, so it
 *   comes back in a group of its own, at every rung, for as long as the document
 *   it was written about is open. That is the whole point of keeping the quote.
 * - A note written with nothing selected is placed by its PAGE, because a page
 *   is the only anchor it has.
 *
 * ## The page is a filter and the range is an anchor
 *
 * A note records the page it was written on, and page numbers move: they are a
 * reader's arithmetic over a document, not a property of it, so re-paginating
 * moves every note's recorded page without touching a byte of what it points
 * at. That is fine, because the page is only ever used to NARROW a list of
 * notes that are already about this document — never to decide what a note is
 * about. What a note is about is its range and its words, and those are checked
 * against the file. When the two disagree, the row prints the anchor and the
 * page is what was hiding it.
 */
export type Scope =
  /** Nothing is pointing at anything. `passage` was null. */
  | { kind: 'nowhere' }
  /**
   * Everything this project holds, because somebody asked for it in so many
   * words. Not a rung on the ladder — a deliberate act, and the only way past
   * `nowhere`. See `App`: a container that is honest about having no document still
   * has to be usable by somebody who wants to see what they wrote yesterday.
   */
  | { kind: 'everything' }
  | { kind: 'document'; path: string }
  | { kind: 'page'; path: string; page: number }
  | { kind: 'passage'; path: string; page: number | null; from: number; to: number }

/** A passage, as it arrives in the context. The protocol's shape, restated so this file needs no import. */
export interface PassageLike {
  path: string
  page: number | null
  from: number | null
  to: number | null
  quoted: string
}

/**
 * Which rung a passage puts the container on.
 *
 * One function, and every screen in this app reads its answer rather than
 * testing `passage?.from !== null` for itself. Three places asking the same
 * question three ways is how a container ends up saying "page 7" in its heading and
 * drawing a passage's notes underneath.
 */
export function scopeOf(passage: PassageLike | null): Scope {
  if (!passage) return { kind: 'nowhere' }
  if (passage.from !== null && passage.to !== null) {
    return { kind: 'passage', path: passage.path, page: passage.page, from: passage.from, to: passage.to }
  }
  if (passage.page !== null) return { kind: 'page', path: passage.path, page: passage.page }
  return { kind: 'document', path: passage.path }
}

/** The path a scope is about, or null when it is about no document. */
export function pathOf(scope: Scope): string | null {
  return scope.kind === 'nowhere' || scope.kind === 'everything' ? null : scope.path
}

export interface Narrowed {
  scope: Scope
  /**
   * What the scope names, nearest the top of the document first.
   *
   * Ordered by where the note points NOW rather than by when it was written,
   * because a reader looking at a page is reading down it. Two notes on the
   * same sentence fall back to the older first, so a reply-shaped conversation
   * reads in the order it happened.
   */
  shown: Anchored[]
  /**
   * Notes on this document whose anchor no longer points anywhere.
   *
   * Never empty because of narrowing and never merged into `shown`: these are
   * the notes this app cannot honestly place, and a reader has to be able to see
   * that they are a different kind of thing from the ones above them.
   */
  adrift: Anchored[]
  /**
   * How many notes on this document the narrowing excluded.
   *
   * A number and not a list, deliberately. The list is one press away — widen
   * the scope — and printing it here would defeat the narrowing the reader
   * asked for. What the number does is make the narrowing visible, which is the
   * whole difference between a scope and a filter nobody mentioned.
   */
  elsewhere: number
  /**
   * Notes this app lifted under rules it no longer applies.
   *
   * ## Why they are a third pile rather than filtered away or left in place
   *
   * These are the notes whose annotation this app has stopped reading as an
   * annotation at all — today, everything in a `.tex` file's preamble, which is
   * the build rather than the paper. Ten of them in the store this was written
   * against, every one a note about `main.tex`'s font setup sitting in a column
   * of notes about the argument, which is the complaint that produced this.
   *
   * Leaving them in `shown` is what the reader objected to. Dropping them from
   * the answer entirely would be the filter this file's own essay refuses:
   * somebody who wrote a reply on one would find it gone with nothing anywhere
   * saying why. So they come back separately, with the sentence each one
   * carries about why it was withdrawn, and the page draws a line about them
   * rather than the notes themselves.
   *
   * They are taken out BEFORE `adrift` and before `elsewhere` is counted. A
   * withdrawn note's anchor is not interesting — this app is not claiming
   * anything about where it points any more — and counting it as "outside what
   * is selected" would put a number on the screen that widening cannot explain.
   */
  withdrawn: Anchored[]
}

/** Whether this app has stopped reading a note's annotation as one. See `Source.withdrawn`. */
function isWithdrawn(one: Anchored): boolean {
  return Boolean(sourceOf(one.note)?.withdrawn)
}

/** Where a note can be placed, given what its anchor turned out to be. */
function placeable(one: Anchored): boolean {
  return one.anchor.from !== null && one.anchor.to !== null
}

/** Two ranges overlap when each starts before the other ends. Touching is not overlapping. */
function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to
}

function inOrder(a: Anchored, b: Anchored): number {
  const at = a.anchor.from ?? Number.MAX_SAFE_INTEGER
  const bt = b.anchor.from ?? Number.MAX_SAFE_INTEGER
  if (at !== bt) return at - bt
  return a.note.at < b.note.at ? -1 : a.note.at > b.note.at ? 1 : 0
}

/**
 * The notes one screen shows, and an honest count of the ones it does not.
 *
 * `notes` are already resolved against their documents, and they are already
 * one project's — every one of them came out of that project's own
 * `.kehikot/notes/notes.json`, so there is no partitioning left here to do or to get
 * wrong. It is pure, it is the whole of the ladder, and it is the reason the
 * ladder can be tested without a browser, a store, or a `.tex` file.
 */
export function narrow(all: Anchored[], scope: Scope): Narrowed {
  /* Taken out first, everywhere, so no rung of the ladder can put one back. */
  const withdrawn = all.filter(isWithdrawn)
  const notes = all.filter((one) => !isWithdrawn(one))

  if (scope.kind === 'nowhere') {
    return { scope, shown: [], adrift: [], elsewhere: notes.length, withdrawn: [] }
  }

  if (scope.kind === 'everything') {
    const adrift = notes.filter((one) => !placeable(one))
    const shown = notes.filter(placeable).sort(inOrder)
    return { scope, shown, adrift, elsewhere: 0, withdrawn }
  }

  const mine = withdrawn.filter((one) => one.note.path === scope.path)
  const here = notes.filter((one) => one.note.path === scope.path)
  const adrift = here.filter((one) => !placeable(one))
  const placed = here.filter(placeable)

  if (scope.kind === 'document') {
    return { scope, shown: placed.sort(inOrder), adrift, elsewhere: 0, withdrawn: mine }
  }

  if (scope.kind === 'page') {
    /* A note with no page recorded is shown on every page of its document
       rather than on none. It was written before anybody was paginating, or by
       an agent that had no page to give; hiding it on every page would be this
       app losing a note to a field somebody left out. */
    const shown = placed.filter((one) => one.note.page === null || one.note.page === scope.page)
    return { scope, shown: shown.sort(inOrder), adrift, elsewhere: placed.length - shown.length, withdrawn: mine }
  }

  /* A passage. Overlap against where each note points NOW — the moved offsets
     where it moved — so an edit above the reader does not empty the container. */
  const shown = placed.filter((one) =>
    overlaps({ from: one.anchor.from as number, to: one.anchor.to as number }, { from: scope.from, to: scope.to }),
  )
  return { scope, shown: shown.sort(inOrder), adrift, elsewhere: placed.length - shown.length, withdrawn: mine }
}

/**
 * What the container says it is showing, in one line a person reads.
 *
 * Here rather than in a component because it is the same sentence at the door
 * and on the screen, and two spellings of "notes on page 7" is how an agent and
 * a reader end up describing different lists to each other.
 */
export function saidOf(scope: Scope): string {
  if (scope.kind === 'nowhere') return 'No document is open, so there is no place for a note to be about.'
  if (scope.kind === 'everything') return 'Every note in this project.'
  if (scope.kind === 'document') return `Every note on ${scope.path}.`
  if (scope.kind === 'page') return `Notes on page ${scope.page} of ${scope.path}.`
  return `Notes on the selected passage of ${scope.path}, bytes ${scope.from}–${scope.to}.`
}
