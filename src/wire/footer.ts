import { LIMITS, type FooterItemInput, type HeaderItemInput } from 'kehikot-module-protocol'

/**
 * This page's two rows, as the host draws them: the header (`kehikot.header`) and the footer
 * (`kehikot.footer`, protocol 2.38.0).
 *
 * The rule the rows follow: the header is how the module is set up, the footer is what is going on
 * now. Writing a note is starting something, so "New note" is the header's one run; the filters
 * (resolved, preamble comments, aim) were the header's already, as offers. Everything a person
 * glances at to know where this list stands is the footer: which passage, file or project it is
 * scoped to, how many notes are on it, which note the canvas was pointed at, and what went wrong.
 *
 * The way back out of a narrowed list ("all of main.tex", "all in project", "follow the reader")
 * stands beside the scope in the footer. It acts on that readout and nothing else, the way Back
 * sits beside an address, and it is the reason the scope is worth reading at all.
 *
 * Folded to two rows, a container shows its header and this footer, so the scope and the count are
 * what a person reads there.
 *
 * Declared only when the host says it draws a footer (`drawsFooter === true`); with any other host
 * the page draws its own heading and lines exactly as before, and declares no header either, so the
 * "write a note here" press is never in two places. The page owns every bit of state: the host
 * draws the latest list. Pure, so what is declared is what is tested.
 */

/** A rung of the way back out, as the heading offered it. */
export type Climb = 'document' | 'everything' | 'follow'

export interface FooterState {
  /** What the list is scoped to, in the heading's words, and the path(s) behind it; null when no list is drawn. */
  scope: { said: string; title: string | null } | null
  /** The rungs on offer now, in the heading's order, each with its words. */
  climbs: readonly { id: Climb; said: string }[]
  /** Notes drawn at this scope, or null before the first answer. */
  shown: number | null
  /** Notes on the document that can no longer be placed in it. */
  adrift: number
  /** Notes on the document outside this selection. */
  elsewhere: number
  /** Preamble comments, and whether they are on screen. */
  withdrawn: number
  withdrawnShown: boolean
  /** Whether any document asked about could be opened to check an anchor. */
  verified: boolean
  /** The words of the note this container pointed the canvas at, or null. */
  pointed: string | null
  /** A write the store refused, said in words, or null. */
  refused: string | null
  /** A write in flight. */
  busy: boolean
}

const clip = (text: string, most: number) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= most ? one : `${one.slice(0, most - 1)}…`
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** What the count says: the notes here, then the ones put aside, each only when there are some. */
export function countSaid(state: Pick<FooterState, 'shown' | 'adrift' | 'elsewhere' | 'withdrawn' | 'withdrawnShown'>): string {
  const parts = [plural(state.shown ?? 0, 'note')]
  if (state.adrift) parts.push(`${state.adrift} adrift`)
  if (state.elsewhere) parts.push(`${state.elsewhere} outside`)
  if (state.withdrawn && !state.withdrawnShown) parts.push(`${state.withdrawn} preamble hidden`)
  return parts.join(' · ')
}

/** The count's tooltip: the same, in sentences. */
function countTold(state: FooterState): string {
  const said = [`${plural(state.shown ?? 0, 'note')} here.`]
  if (state.adrift) said.push(`${plural(state.adrift, 'note')} can no longer be placed in this document.`)
  if (state.elsewhere) said.push(`${state.elsewhere} more on this document, outside this selection.`)
  if (state.withdrawn && !state.withdrawnShown) said.push(`${plural(state.withdrawn, 'preamble comment')} not shown.`)
  return said.join(' ')
}

/** The footer's items for a state; `[]` when no list is drawn. */
export function footerItems(state: FooterState): FooterItemInput[] {
  const items: FooterItemInput[] = []
  if (state.refused) {
    items.push({ kind: 'text', id: 'refused', text: clip(state.refused, LIMITS.FOOTER_TEXT), level: 'critical', tooltip: clip(state.refused, LIMITS.FOOTER_TOOLTIP) })
  }
  if (!state.scope) return items
  items.push({
    kind: 'text',
    id: 'scope',
    text: clip(state.scope.said, LIMITS.FOOTER_TEXT),
    ...(state.scope.title ? { tooltip: clip(state.scope.title, LIMITS.FOOTER_TOOLTIP) } : {}),
  })
  for (const climb of state.climbs) {
    items.push({ kind: 'run', id: climb.id, label: clip(climb.said, LIMITS.HEADER_LABEL), agents: true, ...(climb.id === 'follow' ? { icon: 'undo' as const } : {}) })
  }
  if (state.pointed) {
    items.push({
      kind: 'text',
      id: 'pointed',
      text: clip(`On “${state.pointed}”`, LIMITS.FOOTER_TEXT),
      tooltip: clip(`The canvas is pointed at this note: “${state.pointed}”`, LIMITS.FOOTER_TOOLTIP),
      align: 'center',
      optional: true,
    })
  }
  if (state.busy) items.push({ kind: 'text', id: 'saving', text: 'Saving…', align: 'end', optional: true })
  if (!state.verified && state.shown !== null && (state.shown > 0 || state.adrift > 0)) {
    items.push({
      kind: 'text',
      id: 'unchecked',
      text: 'unchecked',
      level: 'warn',
      align: 'end',
      optional: true,
      tooltip: 'These documents could not be opened: each note shows the words it was written about, not what is there now.',
    })
  }
  if (state.shown !== null) {
    items.push({
      kind: 'text',
      id: 'count',
      text: clip(countSaid(state), LIMITS.FOOTER_TEXT),
      level: state.adrift ? 'warn' : 'normal',
      align: 'end',
      tooltip: clip(countTold(state), LIMITS.FOOTER_TOOLTIP),
    })
  }
  return items
}

/** What a footer press asks for: a rung of the way back, or the sentence saying why not. */
export function footerPressed(item: string, state: Pick<FooterState, 'climbs'>): Climb | string {
  const climb = state.climbs.find((one) => one.id === item)
  if (climb) return climb.id
  if (item === 'document' || item === 'everything' || item === 'follow') return 'That way back is not on offer from where this list stands now.'
  return 'Nothing else in this footer can be pressed.'
}

/** The header: one run, writing a note on the passage in front, refused in words when there is none. */
export function headerItems(state: { canWrite: boolean; composing: boolean; busy: boolean }): HeaderItemInput[] {
  return [
    {
      kind: 'run',
      id: 'write',
      label: 'New note',
      icon: 'pencil',
      state: state.busy ? 'busy' : 'idle',
      disabled: state.canWrite
        ? state.composing
          ? 'A note is being written already.'
          : null
        : 'A note is written on the passage the reader is on: point at one in a document first.',
    },
  ]
}
