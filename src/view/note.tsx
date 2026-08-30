import { useState } from 'react'

import type { Anchored } from '@/store/ask.ts'
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
  busy: boolean
}

export function NoteRow({ one, actions }: { one: Anchored; actions: NoteActions }) {
  const { note, anchor } = one
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const verdict = VERDICT[anchor.state] ?? VERDICT.unverified
  const where =
    anchor.from === null
      ? note.page === null
        ? note.path
        : `${note.path} · page ${note.page}`
      : `${note.path} · ${anchor.from}–${anchor.to}`

  return (
    <li
      data-testid="note"
      data-anchor={anchor.state}
      data-note-id={note.id}
      className="min-w-0 border-b border-border/60 py-2 last:border-b-0"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant={verdict?.variant}>{verdict?.word}</Badge>
        {note.resolved ? <Badge variant="outline">resolved</Badge> : null}
        {note.viaMcp ? <Badge variant="outline">over MCP</Badge> : null}
      </div>

      {/* The path and the range: somebody else's string, so it wraps rather than
          widening the pane. Never in a badge. */}
      <p className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">{where}</p>

      {note.quoted ? (
        <blockquote className="mt-1 min-w-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
          {note.quoted}
        </blockquote>
      ) : null}

      <p className="mt-1.5 min-w-0 text-sm">{note.body}</p>

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
