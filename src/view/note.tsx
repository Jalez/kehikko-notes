import { useState } from 'react'

import type { Anchored } from '@/store/ask.ts'
import { sourceOf } from '../../notes/shape.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'

/**
 * One note, and the truth about its anchor beside it.
 *
 * ## The verdict is the first thing on the row and never the last
 *
 * A reader scanning a column of notes is deciding which to read. If the anchor
 * verdict were a detail at the bottom, a note whose passage has been rewritten
 * would look exactly like one whose passage is still there until they had
 * already read it and formed an opinion about a sentence that no longer exists.
 * So the badge is first, it is a WORD as well as a colour, and the sentence
 * explaining it sits under the quote where somebody comparing the two will
 * find it.
 *
 * ## The quote is shown even when — especially when — it is adrift
 *
 * A note whose passage is gone is the most interesting note on the page: it is
 * the record of what somebody thought about a sentence that has since been
 * changed. Hiding it, or showing it without its quote, would leave a reader
 * with an opinion and no idea what it was about. So the quote is always drawn,
 * and it is drawn as a `blockquote` rather than inside anything with
 * `whitespace-nowrap` on it — see the essay in `badge.tsx` for why that
 * distinction is load-bearing at 220 pixels.
 */

const VERDICT: Record<string, { word: string; variant: 'exact' | 'moved' | 'adrift' | 'unchecked' | 'unranged' }> = {
  exact: { word: 'anchored', variant: 'exact' },
  moved: { word: 'moved', variant: 'moved' },
  adrift: { word: 'adrift', variant: 'adrift' },
  unverified: { word: 'unchecked', variant: 'unchecked' },
  unranged: { word: 'whole page', variant: 'unranged' },
}

export interface NoteActions {
  reply: (id: string, body: string) => void
  resolve: (id: string, done: boolean) => void
  reanchor: (one: Anchored) => void
  /**
   * Point every pane on the canvas at this note's passage.
   *
   * Handed in rather than done here, because what it takes is a host and this
   * component has never seen one — the same split `app.tsx` keeps for every
   * other write. Null when nothing is framing this page: there is nobody to
   * tell, and a control that would silently do nothing is worse than one that
   * is not drawn.
   */
  point: ((one: Anchored) => void) | null
  busy: boolean
}

