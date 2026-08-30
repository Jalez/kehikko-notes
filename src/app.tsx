import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ID } from '../manifest.ts'
import { saidOf, scopeOf } from '../notes/scope.ts'

import { Button } from '@/components/ui/button.tsx'
import { edit, look, type Anchored, type Ask, type Looked } from '@/store/ask.ts'
import { NoteRow, type NoteActions } from '@/view/note.tsx'
import { Listening, Nowhere, Trouble, Unhosted } from '@/view/screens.tsx'
import { useRoadmap, type GotoHandler } from '@/wire/use-roadmap.ts'

/**
 * The page.
 *
 * ## What it shows, and the sentence that decides it
 *
 * > "Paper should provide information on what is being highlighted or selected,
 * > so that the notes module can be used to create notes on the selected item…
 * > Notes should show notes in a way that ensures specificity based on what is
 * > selected. For instance if nothing is selected but paper module shows a page,
 * > it should show all notes related to that page vs if only a part of the page
 * > is selected."
 *
 * So there is one screen and its scope is decided entirely by `context.passage`.
 * There is no picker here, no document list, no filter row — every one of those
 * would be a second answer to "what are we looking at" that could disagree with
 * the first. The pane follows.
 *
 * The one control that is not the reader pointing at something is `everything`,
 * and it exists because the honest state of this workspace today is that
 * nothing points: the module that shows papers does not call `passage.set` yet.
 * A pane that could only ever say "nobody is pointing at anything" would be
 * useless for the whole period between these two repositories landing, so there
 * is one press that widens to the project. It is a press and not a default,
 * because a pane that silently showed everything would make the narrowing above
 * it meaningless.
 *
 * ## Identity is printed only when nothing is framing this page
 *
 * A host prints the module's name in the pane header and hangs the manifest's
 * `summary` off it as a tooltip. A page that also printed "Notes" at the top of
 * itself would be saying the name twice and spending a fixed strip of a
 * 340-pixel-tall pane on the repetition. Unframed there is no pane header, so
 * the heading stays — see `Unhosted`.
 */
