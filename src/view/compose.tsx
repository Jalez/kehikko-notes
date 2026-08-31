import { Button } from '@/components/ui/button.tsx'

import type { Room } from '../../notes/room.ts'

/**
 * Writing one, in a strip above the list or in the whole frame.
 *
 * ## Why the same form is two shapes
 *
 * A form above a list costs the same hundred and fifty pixels wherever it is —
 * a quotation of the passage, a textarea, and a row of presses. In a container
 * 700 pixels tall that is a fifth of the screen and the list is still a list.
 * In a container 300 pixels tall it is half the frame, and what is left of the
 * list is one clipped row: a person writing a note can no longer see the notes
 * they are writing it beside, and the textarea they are writing into is two
 * lines tall.
 *
 * So in a small container this takes the frame. The words of the person who
 * asked for it: "perhaps that creation component could turn out to be a modal
 * that takes full space in such a situation".
 *
 * ## Taking the frame is not a surprise here, and that is the whole argument
 *
 * A modal that appears is an interruption. This one is a press answering: it is
 * only ever reached from "write a note here", which the reader pressed, and it
 * closes back to exactly the list they pressed it from. The one case where it
 * would have been an interruption — the form that opens by itself when there is
 * nothing to read — is the one case where the fill shape is refused: see `App`,
 * where an empty list keeps its press and its sentence rather than being
 * covered by a form nobody asked for.
 *
 * ## The quote is scrolled rather than truncated
 *
 * The passage a note will be attached to can be a paragraph. Clipping it to a
 * line would leave a reader agreeing to attach a thought to words they cannot
 * see; growing with it would push the textarea off the bottom of a 300-pixel
 * frame. So it keeps a fixed share of the frame and scrolls inside it, which is
 * the only arrangement where both halves of the form are always on screen.
 */
export function Compose({
  room,
  quoted,
  passage,
  said,
  busy,
  draft,
  onDraft,
  onSubmit,
  onCancel,
}: {
  room: Room
  /** The words this note will be anchored to, as the reader is pointing at them. */
  quoted: string | null
  /** Whether the reader has a range selected, rather than a whole page. */
  passage: boolean
  /** What the list is scoped to, printed only in the shape that hides the heading. */
  said: string
  busy: boolean
  draft: string
  onDraft: (draft: string) => void
  onSubmit: () => void
  /** Null where there is nothing to go back to — an empty list's own form. */
  onCancel: (() => void) | null
}) {
  const fill = room.compose === 'fill'

  const form = (
    <form
      data-testid="compose"
      data-shape={room.compose}
      className={'min-w-0 space-y-1' + (fill ? ' flex min-h-0 flex-1 flex-col' : '')}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {/* The passage this note will be anchored to, shown before it is
          written. A reader has to be able to see what they are about to
          attach a thought to — and it is prose, not a badge, because it is
          exactly the long unbroken string that widens a 220px container. */}
      {quoted ? (
        <blockquote
          className={
            'min-w-0 shrink-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground'
            + (fill ? ' max-h-[30%] overflow-y-auto' : '')
          }
        >
          {quoted}
        </blockquote>
      ) : null}
      <textarea
        aria-label="Write a note about this"
        autoFocus={fill}
        placeholder={passage ? 'A note about this passage…' : 'A note about this page…'}
        className={
          'w-full min-w-0 rounded border bg-background p-1.5 text-xs'
          + (fill ? ' min-h-0 flex-1' : ' min-h-16')
        }
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="flex min-w-0 shrink-0 flex-wrap gap-1">
        <Button size="container" type="submit" disabled={busy || !draft.trim()}>
          write note
        </Button>
        {onCancel ? (
          <Button size="container" variant="ghost" type="button" onClick={onCancel}>
            cancel
          </Button>
        ) : null}
      </div>
    </form>
  )

  if (!fill) return form

  return (
    /*
     * Over the frame, and over the heading with it.
     *
     * `absolute` rather than `fixed` because the page's root is the frame: the
     * two are the same rectangle here, and one of them is a rectangle this
     * module can reason about without asking what a canvas did to its iframe.
     */
    <div data-testid="compose-fill" className="absolute inset-0 z-20 flex min-h-0 flex-col gap-1 bg-background p-2">
      <p className="min-w-0 shrink-0 truncate text-xs font-medium" title={said}>
        a note on {said}
      </p>
      {form}
    </div>
  )
}