export function NoteRow({ one, actions }: { one: Anchored; actions: NoteActions }) {
  const { note, anchor } = one
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const verdict = VERDICT[anchor.state] ?? VERDICT.unverified
  /* Read through `sourceOf` rather than off the record, so that a note written
     before this field existed — where it is absent rather than null — is read
     as what it is: something a person typed. */
  const source = sourceOf(note)
  const where =
    anchor.from === null
      ? note.page === null
        ? note.path
        : `${note.path} · page ${note.page}`
      : `${note.path} · ${anchor.from}–${anchor.to}`

  /**
   * Pressing the row points the paper at it.
   *
   * The user asked for exactly this — "when you click on a note shouldn't it
   * highlight and show what its target from the paper?" — so the target is the
   * whole row and not a small control at the end of it. What that costs is a
   * press that has to know it was not meant for one of the buttons inside the
   * row, which is the `closest` below: a reply form, a resolve, a re-anchor and
   * a textarea all live in here and all of them mean something else. The button
   * in the action row is the same call, kept because a row you can only reach
   * with a mouse is a row half the people using it cannot reach.
   */
  const press = () => actions.point?.(one)

  return (
    <li
      data-testid="note"
      data-anchor={anchor.state}
      data-note-id={note.id}
      data-points={actions.point ? '1' : undefined}
      onClick={(event) => {
        if (!actions.point) return
        /* Anything with its own meaning for a press keeps it. */
        if ((event.target as HTMLElement).closest('button, a, textarea, input, form')) return
        press()
      }}
      className={
        'min-w-0 border-b border-border/60 py-2 last:border-b-0'
        + (actions.point ? ' cursor-pointer hover:bg-muted/40' : '')
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant={verdict?.variant}>{verdict?.word}</Badge>
        {note.resolved ? <Badge variant="outline">resolved</Badge> : null}
        {note.viaMcp ? <Badge variant="outline">over MCP</Badge> : null}
        {/*
          Where the note came from, when nobody typed it here.
          A `\todo{}` the author left in their own `.tex` and a thought
          somebody had while reading are different claims about the same
          sentence, and this row already makes that argument once for the MCP
          door. It has to be made again here, and more loudly: a derived note is
          the only kind whose words are also somewhere else, being edited by
          somebody who has never seen this pane.
          "in the source" and "gone from source" are FIXED words chosen by this
          file — never the path, never the annotation, never the author. A badge
          carries `whitespace-nowrap`, and a variable string inside one is how a
          220px pane acquires a 1187px min-content floor. The path is below, in
          a `<p>` that wraps.
        */}
        {source ? (
          <Badge variant="outline" data-source={source.kind}>
            {source.withdrawn ? 'not an annotation' : source.present ? 'in the source' : 'gone from source'}
          </Badge>
        ) : null}
      </div>

      {/* The path and the range: somebody else's string, so it wraps rather than
          widening the pane. Never in a badge. */}
      <p className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">{where}</p>

      {/*
        The quote, for a note somebody TYPED, and never for one lifted out of
        the source.

        For a typed note the two are different texts and both are worth having:
        the quote is the passage, the body is what somebody said about it. For a
        derived note they are one text — the body is the annotation with its `%`
        markers or its `\todo{…}` wrapper taken off, and the quote is the same
        words with the wrapper still on — so drawing both prints one comment
        twice, once in italics and once not. That is what the user saw and said
        so, and it is not a rendering slip: it is this row making its typed-note
        argument about a kind of note the argument does not fit.

        The BODY is the half that survives, and which half is not arbitrary. The
        quote exists for `anchor.ts` — it is the exact slice of the file, kept so
        the passage can be found again after an edit — and it is machinery. The
        body is the author's sentence with the markup taken off, which is what
        somebody reading a column of notes came to read. Nothing is lost: for a
        derived note the quote's words are all in the body, and the rules that
        were only ever a line drawn in a text editor are not.
      */}
      {note.quoted && !source ? (
        <blockquote className="mt-1 min-w-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
          {note.quoted}
        </blockquote>
      ) : null}

      <p className="mt-1.5 min-w-0 text-sm">{note.body}</p>

      {/* What this app used to make of the same annotation, when its own reading
          of it changed. Under the body, because the two are read together, and
          kept forever because the replies below were written against the old
          words. See `Source.reread`. */}
      {source?.reread ? (
        <p data-testid="reread" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          This app read the same annotation differently before {source.reread.at.slice(0, 10)}. It used to show:{' '}
          <span className="italic">{source.reread.was.slice(0, 200)}</span>
        </p>
      ) : null}

      {/* Why this app stopped lifting it, in the words the store holds. Only
          ever drawn where a reader has asked to see these; see `App`. */}
      {source?.withdrawn ? (
        <p data-testid="withdrawn-said" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          {source.withdrawn}
        </p>
      ) : null}

      <p className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">
        {note.by}
        {note.resolved && note.resolvedBy ? ` · resolved by ${note.resolvedBy}` : ''}
      </p>

      {/* The anchor's own sentence. Under the quote, because the two are read
          together: "these words, and here is what has become of them". */}
      {anchor.state !== 'exact' ? (
        <p data-testid="anchor-said" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          {anchor.said}
        </p>
      ) : null}

      {note.replies.length ? (
        <ul className="mt-1.5 min-w-0 space-y-1 border-l-2 border-border pl-2">
          {note.replies.map((reply) => (
            <li key={reply.id} className="min-w-0 text-xs">
              <span className="text-muted-foreground">{reply.by}: </span>
              {reply.body}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1.5 flex flex-wrap gap-1">
        <Button size="pane" variant="ghost" onClick={() => setReplying((was) => !was)}>
          {replying ? 'cancel' : 'reply'}
        </Button>
        <Button size="pane" variant="ghost" disabled={actions.busy} onClick={() => actions.resolve(note.id, !note.resolved)}>
          {note.resolved ? 'reopen' : 'resolve'}
        </Button>
        {/*
         * Offered only where it can honestly be done: a note whose words this
         * app FOUND somewhere else in the file. An adrift note has no new place
         * to point at, so there is nothing here to press — moving it would mean
         * inventing a range, which is the failure the whole module is against.
         */}
        {anchor.state === 'moved' ? (
          <Button size="pane" variant="outline" disabled={actions.busy} onClick={() => actions.reanchor(one)}>
            re-anchor
          </Button>
        ) : null}
        {/*
         * The same press as the row, reachable from a keyboard.
         *
         * Its words change with the verdict because what it can honestly do
         * changes with the verdict: an adrift note has no range left to point
         * at, so the paper is pointed at the DOCUMENT and the button says the
         * smaller thing rather than promising a highlight that would land on
         * whatever text now sits at offsets nobody has verified.
         */}
        {actions.point ? (
          <Button size="pane" variant="ghost" onClick={press}>
            {anchor.from === null ? 'open in the paper' : 'show in the paper'}
          </Button>
        ) : null}
      </div>

      {replying ? (
        <form
          className="mt-1.5 min-w-0"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            actions.reply(note.id, draft.trim())
            setDraft('')
            setReplying(false)
          }}
        >
          <textarea
            aria-label={`Reply to ${note.id}`}
            className="min-h-14 w-full min-w-0 rounded border bg-background p-1.5 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="pane" type="submit" disabled={actions.busy || !draft.trim()}>
            leave reply
          </Button>
        </form>
      ) : null}
    </li>
  )
}
