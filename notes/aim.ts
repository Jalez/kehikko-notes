import type { PassageLike } from './scope.ts'

/**
 * Which documents are in front of the reader, once the kehikko can say what
 * each of its containers is showing and which of them are picked out.
 *
 * ## The sentence this file implements
 *
 * > "if user selects x number of the modules then we should only show those
 * > modules checklist no? Same with notes, and references"
 *
 * The host lists every container on the kehikko — `context.containers`: which
 * module, whether a person picked it out with the box in its header, and what
 * it says it is showing. The rule the protocol states once, so that three
 * consumers do not state it three ways, is: nothing picked out means
 * everything, some picked out means only what those show. This file is that
 * rule for notes, which are filed against places in documents and against
 * nothing else — so a container's refs are of no interest here and are never
 * read.
 *
 * ## What "everything" means for THIS module, and why it is not a union
 *
 * The checklist module, under the same rule, takes the union of what every
 * container shows when nothing is picked out. This one does not, and the
 * difference is what the two modules are FOR. A list is held against a
 * chapter or a file, and a reader anywhere in the chapter should see it. A
 * note is anchored to a sentence, and this container exists to narrow as the
 * reader narrows — `notes/scope.ts` is a ladder from a highlighted passage out
 * to a whole project, and the reader's own passage is always the narrowest
 * rung anybody is on. The union of every open document would undo, on every
 * context, the narrowing the module was built to do.
 *
 * So the first half of the rule is kept as it always was: nothing picked out
 * is the reader's passage. The second half is new and is the whole of this
 * file: some containers picked out is the documents THOSE containers show,
 * and nothing else — including, deliberately, the reader's passage when the
 * container that set it is not among the picked.
 *
 * ## One place per document, the narrowest, and why
 *
 * The host puts the passage a container pointed at FIRST in that container's
 * documents, ahead of whatever the container said it shows. A paper module
 * that points at a paragraph and says it shows the chapter therefore lists the
 * paragraph and then the chapter, and taking both would answer "narrow to
 * Paper" with the whole chapter's notes — ticking a box would WIDEN the list.
 * So one place per path is kept, the first, which is the narrowest the host
 * had for it; a reader who wants the chapter presses the ladder.
 *
 * ## Narrowing says what it hid
 *
 * A container emptied by a tick on a neighbour has to say so, or its
 * emptiness has no visible cause. So what comes back names the picked-out
 * containers and, separately, the ones showing no document at all — "journeys
 * is picked out and shows no document" is a different sentence from "nothing
 * has been written on what paper shows", with a different remedy. The control
 * that turns the narrowing off is the `aim` group this page offers the host
 * over `roadmap.filters`, in the container header beside its other two.
 *
 * ## An older host
 *
 * Lists no containers, so nothing narrows, no control is offered, and the page
 * is the page it was. Pure, so `test/aim.test.ts` is a table of canvases.
 */

/** One container on the kehikko, as this page reads the host's list. Refs are not carried; notes have no use for them. */
export interface Shown {
  module: string
  selected: boolean
  documents: PassageLike[]
}

/** The filter group's id and its two options, spelled once. `follow` is the resting option. */
export const AIM = 'aim'
export type Aim = 'follow' | 'all'

/** The choice out of `context.filters`, read leniently: anything that is not `all` is following. */
export function aimOf(chosen: Readonly<Record<string, string>> | null | undefined): Aim {
  return chosen && Object.hasOwn(chosen, AIM) && chosen[AIM] === 'all' ? 'all' : 'follow'
}

export interface InFront {
  /** Whether the picks narrowed this: some container is picked out and the reader is following. */
  narrowed: boolean
  /** The documents in front when narrowed — one per path, the narrowest — in the canvas's order. Empty otherwise. */
  documents: PassageLike[]
  /** The picked-out containers, in the canvas's order. */
  picked: string[]
  /** Those of them showing no document. */
  quiet: string[]
}

export function inFrontOf(input: { containers: readonly Shown[]; aim: Aim }): InFront {
  const picked = input.containers.filter((one) => one.selected)
  const narrowed = input.aim === 'follow' && picked.length > 0
  const documents = narrowed ? onePerPath(picked.flatMap((one) => one.documents)) : []
  return {
    narrowed,
    documents,
    picked: picked.map((one) => one.module),
    quiet: picked.filter((one) => one.documents.length === 0).map((one) => one.module),
  }
}

/**
 * The offer for the header: one group, only when the host lists containers,
 * with the count in the label — the protocol puts counts in labels because a
 * host cannot count what it does not render. Appended to the two groups
 * `notes/sift.ts` already offers.
 */
export function aimOffer(
  containers: readonly Shown[],
): { id: string; label: string; options: { id: string; label: string }[]; fallback: string }[] {
  if (!containers.length) return []
  const picked = containers.filter((one) => one.selected).length
  const count = picked ? `${picked} of ${containers.length} picked out` : 'nothing picked out'
  return [
    {
      id: AIM,
      label: 'aim',
      options: [
        { id: 'follow', label: `follow what is picked out (${count})` },
        { id: 'all', label: 'everything on this kehikko' },
      ],
      fallback: 'follow',
    },
  ]
}

