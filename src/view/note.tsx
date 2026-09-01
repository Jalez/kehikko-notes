import { useState, type CSSProperties } from 'react'

import type { Anchored } from '@/store/ask.ts'
import { sourceOf } from '../../notes/shape.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { fileOf } from '../../notes/scope.ts'
import { withoutRules } from '../../notes/readable.ts'
import { ROOMY, type Room } from '../../notes/room.ts'

import { Button } from '@/components/ui/button.tsx'

/**
 * One note, and the truth about its anchor beside it.
 *
 * ## A bad verdict is the first thing on the row. A good one is not drawn
 *
 * A reader scanning a column of notes is deciding which to read. If the anchor
 * verdict were a detail at the bottom, a note whose passage has been rewritten
 * would look exactly like one whose passage is still there until they had
 * already read it and formed an opinion about a sentence that no longer exists.
 * So the badge is first, it is a WORD as well as a colour, and the sentence
 * explaining it sits under the quote where somebody comparing the two will
 * find it.
 *
 * That argument is about making the BAD states loud, and for its whole life
 * this file also drew the good one — a badge saying `anchored` on every healthy
 * row, which is nearly every row. The owner's words: "I don't understand why
 * each note has to have an 'anchored' badge, I don't understand the value of
 * it." There is none. `exact` is the overwhelming majority verdict, so the word
 * appeared on almost every row of almost every list, and a word that is on
 * every row is the default spelled out. It carried no information and it cost
 * the one thing the argument above was trying to buy: when everything is
 * badged, a badge is not a signal.
 *
 * So `exact` draws nothing. A note that is fine says nothing about being fine,
 * and `moved`, `adrift`, `unchecked` and `whole page` keep their badge, their
 * colour and their sentence — louder now, because they are the only ones there.
 * The absence is not silence about an unchecked note either: `unverified` is
 * its own verdict with its own word, precisely so that "this app could not
 * look" is never drawn the same as "this app looked and it is fine".
 *
 * ## The other badges were checked against the same test, and kept
 *
 * `resolved` is on a minority of rows and is the thing a reader is filtering
 * by. `over MCP` is on the notes an agent left. The provenance badge is on
 * derived notes and not on typed ones. All three vary between neighbouring
 * rows, which is the whole test, and the last two are already not drawn in a
 * compact container — which is worth saying plainly, because it means the
 * verdict was the ONLY badge on every row of the 220-pixel container the
 * complaint came out of.
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
 *
 * ## In a small container a row is a PREFIX of itself, and the rest is one press away
 *
 * Everything above is right on a row that has the space for it, and everything
 * above came to 712 pixels for ONE note in a 300-pixel box — measured, against
 * this workspace's own store. So `room` decides how much of the row is drawn,
 * and the decision itself is in `notes/room.ts` where it can be argued with.
 *
 * What a compact row keeps is what a reader chooses BY: the verdict, whether it
 * is resolved, and the first lines of what somebody said. What it drops — the
 * path, the range, the author, the anchor's sentence, the provenance badges,
 * the four buttons — it drops in a strict prefix order, and the press that
 * opens it is the press that was already on the row. Nothing moves to a control
 * that exists only at one size, and a row nobody has pressed is never in a
 * state a roomier container could not draw.
 *
 * The quote survives that in clamped form rather than being dropped, because of
 * the paragraph above it: an adrift note without its words is an opinion about
 * nothing. Two lines of it and a press is a smaller version of the same
 * promise; none of it would be a different one.
 */

/**
 * The word for each verdict worth a badge, which is every verdict but one.
 *
 * `exact` is deliberately absent rather than mapped to an empty string: a
 * lookup that misses is how this file already spells "there is nothing to draw
 * here", and an entry whose word is `''` would be a badge with no text in it —
 * a coloured rectangle beside every healthy note, which is the same complaint
 * one step quieter.
 *
 * `unverified` keeps its word and must. "This app could not read the document"
 * is not "this app read it and the note is fine", and drawing nothing for both
 * would be this row telling a reader the one thing `anchor.ts` refuses to.
 */
