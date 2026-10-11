import { narrowToFocus, pickedParts, type Anchors, type EpicPart } from 'kehikot-module-protocol'

import type { Anchored } from './anchor.ts'

/**
 * The parts of the epic a person ticked in the host's bar, as this list
 * follows them.
 *
 * The rule is the protocol's (0.34.0). What is here is the two things only
 * this module knows: what anchors a note, and that its list is three groups —
 * the notes that could be placed, the ones adrift, and the preamble comments
 * it stopped reading as notes — which are narrowed together.
 *
 * ## Nothing is said about what was put aside
 *
 * The list used to carry a line of its own under the heading — `26 notes
 * outside the picked part (Methods).` — and it cost a row of a container
 * whose rows are the point. The host's bar already says which parts are
 * ticked, and the heading of this list names them in the line it had anyway;
 * the notes that are drawn are the message. The one thing still said is why
 * a list is EMPTY when the ticks emptied it (`saidOfNone`), in the place the
 * list would have been, because an empty pane with no reason reads as broken.
 *
 * ## A tick is asked about the whole project, and then narrowed
 *
 * This used to narrow only what the page had already asked for, and the page
 * asked for the reader's passage: the one page of the one file the paper's
 * caret was in. So a ticked part showed that page's notes and no more, two
 * ticked parts showed one of them, and a paper
 * that had been walked somewhere by another container — which then says
 * nothing new until a person touches it — left this list on the old chapter,
 * or empty, whatever was ticked. The passage is a guess at where the reader
 * is; a tick is them saying.
 *
 * So while a part is ticked and nothing else narrows on purpose (`ledByParts`),
 * the page asks its store for every note in the project and this narrows THAT:
 * the list is the ticked parts' notes. The MCP door is unchanged: an agent has no canvas and reads every
 * note.
 */

/**
 * Whether the ticked parts decide the list, rather than the passage.
 *
 * They do unless a person narrowed on purpose some other way, and each of
 * those is a press: a container picked out in its header (`narrowed`, see
 * `notes/aim.ts` — the two are applied together, the parts to what the picked
 * containers show), or a rung of this page's own ladder (`widen`), which
 * stands until the reader moves. A press on a note is NOT one: it marks the
 * note and moves the paper, and the list it was pressed from stays.
 */
export function ledByParts(input: { focused: boolean; narrowed: boolean; widen: null | 'document' | 'everything' }): boolean {
  return input.focused && !input.narrowed && input.widen === null
}

/** The heading for a list the ticked parts decide: their names, in the epic's order. A label, for the column it sits in. */
export function briefOfParts(parts: readonly EpicPart[]): string {
  return pickedParts(parts).map((part) => part.heading || part.id).join(', ')
}

/** What ties a note to a part: the file it was written against. Absolute here; the protocol finds the paper's folder in it. */
export function anchorOf(one: Anchored): Anchors {
  return { file: one.note.path }
}

/** As much of an answer from the store as a focus narrows. */
interface Groups {
  shown: Anchored[]
  adrift: Anchored[]
  withdrawn: Anchored[]
}

export interface Focused<L extends Groups> {
  /** The answer with each group narrowed — or the same object when nothing is ticked. */
  looked: L
  /** Whether the ticks put any drawn note aside: what tells a list the ticks emptied from one nobody wrote in. */
  aside: boolean
}

/**
 * One answer from the store, narrowed to the ticked parts.
 *
 * `inHand` is the notes a person is in the middle of — opened, being replied
 * to, being rewritten, or the one the canvas was pointed at by pressing it.
 * Those stay where they are though their file is outside.
 *
 * The preamble comments are narrowed like the rest and weighed only while
 * they are drawn (`withdrawnShown`): rows nobody was going to see are not
 * what the focus hid.
 */
export function focusOn<L extends Groups>(
  looked: L,
  parts: readonly EpicPart[],
  epic: string | null,
  inHand: ReadonlySet<string>,
  withdrawnShown: boolean,
): Focused<L> {
  if (!pickedParts(parts).length) return { looked, aside: false }
  const keep = (one: Anchored) => inHand.has(one.note.id)
  const narrow = (group: Anchored[]) => narrowToFocus(parts, group, anchorOf, { epic, keep })
  const shown = narrow(looked.shown)
  const adrift = narrow(looked.adrift)
  const withdrawn = narrow(looked.withdrawn)
  const weighed = withdrawnShown ? [shown, adrift, withdrawn] : [shown, adrift]
  return {
    looked: { ...looked, shown: shown.shown, adrift: adrift.shown, withdrawn: withdrawn.shown },
    aside: weighed.some((one) => one.outside > 0),
  }
}

/** The one sentence for a list the ticks emptied, drawn where the list would have been. */
export function saidOfNone(parts: readonly EpicPart[]): string {
  return `No note is in the picked ${pickedParts(parts).length === 1 ? 'part' : 'parts'}.`
}
