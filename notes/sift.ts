import type { FilterChoice, FilterGroup } from 'roadmap-module-protocol'

/**
 * What this container can be narrowed by, in the host's words rather than in its own.
 *
 * ## Why the two presses left this page
 *
 * They were two `Button`s at the bottom of the list — `show resolved` and
 * `show 3 preamble comments` — in a container that is routinely 220 pixels
 * wide, and every module in this family had built the same kind of thing in its
 * own words and its own corner. None of them could put it anywhere else,
 * because the strip around a module belongs to the host.
 *
 * `roadmap.filters` is the host learning to take it: this file says what the
 * page can be narrowed by, the host draws one control in the container header,
 * and the choice comes back in `context.filters` — remembered per container, so
 * it survives a reload and an app quit. The host is never told what any of it
 * MEANS; `resolved` and `preamble` are this module's words and stay this
 * module's words.
 *
 * ## What did NOT move, and must not
 *
 * The scope ladder. `all of main.tex`, `all in project`, `follow the reader`
 * are on the heading, and they are not a preference: they are the way back out
 * of a narrowed list, which is the one control this page was missing when
 * pressing a note was still a one-way door. A filter is something a reader sets
 * and forgets; the ladder is what they reach for when they are lost, and it
 * belongs where they are looking. The reporting stayed too — `N more on this
 * document, outside this selection`, and the count of preamble comments not
 * drawn — because a host cannot count rows it does not render.
 *
 * ## Why the ids and the labels are not the same strings
 *
 * `id` is what travels, is written down by the host, and has to go on meaning
 * the same thing across versions of this module. `label` is what a person reads
 * and may be rewritten whenever it reads better. Spelling them the same would
 * make the first rewording of a button into a filter that silently stops
 * matching what is stored — which the host degrades to the fallback rather than
 * getting wrong, but a degraded filter is still somebody's choice quietly reset.
 */

/** The group ids. Named because both halves of this file have to agree on them. */
const RESOLVED = 'resolved'
const PREAMBLE = 'preamble'

/**
 * The offer, which is a function of what is on screen rather than a constant.
 *
 * ## The count is in the label, and that is what makes this a function
 *
 * The press this replaces said `show 3 preamble comments`, and the number was
 * the useful half of it — these are notes this app has STOPPED lifting, so a
 * reader who never knew they existed needs to be told there are some before
 * being offered a way to see them. The protocol puts a count in the label
 * deliberately (see `filterOptionSchema`) because a host cannot count rows it
 * does not render, in a document it cannot read, in a frame on another origin.
 *
 * The consequence is that this offer has to be re-sent whenever the count
 * changes, which is whenever the scope changes — a different chapter has a
 * different number of them, and most chapters have none. `kehikko-notifications`
 * sends its offer once at mount and is correct to: its two labels never change.
 * This one cannot be, and the effect in `App` is what says so.
 *
 * ## And the group is absent when the count is zero
 *
 * Not an option reading `0 preamble comments`, and not a group with nothing
 * behind it. The offer REPLACES the last one whole, so a group that goes away
 * takes its control with it — which is the honest drawing of a document that
 * has no preamble comments in it. Leaving the control there would be a press
 * that reveals nothing, on most chapters of a thesis.
 */
export function offer(preambleComments: number): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      id: RESOLVED,
      label: 'resolved notes',
      options: [
        { id: 'without', label: 'Hidden' },
        { id: 'with', label: 'Shown' },
      ],
      fallback: 'without',
    },
  ]

  if (preambleComments > 0) {
    groups.push({
      id: PREAMBLE,
      label: `${preambleComments} preamble comment${preambleComments === 1 ? '' : 's'}`,
      options: [
        { id: 'hidden', label: 'Hidden' },
        { id: 'shown', label: 'Shown' },
      ],
      fallback: 'hidden',
    })
  }

  return groups
}

/**
 * Whether resolved notes are in the list, as this context asks for it.
 *
 * Anything this module does not recognise is the fallback, and the leniency is
 * required rather than defensive. The host reconciles a stored choice against
 * what this module offers — but it cannot do that before this module has
 * offered anything, and the greeting goes out first. So the first choice this
 * page ever receives may name an option from a version of itself that no longer
 * exists, and a page that trusted it would narrow by a value nobody can see,
 * choose, or clear. Both halves defend it; this is our half.
 */
export function resolvedShown(chosen: FilterChoice): boolean {
  return chosen[RESOLVED] === 'with'
}

/** Whether the notes this app has stopped lifting are drawn. Same leniency, same reason. */
export function preambleShown(chosen: FilterChoice): boolean {
  return chosen[PREAMBLE] === 'shown'
}
