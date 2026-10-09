import { focusSentence, narrowToFocus, type Anchors, type EpicPart } from 'kehikot-module-protocol'

import type { Anchored } from './anchor.ts'

/**
 * The parts of the epic a person ticked in the host's bar, as this list
 * follows them.
 *
 * The rule, the count and the sentence are the protocol's (0.34.0). What is
 * here is the two things only this module knows: what anchors a note, and
 * that its list is three groups — the notes that could be placed, the ones
 * adrift, and the preamble comments it stopped reading as notes — which are
 * narrowed together and counted once.
 *
 * It narrows what the page DRAWS. What the page asks its store for is
 * unchanged, and so is the MCP door: an agent has no canvas and reads every
 * note.
 */

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
  /** The protocol's sentence, with what was kept said after it. `''` when nothing is ticked. */
  sentence: string
}

/**
 * One answer from the store, narrowed to the ticked parts.
 *
 * `inHand` is the notes a person is in the middle of — opened, being replied
 * to, being rewritten, or the one the canvas was pointed at by pressing it.
 * Those stay where they are though their file is outside, are still counted
 * outside, and the sentence says they are there because they are open.
 *
 * The preamble comments are narrowed like the rest and counted only while
 * they are drawn (`withdrawnShown`): a count of rows nobody was going to see
 * is not a count of what the focus hid.
 */
export function focusOn<L extends Groups>(
  looked: L,
  parts: readonly EpicPart[],
  epic: string | null,
  inHand: ReadonlySet<string>,
  withdrawnShown: boolean,
): Focused<L> {
  const keep = (one: Anchored) => inHand.has(one.note.id)
  const narrow = (group: Anchored[]) => narrowToFocus(parts, group, anchorOf, epic, keep)
  const shown = narrow(looked.shown)
  const adrift = narrow(looked.adrift)
  const withdrawn = narrow(looked.withdrawn)
  const counted = withdrawnShown ? [shown, adrift, withdrawn] : [shown, adrift]
  const sentence = focusSentence(parts, counted.reduce((sum, one) => sum + one.outside, 0), 'note')
  if (!sentence) return { looked, sentence }
  const kept = counted.reduce((sum, one) => sum + one.kept, 0)
  return {
    looked: { ...looked, shown: shown.shown, adrift: adrift.shown, withdrawn: withdrawn.shown },
    sentence: kept ? `${sentence} ${kept === 1 ? '1 is' : `${kept} are`} still here because you have ${kept === 1 ? 'it' : 'them'} open.` : sentence,
  }
}