const VERDICT: Record<string, { word: string; variant: 'moved' | 'adrift' | 'unchecked' | 'unranged' }> = {
  moved: { word: 'moved', variant: 'moved' },
  adrift: { word: 'adrift', variant: 'adrift' },
  unverified: { word: 'unchecked', variant: 'unchecked' },
  unranged: { word: 'whole page', variant: 'unranged' },
}

/**
 * How many lines of somebody else's prose to show, as a style.
 *
 * ## Why this is not `line-clamp-N` any more, and could not be
 *
 * It used to be a lookup table of two Tailwind classes, `line-clamp-2` and
 * `line-clamp-3`, written out rather than interpolated — because Tailwind's
 * classes are strings a build step looks for in this file, so
 * `line-clamp-${n}` compiles to no CSS at all and clamps nothing. That is a
 * real hazard and it is the reason the table existed.
 *
 * The number is no longer one of two. `room.bodyLines` is now as many lines as
 * the FRAME holds — 6 in a 200-pixel container, 11 in a 300-pixel one, 41 in a
 * tall narrow one — so a table would need a row per pixel height, and Tailwind
 * ships `line-clamp-1` through `line-clamp-6` and no further regardless.
 *
 * So it is written as the four declarations Tailwind's own utility expands to.
 * A style attribute carries a number the build step never has to have seen,
 * which is the whole difficulty, and it cannot silently compile to nothing.
 */
function clamped(lines: number | null, off: boolean): CSSProperties | undefined {
  if (off || lines === null) return undefined
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  }
}