/**
 * The heading for a narrowed list: who is picked out, and how many documents
 * that came to. A label and not a sentence, for the column it sits in.
 */
export function briefOfPicked(front: InFront): string {
  const who = list(front.picked.map(nameOf))
  const n = front.documents.length
  return n === 1 ? who : `${who} · ${n} documents`
}

/**
 * The sentence for a narrowed list with no document in it, or null when the
 * picks did not narrow anything. Names the containers, and names the ones
 * showing no document, because those two absences have two remedies.
 */
export function whyEmpty(front: InFront): string | null {
  if (!front.narrowed || front.documents.length) return null
  const names = front.picked.map(nameOf)
  const one = names.length === 1
  return `${list(names)} ${one ? 'is' : 'are'} picked out and ${one ? 'shows' : 'show'} no document, so there is no place here for a note to be about.`
}

/** The last word of a module id, which is what the ids look like: `roadmap.journeys` is `journeys`. */
export function nameOf(module: string): string {
  const cut = module.lastIndexOf('.')
  return cut === -1 ? module : module.slice(cut + 1)
}

/**
 * Several screens' worth of notes, merged into one — for a narrowed list that
 * covers more than one document.
 *
 * Generic over the row, so this file never imports the page's types: every
 * list is concatenated in the order the documents came, the counts are added,
 * the scope and the sentence are the first document's, and `verified` is
 * true only when every document could be opened — one unchecked document
 * makes the whole list's anchors worth a warning. The rows carry their own
 * file name, so a merged list still says which document each note is on.
 */
export function merged<Row, Scope>(
  looks: readonly {
    said: string
    scope: Scope
    shown: Row[]
    adrift: Row[]
    elsewhere: number
    withdrawn: Row[]
    verified: boolean
    opened: boolean | null
    trouble: string | null
  }[],
): {
  said: string
  scope: Scope
  shown: Row[]
  adrift: Row[]
  elsewhere: number
  withdrawn: Row[]
  verified: boolean
  opened: boolean | null
  trouble: string | null
} | null {
  const first = looks[0]
  if (!first) return null
  return {
    said: looks.map((one) => one.said).join(' '),
    scope: first.scope,
    shown: looks.flatMap((one) => one.shown),
    adrift: looks.flatMap((one) => one.adrift),
    elsewhere: looks.reduce((sum, one) => sum + one.elsewhere, 0),
    withdrawn: looks.flatMap((one) => one.withdrawn),
    verified: looks.every((one) => one.verified),
    /* False if ANY named document could not be opened: one unreadable
       document among three is still a list that is not the list it claims to
       be, and the sentence for it names the failure. Null only when nothing
       named a document at all. */
    opened: looks.some((one) => one.opened === false) ? false : looks.every((one) => one.opened === null) ? null : true,
    trouble: looks.find((one) => one.trouble !== null)?.trouble ?? null,
  }
}

/**
 * The sentence for a list with nothing in it, in the three states that are
 * three different states.
 *
 * ## Why one sentence was not enough
 *
 * "Nothing has been written here yet" was drawn over a document that exists
 * and has no notes, and also over a path this app could not open at all —
 * which is what it looks like when a picked-out container says it shows a
 * document that is not there, or that `NOTES_ROOTS` fences off. The two are
 * different states with different remedies (write a note; fix the path or the
 * roots), and a reader given one sentence for both cannot tell an empty
 * chapter from a wrong address. The protocol's essay on `context.containers`
 * asks a consumer to say what its emptiness is FROM; this is that, one rung
 * further in than `whyEmpty` above, which covers the case where nothing is
 * aimed at anything.
 *
 *   - nothing aimed at: `whyEmpty` — the picked containers show no document.
 *   - aimed at something that resolves, and empty: nothing written here yet.
 *   - aimed at something that does not resolve: the document could not be
 *     opened, by name, so nobody reads "no notes" off a file nobody read.
 *
 * `file` is the short name of the document, for the sentence; `adrift` is
 * whether the scope hides only adrift notes, which is the fourth wording the
 * page already had and keeps.
 */
export function saidOfEmpty(input: { opened: boolean | null; adrift: boolean; file: string | null }): string {
  if (input.opened === false) {
    return `This app could not open ${input.file ?? 'that document'}, so it cannot say what is anchored there — the notes it holds on it are shown as written, unchecked.`
  }
  return input.adrift ? 'Nothing is anchored here.' : 'Nothing has been written here yet.'
}

function onePerPath(documents: readonly PassageLike[]): PassageLike[] {
  const seen = new Set<string>()
  const out: PassageLike[] = []
  for (const one of documents) {
    if (!one.path || seen.has(one.path)) continue
    seen.add(one.path)
    out.push(one)
  }
  return out
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const all = [...names]
  const last = all.pop()
  return `${all.join(', ')} and ${last}`
}