export function App() {
  const [looked, setLooked] = useState<Looked | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [everything, setEverything] = useState(false)
  const [withResolved, setWithResolved] = useState(false)
  const [draft, setDraft] = useState('')
  const [round, setRound] = useState(0)

  const onGoto = useCallback<GotoHandler>((message, answer) => {
    /* A `goto` may name an epic, a step, or a reference. This pane draws notes
       against a place in a document, and none of those three is one — saying so
       quickly is what gets the reader the host's fallback link instead of a
       twelve-second wait. */
    answer(
      false,
      message.ref
        ? 'This pane shows notes anchored to passages of a document, so there is nothing here to walk to by reference.'
        : 'This pane shows notes on a document, so there is nothing here to walk to by epic or step.',
    )
  }, [])

  const { where, project, projectPath, passage, resize } = useRoadmap(ID, onGoto)

  /**
   * The scope, computed from the passage by the same function the server uses.
   *
   * One definition of the ladder, imported rather than restated — see
   * `notes/scope.ts`. The heading a reader sees and the heading an agent is
   * given at the door come from the same `saidOf`, so the two cannot describe
   * different lists to each other.
   */
  const scope = useMemo(() => scopeOf(passage), [passage])

  /*
   * A pointing reader clears the widened view.
   *
   * Without this, somebody who pressed "show every note" would stay widened
   * while they highlighted a sentence, and the pane would go on showing the
   * project while the reader watched their own selection do nothing. The press
   * is an answer to "nothing is pointing"; a passage arriving is that question
   * being answered better.
   */
  useEffect(() => {
    if (passage) setEverything(false)
  }, [passage])

  const ask: Ask | null = useMemo(() => {
    if (where === 'listening') return null
    if (everything) {
      return { project, projectPath, path: null, page: null, from: null, to: null, everything: true, resolved: withResolved }
    }
    if (!passage) return null
    return {
      project,
      projectPath,
      path: passage.path,
      page: passage.page,
      from: passage.from,
      to: passage.to,
      everything: false,
      resolved: withResolved,
    }
  }, [where, everything, passage, project, projectPath, withResolved])

  /*
   * Re-read on every change of scope, and after every write.
   *
   * Never patched in place. The server holds the notes AND resolves every
   * anchor against the file on disk, so a row this page assembled itself would
   * be a row with no anchor verdict on it — which is the one thing every row
   * here is for. `round` is what a write bumps.
   */
  useEffect(() => {
    if (!ask) {
      setLooked(null)
      return
    }
    let live = true
    void look(ask)
      .then((answer) => {
        if (!live) return
        if ('error' in answer) {
          setRefused(answer.error)
          setLooked(null)
        } else {
          setRefused(null)
          setLooked(answer)
        }
      })
      .catch(() => {
        if (live) setRefused('This app could not reach its own store.')
      })
    return () => {
      live = false
    }
  }, [ask, round])

  const write = useCallback(
    async (change: Parameters<typeof edit>[0]) => {
      setBusy(true)
      const answer = await edit(change)
      setBusy(false)
      setRefused(answer.ok ? null : answer.error)
      setRound((was) => was + 1)
      return answer.ok
    },
    [],
  )

  const actions: NoteActions = useMemo(
    () => ({
      reply: (id, body) => void write({ op: 'reply', id, body }),
      resolve: (id, done) => void write({ op: 'resolve', id, done }),
      /*
       * Re-anchoring takes the offsets this app FOUND and the note's own words.
       *
       * The words are the note's rather than the file's on purpose: a `moved`
       * verdict means those exact words were located, so writing them back is
       * recording what was found, not asserting something new about the
       * document. The one thing this never does is re-anchor on its own — see
       * the essay in `notes/anchor.ts`.
       */
      reanchor: (one: Anchored) => {
        if (one.anchor.from === null || one.anchor.to === null) return
        void write({ op: 'reanchor', id: one.note.id, from: one.anchor.from, to: one.anchor.to, quoted: one.note.quoted })
      },
      busy,
    }),
    [write, busy],
  )

  /* How tall this page would like to be, asked for whenever what it draws
     changes. The host clamps it and may ignore it; that is the protocol. */
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = body.current
    if (!element) return
    resize(element.scrollHeight + 8)
  }, [resize, looked, refused, where])

  if (where === 'listening') return <Listening />
  if (where === 'unhosted' && !everything) return <Unhosted onEverything={() => setEverything(true)} />
  if (looked?.trouble) return <Trouble said={looked.trouble} />
  if (!ask) return <Nowhere project={project} onEverything={() => setEverything(true)} />

  const canWrite = !everything && scope.kind !== 'nowhere' && scope.kind !== 'everything'

  return (
    <div ref={body} className="min-w-0 space-y-2 p-2 @sm/pane:p-3">
      {/* What this pane is showing, in the words the door uses for the same
          scope. Never "Notes (3)" — a count is not a scope, and a reader who
          cannot see what was narrowed cannot tell narrowing from a bug. */}
      <p data-testid="scope" className="min-w-0 text-xs font-medium">
        {everything ? saidOf({ kind: 'everything' }) : (looked?.said ?? saidOf(scope))}
      </p>

      {refused ? (
        <p data-testid="refusal" className="min-w-0 text-xs text-adrift">
          {refused}
        </p>
      ) : null}

      {looked && !looked.verified && (looked.shown.length > 0 || looked.adrift.length > 0) ? (
        <p data-testid="unchecked" className="min-w-0 text-[0.7rem] text-muted-foreground">
          This app could not open any of these documents, so no anchor below has been checked. It is showing the words
          each note was written about, not the words that are there now.
        </p>
      ) : null}

      {canWrite ? (
        <form
          className="min-w-0 space-y-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim() || !passage) return
            void write({
              op: 'add',
              project,
              projectPath,
              path: passage.path,
              page: passage.page,
              from: passage.from,
              to: passage.to,
              quoted: passage.quoted,
              body: draft.trim(),
            }).then((ok) => {
              if (ok) setDraft('')
            })
          }}
        >
          {/* The passage this note will be anchored to, shown before it is
              written. A reader has to be able to see what they are about to
              attach a thought to — and it is prose, not a badge, because it is
              exactly the long unbroken string that widens a 220px pane. */}
          {passage?.quoted ? (
            <blockquote className="min-w-0 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
              {passage.quoted}
            </blockquote>
          ) : null}
          <textarea
            aria-label="Write a note about this"
            placeholder={
              scope.kind === 'passage' ? 'A note about this passage…' : 'A note about this page…'
            }
            className="min-h-16 w-full min-w-0 rounded border bg-background p-1.5 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="pane" type="submit" disabled={busy || !draft.trim()}>
            write note
          </Button>
        </form>
      ) : null}

      {looked?.shown.length ? (
        <ul className="min-w-0">
          {looked.shown.map((one) => (
            <NoteRow key={one.note.id} one={one} actions={actions} />
          ))}
        </ul>
      ) : (
        <p data-testid="empty" className="min-w-0 text-xs text-muted-foreground">
          {looked?.adrift.length
            ? 'Nothing is anchored here.'
            : 'Nothing has been written here yet.'}
        </p>
      )}

      {/*
       * The adrift group, which is never filtered away by narrowing.
       *
       * A note whose passage has been rewritten cannot be placed by a range
       * test and must not be dropped by one. It is the most interesting note on
       * the document — the record of what somebody thought about a sentence that
       * has since changed — so it is shown at every scope, in a group of its own
       * so a reader can see it is a different kind of thing.
       */}
      {looked?.adrift.length ? (
        <section data-testid="adrift-group" className="min-w-0 space-y-1">
          <p className="min-w-0 text-xs font-medium text-adrift">
            {looked.adrift.length} note{looked.adrift.length === 1 ? '' : 's'} on this document cannot be placed in it
          </p>
          <ul className="min-w-0">
            {looked.adrift.map((one) => (
              <NoteRow key={one.note.id} one={one} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}

      {looked?.elsewhere ? (
        <p data-testid="elsewhere" className="min-w-0 text-[0.7rem] text-muted-foreground">
          {looked.elsewhere} more note{looked.elsewhere === 1 ? ' is' : 's are'} on this document, outside what is
          selected.
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-1">
        <Button size="pane" variant="ghost" onClick={() => setWithResolved((was) => !was)}>
          {withResolved ? 'hide resolved' : 'show resolved'}
        </Button>
        {passage ? (
          <Button size="pane" variant="ghost" onClick={() => setEverything((was) => !was)}>
            {everything ? 'follow the reader' : 'every note in this project'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