export interface NoteActions {
  reply: (id: string, body: string) => void
  resolve: (id: string, done: boolean) => void
  reanchor: (one: Anchored) => void
  /**
   * Point every container on the canvas at this note's passage.
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

export function NoteRow({
  one,
  actions,
  pointed = false,
  room = ROOMY,
}: {
  one: Anchored
  actions: NoteActions
  /** This is the note the canvas is currently pointed at, by a press here. */
  pointed?: boolean
  /**
   * How much of this row the container has space for. Everything, unless
   * somebody measured — see `notes/room.ts`.
   */
  room?: Room
}) {
  const { note, anchor } = one
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  /**
   * Whether this row has been opened.
   *
   * Per row and not one at a time, because a person comparing two notes has
   * already told you they want both: a list that closed the last one would be
   * making them press twice to do the thing they just did once.
   *
   * It used to mean "opened in a container too small to draw it whole", and
   * there is no such container any more — `room.bodyLines` caps a body at every
   * size, so every row is a prefix of itself and every row opens. See `MOST`.
   */
  const [open, setOpen] = useState(false)
  /**
   * Whether what this app used to make of the same annotation is shown.
   *
   * Its own state rather than `open`, because they answer two different
   * questions: a reader opening a row wants the end of the note, and almost
   * nobody opening a row wants a paragraph about how this app used to read it.
   * Folding the two together would put the noise back on every opened row.
   */
  const [saidBefore, setSaidBefore] = useState(false)
  /**
   * What a row is holding back, and it is never nothing.
   *
   * A compact row is holding back its fields; every row, compact or not, may be
   * holding back the end of a long note, and this component cannot know which
   * without measuring text — which is the browser's job and not a decision this
   * file is allowed to make wrongly. So the press is always offered. The cost
   * is a press on a six-word note that does nothing visible; the alternative
   * was a row whose ending is unreachable, which is the failure the cap would
   * otherwise have introduced.
   */
  const holdingBack = room.compact && !open
  /* Undefined for `exact`, and for `exact` alone. An anchor state this file has
     never heard of falls back to `unchecked`, which is the honest word for a
     verdict nobody here can read. */
  const verdict = anchor.state === 'exact' ? undefined : (VERDICT[anchor.state] ?? VERDICT.unverified)
  /* Read through `sourceOf` rather than off the record, so that a note written
     before this field existed — where it is absent rather than null — is read
     as what it is: something a person typed. */
  const source = sourceOf(note)
  /*
   * Where the note is, in the file's own name rather than its address.
   *
   * Every row on a list of notes about one document repeated the same
   * ninety-character absolute path, under a heading that had just printed it as
   * well. It is the reader's own project folder; they know where it is. The
   * whole path stays as the `title`, one hover from being read.
   */
  const where =
    anchor.from === null
      ? note.page === null
        ? fileOf(note.path)
        : `${fileOf(note.path)} · page ${note.page}`
      : `${fileOf(note.path)} · ${anchor.from}–${anchor.to}`

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
   *
   * The same press ALSO opens the row, and the two are one gesture rather than
   * two controls because they are one intention: a person who picks a note out
   * of a list of twenty wants to see that note. That used to be true only in a
   * small container; the body is capped at every size now, so it is true
   * everywhere and there is no size at which this press does only half of it.
   *
   * Every row takes it, where it used to be only a row somebody could point at
   * or a row in a compact container: a row that could not be pressed would be a
   * row whose last sentence nobody can read. `closest` below is what keeps the
   * buttons inside the row meaning what they say.
   */
  const press = () => {
    setOpen((was) => !was)
    actions.point?.(one)
  }
  return (
    <li
      data-testid="note"
      data-anchor={anchor.state}
      data-note-id={note.id}
      data-points={actions.point ? '1' : undefined}
      data-open={open ? '1' : '0'}
      /*
       * Reachable from a keyboard, on every row.
       *
       * The action row used to be the whole of that story — the button at the
       * end of every row existed because a row you can only reach with a mouse
       * is a row half the people using it cannot reach. In a compact container
       * the action row is one of the things not drawn, so the row itself has to
       * take the tab stop over: without this, everything a compact row hides
       * would be reachable by pointer alone, which is the same failure wearing
       * a smaller layout. The cap put the end of a long note behind the same
       * press in every container, so the tab stop is on every row too.
       */
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if ((event.target as HTMLElement).closest('button, a, textarea, input, form')) return
        event.preventDefault()
        press()
      }}
      onClick={(event) => {
        /* Anything with its own meaning for a press keeps it. */
        if ((event.target as HTMLElement).closest('button, a, textarea, input, form')) return
        press()
      }}
      data-pointed={pointed ? '1' : undefined}
      /*
       * The pointed row is marked, and marking it is the whole reason the list
       * no longer collapses when you press one. A press moves the paper, and
       * without a mark on the row nothing on this side said which note the
       * paper had been moved to — so the only evidence a press had worked was
       * the list shrinking to one, which was also how you lost the list.
       */
      /* What a compact row is not drawing, said on hover. A `title` is not a
         replacement for any of it — it cannot be read by touch and it is gone
         the moment a finger is on the screen — which is why the press exists;
         it is the cheap half of the same promise for whoever has a pointer. */
      title={holdingBack ? `${note.path}\n${where}\n${note.by}` : undefined}
      className={
        'min-w-0 border-b border-border/60 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        /* Four pixels a row, and they decide whether a 200-pixel container holds
           two notes or one: measured at 83 pixels a row against 164 pixels of
           window, which is one row and a half. */
        + (room.compact ? ' py-1.5' : ' py-2')
        + ' cursor-pointer hover:bg-muted/40'
        + (pointed ? ' -mx-1 border-l-2 border-l-foreground bg-muted/60 px-1' : '')
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {verdict ? <Badge variant={verdict.variant}>{verdict.word}</Badge> : null}
        {note.resolved ? <Badge variant="outline">resolved</Badge> : null}
        {/* The two provenance badges wrap onto lines of their own at 220px, and
            three stacked badges are two thirds of what a compact row is allowed
            to be. The verdict and `resolved` stay because they are what a
            reader is choosing by; these say where a note came from, which is
            what they read once they have chosen. */}
        {note.viaMcp && (open || room.provenance) ? <Badge variant="outline">over MCP</Badge> : null}
        {/*
          Where the note came from, when nobody typed it here.
          A `\todo{}` the author left in their own `.tex` and a thought
          somebody had while reading are different claims about the same
          sentence, and this row already makes that argument once for the MCP
          door. It has to be made again here, and more loudly: a derived note is
          the only kind whose words are also somewhere else, being edited by
          somebody who has never seen this container.
          "in the source" and "gone from source" are FIXED words chosen by this
          file — never the path, never the annotation, never the author. A badge
          carries `whitespace-nowrap`, and a variable string inside one is how a
          220px container acquires a 1187px min-content floor. The path is below, in
          a `<p>` that wraps.
        */}
        {source && (open || room.provenance) ? (
          <Badge variant="outline" data-source={source.kind}>
            {source.withdrawn ? 'not an annotation' : source.present ? 'in the source' : 'gone from source'}
          </Badge>
        ) : null}
      </div>

      {/* The path and the range: somebody else's string, so it wraps rather than
          widening the container. Never in a badge.

          Dropped first of everything in a compact row, and it is the easiest of
          them to justify: the heading above the list has just said which file
          this is, in the same words, and the range is a byte offset nobody
          reads by eye. It stays as the row's `title` and comes back on a press. */}
      {open || room.where ? (
        <p title={note.path} className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">
          {where}
        </p>
      ) : null}

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
        <blockquote
          style={clamped(room.quoteLines, open)}
          className="mt-1 min-w-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground"
        >
          {note.quoted}
        </blockquote>
      ) : null}

      {/* The words, which are the one thing every row keeps at every size. A
          long one is clamped rather than cut off mid-sentence by the frame:
          six lines that end in an ellipsis say "there is more of this" where a
          paragraph running under the bottom edge says nothing at all.

          `withoutRules` because a stored body can carry a divider the author
          drew in their editor — see the essay there. Live notes have had them
          taken out on the way in since the reading changed; the ones this app
          has STOPPED lifting are frozen records that will never be read again,
          and they are drawn — behind the host's `preamble comments` filter —
          with sixty equals signs on the first line. */}
      <p
        data-testid="body"
        style={clamped(room.bodyLines, open)}
        className="mt-1.5 min-w-0 text-sm"
      >
        {withoutRules(note.body)}
      </p>

      {/*
        What this app used to make of the same annotation, when its own reading
        of it changed.

        ## Six words and a press, where there were forty and a paragraph

        This line is not optional and must not be deleted: the replies below a
        re-read note were written against the OLD words, and a conversation
        answering words nobody can see is a conversation that reads as nonsense.

        What it may not do is drown the note it is about. It printed the first
        two hundred characters of the old body — which on a re-read note is the
        beginning of the body it sits directly UNDER, differing by a rule line
        and a bit of markup — under a sentence forty words long, on seventeen of
        the fifty-two notes in the thesis this module is used on. Three quarters
        of that row was this app talking about itself.

        So: a marker saying THAT the reading changed and when, and the old words
        behind the press on the marker. Same promise as the row itself — less,
        never other, and nothing unreachable. The date is the whole of the
        marker's information: a person who remembers replying last week can see
        at a glance whether their reply predates the change.
      */}
      {source?.reread && (open || room.said) ? (
        <div data-testid="reread" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          {/* A real button, because it is a press: the row's own `closest`
              check hands it its meaning, and a keyboard finds it in order. */}
          <button
            type="button"
            className="underline decoration-dotted underline-offset-2"
            aria-expanded={saidBefore}
            onClick={() => setSaidBefore((was) => !was)}
          >
            re-read on {source.reread.at.slice(0, 10)}
          </button>
          {saidBefore ? (
            <p data-testid="reread-was" className="mt-1 min-w-0">
              {/* The sentence the marker replaced, kept for the reader who
                  pressed it: they asked what changed, and "it used to show" is
                  the answer the marker's four words cannot carry. */}
              It used to show:{' '}
              <span className="italic">
              {/* Frozen text: this note was adopted by its `quoted` slice and
                  the words below are what the old rules made of it, so no
                  later re-read will ever clean them. The divider goes here or
                  nowhere — and sixty unbreakable characters in a 220-pixel
                  column are a min-content floor, not merely noise. */}
                {withoutRules(source.reread.was)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Why this app stopped lifting it, in the words the store holds. Only
          ever drawn where a reader has asked to see these; see `App`. */}
      {source?.withdrawn ? (
        <p data-testid="withdrawn-said" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          {source.withdrawn}
        </p>
      ) : null}

      {/* Who wrote it. Every note in a list is usually by the same person, and
          in a compact row that is a line of the frame spent saying so twenty
          times. `resolved` is a badge at the top whatever the size, so the fact
          survives even where the name does not. */}
      {open || room.author ? (
        <p className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">
          {note.by}
          {note.resolved && note.resolvedBy ? ` · resolved by ${note.resolvedBy}` : ''}
        </p>
      ) : null}

      {/* The anchor's own sentence. Under the quote, because the two are read
          together: "these words, and here is what has become of them". The
          BADGE says which of the five verdicts it is at every size; this
          sentence is the paragraph explaining that word, and a paragraph is
          what a 300-pixel box has least of. */}
      {anchor.state !== 'exact' && (open || room.said) ? (
        <p data-testid="anchor-said" className="mt-1 min-w-0 text-[0.7rem] text-muted-foreground">
          {anchor.said}
        </p>
      ) : null}

      {/* The replies, or — where there is no room for them — the fact that there
          are some. A conversation silently absent from a row is the one kind of
          hiding this file will not do: a reader who cannot see that three
          people answered would read the note as the last word on it. */}
      {note.replies.length ? (
        open || room.actions ? (
          <ul className="mt-1.5 min-w-0 space-y-1 border-l-2 border-border pl-2">
            {note.replies.map((reply) => (
              <li key={reply.id} className="min-w-0 text-xs">
                <span className="text-muted-foreground">{reply.by}: </span>
                {reply.body}
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="replies-said" className="mt-1 min-w-0 text-[0.65rem] text-muted-foreground">
            {note.replies.length} {note.replies.length === 1 ? 'reply' : 'replies'}
          </p>
        )
      ) : null}

      {/* The action row, which is a line of the frame on every note whether
          anybody wants it or not. In a compact container it appears on the row
          somebody actually pressed, which is the only row any of these four
          presses was ever going to be used on. */}
      {open || room.actions ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button size="container" variant="ghost" onClick={() => setReplying((was) => !was)}>
            {replying ? 'cancel' : 'reply'}
          </Button>
          <Button
            size="container"
            variant="ghost"
            disabled={actions.busy}
            onClick={() => actions.resolve(note.id, !note.resolved)}
          >
            {note.resolved ? 'reopen' : 'resolve'}
          </Button>
          {/*
           * Offered only where it can honestly be done: a note whose words this
           * app FOUND somewhere else in the file. An adrift note has no new place
           * to point at, so there is nothing here to press — moving it would mean
           * inventing a range, which is the failure the whole module is against.
           */}
          {anchor.state === 'moved' ? (
            <Button size="container" variant="outline" disabled={actions.busy} onClick={() => actions.reanchor(one)}>
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
            /* The point alone, and not `press`: this button is inside a row that
               is already open, so the toggle in `press` would close the row a
               person is reading in order to show them the paper. */
            <Button size="container" variant="ghost" onClick={() => actions.point?.(one)}>
              {anchor.from === null ? 'open in the paper' : 'show in the paper'}
            </Button>
          ) : null}
          {/* The way back to a row the size of the others, wherever a press
              opened this one. Not `room.compact` any more: a roomy container
              caps the body too, so it has something to fold. */}
          {open ? (
            <Button size="container" variant="ghost" onClick={() => setOpen(false)}>
              less
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Folded away with the button that opened it. Half a reply left standing
          under a row whose controls are no longer drawn is a form nothing on
          screen explains. */}
      {replying && (open || room.actions) ? (
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
          <Button size="container" type="submit" disabled={actions.busy || !draft.trim()}>
            leave reply
          </Button>
        </form>
      ) : null}
    </li>
  )
}
